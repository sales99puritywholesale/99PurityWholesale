-- =====================================================================================================================================
-- P9 DRAFT. NOT APPLIED. NOT EXECUTED. NEVER PARSED BY POSTGRESQL.
-- After-sales: certificates of analysis (lots and fulfillment orders), referral commissions (plans, codes, an append-only ledger accrued from paid invoices after a hold,
-- manual payouts), e-mail notifications (templates, preferences, an outbox; no provider is wired) and reports (sales, receivables, inventory, commissions).
-- Depends on 0001 to 0004 and P3 to P8 (documents, inventory_lots, fulfillment_orders, shipments, invoices, payments, invoice_lines, platform_flags).
-- Reuses existing capabilities only (inventory.adjust, documents.read, org.read, org.manage, org.billing.read, financial.write, profiles.read.basic, flags.read, flags.write):
-- no change to the staff catalog and NO new anon-callable function. TypeScript mirror: src/lib/portal/aftersales/.
-- =====================================================================================================================================

-- 1. Certificates ---------------------------------------------------------------------------------------------------------------------
-- The composite keys let a certificate prove, in the database, that its lot and its order belong to the same organization as the certificate.
alter table public.inventory_lots add constraint inventory_lots_id_org_key unique (id, organization_id);
alter table public.fulfillment_orders add constraint fulfillment_orders_id_org_key unique (id, organization_id);

create table public.certificates (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete restrict,
  lot_id               uuid,
  fulfillment_order_id uuid,
  document_id          uuid not null unique,
  title                text not null check (char_length(btrim(title)) between 1 and 160),
  issued_on            date check (issued_on is null or issued_on between date '2000-01-01' and date '2100-01-01'),
  status               text not null default 'published' check (status in ('published', 'withdrawn')),
  withdrawn_at         timestamptz,
  withdrawn_by         uuid,
  withdraw_reason      text check (withdraw_reason is null or char_length(withdraw_reason) <= 300),
  created_by           uuid not null,
  created_at           timestamptz not null default clock_timestamp(),
  constraint certificates_target check (lot_id is not null or fulfillment_order_id is not null),
  constraint certificates_withdrawn_consistent check ((status = 'withdrawn') = (withdrawn_at is not null and withdrawn_by is not null and withdraw_reason is not null)),
  constraint certificates_document_fk foreign key (document_id, organization_id) references public.documents (id, organization_id) on delete restrict,
  constraint certificates_lot_fk foreign key (lot_id, organization_id) references public.inventory_lots (id, organization_id) on delete restrict,
  constraint certificates_order_fk foreign key (fulfillment_order_id, organization_id) references public.fulfillment_orders (id, organization_id) on delete restrict
);
create index certificates_org_idx on public.certificates (organization_id, created_at desc);
create index certificates_lot_idx on public.certificates (lot_id);

-- 2. Commissions ----------------------------------------------------------------------------------------------------------------------
create table public.commission_plans (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[a-z0-9_]{2,40}$'),
  name       text not null check (char_length(btrim(name)) between 1 and 120),
  rate_bps   integer not null check (rate_bps between 1 and 5000),
  hold_days  integer not null default 14 check (hold_days between 0 and 90),
  active     boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp()
);

-- One referral code per referring organization. The plan can be changed for FUTURE accruals; every accrual stores the rate and hold it was computed with.
create table public.referral_codes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete restrict,
  code            text not null unique check (code ~ '^[A-Z0-9]{6,12}$'),
  plan_id         uuid not null references public.commission_plans (id) on delete restrict,
  active          boolean not null default true,
  created_by      uuid not null,
  created_at      timestamptz not null default clock_timestamp(),
  constraint referral_codes_id_org_key unique (id, organization_id)
);

-- A referred organization has at most one referrer. Links are made by staff (there is no public sign-up yet) and can only be ended, never edited.
create table public.organization_referrals (
  id               uuid primary key default gen_random_uuid(),
  referral_code_id uuid not null,
  referrer_org_id  uuid not null references public.organizations (id) on delete restrict,
  referred_org_id  uuid not null unique references public.organizations (id) on delete restrict,
  status           text not null default 'active' check (status in ('active', 'ended')),
  started_on       date not null default current_date,
  ended_on         date,
  end_reason       text check (end_reason is null or char_length(end_reason) <= 300),
  created_by       uuid not null,
  created_at       timestamptz not null default clock_timestamp(),
  constraint referrals_not_self check (referrer_org_id <> referred_org_id),
  constraint referrals_ended_consistent check ((status = 'ended') = (ended_on is not null and end_reason is not null)),
  constraint referrals_code_fk foreign key (referral_code_id, referrer_org_id) references public.referral_codes (id, organization_id) on delete restrict
);
create index organization_referrals_referrer_idx on public.organization_referrals (referrer_org_id);

create table public.commission_payouts (
  id              uuid primary key default gen_random_uuid(),
  referrer_org_id uuid not null references public.organizations (id) on delete restrict,
  amount_cents    bigint not null check (amount_cents between 1 and 1000000000000),
  method          text not null check (method in ('wire', 'zelle', 'ach', 'check', 'other')),
  reference       text check (reference is null or char_length(reference) <= 120),
  paid_on         date not null,
  idempotency_key uuid not null unique,
  created_by      uuid not null,
  created_at      timestamptz not null default clock_timestamp()
);
create index commission_payouts_org_idx on public.commission_payouts (referrer_org_id, created_at desc);

-- Append-only ledger of signed cents per referring organization. accrual: positive, one per paid invoice, available after the hold. payout: negative, one per payout.
-- adjustment: signed, needs a reason. The balance is derived (private.comm_balance); nothing here is ever updated or deleted.
create table public.commission_entries (
  id              uuid primary key default gen_random_uuid(),
  referrer_org_id uuid not null references public.organizations (id) on delete restrict,
  referred_org_id uuid references public.organizations (id) on delete restrict,
  entry_type      text not null check (entry_type in ('accrual', 'adjustment', 'payout')),
  amount_cents    bigint not null check (amount_cents <> 0 and amount_cents between -1000000000000 and 1000000000000),
  invoice_id      uuid references public.invoices (id) on delete restrict,
  base_cents      bigint check (base_cents is null or base_cents between 1 and 1000000000000),
  rate_bps        integer check (rate_bps is null or rate_bps between 1 and 5000),
  available_at    timestamptz,
  payout_id       uuid references public.commission_payouts (id) on delete restrict,
  reason          text check (reason is null or char_length(reason) <= 300),
  idempotency_key uuid unique,
  created_by      uuid not null,
  created_at      timestamptz not null default clock_timestamp(),
  constraint commission_entries_accrual_shape check (entry_type <> 'accrual' or (amount_cents > 0 and invoice_id is not null and referred_org_id is not null and base_cents is not null
                                                     and rate_bps is not null and available_at is not null and payout_id is null)),
  constraint commission_entries_payout_shape check (entry_type <> 'payout' or (amount_cents < 0 and payout_id is not null and invoice_id is null and available_at is null)),
  constraint commission_entries_adjustment_shape check (entry_type <> 'adjustment' or (reason is not null and invoice_id is null and payout_id is null and available_at is null and idempotency_key is not null))
);
create unique index commission_entries_one_accrual_per_invoice on public.commission_entries (invoice_id) where entry_type = 'accrual';
create unique index commission_entries_one_entry_per_payout on public.commission_entries (payout_id) where entry_type = 'payout';
create index commission_entries_referrer_idx on public.commission_entries (referrer_org_id, created_at desc);

-- 3. Notifications --------------------------------------------------------------------------------------------------------------------
-- Plain-text e-mail only. A template may use {{name}} placeholders from the fixed list of its key (private.notif_vars); values are plain text with line breaks removed.
create table public.notification_templates (
  key        text primary key check (key in ('invoice_issued', 'payment_confirmed', 'payment_rejected', 'order_shipped', 'certificate_available', 'commission_payout')),
  category   text not null check (category in ('billing', 'fulfillment', 'certificates', 'commissions')),
  subject    text not null check (char_length(btrim(subject)) between 1 and 150 and subject !~ '[\r\n]'),
  body       text not null check (char_length(btrim(body)) between 1 and 4000),
  updated_by uuid,
  updated_at timestamptz not null default clock_timestamp()
);
insert into public.notification_templates (key, category, subject, body) values
  ('invoice_issued', 'billing', 'Invoice {{invoice_number}} for {{total}}',
   E'A new invoice is ready in your portal.\n\nInvoice: {{invoice_number}}\nAmount: {{total}}\nDue: {{due_date}}\n\nOpen the Invoices page in your portal to see the payment instructions.'),
  ('payment_confirmed', 'billing', 'Payment received for invoice {{invoice_number}}',
   E'We received and confirmed your payment of {{amount}} for invoice {{invoice_number}}.\n\nThank you.'),
  ('payment_rejected', 'billing', 'We could not confirm your payment for invoice {{invoice_number}}',
   E'We could not confirm the payment you reported for invoice {{invoice_number}}.\n\nOpen the invoice in your portal to see the details and report the payment again if needed.'),
  ('order_shipped', 'fulfillment', 'Order {{order_number}} has shipped',
   E'Order {{order_number}} has shipped.\n\nCarrier: {{carrier}}\nTracking number: {{tracking_number}}'),
  ('certificate_available', 'certificates', 'A certificate of analysis is available: {{title}}',
   E'A new certificate of analysis was added to your portal.\n\nCertificate: {{title}}\n\nOpen the Certificates page in your portal to download it.'),
  ('commission_payout', 'commissions', 'Commission payout of {{amount}} recorded',
   E'A commission payout of {{amount}} was recorded for your organization.\n\nOpen the Commissions page in your portal to see your statement.');

