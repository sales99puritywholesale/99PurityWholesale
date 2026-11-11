-- =====================================================================================================================================
-- P8 DRAFT. NOT APPLIED. NOT EXECUTED. NEVER PARSED BY POSTGRESQL.
-- Admin operations and management: application intake and approval, organization management (status, terms, members), the customer directory, an audit log viewer,
-- platform settings (payment instructions), effective-dated fee schedules, customer profile and member views, and the operations and finance dashboard.
-- Staff management reuses the P2 functions (rpc_staff_*); nothing here redefines them. Reuses existing capabilities only (org.read, org.manage, org.billing.read, members.manage,
-- applications.read.basic/full, applications.review, profiles.read.basic/full, audit.read, flags.read, flags.write, financial.write): no change to the staff catalog.
-- TypeScript mirror: src/lib/portal/admin-ops/.
-- =====================================================================================================================================

-- 1. Tables ---------------------------------------------------------------------------------------------------------------------------
create table public.organization_applications (
  id              uuid primary key default gen_random_uuid(),
  company_name    text not null check (char_length(btrim(company_name)) between 1 and 200),
  contact_name    text not null check (char_length(btrim(contact_name)) between 1 and 120),
  contact_email   text not null check (contact_email = lower(contact_email) and char_length(contact_email) <= 254 and contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  phone           text check (phone is null or char_length(phone) <= 40),
  website         text check (website is null or char_length(website) <= 200),
  message         text check (message is null or char_length(message) <= 2000),
  status          text not null default 'new' check (status in ('new', 'approved', 'rejected')),
  organization_id uuid references public.organizations (id) on delete restrict,
  review_note     text check (review_note is null or char_length(review_note) <= 300),
  reviewed_by     uuid,
  reviewed_at     timestamptz,
  created_by      uuid not null,
  created_at      timestamptz not null default clock_timestamp(),
  constraint applications_review_consistent check ((status = 'new') = (reviewed_at is null and reviewed_by is null)),
  constraint applications_org_consistent check ((status = 'approved') = (organization_id is not null)),
  constraint applications_reject_note check (status <> 'rejected' or review_note is not null)
);
create index organization_applications_status_idx on public.organization_applications (status, created_at desc);

create table public.platform_settings (
  key        text primary key check (key in ('payment_instructions', 'invoice_footer')),
  value      text not null default '' check (char_length(value) <= 2000),
  updated_by uuid,
  updated_at timestamptz not null default clock_timestamp()
);
insert into public.platform_settings (key) values ('payment_instructions'), ('invoice_footer');

-- Effective-dated fees. A price change inserts a NEW row and closes the previous row of the same code; rows are otherwise immutable, so history stays exact.
create table public.fee_schedules (
  id             uuid primary key default gen_random_uuid(),
  code           text not null check (code ~ '^[a-z0-9_]{2,40}$'),
  name           text not null check (char_length(btrim(name)) between 1 and 120),
  amount_cents   bigint not null check (amount_cents between 0 and 100000000),
  unit           text not null check (unit in ('flat', 'per_order', 'per_unit', 'per_box', 'per_pallet', 'per_month')),
  note           text check (note is null or char_length(note) <= 300),
  effective_from date not null,
  effective_to   date,
  created_by     uuid not null,
  created_at     timestamptz not null default clock_timestamp(),
  constraint fee_schedules_dates check (effective_to is null or effective_to >= effective_from),
  constraint fee_schedules_code_from_key unique (code, effective_from)
);
create unique index fee_schedules_one_open_per_code on public.fee_schedules (code) where effective_to is null;

alter table public.organization_applications enable row level security;
alter table public.platform_settings         enable row level security;
alter table public.fee_schedules             enable row level security;

-- 2. Guards ---------------------------------------------------------------------------------------------------------------------------
create function private.guard_adminops_applications() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'applications cannot be deleted' using errcode = '23514'; end if;
  if new.id <> old.id or new.company_name <> old.company_name or new.contact_email <> old.contact_email or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'application identity is immutable' using errcode = '23514';
  end if;
  if old.status <> 'new' then raise exception 'a reviewed application is final' using errcode = '23514'; end if;
  return new;
end;
$$;

create function private.guard_adminops_fees() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'fee schedule rows cannot be deleted' using errcode = '23514'; end if;
  if new.id <> old.id or new.code <> old.code or new.name <> old.name or new.amount_cents <> old.amount_cents or new.unit <> old.unit or new.note is distinct from old.note
     or new.effective_from <> old.effective_from or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'fee schedule rows are immutable except for closing them' using errcode = '23514';
  end if;
  if old.effective_to is not null and new.effective_to is distinct from old.effective_to then raise exception 'a closed fee schedule row is final' using errcode = '23514'; end if;
  return new;
end;
$$;

create function private.guard_adminops_settings() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'platform settings cannot be deleted' using errcode = '23514'; end if;
  if new.key <> old.key then raise exception 'setting keys are immutable' using errcode = '23514'; end if;
  return new;
end;
$$;

create trigger organization_applications_guard before update or delete on public.organization_applications for each row execute function private.guard_adminops_applications();
create trigger fee_schedules_guard before update or delete on public.fee_schedules for each row execute function private.guard_adminops_fees();
create trigger platform_settings_guard before update or delete on public.platform_settings for each row execute function private.guard_adminops_settings();
create trigger organization_applications_no_truncate before truncate on public.organization_applications for each statement execute function private.block_truncate();
create trigger fee_schedules_no_truncate before truncate on public.fee_schedules for each statement execute function private.block_truncate();
create trigger platform_settings_no_truncate before truncate on public.platform_settings for each statement execute function private.block_truncate();

-- 3. Customer RPCs (the caller must be an active member of an active organization) ----------------------------------------------------------
create function public.rpc_payment_instructions() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not exists (select 1 from private.my_org_ids() o(id) join public.organizations g on g.id = o.id where g.status = 'active') then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  return jsonb_build_object('ok', true,
    'payment_instructions', coalesce((select s.value from public.platform_settings s where s.key = 'payment_instructions'), ''),
    'invoice_footer', coalesce((select s.value from public.platform_settings s where s.key = 'invoice_footer'), ''));
end;
$$;

create function public.rpc_fee_schedule_current() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not exists (select 1 from private.my_org_ids() o(id) join public.organizations g on g.id = o.id where g.status = 'active') then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  return jsonb_build_object('ok', true, 'fees',
    (select coalesce(jsonb_agg(jsonb_build_object('code', x.code, 'name', x.name, 'amount_cents', x.amount_cents, 'unit', x.unit, 'note', x.note, 'effective_from', x.effective_from) order by x.name), '[]'::jsonb)
       from public.fee_schedules x where x.effective_from <= current_date and (x.effective_to is null or x.effective_to >= current_date)));
end;
$$;

-- The members of one organization. Names for every member; e-mail addresses only for an owner of that organization.
create function public.rpc_org_members_list(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_owner boolean;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not (p_organization_id in (select private.my_org_ids())) or private.shop_org_ok(p_organization_id) is not true then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  v_owner := private.pay_org_owner_ok(p_organization_id);
  return jsonb_build_object('ok', true, 'can_see_email', v_owner,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('role', m.role, 'name', p.full_name, 'email', case when v_owner then u.email else null end, 'joined', m.created_at, 'is_me', m.user_id = v_actor)
                                           order by m.role desc, m.created_at), '[]'::jsonb)
                  from public.organization_members m join auth.users u on u.id = m.user_id left join public.profiles p on p.user_id = m.user_id
                 where m.organization_id = p_organization_id and m.status = 'active'));