-- Optional categories only. Billing messages are mandatory and have no preference row.
create table public.notification_preferences (
  user_id    uuid not null,
  category   text not null check (category in ('fulfillment', 'certificates', 'commissions')),
  enabled    boolean not null,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, category)
);

create table public.email_outbox (
  id              uuid primary key default gen_random_uuid(),
  dedupe_key      text not null unique check (char_length(dedupe_key) between 1 and 200),
  template_key    text not null references public.notification_templates (key) on delete restrict,
  category        text not null check (category in ('billing', 'fulfillment', 'certificates', 'commissions')),
  user_id         uuid not null,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  recipient_email text not null check (char_length(recipient_email) <= 254),
  subject         text not null check (char_length(subject) between 1 and 400),
  body            text not null check (char_length(body) between 1 and 8000),
  status          text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  attempts        integer not null default 0 check (attempts between 0 and 10),
  next_attempt_at timestamptz not null default clock_timestamp(),
  claimed_at      timestamptz,
  last_error      text check (last_error is null or char_length(last_error) <= 200),
  provider_ref    text check (provider_ref is null or char_length(provider_ref) <= 120),
  created_at      timestamptz not null default clock_timestamp(),
  sent_at         timestamptz,
  constraint email_outbox_sent_consistent check ((status = 'sent') = (sent_at is not null))
);
create index email_outbox_queue_idx on public.email_outbox (status, next_attempt_at);
create index email_outbox_org_idx on public.email_outbox (organization_id, created_at desc);

alter table public.certificates             enable row level security;
alter table public.commission_plans         enable row level security;
alter table public.referral_codes           enable row level security;
alter table public.organization_referrals   enable row level security;
alter table public.commission_payouts       enable row level security;
alter table public.commission_entries       enable row level security;
alter table public.notification_templates   enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.email_outbox             enable row level security;

-- 4. Guards ---------------------------------------------------------------------------------------------------------------------------
create function private.guard_p9_certificates() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'certificates cannot be deleted' using errcode = '23514'; end if;
  if new.id <> old.id or new.organization_id <> old.organization_id or new.lot_id is distinct from old.lot_id or new.fulfillment_order_id is distinct from old.fulfillment_order_id
     or new.document_id <> old.document_id or new.title <> old.title or new.issued_on is distinct from old.issued_on or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'a certificate is immutable except for withdrawing it' using errcode = '23514';
  end if;
  if old.status = 'withdrawn' then raise exception 'a withdrawn certificate is final' using errcode = '23514'; end if;
  return new;
end;
$$;

-- Plans and referral codes: only the active flag (and, for a code, its plan) may change. Referral links: only ending. Payouts and ledger entries: never changed.
create function private.guard_p9_plans() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'commission plans cannot be deleted' using errcode = '23514'; end if;
  if new.id <> old.id or new.code <> old.code or new.name <> old.name or new.rate_bps <> old.rate_bps or new.hold_days <> old.hold_days or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'a commission plan is immutable except for its active flag' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function private.guard_p9_codes() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'referral codes cannot be deleted' using errcode = '23514'; end if;
  if new.id <> old.id or new.organization_id <> old.organization_id or new.code <> old.code or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'a referral code is immutable except for its plan and active flag' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function private.guard_p9_referrals() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'referral links cannot be deleted' using errcode = '23514'; end if;
  if new.id <> old.id or new.referral_code_id <> old.referral_code_id or new.referrer_org_id <> old.referrer_org_id or new.referred_org_id <> old.referred_org_id
     or new.started_on <> old.started_on or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'a referral link can only be ended' using errcode = '23514';
  end if;
  if old.status = 'ended' then raise exception 'an ended referral link is final' using errcode = '23514'; end if;
  return new;
end;
$$;

create function private.guard_p9_append_only() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '23514';
end;
$$;

create function private.guard_p9_templates() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'notification templates cannot be deleted' using errcode = '23514'; end if;
  if new.key <> old.key or new.category <> old.category then raise exception 'template key and category are immutable' using errcode = '23514'; end if;
  return new;
end;
$$;

-- An outbox row's content never changes; only its delivery state does, and a sent row is final.
create function private.guard_p9_outbox() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'outbox rows cannot be deleted' using errcode = '23514'; end if;
  if new.id <> old.id or new.dedupe_key <> old.dedupe_key or new.template_key <> old.template_key or new.category <> old.category or new.user_id <> old.user_id
     or new.organization_id <> old.organization_id or new.recipient_email <> old.recipient_email or new.subject <> old.subject or new.body <> old.body or new.created_at <> old.created_at then
    raise exception 'an outbox message is immutable except for its delivery state' using errcode = '23514';
  end if;
  if old.status in ('sent', 'failed') and (new.status <> old.status or new.attempts <> old.attempts) then raise exception 'a finished outbox message is final' using errcode = '23514'; end if;
  return new;
end;
$$;

create trigger certificates_guard before update or delete on public.certificates for each row execute function private.guard_p9_certificates();
create trigger commission_plans_guard before update or delete on public.commission_plans for each row execute function private.guard_p9_plans();
create trigger referral_codes_guard before update or delete on public.referral_codes for each row execute function private.guard_p9_codes();
create trigger organization_referrals_guard before update or delete on public.organization_referrals for each row execute function private.guard_p9_referrals();
create trigger commission_payouts_append_only before update or delete on public.commission_payouts for each row execute function private.guard_p9_append_only();
create trigger commission_entries_append_only before update or delete on public.commission_entries for each row execute function private.guard_p9_append_only();
create trigger notification_templates_guard before update or delete on public.notification_templates for each row execute function private.guard_p9_templates();
create trigger email_outbox_guard before update or delete on public.email_outbox for each row execute function private.guard_p9_outbox();
create trigger certificates_no_truncate before truncate on public.certificates for each statement execute function private.block_truncate();
create trigger commission_plans_no_truncate before truncate on public.commission_plans for each statement execute function private.block_truncate();
create trigger referral_codes_no_truncate before truncate on public.referral_codes for each statement execute function private.block_truncate();
create trigger organization_referrals_no_truncate before truncate on public.organization_referrals for each statement execute function private.block_truncate();
create trigger commission_payouts_no_truncate before truncate on public.commission_payouts for each statement execute function private.block_truncate();
create trigger commission_entries_no_truncate before truncate on public.commission_entries for each statement execute function private.block_truncate();
create trigger notification_templates_no_truncate before truncate on public.notification_templates for each statement execute function private.block_truncate();
create trigger notification_preferences_no_truncate before truncate on public.notification_preferences for each statement execute function private.block_truncate();
create trigger email_outbox_no_truncate before truncate on public.email_outbox for each statement execute function private.block_truncate();

-- Staff with inventory.adjust may upload certificate files into the private bucket (the file must still be registered by rpc_admin_certificate_publish, which re-reads the object).
create policy portal_documents_cert_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'portal-documents' and private.staff_session_ok() and private.has_capability('inventory.adjust')
              and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg|jpeg)$');

-- 5. Private helpers ------------------------------------------------------------------------------------------------------------------
create function private.notif_vars(p_key text) returns text[]
language sql immutable set search_path = ''
as $$
  select case p_key
    when 'invoice_issued' then array['invoice_number', 'total', 'due_date']
    when 'payment_confirmed' then array['invoice_number', 'amount']
    when 'payment_rejected' then array['invoice_number']
    when 'order_shipped' then array['order_number', 'carrier', 'tracking_number']
    when 'certificate_available' then array['title']
    when 'commission_payout' then array['amount']
    else array[]::text[]
  end;
$$;

create function private.notif_render(p_text text, p_key text, p_vars jsonb) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  k text;
  v_out text := p_text;
begin
  foreach k in array private.notif_vars(p_key) loop
    v_out := replace(v_out, '{{' || k || '}}', left(regexp_replace(coalesce(p_vars ->> k, ''), '[\r\n\t]+', ' ', 'g'), 200));
  end loop;
  return v_out;
end;
$$;

-- Queues one message per active OWNER of the organization (billing messages ignore preferences; the others respect them). The dedupe key makes every producer safe to repeat.
create function private.notif_enqueue(p_template text, p_org uuid, p_vars jsonb, p_dedupe text) returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_t record;
  v_n integer;
begin
  select t.category, t.subject, t.body into v_t from public.notification_templates t where t.key = p_template;
  if not found then return 0; end if;
  insert into public.email_outbox (dedupe_key, template_key, category, user_id, organization_id, recipient_email, subject, body)
  select left(p_dedupe, 160) || ':' || m.user_id::text, p_template, v_t.category, m.user_id, p_org, lower(u.email),
         private.notif_render(v_t.subject, p_template, p_vars), private.notif_render(v_t.body, p_template, p_vars)
    from public.organization_members m join auth.users u on u.id = m.user_id
   where m.organization_id = p_org and m.role = 'owner' and m.status = 'active' and u.email is not null and char_length(u.email) <= 254
     and (v_t.category = 'billing' or not exists (select 1 from public.notification_preferences np where np.user_id = m.user_id and np.category = v_t.category and np.enabled = false))
  on conflict (dedupe_key) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create function private.comm_balance(p_org uuid) returns table (pending_cents bigint, available_cents bigint, paid_out_cents bigint)
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(e.amount_cents) filter (where e.entry_type = 'accrual' and e.available_at > clock_timestamp()), 0)::bigint,
         coalesce(sum(e.amount_cents) filter (where (e.entry_type = 'accrual' and e.available_at <= clock_timestamp()) or e.entry_type in ('adjustment', 'payout')), 0)::bigint,
         coalesce(sum(-e.amount_cents) filter (where e.entry_type = 'payout'), 0)::bigint
    from public.commission_entries e where e.referrer_org_id = p_org;
$$;

-- 6. Certificates: customer and staff RPCs --------------------------------------------------------------------------------------------
create function public.rpc_certificates_list(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not (p_organization_id in (select private.my_org_ids())) or private.shop_org_ok(p_organization_id) is not true then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  return jsonb_build_object('ok', true, 'certificates',
    (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'issued_on', x.issued_on, 'status', x.status, 'lot_number', x.lot_number, 'product_name', x.product_name,
                                                  'order_number', x.order_number, 'file_name', x.file_name, 'storage_path', case when x.status = 'published' then x.storage_path else null end,
                                                  'created_at', x.created_at) order by x.created_at desc), '[]'::jsonb)
       from (select c.id, c.title, c.issued_on, c.status, c.created_at, lo.lot_number, coalesce(m.product_name, pr.name) as product_name, fo.order_number, d.file_name, d.storage_path
               from public.certificates c join public.documents d on d.id = c.document_id
               left join public.inventory_lots lo on lo.id = c.lot_id left join public.sku_mappings m on m.id = lo.sku_mapping_id
               left join public.product_variants v on v.id = m.variant_id left join public.products pr on pr.id = v.product_id
               left join public.fulfillment_orders fo on fo.id = c.fulfillment_order_id
              where c.organization_id = p_organization_id order by c.created_at desc limit 200) x));
end;
$$;

create function public.rpc_admin_certificates_list(p_organization_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
begin
  v_gate := private.staff_gate('documents.read', 'staff.certificates.list', false, 'certificate', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  return jsonb_build_object('ok', true, 'certificates',
    (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'organization_id', x.organization_id, 'organization_name', x.organization_name, 'title', x.title, 'issued_on', x.issued_on, 'status', x.status,
                                                  'lot_number', x.lot_number, 'order_number', x.order_number, 'file_name', x.file_name, 'storage_path', x.storage_path, 'withdraw_reason', x.withdraw_reason,
                                                  'created_at', x.created_at) order by x.created_at desc), '[]'::jsonb)
       from (select c.id, c.organization_id, g.name as organization_name, c.title, c.issued_on, c.status, c.created_at, c.withdraw_reason, lo.lot_number, fo.order_number, d.file_name, d.storage_path
               from public.certificates c join public.documents d on d.id = c.document_id join public.organizations g on g.id = c.organization_id
               left join public.inventory_lots lo on lo.id = c.lot_id left join public.fulfillment_orders fo on fo.id = c.fulfillment_order_id
              where p_organization_id is null or c.organization_id = p_organization_id order by c.created_at desc limit 200) x));
end;
$$;

-- The lots and orders a certificate can be attached to, for one organization.
create function public.rpc_admin_certificate_targets(p_organization_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
begin
  v_gate := private.staff_gate('inventory.adjust', 'staff.certificate.targets', false, 'organization', p_organization_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_organization_id is null or not exists (select 1 from public.organizations g where g.id = p_organization_id) then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  return jsonb_build_object('ok', true,
    'lots', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'lot_number', t.lot_number, 'product_name', t.product_name, 'expires_on', t.expires_on) order by t.created_at desc), '[]'::jsonb)
               from (select lo.id, lo.lot_number, lo.expires_on, lo.created_at, coalesce(m.product_name, pr.name) as product_name
                       from public.inventory_lots lo join public.sku_mappings m on m.id = lo.sku_mapping_id left join public.product_variants v on v.id = m.variant_id left join public.products pr on pr.id = v.product_id
                      where lo.organization_id = p_organization_id order by lo.created_at desc limit 200) t),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'order_number', t.order_number, 'status', t.status) order by t.created_at desc), '[]'::jsonb)
                 from (select o.id, o.order_number, o.status, o.created_at from public.fulfillment_orders o where o.organization_id = p_organization_id and not o.is_sandbox order by o.created_at desc limit 200) t));
end;
$$;

-- Registers the already uploaded file (the object is read back from storage: size and type never come from the caller) and publishes the certificate in ONE transaction.
create function public.rpc_admin_certificate_publish(p_organization_id uuid, p_document_id uuid, p_file_name text, p_lot_id uuid, p_order_id uuid, p_title text, p_issued_on date) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_name  text := nullif(btrim(coalesce(p_file_name, '')), '');
  v_title text := btrim(coalesce(p_title, ''));
  v_path  text;
  v_size  bigint;
  v_type  text;
  v_id    uuid;
  v_lot   text;
begin
  v_gate := private.staff_gate('inventory.adjust', 'staff.certificate.publish', false, 'certificate', p_document_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_organization_id is null or p_document_id is null or v_name is null or char_length(v_name) > 200 or char_length(v_title) not between 1 and 160
     or (p_lot_id is null and p_order_id is null) or (p_issued_on is not null and p_issued_on not between date '2000-01-01' and date '2100-01-01') then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organizations g where g.id = p_organization_id) then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  if p_lot_id is not null then
    select lo.lot_number into v_lot from public.inventory_lots lo where lo.id = p_lot_id and lo.organization_id = p_organization_id;
    if not found then return jsonb_build_object('ok', false, 'code', 'target_not_found'); end if;
  end if;
  if p_order_id is not null and not exists (select 1 from public.fulfillment_orders o where o.id = p_order_id and o.organization_id = p_organization_id) then
    return jsonb_build_object('ok', false, 'code', 'target_not_found');
  end if;
  if exists (select 1 from public.certificates c where c.document_id = p_document_id) then return jsonb_build_object('ok', false, 'code', 'already_published'); end if;
  select o.name, (o.metadata ->> 'size')::bigint, o.metadata ->> 'mimetype' into v_path, v_size, v_type
    from storage.objects o where o.bucket_id = 'portal-documents' and o.name like p_organization_id::text || '/' || p_document_id::text || '.%';
  if v_path is null then return jsonb_build_object('ok', false, 'code', 'document_not_found'); end if;
  if v_type is null or v_type not in ('application/pdf', 'image/png', 'image/jpeg') or v_size is null or v_size < 1 or v_size > 10485760 then return jsonb_build_object('ok', false, 'code', 'document_invalid'); end if;
  insert into public.documents (id, organization_id, kind, file_name, content_type, size_bytes, storage_path, uploaded_by, uploader_kind)
  values (p_document_id, p_organization_id, 'certificate', v_name, v_type, v_size, v_path, v_actor, 'staff') on conflict (id) do nothing;
  if not exists (select 1 from public.documents d where d.id = p_document_id and d.organization_id = p_organization_id and d.kind = 'certificate') then return jsonb_build_object('ok', false, 'code', 'document_invalid'); end if;
  insert into public.certificates (organization_id, lot_id, fulfillment_order_id, document_id, title, issued_on, created_by)
  values (p_organization_id, p_lot_id, p_order_id, p_document_id, v_title, p_issued_on, v_actor) returning id into v_id;
  perform private.notif_enqueue('certificate_available', p_organization_id, jsonb_build_object('title', v_title), 'cert:' || v_id::text);
  perform private.write_audit(v_actor, 'staff', 'staff.certificate.publish', 'success', p_organization_id, 'certificate', v_id::text, jsonb_build_object('lot', v_lot, 'has_order', p_order_id is not null));
  return jsonb_build_object('ok', true, 'code', 'published', 'id', v_id);