end;
$$;

create function public.rpc_profile_get() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  return jsonb_build_object('ok', true, 'email', (select u.email from auth.users u where u.id = v_actor),
    'full_name', (select p.full_name from public.profiles p where p.user_id = v_actor), 'phone', (select p.phone from public.profiles p where p.user_id = v_actor));
end;
$$;

create function public.rpc_profile_update(p_full_name text, p_phone text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_name  text := nullif(btrim(coalesce(p_full_name, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if (v_name is not null and char_length(v_name) > 200) or (v_phone is not null and (char_length(v_phone) > 40 or v_phone !~ '^[0-9+()./ -]{3,40}$')) then raise exception 'invalid arguments' using errcode = '22023'; end if;
  insert into public.profiles (user_id, full_name, phone) values (v_actor, v_name, v_phone) on conflict (user_id) do update set full_name = excluded.full_name, phone = excluded.phone;
  perform private.write_audit(v_actor, case when private.staff_session_ok() then 'staff' else 'organization_user' end, 'profile.update', 'success', null, 'profile', v_actor::text, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'code', 'updated');
end;
$$;

-- 4. Staff RPCs ---------------------------------------------------------------------------------------------------------------------------
-- The operations and finance dashboard. Everyone with org.read sees operations; amounts of money need org.billing.read; applications need applications.read.basic.
create function public.rpc_admin_dashboard() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
  v_fin  boolean := private.has_capability('org.billing.read');
  v_app  boolean := private.has_capability('applications.read.basic');
  v_fin_json jsonb := null;
begin
  v_gate := private.staff_gate('org.read', 'staff.dashboard', false, 'dashboard', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if v_fin then
    v_fin_json := jsonb_build_object(
      'invoiced_30d_cents', (select coalesce(sum(i.total_cents), 0)::bigint from public.invoices i where i.status <> 'void' and i.issued_at > clock_timestamp() - interval '30 days'),
      'collected_30d_cents', (select coalesce(sum(p.confirmed_cents), 0)::bigint from public.payments p where p.status = 'confirmed' and p.reviewed_at > clock_timestamp() - interval '30 days'),
      'outstanding_cents', (select coalesce(sum(i.total_cents - i.paid_cents), 0)::bigint from public.invoices i where i.status in ('open', 'partially_paid')),
      'outstanding_count', (select count(*)::int from public.invoices i where i.status in ('open', 'partially_paid')),
      'overdue_cents', (select coalesce(sum(i.total_cents - i.paid_cents), 0)::bigint from public.invoices i where i.status in ('open', 'partially_paid') and i.due_at < clock_timestamp()),
      'overdue_count', (select count(*)::int from public.invoices i where i.status in ('open', 'partially_paid') and i.due_at < clock_timestamp()),
      'pending_payments_count', (select count(*)::int from public.payments p where p.status = 'reported'),
      'pending_payments_cents', (select coalesce(sum(p.claimed_cents), 0)::bigint from public.payments p where p.status = 'reported'),
      'aging', (select coalesce(jsonb_object_agg(b.bucket, jsonb_build_object('count', b.n, 'cents', b.amt)), '{}'::jsonb)
                  from (select case when d.days <= 0 then 'current' when d.days <= 30 then '1-30' when d.days <= 60 then '31-60' when d.days <= 90 then '61-90' else '90+' end as bucket,
                               count(*)::int as n, sum(d.remaining)::bigint as amt
                          from (select floor(extract(epoch from (clock_timestamp() - i.due_at)) / 86400) as days, i.total_cents - i.paid_cents as remaining
                                  from public.invoices i where i.status in ('open', 'partially_paid')) d group by 1) b),
      'top_balances', (select coalesce(jsonb_agg(jsonb_build_object('organization_name', t.name, 'organization_code', t.code, 'outstanding_cents', t.amt) order by t.amt desc), '[]'::jsonb)
                         from (select g.name, g.code, sum(i.total_cents - i.paid_cents)::bigint as amt from public.invoices i join public.organizations g on g.id = i.organization_id
                                where i.status in ('open', 'partially_paid') group by g.id, g.name, g.code order by sum(i.total_cents - i.paid_cents) desc limit 5) t));
  end if;
  return jsonb_build_object('ok', true, 'can_see_finance', v_fin, 'finance', v_fin_json,
    'orders', jsonb_build_object(
      'today', (select count(*)::int from public.orders o where (o.created_at at time zone 'utc')::date = (clock_timestamp() at time zone 'utc')::date),
      'last_7_days', (select count(*)::int from public.orders o where o.created_at > clock_timestamp() - interval '7 days'),
      'by_status', (select coalesce(jsonb_object_agg(x.status, x.n), '{}'::jsonb) from (select o.status, count(*)::int as n from public.orders o group by o.status) x)),
    'fulfillment', jsonb_build_object(
      'by_status', (select coalesce(jsonb_object_agg(x.status, x.n), '{}'::jsonb) from (select o.status, count(*)::int as n from public.fulfillment_orders o where not o.is_sandbox group by o.status) x),
      'open_exceptions', (select count(*)::int from public.fulfillment_exceptions e where e.status = 'open'),
      'open_receipts', (select count(*)::int from public.inbound_receipts r where r.status = 'expected'),
      'onboarding_waiting', (select count(*)::int from public.onboarding_steps s where s.status = 'submitted'),
      'webhook_failed_24h', (select count(*)::int from public.webhook_deliveries d where d.status = 'failed' and d.created_at > clock_timestamp() - interval '24 hours')),
    'organizations', jsonb_build_object('active', (select count(*)::int from public.organizations g where g.status = 'active'), 'suspended', (select count(*)::int from public.organizations g where g.status = 'suspended'),
                                        'live', (select count(*)::int from public.onboarding_instances i where i.status = 'live')),
    'applications_new', case when v_app then (select count(*)::int from public.organization_applications a where a.status = 'new') else null end);
end;
$$;

create function public.rpc_admin_orgs_overview() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
  v_fin  boolean := private.has_capability('org.billing.read');
begin
  v_gate := private.staff_gate('org.read', 'staff.orgs.overview', false, 'organization', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  return jsonb_build_object('ok', true, 'can_see_finance', v_fin, 'organizations',
    (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'code', g.code, 'status', g.status, 'payment_terms', g.payment_terms, 'created_at', g.created_at,
                                                  'members', (select count(*)::int from public.organization_members m where m.organization_id = g.id and m.status = 'active'),
                                                  'onboarding', (select i.status from public.onboarding_instances i where i.organization_id = g.id),
                                                  'outstanding_cents', case when v_fin then (select coalesce(sum(i.total_cents - i.paid_cents), 0)::bigint from public.invoices i where i.organization_id = g.id and i.status in ('open', 'partially_paid')) else null end)
                            order by g.name), '[]'::jsonb)
       from public.organizations g));
end;
$$;

create function public.rpc_admin_org_detail(p_organization_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_fin   boolean := private.has_capability('org.billing.read');
  v_pii   boolean := private.has_capability('profiles.read.basic') or private.has_capability('profiles.read.full');
  g       record;
begin
  v_gate := private.staff_gate('org.read', 'staff.org.detail', false, 'organization', p_organization_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  select o.id, o.name, o.code, o.status, o.payment_terms, o.created_at into g from public.organizations o where o.id = p_organization_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  if v_pii then perform private.write_audit(v_actor, 'staff', 'staff.profiles.read', 'success', p_organization_id, 'organization', p_organization_id::text, jsonb_build_object('via', 'org_detail')); end if;
  return jsonb_build_object('ok', true, 'can_see_finance', v_fin, 'can_see_people', v_pii,
    'organization', jsonb_build_object('id', g.id, 'name', g.name, 'code', g.code, 'status', g.status, 'payment_terms', g.payment_terms, 'created_at', g.created_at),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'role', m.role, 'status', m.status, 'joined', m.created_at, 'email', case when v_pii then u.email else null end,
                                                             'name', case when v_pii then p.full_name else null end) order by m.status, m.role desc, m.created_at), '[]'::jsonb)
                  from public.organization_members m join auth.users u on u.id = m.user_id left join public.profiles p on p.user_id = m.user_id where m.organization_id = p_organization_id),
    'onboarding', (select jsonb_build_object('status', i.status, 'approved', (select count(*)::int from public.onboarding_steps s where s.instance_id = i.id and s.status = 'approved')) from public.onboarding_instances i where i.organization_id = p_organization_id),
    'orders', jsonb_build_object('count', (select count(*)::int from public.orders o where o.organization_id = p_organization_id), 'last_at', (select max(o.created_at) from public.orders o where o.organization_id = p_organization_id)),
    'fulfillment_open', (select count(*)::int from public.fulfillment_orders fo where fo.organization_id = p_organization_id and fo.status not in ('delivered', 'cancelled')),
    'invoices', case when v_fin then jsonb_build_object('outstanding_cents', (select coalesce(sum(i.total_cents - i.paid_cents), 0)::bigint from public.invoices i where i.organization_id = p_organization_id and i.status in ('open', 'partially_paid')),
                                                        'open_count', (select count(*)::int from public.invoices i where i.organization_id = p_organization_id and i.status in ('open', 'partially_paid'))) else null end);
end;
$$;

-- Suspending stops the customer (shop, orders, API keys) at once; closing is refused while money or fulfillment is still open. A reason is recorded.
create function public.rpc_admin_org_set_status(p_organization_id uuid, p_status text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_old    text;
begin
  v_gate := private.staff_gate('org.manage', 'staff.org.status', true, 'organization', p_organization_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_organization_id is null or p_status is null or p_status not in ('active', 'suspended', 'closed') or v_reason is null or char_length(v_reason) > 300 then raise exception 'invalid arguments' using errcode = '22023'; end if;
  select o.status into v_old from public.organizations o where o.id = p_organization_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  if v_old = p_status then return jsonb_build_object('ok', true, 'code', 'no_change'); end if;
  if p_status = 'closed' and (exists (select 1 from public.invoices i where i.organization_id = p_organization_id and i.status in ('open', 'partially_paid'))
                              or exists (select 1 from public.fulfillment_orders fo where fo.organization_id = p_organization_id and fo.status not in ('delivered', 'cancelled'))) then
    return jsonb_build_object('ok', false, 'code', 'has_open_items');
  end if;
  update public.organizations set status = p_status where id = p_organization_id;
  perform private.write_audit(v_actor, 'staff', 'staff.org.status', 'success', p_organization_id, 'organization', p_organization_id::text, jsonb_build_object('from', v_old, 'to', p_status, 'reason', v_reason));
  return jsonb_build_object('ok', true, 'code', 'updated');
end;
$$;

-- Payment terms apply to FUTURE invoices only (each invoice keeps the terms it was issued with).
create function public.rpc_admin_org_set_terms(p_organization_id uuid, p_terms text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_old   text;
begin
  v_gate := private.staff_gate('org.manage', 'staff.org.terms', true, 'organization', p_organization_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_organization_id is null or p_terms is null or p_terms !~ '^(prepay|net_?[0-9]{1,3})$' or (p_terms ~ '[0-9]' and regexp_replace(p_terms, '[^0-9]', '', 'g')::int > 365) then raise exception 'invalid arguments' using errcode = '22023'; end if;
  select o.payment_terms into v_old from public.organizations o where o.id = p_organization_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  if v_old = p_terms then return jsonb_build_object('ok', true, 'code', 'no_change'); end if;
  update public.organizations set payment_terms = p_terms where id = p_organization_id;
  perform private.write_audit(v_actor, 'staff', 'staff.org.terms', 'success', p_organization_id, 'organization', p_organization_id::text, jsonb_build_object('from', v_old, 'to', p_terms));
  return jsonb_build_object('ok', true, 'code', 'updated');
end;
$$;

-- Remove a member or change a member's role (adding is rpc_admin_org_member_add of P3). The last active owner can never be removed or demoted (database trigger).
create function public.rpc_admin_member_set(p_organization_id uuid, p_user_id uuid, p_action text, p_role text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_role   text;
  v_status text;
begin
  v_gate := private.staff_gate('members.manage', 'staff.org.member.set', true, 'organization', p_organization_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_organization_id is null or p_user_id is null or p_action is null or p_action not in ('remove', 'set_role') or (p_action = 'set_role' and (p_role is null or p_role not in ('owner', 'member'))) then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  select m.role, m.status into v_role, v_status from public.organization_members m where m.organization_id = p_organization_id and m.user_id = p_user_id for update;
  if not found or v_status <> 'active' then return jsonb_build_object('ok', false, 'code', 'member_not_found'); end if;
  begin
    if p_action = 'remove' then
      update public.organization_members set status = 'removed', removed_at = clock_timestamp() where organization_id = p_organization_id and user_id = p_user_id;
    else
      if v_role = p_role then return jsonb_build_object('ok', true, 'code', 'no_change'); end if;
      update public.organization_members set role = p_role where organization_id = p_organization_id and user_id = p_user_id;
    end if;
  exception when sqlstate '23514' then
    return jsonb_build_object('ok', false, 'code', 'last_owner_protected');
  end;
  perform private.write_audit(v_actor, 'staff', 'staff.org.member.set', 'success', p_organization_id, 'user', p_user_id::text, jsonb_build_object('action', p_action, 'old_role', v_role, 'new_role', p_role));
  return jsonb_build_object('ok', true, 'code', case when p_action = 'remove' then 'removed' else 'role_changed' end);
end;
$$;

create function public.rpc_admin_application_create(p_company text, p_contact_name text, p_contact_email text, p_phone text, p_website text, p_message text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_co    text := btrim(coalesce(p_company, ''));
  v_cn    text := btrim(coalesce(p_contact_name, ''));
  v_em    text := lower(btrim(coalesce(p_contact_email, '')));
  v_id    uuid;
begin
  v_gate := private.staff_gate('applications.review', 'staff.application.create', false, 'application', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if char_length(v_co) not between 1 and 200 or char_length(v_cn) not between 1 and 120 or char_length(v_em) > 254 or v_em !~ '^[^@[:space:]]+@[^@[:space:]]+$'
     or char_length(coalesce(p_phone, '')) > 40 or char_length(coalesce(p_website, '')) > 200 or char_length(coalesce(p_message, '')) > 2000 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  insert into public.organization_applications (company_name, contact_name, contact_email, phone, website, message, created_by)
  values (v_co, v_cn, v_em, nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_website, '')), ''), nullif(btrim(coalesce(p_message, '')), ''), v_actor) returning id into v_id;
  perform private.write_audit(v_actor, 'staff', 'staff.application.create', 'success', null, 'application', v_id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'code', 'created', 'id', v_id);
end;
$$;

create function public.rpc_admin_applications_list(p_status text default 'new') returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_full  boolean := private.has_capability('applications.read.full');
begin
  v_gate := private.staff_gate('applications.read.basic', 'staff.applications.list', false, 'application', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_status is not null and p_status not in ('new', 'approved', 'rejected') then raise exception 'invalid arguments' using errcode = '22023'; end if;
  if v_full then perform private.write_audit(v_actor, 'staff', 'staff.applications.read', 'success', null, 'application', null, jsonb_build_object('full', true)); end if;
  return jsonb_build_object('ok', true, 'can_see_contact', v_full, 'applications',
    (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'company_name', a.company_name, 'status', a.status, 'created_at', a.created_at, 'reviewed_at', a.reviewed_at, 'review_note', a.review_note,
                                                  'organization_id', a.organization_id, 'contact_name', case when v_full then a.contact_name else null end, 'contact_email', case when v_full then a.contact_email else null end,
                                                  'phone', case when v_full then a.phone else null end, 'website', case when v_full then a.website else null end, 'message', case when v_full then a.message else null end)
                            order by a.created_at desc), '[]'::jsonb)
       from (select x.id, x.company_name, x.status, x.created_at, x.reviewed_at, x.review_note, x.organization_id, x.contact_name, x.contact_email, x.phone, x.website, x.message
               from public.organization_applications x where p_status is null or x.status = p_status order by x.created_at desc limit 200) a));
end;
$$;

-- Approving creates the organization (prepay terms) and, when the contact already has a confirmed account that is not staff, adds that person as its owner.
create function public.rpc_admin_application_review(p_id uuid, p_decision text, p_note text, p_org_code text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
  v_status text;
  v_co     text;
  v_email  text;
  v_org    uuid;
  v_user   uuid;
  v_owner  boolean := false;
begin
  v_gate := private.staff_gate('applications.review', 'staff.application.review', true, 'application', p_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_id is null or p_decision is null or p_decision not in ('approve', 'reject') or (v_note is not null and char_length(v_note) > 300) or (p_decision = 'reject' and v_note is null)
     or (p_decision = 'approve' and (p_org_code is null or p_org_code !~ '^[A-Z0-9][A-Z0-9-]{2,19}$')) then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  select a.status, a.company_name, a.contact_email into v_status, v_co, v_email from public.organization_applications a where a.id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'application_not_found'); end if;
  if v_status <> 'new' then return jsonb_build_object('ok', false, 'code', 'already_reviewed'); end if;
  if p_decision = 'reject' then
    update public.organization_applications set status = 'rejected', review_note = v_note, reviewed_by = v_actor, reviewed_at = clock_timestamp() where id = p_id;
    perform private.write_audit(v_actor, 'staff', 'staff.application.review', 'success', null, 'application', p_id::text, jsonb_build_object('decision', 'reject'));
    return jsonb_build_object('ok', true, 'code', 'rejected');
  end if;
  begin
    insert into public.organizations (name, code, payment_terms) values (left(v_co, 200), p_org_code, 'prepay') returning id into v_org;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'code_taken');
  end;
  select u.id into v_user from auth.users u where lower(u.email) = v_email and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now()) limit 1;
  if v_user is not null then
    begin
      insert into public.organization_members (organization_id, user_id, role) values (v_org, v_user, 'owner');
      v_owner := true;
    exception when sqlstate '23514' then
      v_owner := false;
    end;
  end if;
  update public.organization_applications set status = 'approved', organization_id = v_org, review_note = v_note, reviewed_by = v_actor, reviewed_at = clock_timestamp() where id = p_id;
  perform private.write_audit(v_actor, 'staff', 'staff.application.review', 'success', v_org, 'application', p_id::text, jsonb_build_object('decision', 'approve', 'owner_added', v_owner));
  return jsonb_build_object('ok', true, 'code', 'approved', 'organization_id', v_org, 'owner_added', v_owner);
end;
$$;

-- The customer directory: active members with their organizations. E-mail and name need profiles.read.basic; the phone number needs profiles.read.full. Every read is audited.
create function public.rpc_admin_customers_list(p_query text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_full  boolean := private.has_capability('profiles.read.full');
  v_q     text := nullif(lower(btrim(coalesce(p_query, ''))), '');
begin
  v_gate := private.staff_gate('profiles.read.basic', 'staff.customers.list', false, 'profile', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if v_q is not null and char_length(v_q) > 100 then raise exception 'invalid arguments' using errcode = '22023'; end if;
  perform private.write_audit(v_actor, 'staff', 'staff.profiles.read', 'success', null, 'profile', null, jsonb_build_object('via', 'customers_list', 'full', v_full, 'filtered', v_q is not null));
  return jsonb_build_object('ok', true, 'can_see_phone', v_full, 'customers',
    (select coalesce(jsonb_agg(jsonb_build_object('user_id', c.user_id, 'email', c.email, 'name', c.full_name, 'phone', case when v_full then c.phone else null end, 'organization_id', c.org_id,
                                                  'organization_name', c.org_name, 'organization_code', c.org_code, 'role', c.role, 'joined', c.joined) order by c.email), '[]'::jsonb)
       from (select m.user_id, u.email, p.full_name, p.phone, g.id as org_id, g.name as org_name, g.code as org_code, m.role, m.created_at as joined
               from public.organization_members m join auth.users u on u.id = m.user_id join public.organizations g on g.id = m.organization_id left join public.profiles p on p.user_id = m.user_id
              where m.status = 'active' and (v_q is null or position(v_q in lower(u.email)) > 0 or position(v_q in lower(coalesce(p.full_name, ''))) > 0)
              order by u.email limit 200) c));
end;
$$;

-- The audit log (read only). The prefix filter is a plain prefix, never a pattern.
create function public.rpc_admin_audit_list(p_action_prefix text default null, p_organization_id uuid default null, p_limit integer default 100) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate   text;
  v_prefix text := nullif(btrim(coalesce(p_action_prefix, '')), '');
begin
  v_gate := private.staff_gate('audit.read', 'staff.audit.list', false, 'audit', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if v_prefix is not null and (char_length(v_prefix) > 40 or v_prefix !~ '^[a-z._]+$') then raise exception 'invalid arguments' using errcode = '22023'; end if;
  return jsonb_build_object('ok', true, 'events',
    (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'occurred_at', e.occurred_at, 'actor_kind', e.actor_kind, 'actor_roles', to_jsonb(e.actor_roles), 'action', e.action, 'outcome', e.outcome,
                                                  'organization_name', g.name, 'subject_type', e.subject_type, 'subject_id', e.subject_id, 'detail', e.detail) order by e.occurred_at desc, e.id), '[]'::jsonb)
       from (select x.id, x.occurred_at, x.actor_kind, x.actor_roles, x.action, x.outcome, x.organization_id, x.subject_type, x.subject_id, x.detail from public.audit_events x
              where (v_prefix is null or left(x.action, char_length(v_prefix)) = v_prefix) and (p_organization_id is null or x.organization_id = p_organization_id)
              order by x.occurred_at desc, x.id limit least(greatest(coalesce(p_limit, 100), 1), 300)) e left join public.organizations g on g.id = e.organization_id));
end;
$$;

create function public.rpc_admin_settings_get() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
begin
  v_gate := private.staff_gate('flags.read', 'staff.settings.get', false, 'settings', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  return jsonb_build_object('ok', true,
    'settings', (select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb) from public.platform_settings s),
    'flags', (select coalesce(jsonb_object_agg(pf.key, pf.enabled), '{}'::jsonb) from public.platform_flags pf),
    'gates', (select coalesce(jsonb_object_agg(g.code, g.status), '{}'::jsonb) from public.compliance_gates g));
end;
$$;

create function public.rpc_admin_setting_set(p_key text, p_value text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_value text := btrim(coalesce(p_value, ''));
begin
  v_gate := private.staff_gate('flags.write', 'staff.setting.set', true, 'setting', p_key);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_key is null or p_key not in ('payment_instructions', 'invoice_footer') or char_length(v_value) > 2000 then raise exception 'invalid arguments' using errcode = '22023'; end if;
  update public.platform_settings set value = v_value, updated_by = v_actor, updated_at = clock_timestamp() where key = p_key;
  perform private.write_audit(v_actor, 'staff', 'staff.setting.set', 'success', null, 'setting', p_key, jsonb_build_object('length', char_length(v_value)));
  return jsonb_build_object('ok', true, 'code', 'updated');
end;
$$;

create function public.rpc_admin_fee_list() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
begin
  v_gate := private.staff_gate('org.billing.read', 'staff.fees.list', false, 'fee_schedule', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  return jsonb_build_object('ok', true, 'fees',
    (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'code', x.code, 'name', x.name, 'amount_cents', x.amount_cents, 'unit', x.unit, 'note', x.note, 'effective_from', x.effective_from,
                                                  'effective_to', x.effective_to) order by x.code, x.effective_from desc), '[]'::jsonb)
       from (select y.id, y.code, y.name, y.amount_cents, y.unit, y.note, y.effective_from, y.effective_to from public.fee_schedules y order by y.code, y.effective_from desc limit 300) x));
end;
$$;

-- Saves a fee. A change to an existing code closes its open row the day before the new one starts; the old row is never rewritten.
create function public.rpc_admin_fee_save(p_code text, p_name text, p_amount_cents bigint, p_unit text, p_note text, p_effective_from date) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_name  text := btrim(coalesce(p_name, ''));
  v_open  record;
  v_id    uuid;
begin
  v_gate := private.staff_gate('financial.write', 'staff.fee.save', true, 'fee_schedule', p_code);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_code is null or p_code !~ '^[a-z0-9_]{2,40}$' or char_length(v_name) not between 1 and 120 or p_amount_cents is null or p_amount_cents not between 0 and 100000000
     or p_unit is null or p_unit not in ('flat', 'per_order', 'per_unit', 'per_box', 'per_pallet', 'per_month') or char_length(coalesce(p_note, '')) > 300
     or p_effective_from is null or p_effective_from < date '2020-01-01' or p_effective_from > current_date + 366 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  select x.id, x.effective_from into v_open from public.fee_schedules x where x.code = p_code and x.effective_to is null for update;
  if found then
    if p_effective_from <= v_open.effective_from then return jsonb_build_object('ok', false, 'code', 'effective_date_invalid'); end if;
    update public.fee_schedules set effective_to = p_effective_from - 1 where id = v_open.id;
  end if;
  insert into public.fee_schedules (code, name, amount_cents, unit, note, effective_from, created_by) values (p_code, v_name, p_amount_cents, p_unit, nullif(btrim(coalesce(p_note, '')), ''), p_effective_from, v_actor) returning id into v_id;
  perform private.write_audit(v_actor, 'staff', 'staff.fee.save', 'success', null, 'fee_schedule', v_id::text, jsonb_build_object('code', p_code, 'amount_cents', p_amount_cents, 'unit', p_unit, 'effective_from', p_effective_from));
  return jsonb_build_object('ok', true, 'code', 'saved', 'id', v_id);
end;
$$;

create function public.rpc_admin_fee_retire(p_code text, p_effective_to date) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_id    uuid;
  v_from  date;
begin
  v_gate := private.staff_gate('financial.write', 'staff.fee.retire', true, 'fee_schedule', p_code);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_code is null or p_code !~ '^[a-z0-9_]{2,40}$' or p_effective_to is null or p_effective_to > current_date + 366 then raise exception 'invalid arguments' using errcode = '22023'; end if;
  select x.id, x.effective_from into v_id, v_from from public.fee_schedules x where x.code = p_code and x.effective_to is null for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if p_effective_to < v_from then return jsonb_build_object('ok', false, 'code', 'effective_date_invalid'); end if;
  update public.fee_schedules set effective_to = p_effective_to where id = v_id;
  perform private.write_audit(v_actor, 'staff', 'staff.fee.retire', 'success', null, 'fee_schedule', v_id::text, jsonb_build_object('code', p_code, 'effective_to', p_effective_to));
  return jsonb_build_object('ok', true, 'code', 'retired');
end;
$$;

-- 5. Privileges ---------------------------------------------------------------------------------------------------------------------------
revoke all on table public.organization_applications, public.platform_settings, public.fee_schedules from public, anon, authenticated, service_role;

revoke all on function private.guard_adminops_applications(), private.guard_adminops_fees(), private.guard_adminops_settings() from public, anon, authenticated, service_role;

revoke all on function public.rpc_payment_instructions(), public.rpc_fee_schedule_current(), public.rpc_org_members_list(uuid), public.rpc_profile_get(), public.rpc_profile_update(text, text),
                       public.rpc_admin_dashboard(), public.rpc_admin_orgs_overview(), public.rpc_admin_org_detail(uuid), public.rpc_admin_org_set_status(uuid, text, text), public.rpc_admin_org_set_terms(uuid, text),
                       public.rpc_admin_member_set(uuid, uuid, text, text), public.rpc_admin_application_create(text, text, text, text, text, text), public.rpc_admin_applications_list(text),
                       public.rpc_admin_application_review(uuid, text, text, text), public.rpc_admin_customers_list(text), public.rpc_admin_audit_list(text, uuid, integer), public.rpc_admin_settings_get(),
                       public.rpc_admin_setting_set(text, text), public.rpc_admin_fee_list(), public.rpc_admin_fee_save(text, text, bigint, text, text, date), public.rpc_admin_fee_retire(text, date)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_payment_instructions(), public.rpc_fee_schedule_current(), public.rpc_org_members_list(uuid), public.rpc_profile_get(), public.rpc_profile_update(text, text),
                          public.rpc_admin_dashboard(), public.rpc_admin_orgs_overview(), public.rpc_admin_org_detail(uuid), public.rpc_admin_org_set_status(uuid, text, text), public.rpc_admin_org_set_terms(uuid, text),
                          public.rpc_admin_member_set(uuid, uuid, text, text), public.rpc_admin_application_create(text, text, text, text, text, text), public.rpc_admin_applications_list(text),
                          public.rpc_admin_application_review(uuid, text, text, text), public.rpc_admin_customers_list(text), public.rpc_admin_audit_list(text, uuid, integer), public.rpc_admin_settings_get(),
                          public.rpc_admin_setting_set(text, text), public.rpc_admin_fee_list(), public.rpc_admin_fee_save(text, text, bigint, text, text, date), public.rpc_admin_fee_retire(text, date)
  to authenticated;

-- 6. Self-check ---------------------------------------------------------------------------------------------------------------------------
do $$
declare
  t text;
  p text;
begin
  foreach t in array array['public.organization_applications', 'public.platform_settings', 'public.fee_schedules'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = t::regclass) then raise exception 'self-check: RLS not enabled on %', t; end if;
    foreach p in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
      if has_table_privilege('anon', t, p) or has_table_privilege('authenticated', t, p) or has_table_privilege('service_role', t, p) then raise exception 'self-check: an API role has % on %', p, t; end if;
    end loop;
  end loop;
  if (select count(*) from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
       where n.nspname = 'public' and pr.proname in ('rpc_payment_instructions', 'rpc_fee_schedule_current', 'rpc_org_members_list', 'rpc_profile_get', 'rpc_profile_update', 'rpc_admin_dashboard', 'rpc_admin_orgs_overview',
             'rpc_admin_org_detail', 'rpc_admin_org_set_status', 'rpc_admin_org_set_terms', 'rpc_admin_member_set', 'rpc_admin_application_create', 'rpc_admin_applications_list', 'rpc_admin_application_review',
             'rpc_admin_customers_list', 'rpc_admin_audit_list', 'rpc_admin_settings_get', 'rpc_admin_setting_set', 'rpc_admin_fee_list', 'rpc_admin_fee_save', 'rpc_admin_fee_retire')
         and pr.prosecdef and has_function_privilege('authenticated', pr.oid, 'execute') and not has_function_privilege('anon', pr.oid, 'execute')
         and not has_function_privilege('service_role', pr.oid, 'execute') and not has_function_privilege('public', pr.oid, 'execute')
         and exists (select 1 from unnest(pr.proconfig) c where regexp_replace(c, '[\s"'']', '', 'g') ~* '^search_path=$')) <> 21 then
    raise exception 'self-check: RPC definer, search_path or grant state is wrong';
  end if;
  if (select array_agg(pr.proname::text order by pr.proname) from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace where n.nspname = 'public' and has_function_privilege('anon', pr.oid, 'execute'))
     is distinct from array['rpc_api_order_create', 'rpc_api_order_get', 'rpc_api_orders_list', 'rpc_worker_claim_deliveries', 'rpc_worker_record_result'] then
    raise exception 'self-check: the anon-executable set changed (it must stay exactly the five key-authenticated RPCs)';
  end if;
  if exists (select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace where n.nspname = 'private' and pr.proname like 'guard\_adminops\_%'
              and (has_function_privilege('authenticated', pr.oid, 'execute') or has_function_privilege('anon', pr.oid, 'execute'))) then
    raise exception 'self-check: an admin-operations private helper is executable by an API role';
  end if;
  if (select count(*) from public.platform_settings) <> 2 or exists (select 1 from public.organization_applications) or exists (select 1 from public.fee_schedules) then raise exception 'self-check: seed or empty-table state'; end if;
  if (select count(*) from pg_trigger tg where not tg.tgisinternal and tg.tgrelid in ('public.organization_applications'::regclass, 'public.platform_settings'::regclass, 'public.fee_schedules'::regclass)) <> 6 then
    raise exception 'self-check: expected 6 triggers on the admin-operations tables';
  end if;
end;
$$;