end;
$$;

create function public.rpc_admin_certificate_withdraw(p_id uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_org    uuid;
  v_status text;
begin
  v_gate := private.staff_gate('inventory.adjust', 'staff.certificate.withdraw', true, 'certificate', p_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_id is null or char_length(v_reason) not between 1 and 300 then raise exception 'invalid arguments' using errcode = '22023'; end if;
  select c.organization_id, c.status into v_org, v_status from public.certificates c where c.id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if v_status <> 'published' then return jsonb_build_object('ok', false, 'code', 'already_withdrawn'); end if;
  update public.certificates set status = 'withdrawn', withdrawn_at = clock_timestamp(), withdrawn_by = v_actor, withdraw_reason = v_reason where id = p_id;
  perform private.write_audit(v_actor, 'staff', 'staff.certificate.withdraw', 'success', v_org, 'certificate', p_id::text, jsonb_build_object('reason_length', char_length(v_reason)));
  return jsonb_build_object('ok', true, 'code', 'withdrawn');
end;
$$;

-- 7. Commissions: customer and staff RPCs ---------------------------------------------------------------------------------------------
-- Owners only (it is money). A referring organization sees its own code, plan, balances and statement; referred organizations are shown as "Referral 1", "Referral 2" and
-- their names, invoices and orders are never exposed.
create function public.rpc_commissions_get(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_code  record;
  v_bal   record;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not (p_organization_id in (select private.my_org_ids())) or private.shop_org_ok(p_organization_id) is not true then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  if private.pay_org_owner_ok(p_organization_id) is not true then return jsonb_build_object('ok', false, 'code', 'owner_required'); end if;
  select c.code, c.active, p.name as plan_name, p.rate_bps, p.hold_days into v_code
    from public.referral_codes c join public.commission_plans p on p.id = c.plan_id where c.organization_id = p_organization_id;
  if not found then return jsonb_build_object('ok', true, 'enrolled', false); end if;
  select b.pending_cents, b.available_cents, b.paid_out_cents into v_bal from private.comm_balance(p_organization_id) b;
  return jsonb_build_object('ok', true, 'enrolled', true, 'code', v_code.code, 'code_active', v_code.active, 'plan_name', v_code.plan_name, 'rate_bps', v_code.rate_bps, 'hold_days', v_code.hold_days,
    'pending_cents', v_bal.pending_cents, 'available_cents', v_bal.available_cents, 'paid_out_cents', v_bal.paid_out_cents,
    'referrals', (select coalesce(jsonb_agg(jsonb_build_object('label', 'Referral ' || x.n, 'status', x.status, 'started_on', x.started_on) order by x.n), '[]'::jsonb)
                    from (select row_number() over (order by r.created_at, r.id) as n, r.status, r.started_on from public.organization_referrals r where r.referrer_org_id = p_organization_id) x),
    'entries', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'entry_type', e.entry_type, 'amount_cents', e.amount_cents, 'base_cents', e.base_cents, 'rate_bps', e.rate_bps,
                                                             'available_at', e.available_at, 'created_at', e.created_at, 'reason', case when e.entry_type = 'adjustment' then e.reason else null end,
                                                             'referral', case when e.entry_type = 'accrual' then (select 'Referral ' || y.n from (select row_number() over (order by r2.created_at, r2.id) as n, r2.referred_org_id
                                                                                                                         from public.organization_referrals r2 where r2.referrer_org_id = p_organization_id) y
                                                                                                                   where y.referred_org_id = e.referred_org_id) else null end)
                                         order by e.created_at desc, e.id), '[]'::jsonb)
                  from (select z.id, z.entry_type, z.amount_cents, z.base_cents, z.rate_bps, z.available_at, z.created_at, z.reason, z.referred_org_id
                          from public.commission_entries z where z.referrer_org_id = p_organization_id order by z.created_at desc, z.id limit 100) e));
end;
$$;

create function public.rpc_admin_commission_overview() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
begin
  v_gate := private.staff_gate('org.billing.read', 'staff.commissions.overview', false, 'commission', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  return jsonb_build_object('ok', true,
    'plans', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'rate_bps', p.rate_bps, 'hold_days', p.hold_days, 'active', p.active) order by p.code), '[]'::jsonb) from public.commission_plans p),
    'codes', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'organization_id', t.organization_id, 'organization_name', t.org_name, 'code', t.code, 'plan_code', t.plan_code, 'active', t.active,
                                                          'referred_count', t.referred, 'pending_cents', t.pending_cents, 'available_cents', t.available_cents, 'paid_out_cents', t.paid_out_cents) order by t.org_name), '[]'::jsonb)
                from (select c.id, c.organization_id, g.name as org_name, c.code, p.code as plan_code, c.active,
                             (select count(*)::int from public.organization_referrals r where r.referrer_org_id = c.organization_id and r.status = 'active') as referred,
                             b.pending_cents, b.available_cents, b.paid_out_cents
                        from public.referral_codes c join public.organizations g on g.id = c.organization_id join public.commission_plans p on p.id = c.plan_id
                        cross join lateral private.comm_balance(c.organization_id) b order by g.name limit 300) t),
    'referrals', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'referrer_name', t.referrer_name, 'referred_name', t.referred_name, 'status', t.status, 'started_on', t.started_on) order by t.created_at desc), '[]'::jsonb)
                    from (select r.id, r.status, r.started_on, r.created_at, g1.name as referrer_name, g2.name as referred_name
                            from public.organization_referrals r join public.organizations g1 on g1.id = r.referrer_org_id join public.organizations g2 on g2.id = r.referred_org_id order by r.created_at desc limit 200) t),
    'payouts', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'organization_name', t.org_name, 'amount_cents', t.amount_cents, 'method', t.method, 'reference', t.reference, 'paid_on', t.paid_on) order by t.created_at desc), '[]'::jsonb)
                  from (select y.id, y.amount_cents, y.method, y.reference, y.paid_on, y.created_at, g.name as org_name
                          from public.commission_payouts y join public.organizations g on g.id = y.referrer_org_id order by y.created_at desc limit 30) t));
end;
$$;

create function public.rpc_admin_commission_plan_save(p_code text, p_name text, p_rate_bps integer, p_hold_days integer) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_name  text := btrim(coalesce(p_name, ''));
  v_id    uuid;
begin
  v_gate := private.staff_gate('financial.write', 'staff.commission.plan.save', true, 'commission_plan', p_code);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_code is null or p_code !~ '^[a-z0-9_]{2,40}$' or char_length(v_name) not between 1 and 120 or p_rate_bps is null or p_rate_bps not between 1 and 5000 or p_hold_days is null or p_hold_days not between 0 and 90 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if exists (select 1 from public.commission_plans p where p.code = p_code) then return jsonb_build_object('ok', false, 'code', 'plan_code_taken'); end if;
  insert into public.commission_plans (code, name, rate_bps, hold_days, created_by) values (p_code, v_name, p_rate_bps, p_hold_days, v_actor) returning id into v_id;
  perform private.write_audit(v_actor, 'staff', 'staff.commission.plan.save', 'success', null, 'commission_plan', v_id::text, jsonb_build_object('code', p_code, 'rate_bps', p_rate_bps, 'hold_days', p_hold_days));
  return jsonb_build_object('ok', true, 'code', 'saved', 'id', v_id);
end;
$$;

create function public.rpc_admin_commission_plan_set_active(p_plan_id uuid, p_active boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
begin
  v_gate := private.staff_gate('financial.write', 'staff.commission.plan.set_active', true, 'commission_plan', p_plan_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_plan_id is null or p_active is null then raise exception 'invalid arguments' using errcode = '22023'; end if;
  update public.commission_plans set active = p_active where id = p_plan_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  perform private.write_audit(v_actor, 'staff', 'staff.commission.plan.set_active', 'success', null, 'commission_plan', p_plan_id::text, jsonb_build_object('active', p_active));
  return jsonb_build_object('ok', true, 'code', 'updated');
end;
$$;

-- Enrols an organization as a referrer: creates its referral code under an active plan.
create function public.rpc_admin_referral_code_enroll(p_organization_id uuid, p_plan_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_code  text;
  v_id    uuid;
  v_try   integer := 0;
begin
  v_gate := private.staff_gate('financial.write', 'staff.referral.enroll', true, 'organization', p_organization_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_organization_id is null or p_plan_id is null then raise exception 'invalid arguments' using errcode = '22023'; end if;
  if not exists (select 1 from public.organizations g where g.id = p_organization_id) then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  if not exists (select 1 from public.commission_plans p where p.id = p_plan_id and p.active) then return jsonb_build_object('ok', false, 'code', 'plan_not_found'); end if;
  if exists (select 1 from public.referral_codes c where c.organization_id = p_organization_id) then return jsonb_build_object('ok', false, 'code', 'already_enrolled'); end if;
  loop
    v_try := v_try + 1;
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.referral_codes c where c.code = v_code) or v_try >= 8;
  end loop;
  if exists (select 1 from public.referral_codes c where c.code = v_code) then return jsonb_build_object('ok', false, 'code', 'unavailable'); end if;
  insert into public.referral_codes (organization_id, code, plan_id, created_by) values (p_organization_id, v_code, p_plan_id, v_actor) returning id into v_id;
  perform private.write_audit(v_actor, 'staff', 'staff.referral.enroll', 'success', p_organization_id, 'referral_code', v_id::text, jsonb_build_object('plan_id', p_plan_id));
  return jsonb_build_object('ok', true, 'code', 'enrolled', 'id', v_id);
end;
$$;

-- Records that a referred organization came from a referral code (staff enter the code the applicant gave).
create function public.rpc_admin_referral_link(p_referred_org_id uuid, p_code text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_code  text := upper(btrim(coalesce(p_code, '')));
  v_rc    record;
  v_id    uuid;
begin
  v_gate := private.staff_gate('financial.write', 'staff.referral.link', true, 'organization', p_referred_org_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_referred_org_id is null or v_code !~ '^[A-Z0-9]{6,12}$' then raise exception 'invalid arguments' using errcode = '22023'; end if;
  if not exists (select 1 from public.organizations g where g.id = p_referred_org_id) then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  select c.id, c.organization_id, c.active into v_rc from public.referral_codes c where c.code = v_code;
  if not found or not v_rc.active then return jsonb_build_object('ok', false, 'code', 'referral_code_not_found'); end if;
  if v_rc.organization_id = p_referred_org_id then return jsonb_build_object('ok', false, 'code', 'self_referral'); end if;
  if exists (select 1 from public.organization_referrals r where r.referred_org_id = p_referred_org_id) then return jsonb_build_object('ok', false, 'code', 'already_referred'); end if;
  insert into public.organization_referrals (referral_code_id, referrer_org_id, referred_org_id, created_by) values (v_rc.id, v_rc.organization_id, p_referred_org_id, v_actor) returning id into v_id;
  perform private.write_audit(v_actor, 'staff', 'staff.referral.link', 'success', p_referred_org_id, 'referral', v_id::text, jsonb_build_object('referrer_org_id', v_rc.organization_id));
  return jsonb_build_object('ok', true, 'code', 'linked', 'id', v_id);
end;
$$;

create function public.rpc_admin_referral_end(p_id uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_status text;
begin
  v_gate := private.staff_gate('financial.write', 'staff.referral.end', true, 'referral', p_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_id is null or char_length(v_reason) not between 1 and 300 then raise exception 'invalid arguments' using errcode = '22023'; end if;
  select r.status into v_status from public.organization_referrals r where r.id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if v_status <> 'active' then return jsonb_build_object('ok', false, 'code', 'already_ended'); end if;
  update public.organization_referrals set status = 'ended', ended_on = current_date, end_reason = v_reason where id = p_id;
  perform private.write_audit(v_actor, 'staff', 'staff.referral.end', 'success', null, 'referral', p_id::text, jsonb_build_object('reason_length', char_length(v_reason)));
  return jsonb_build_object('ok', true, 'code', 'ended');
end;
$$;

-- Accrues commission on PAID order invoices of referred organizations: base = the wholesale lines of the invoice, rate and hold from the referrer's plan at this moment, available
-- after the hold counted from the last confirmed payment. Repeating it is safe (one accrual per invoice, enforced by a unique index).
create function public.rpc_admin_commissions_accrue() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_n     integer;
begin
  v_gate := private.staff_gate('financial.write', 'staff.commissions.accrue', false, 'commission', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  with eligible as (
    select i.id as invoice_id, r.referrer_org_id, r.referred_org_id, r.started_on, pl.rate_bps, pl.hold_days,
           (select coalesce(sum(l.line_total_cents), 0) from public.invoice_lines l where l.invoice_id = i.id and l.line_type = 'wholesale') as base_cents,
           (select max(pm.reviewed_at) from public.payments pm where pm.invoice_id = i.id and pm.status = 'confirmed') as paid_at
      from public.invoices i
      join public.organization_referrals r on r.referred_org_id = i.organization_id and r.status = 'active'
      join public.referral_codes c on c.id = r.referral_code_id and c.active
      join public.commission_plans pl on pl.id = c.plan_id
     where i.status = 'paid' and i.kind = 'order'
       and not exists (select 1 from public.commission_entries e where e.invoice_id = i.id and e.entry_type = 'accrual')
     limit 500)
  insert into public.commission_entries (referrer_org_id, referred_org_id, entry_type, amount_cents, invoice_id, base_cents, rate_bps, available_at, created_by)
  select q.referrer_org_id, q.referred_org_id, 'accrual', (q.base_cents * q.rate_bps) / 10000, q.invoice_id, q.base_cents, q.rate_bps, q.paid_at + make_interval(days => q.hold_days), v_actor
    from eligible q
   where q.base_cents > 0 and q.paid_at is not null and (q.paid_at at time zone 'utc')::date >= q.started_on and (q.base_cents * q.rate_bps) / 10000 > 0
  on conflict (invoice_id) where entry_type = 'accrual' do nothing;
  get diagnostics v_n = row_count;
  perform private.write_audit(v_actor, 'staff', 'staff.commissions.accrue', 'success', null, 'commission', null, jsonb_build_object('accrued', v_n));
  return jsonb_build_object('ok', true, 'code', 'accrued', 'accrued', v_n);
end;
$$;

-- A manual payout (the money is sent outside the platform). It can never exceed the AVAILABLE balance: the referrer's code row is locked, so two payouts cannot race past it.
create function public.rpc_admin_commission_payout(p_organization_id uuid, p_amount_cents bigint, p_method text, p_reference text, p_paid_on date, p_idempotency_key uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_ref   text := nullif(btrim(coalesce(p_reference, '')), '');
  v_avail bigint;
  v_prior record;
  v_id    uuid;
begin
  v_gate := private.staff_gate('financial.write', 'staff.commission.payout', true, 'organization', p_organization_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_organization_id is null or p_amount_cents is null or p_amount_cents not between 1 and 1000000000000 or p_method is null or p_method not in ('wire', 'zelle', 'ach', 'check', 'other')
     or (v_ref is not null and char_length(v_ref) > 120) or p_paid_on is null or p_paid_on > current_date + 1 or p_paid_on < date '2020-01-01' or p_idempotency_key is null then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  perform 1 from public.referral_codes c where c.organization_id = p_organization_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_enrolled'); end if;
  select y.id, y.referrer_org_id, y.amount_cents into v_prior from public.commission_payouts y where y.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.referrer_org_id = p_organization_id and v_prior.amount_cents = p_amount_cents then return jsonb_build_object('ok', true, 'code', 'recorded', 'id', v_prior.id, 'replayed', true); end if;
    return jsonb_build_object('ok', false, 'code', 'idempotency_conflict');
  end if;
  select b.available_cents into v_avail from private.comm_balance(p_organization_id) b;
  if p_amount_cents > v_avail then return jsonb_build_object('ok', false, 'code', 'insufficient_commission'); end if;
  insert into public.commission_payouts (referrer_org_id, amount_cents, method, reference, paid_on, idempotency_key, created_by)
  values (p_organization_id, p_amount_cents, p_method, v_ref, p_paid_on, p_idempotency_key, v_actor) returning id into v_id;
  insert into public.commission_entries (referrer_org_id, entry_type, amount_cents, payout_id, created_by) values (p_organization_id, 'payout', -p_amount_cents, v_id, v_actor);
  perform private.notif_enqueue('commission_payout', p_organization_id, jsonb_build_object('amount', '$' || to_char(p_amount_cents / 100.0, 'FM999,999,999,990.00')), 'payout:' || v_id::text);
  perform private.write_audit(v_actor, 'staff', 'staff.commission.payout', 'success', p_organization_id, 'commission_payout', v_id::text, jsonb_build_object('amount_cents', p_amount_cents, 'method', p_method));
  return jsonb_build_object('ok', true, 'code', 'recorded', 'id', v_id, 'replayed', false);
end;
$$;

create function public.rpc_admin_commission_adjust(p_organization_id uuid, p_amount_cents bigint, p_reason text, p_idempotency_key uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_prior  record;
  v_id     uuid;
begin
  v_gate := private.staff_gate('financial.write', 'staff.commission.adjust', true, 'organization', p_organization_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_organization_id is null or p_amount_cents is null or p_amount_cents = 0 or p_amount_cents not between -1000000000000 and 1000000000000 or char_length(v_reason) not between 1 and 300 or p_idempotency_key is null then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  perform 1 from public.referral_codes c where c.organization_id = p_organization_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_enrolled'); end if;
  select e.id, e.referrer_org_id, e.amount_cents into v_prior from public.commission_entries e where e.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.referrer_org_id = p_organization_id and v_prior.amount_cents = p_amount_cents then return jsonb_build_object('ok', true, 'code', 'adjusted', 'id', v_prior.id, 'replayed', true); end if;
    return jsonb_build_object('ok', false, 'code', 'idempotency_conflict');
  end if;
  insert into public.commission_entries (referrer_org_id, entry_type, amount_cents, reason, idempotency_key, created_by) values (p_organization_id, 'adjustment', p_amount_cents, v_reason, p_idempotency_key, v_actor) returning id into v_id;
  perform private.write_audit(v_actor, 'staff', 'staff.commission.adjust', 'success', p_organization_id, 'commission_entry', v_id::text, jsonb_build_object('amount_cents', p_amount_cents));
  return jsonb_build_object('ok', true, 'code', 'adjusted', 'id', v_id, 'replayed', false);
end;
$$;

-- 8. Notifications: preferences, outbox, templates, scan, dispatch ----------------------------------------------------------------------
create function public.rpc_notification_prefs_get() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  return jsonb_build_object('ok', true, 'preferences',
    (select jsonb_agg(jsonb_build_object('category', c.category, 'enabled', coalesce((select np.enabled from public.notification_preferences np where np.user_id = v_actor and np.category = c.category), true)) order by c.category)
       from (values ('certificates'), ('commissions'), ('fulfillment')) c(category)));
end;
$$;

create function public.rpc_notification_pref_set(p_category text, p_enabled boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_category is null or p_category not in ('fulfillment', 'certificates', 'commissions') or p_enabled is null then raise exception 'invalid arguments' using errcode = '22023'; end if;
  insert into public.notification_preferences (user_id, category, enabled) values (v_actor, p_category, p_enabled)
  on conflict (user_id, category) do update set enabled = excluded.enabled, updated_at = clock_timestamp();
  perform private.write_audit(v_actor, case when private.staff_session_ok() then 'staff' else 'organization_user' end, 'notification.pref.set', 'success', null, 'notification_preference', p_category, jsonb_build_object('enabled', p_enabled));
  return jsonb_build_object('ok', true, 'code', 'updated');
end;
$$;

create function public.rpc_admin_templates_list() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
begin
  v_gate := private.staff_gate('flags.read', 'staff.templates.list', false, 'notification_template', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  return jsonb_build_object('ok', true, 'templates',
    (select coalesce(jsonb_agg(jsonb_build_object('key', t.key, 'category', t.category, 'subject', t.subject, 'body', t.body, 'variables', to_jsonb(private.notif_vars(t.key)), 'updated_at', t.updated_at) order by t.key), '[]'::jsonb)
       from public.notification_templates t));
end;
$$;

create function public.rpc_admin_template_save(p_key text, p_subject text, p_body text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_gate    text;
  v_subject text := btrim(coalesce(p_subject, ''));
  v_body    text := btrim(coalesce(p_body, ''));
  v_ph      text;
begin
  v_gate := private.staff_gate('flags.write', 'staff.template.save', true, 'notification_template', p_key);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_key is null or not exists (select 1 from public.notification_templates t where t.key = p_key) or char_length(v_subject) not between 1 and 150 or v_subject ~ '[\r\n]' or char_length(v_body) not between 1 and 4000 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  for v_ph in select m[1] from regexp_matches(v_subject || ' ' || v_body, '\{\{([^}]*)\}\}', 'g') as m loop
    if not (v_ph = any (private.notif_vars(p_key))) then return jsonb_build_object('ok', false, 'code', 'template_variable_unknown'); end if;
  end loop;
  update public.notification_templates set subject = v_subject, body = v_body, updated_by = v_actor, updated_at = clock_timestamp() where key = p_key;
  perform private.write_audit(v_actor, 'staff', 'staff.template.save', 'success', null, 'notification_template', p_key, jsonb_build_object('body_length', char_length(v_body)));
  return jsonb_build_object('ok', true, 'code', 'saved');
end;
$$;

-- Derives messages from events of the last 14 days (issued invoices, reviewed payments, shipped orders). It adds nothing that already exists (dedupe keys), and it never changes
-- the functions that produce those events.
create function public.rpc_admin_notifications_scan() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_n     integer := 0;
  r       record;
begin
  v_gate := private.staff_gate('financial.write', 'staff.notifications.scan', false, 'notification', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  for r in select i.id, i.organization_id, i.invoice_number, i.total_cents, i.due_at from public.invoices i where i.status <> 'void' and i.issued_at > clock_timestamp() - interval '14 days' order by i.issued_at limit 500 loop
    v_n := v_n + private.notif_enqueue('invoice_issued', r.organization_id, jsonb_build_object('invoice_number', r.invoice_number, 'total', '$' || to_char(r.total_cents / 100.0, 'FM999,999,999,990.00'), 'due_date', to_char(r.due_at at time zone 'utc', 'YYYY-MM-DD')), 'inv:' || r.id::text);
  end loop;
  for r in select pm.id, pm.organization_id, pm.status, pm.confirmed_cents, i.invoice_number from public.payments pm join public.invoices i on i.id = pm.invoice_id
            where pm.status in ('confirmed', 'rejected') and pm.reviewed_at > clock_timestamp() - interval '14 days' order by pm.reviewed_at limit 500 loop
    if r.status = 'confirmed' then
      v_n := v_n + private.notif_enqueue('payment_confirmed', r.organization_id, jsonb_build_object('invoice_number', r.invoice_number, 'amount', '$' || to_char(r.confirmed_cents / 100.0, 'FM999,999,999,990.00')), 'pay:' || r.id::text);
    else
      v_n := v_n + private.notif_enqueue('payment_rejected', r.organization_id, jsonb_build_object('invoice_number', r.invoice_number), 'pay:' || r.id::text);
    end if;
  end loop;
  for r in select o.id, o.organization_id, o.order_number, s.carrier, s.tracking_number from public.fulfillment_orders o join public.shipments s on s.order_id = o.id
            where not o.is_sandbox and o.status in ('shipped', 'delivered') and s.shipped_at > clock_timestamp() - interval '14 days' order by s.shipped_at limit 500 loop
    v_n := v_n + private.notif_enqueue('order_shipped', r.organization_id, jsonb_build_object('order_number', r.order_number, 'carrier', r.carrier, 'tracking_number', r.tracking_number), 'ship:' || r.id::text);
  end loop;
  perform private.write_audit(v_actor, 'staff', 'staff.notifications.scan', 'success', null, 'notification', null, jsonb_build_object('queued', v_n));
  return jsonb_build_object('ok', true, 'code', 'scanned', 'queued', v_n);
end;
$$;

-- Reading the outbox shows recipients' e-mail addresses, so it needs profiles.read.basic and is itself audited.
create function public.rpc_admin_outbox_list(p_status text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
begin
  v_gate := private.staff_gate('profiles.read.basic', 'staff.outbox.list', false, 'email_outbox', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_status is not null and p_status not in ('queued', 'sending', 'sent', 'failed') then raise exception 'invalid arguments' using errcode = '22023'; end if;
  perform private.write_audit(v_actor, 'staff', 'staff.outbox.read', 'success', null, 'email_outbox', null, jsonb_build_object('status', p_status));
  return jsonb_build_object('ok', true,
    'counts', (select coalesce(jsonb_object_agg(x.status, x.n), '{}'::jsonb) from (select o.status, count(*)::int as n from public.email_outbox o group by o.status) x),
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'template_key', t.template_key, 'recipient_email', t.recipient_email, 'organization_name', t.org_name, 'subject', t.subject, 'status', t.status,
                                                              'attempts', t.attempts, 'last_error', t.last_error, 'created_at', t.created_at, 'sent_at', t.sent_at) order by t.created_at desc), '[]'::jsonb)
                   from (select o.id, o.template_key, o.recipient_email, o.subject, o.status, o.attempts, o.last_error, o.created_at, o.sent_at, g.name as org_name
                           from public.email_outbox o join public.organizations g on g.id = o.organization_id where p_status is null or o.status = p_status order by o.created_at desc limit 100) t));
end;
$$;

-- Dispatch, step 1: takes up to p_limit due messages (also ones stuck in 'sending' for more than 10 minutes) and returns their content. Step 2 reports each result.
create function public.rpc_admin_outbox_claim(p_limit integer default 20) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_rows  jsonb;
begin
  v_gate := private.staff_gate('org.manage', 'staff.outbox.claim', false, 'email_outbox', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  with due as (
    select o.id from public.email_outbox o
     where (o.status = 'queued' and o.next_attempt_at <= clock_timestamp()) or (o.status = 'sending' and o.claimed_at < clock_timestamp() - interval '10 minutes')
     order by o.next_attempt_at, o.id limit v_limit for update skip locked),
  taken as (
    update public.email_outbox o set status = 'sending', attempts = o.attempts + 1, claimed_at = clock_timestamp() from due where o.id = due.id
    returning o.id, o.recipient_email, o.subject, o.body)
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'to', t.recipient_email, 'subject', t.subject, 'body', t.body) order by t.id), '[]'::jsonb) into v_rows from taken t;
  perform private.write_audit(v_actor, 'staff', 'staff.outbox.claim', 'success', null, 'email_outbox', null, jsonb_build_object('claimed', jsonb_array_length(v_rows)));
  return jsonb_build_object('ok', true, 'messages', v_rows);
end;
$$;

-- Dispatch, step 2: success marks the message sent; a failure schedules a retry with a growing delay (5 minutes times the attempt number squared) and stops after 5 attempts.
create function public.rpc_admin_outbox_record(p_id uuid, p_success boolean, p_error text, p_provider_ref text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_row   record;
  v_error text := left(nullif(btrim(coalesce(p_error, '')), ''), 200);
  v_pref  text := left(nullif(btrim(coalesce(p_provider_ref, '')), ''), 120);
begin
  v_gate := private.staff_gate('org.manage', 'staff.outbox.record', false, 'email_outbox', p_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_id is null or p_success is null then raise exception 'invalid arguments' using errcode = '22023'; end if;
  select o.status, o.attempts into v_row from public.email_outbox o where o.id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if v_row.status <> 'sending' then return jsonb_build_object('ok', false, 'code', 'not_claimed'); end if;
  if p_success then
    update public.email_outbox set status = 'sent', sent_at = clock_timestamp(), provider_ref = v_pref, last_error = null where id = p_id;
  elsif v_row.attempts >= 5 then
    update public.email_outbox set status = 'failed', last_error = coalesce(v_error, 'send failed') where id = p_id;
  else
    update public.email_outbox set status = 'queued', last_error = coalesce(v_error, 'send failed'), next_attempt_at = clock_timestamp() + make_interval(mins => 5 * v_row.attempts * v_row.attempts) where id = p_id;
  end if;
  return jsonb_build_object('ok', true, 'code', case when p_success then 'sent' when v_row.attempts >= 5 then 'failed' else 'retry' end);
end;
$$;

-- 9. Reports --------------------------------------------------------------------------------------------------------------------------
-- One RPC, four reports. sales and commissions use the period; receivables and inventory are "as of now". At most 2000 rows; truncated says if more existed.
-- Every run is audited (reports contain customer names and money).
create function public.rpc_admin_report(p_report text, p_from date default null, p_to date default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_cap   text;
  v_from  date := coalesce(p_from, current_date - 30);
  v_to    date := coalesce(p_to, current_date);
  v_rows  jsonb;
  v_trunc boolean;
begin
  if p_report is null or p_report not in ('sales', 'receivables', 'inventory', 'commissions') then raise exception 'invalid arguments' using errcode = '22023'; end if;
  if v_from > v_to or v_to - v_from > 366 or v_from < date '2020-01-01' or v_to > current_date + 1 then raise exception 'invalid arguments' using errcode = '22023'; end if;
  v_cap := case p_report when 'inventory' then 'org.read' else 'org.billing.read' end;
  v_gate := private.staff_gate(v_cap, 'staff.report.run', false, 'report', p_report);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;

  if p_report = 'sales' then
    select coalesce(jsonb_agg(jsonb_build_object('organization_name', t.name, 'organization_code', t.code, 'orders', t.orders, 'cancelled', t.cancelled, 'total_cents', t.total_cents) order by t.total_cents desc, t.name), '[]'::jsonb) into v_rows
      from (select g.name, g.code, count(*) filter (where o.status <> 'cancelled')::int as orders, count(*) filter (where o.status = 'cancelled')::int as cancelled,
                   coalesce(sum(o.total_cents) filter (where o.status <> 'cancelled'), 0)::bigint as total_cents
              from public.orders o join public.organizations g on g.id = o.organization_id
             where (o.created_at at time zone 'utc')::date between v_from and v_to group by g.id, g.name, g.code order by 5 desc, g.name limit 2001) t;
  elsif p_report = 'receivables' then
    select coalesce(jsonb_agg(jsonb_build_object('organization_name', t.name, 'invoice_number', t.invoice_number, 'issued_on', t.issued_on, 'due_on', t.due_on, 'days_overdue', t.days_overdue,
                                                 'bucket', t.bucket, 'remaining_cents', t.remaining_cents) order by t.days_overdue desc, t.invoice_number), '[]'::jsonb) into v_rows
      from (select g.name, i.invoice_number, (i.issued_at at time zone 'utc')::date as issued_on, (i.due_at at time zone 'utc')::date as due_on, greatest(d.days, 0)::int as days_overdue,
                   case when d.days <= 0 then 'current' when d.days <= 30 then '1-30' when d.days <= 60 then '31-60' when d.days <= 90 then '61-90' else '90+' end as bucket,
                   (i.total_cents - i.paid_cents)::bigint as remaining_cents
              from public.invoices i join public.organizations g on g.id = i.organization_id
              cross join lateral (select floor(extract(epoch from (clock_timestamp() - i.due_at)) / 86400) as days) d
             where i.status in ('open', 'partially_paid') order by d.days desc, i.invoice_number limit 2001) t;
  elsif p_report = 'inventory' then
    select coalesce(jsonb_agg(jsonb_build_object('organization_name', t.org_name, 'external_sku', t.external_sku, 'product_name', t.product_name, 'on_hand', t.on_hand, 'reserved', t.reserved,
                                                 'available', t.available, 'next_expiry', t.next_expiry) order by t.org_name, t.external_sku), '[]'::jsonb) into v_rows
      from (select g.name as org_name, m.external_sku, coalesce(m.product_name, pr.name) as product_name, coalesce(sum(bal.on_hand), 0)::int as on_hand, coalesce(sum(bal.reserved), 0)::int as reserved,
                   private.inv_available(m.id, m.organization_id)::int as available, min(lo.expires_on) filter (where bal.on_hand > 0) as next_expiry
              from public.sku_mappings m join public.organizations g on g.id = m.organization_id left join public.product_variants v on v.id = m.variant_id left join public.products pr on pr.id = v.product_id
              left join public.inventory_balances bal on bal.sku_mapping_id = m.id left join public.inventory_lots lo on lo.id = bal.lot_id
             where m.status = 'approved' group by g.id, g.name, m.id, m.external_sku, m.product_name, pr.name, m.organization_id order by g.name, m.external_sku limit 2001) t;
  else
    select coalesce(jsonb_agg(jsonb_build_object('organization_name', t.org_name, 'accrued_cents', t.accrued_cents, 'adjustments_cents', t.adjustments_cents, 'paid_out_cents', t.paid_out_cents,
                                                 'pending_cents', t.pending_cents, 'available_cents', t.available_cents) order by t.org_name), '[]'::jsonb) into v_rows
      from (select g.name as org_name,
                   coalesce(sum(e.amount_cents) filter (where e.entry_type = 'accrual' and (e.created_at at time zone 'utc')::date between v_from and v_to), 0)::bigint as accrued_cents,
                   coalesce(sum(e.amount_cents) filter (where e.entry_type = 'adjustment' and (e.created_at at time zone 'utc')::date between v_from and v_to), 0)::bigint as adjustments_cents,
                   coalesce(sum(-e.amount_cents) filter (where e.entry_type = 'payout' and (e.created_at at time zone 'utc')::date between v_from and v_to), 0)::bigint as paid_out_cents,
                   b.pending_cents, b.available_cents
              from public.referral_codes c join public.organizations g on g.id = c.organization_id
              left join public.commission_entries e on e.referrer_org_id = c.organization_id cross join lateral private.comm_balance(c.organization_id) b
             group by g.id, g.name, b.pending_cents, b.available_cents order by g.name limit 2001) t;
  end if;
  v_trunc := jsonb_array_length(v_rows) > 2000;
  if v_trunc then v_rows := v_rows - 2000; end if;
  perform private.write_audit(v_actor, 'staff', 'staff.report.run', 'success', null, 'report', p_report, jsonb_build_object('from', v_from, 'to', v_to, 'rows', jsonb_array_length(v_rows), 'truncated', v_trunc));
  return jsonb_build_object('ok', true, 'report', p_report, 'from', v_from, 'to', v_to, 'truncated', v_trunc, 'rows', v_rows);
end;
$$;

-- 10. Privileges ----------------------------------------------------------------------------------------------------------------------
revoke all on table public.certificates, public.commission_plans, public.referral_codes, public.organization_referrals, public.commission_payouts, public.commission_entries,
                    public.notification_templates, public.notification_preferences, public.email_outbox from public, anon, authenticated, service_role;

revoke all on function private.guard_p9_certificates(), private.guard_p9_plans(), private.guard_p9_codes(), private.guard_p9_referrals(), private.guard_p9_append_only(), private.guard_p9_templates(),
                       private.guard_p9_outbox(), private.notif_vars(text), private.notif_render(text, text, jsonb), private.notif_enqueue(text, uuid, jsonb, text), private.comm_balance(uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.rpc_certificates_list(uuid), public.rpc_admin_certificates_list(uuid), public.rpc_admin_certificate_targets(uuid),
                       public.rpc_admin_certificate_publish(uuid, uuid, text, uuid, uuid, text, date), public.rpc_admin_certificate_withdraw(uuid, text),
                       public.rpc_commissions_get(uuid), public.rpc_admin_commission_overview(), public.rpc_admin_commission_plan_save(text, text, integer, integer),
                       public.rpc_admin_commission_plan_set_active(uuid, boolean), public.rpc_admin_referral_code_enroll(uuid, uuid), public.rpc_admin_referral_link(uuid, text),
                       public.rpc_admin_referral_end(uuid, text), public.rpc_admin_commissions_accrue(), public.rpc_admin_commission_payout(uuid, bigint, text, text, date, uuid),
                       public.rpc_admin_commission_adjust(uuid, bigint, text, uuid), public.rpc_notification_prefs_get(), public.rpc_notification_pref_set(text, boolean),
                       public.rpc_admin_templates_list(), public.rpc_admin_template_save(text, text, text), public.rpc_admin_notifications_scan(), public.rpc_admin_outbox_list(text),
                       public.rpc_admin_outbox_claim(integer), public.rpc_admin_outbox_record(uuid, boolean, text, text), public.rpc_admin_report(text, date, date)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_certificates_list(uuid), public.rpc_admin_certificates_list(uuid), public.rpc_admin_certificate_targets(uuid),
                          public.rpc_admin_certificate_publish(uuid, uuid, text, uuid, uuid, text, date), public.rpc_admin_certificate_withdraw(uuid, text),
                          public.rpc_commissions_get(uuid), public.rpc_admin_commission_overview(), public.rpc_admin_commission_plan_save(text, text, integer, integer),
                          public.rpc_admin_commission_plan_set_active(uuid, boolean), public.rpc_admin_referral_code_enroll(uuid, uuid), public.rpc_admin_referral_link(uuid, text),
                          public.rpc_admin_referral_end(uuid, text), public.rpc_admin_commissions_accrue(), public.rpc_admin_commission_payout(uuid, bigint, text, text, date, uuid),
                          public.rpc_admin_commission_adjust(uuid, bigint, text, uuid), public.rpc_notification_prefs_get(), public.rpc_notification_pref_set(text, boolean),
                          public.rpc_admin_templates_list(), public.rpc_admin_template_save(text, text, text), public.rpc_admin_notifications_scan(), public.rpc_admin_outbox_list(text),
                          public.rpc_admin_outbox_claim(integer), public.rpc_admin_outbox_record(uuid, boolean, text, text), public.rpc_admin_report(text, date, date)
  to authenticated;

-- 11. Self-check ----------------------------------------------------------------------------------------------------------------------
do $$
declare
  t text;
  p text;
begin
  foreach t in array array['public.certificates', 'public.commission_plans', 'public.referral_codes', 'public.organization_referrals', 'public.commission_payouts', 'public.commission_entries',
                           'public.notification_templates', 'public.notification_preferences', 'public.email_outbox'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = t::regclass) then raise exception 'self-check: RLS not enabled on %', t; end if;
    foreach p in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
      if has_table_privilege('anon', t, p) or has_table_privilege('authenticated', t, p) or has_table_privilege('service_role', t, p) then raise exception 'self-check: an API role has % on %', p, t; end if;
    end loop;
  end loop;
  if (select count(*) from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
       where n.nspname = 'public' and pr.proname in ('rpc_certificates_list', 'rpc_admin_certificates_list', 'rpc_admin_certificate_targets', 'rpc_admin_certificate_publish', 'rpc_admin_certificate_withdraw',
             'rpc_commissions_get', 'rpc_admin_commission_overview', 'rpc_admin_commission_plan_save', 'rpc_admin_commission_plan_set_active', 'rpc_admin_referral_code_enroll', 'rpc_admin_referral_link',
             'rpc_admin_referral_end', 'rpc_admin_commissions_accrue', 'rpc_admin_commission_payout', 'rpc_admin_commission_adjust', 'rpc_notification_prefs_get', 'rpc_notification_pref_set',
             'rpc_admin_templates_list', 'rpc_admin_template_save', 'rpc_admin_notifications_scan', 'rpc_admin_outbox_list', 'rpc_admin_outbox_claim', 'rpc_admin_outbox_record', 'rpc_admin_report')
         and pr.prosecdef and has_function_privilege('authenticated', pr.oid, 'execute') and not has_function_privilege('anon', pr.oid, 'execute')
         and not has_function_privilege('service_role', pr.oid, 'execute') and not has_function_privilege('public', pr.oid, 'execute')
         and exists (select 1 from unnest(pr.proconfig) c where regexp_replace(c, '[\s"'']', '', 'g') ~* '^search_path=$')) <> 24 then
    raise exception 'self-check: RPC definer, search_path or grant state is wrong';
  end if;
  if (select array_agg(pr.proname::text order by pr.proname) from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace where n.nspname = 'public' and has_function_privilege('anon', pr.oid, 'execute'))
     is distinct from array['rpc_api_order_create', 'rpc_api_order_get', 'rpc_api_orders_list', 'rpc_worker_claim_deliveries', 'rpc_worker_record_result'] then
    raise exception 'self-check: the anon-executable set changed (it must stay exactly the five key-authenticated RPCs)';
  end if;
  if exists (select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
              where n.nspname = 'private' and (pr.proname like 'guard\_p9\_%' or pr.proname in ('notif_vars', 'notif_render', 'notif_enqueue', 'comm_balance'))
                and (has_function_privilege('authenticated', pr.oid, 'execute') or has_function_privilege('anon', pr.oid, 'execute'))) then
    raise exception 'self-check: a P9 private helper is executable by an API role';
  end if;
  if (select count(*) from public.notification_templates) <> 6 or exists (select 1 from public.certificates) or exists (select 1 from public.commission_plans) or exists (select 1 from public.commission_entries)
     or exists (select 1 from public.email_outbox) then
    raise exception 'self-check: seed or empty-table state';
  end if;
  if (select count(*) from pg_trigger tg where not tg.tgisinternal and tg.tgrelid in ('public.certificates'::regclass, 'public.commission_plans'::regclass, 'public.referral_codes'::regclass,
        'public.organization_referrals'::regclass, 'public.commission_payouts'::regclass, 'public.commission_entries'::regclass, 'public.notification_templates'::regclass,
        'public.notification_preferences'::regclass, 'public.email_outbox'::regclass)) <> 17 then
    raise exception 'self-check: expected 17 triggers on the P9 tables';
  end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'portal\_documents\_%') <> 5 then raise exception 'self-check: expected 5 storage policies'; end if;
end;
$$;
