-- =====================================================================================================================================
-- P4 DRAFT. NOT APPLIED. NOT EXECUTED. NEVER PARSED BY POSTGRESQL.
-- Invoices, payments and the (locked) wallet. Depends on migrations 0001 to 0004 and the P3 migration 20261110000100 (applied to the hosted dev project).
-- Reuses existing capabilities only (org.billing.read, payments.reconcile, payments.confirm, financial.write): no change to the staff catalog.
-- Design: docs/P4-IMPLEMENTATION-PLAN.md. TypeScript mirror: src/lib/portal/billing/invoices.ts.
-- =====================================================================================================================================

-- 1. Tables ---------------------------------------------------------------------------------------------------------------------------
create sequence public.invoice_number_seq start 1000 minvalue 1000;

create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  invoice_number  text not null unique default ('INV-' || lpad(nextval('public.invoice_number_seq')::text, 8, '0')),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  order_id        uuid not null unique references public.orders (id) on delete restrict,   -- one invoice per order
  status          text not null default 'open' check (status in ('open', 'partially_paid', 'paid', 'void')),
  total_cents     bigint not null check (total_cents between 1 and 1000000000000),
  paid_cents      bigint not null default 0,
  currency        text not null default 'USD' check (currency = 'USD'),
  terms           text not null check (terms ~ '^[a-z0-9_]{1,32}$'),   -- organization payment terms at the moment of issue
  issued_at       timestamptz not null default clock_timestamp(),
  due_at          timestamptz not null,
  voided_at       timestamptz,
  void_reason     text check (void_reason is null or char_length(void_reason) <= 300),
  created_at      timestamptz not null default clock_timestamp(),
  updated_at      timestamptz not null default clock_timestamp(),
  constraint invoices_id_org_key unique (id, organization_id),
  constraint invoices_status_matches_amounts check (
       (status = 'open'           and paid_cents = 0 and voided_at is null)
    or (status = 'partially_paid' and paid_cents > 0 and paid_cents < total_cents and voided_at is null)
    or (status = 'paid'           and paid_cents = total_cents and voided_at is null)
    or (status = 'void'           and paid_cents = 0 and voided_at is not null and void_reason is not null))
);
create index invoices_org_issued_idx on public.invoices (organization_id, issued_at desc);
create index invoices_status_due_idx on public.invoices (status, due_at);

-- Immutable lines. Only 'wholesale' lines are created in P4; the other types are reserved for fees and adjustments (P5 onward).
create table public.invoice_lines (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references public.invoices (id) on delete restrict,
  line_type        text not null check (line_type in ('wholesale', 'setup_fee', 'fulfillment_fee', 'packaging_fee', 'shipping_fee', 'storage_fee', 'adjustment')),
  description      text not null check (char_length(description) between 1 and 300),
  quantity         integer not null check (quantity between 1 and 10000),
  unit_price_cents bigint not null check (line_type = 'adjustment' or unit_price_cents > 0),
  line_total_cents bigint not null,
  constraint invoice_lines_total check (line_total_cents = unit_price_cents * quantity)
);
create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id);

-- A payment is a CLAIM by the customer owner ("I've sent payment") until finance confirms it. claimed_cents never changes; confirmed_cents is set by the confirm RPC.
create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id      uuid not null,
  method          text not null check (method in ('wire', 'zelle', 'ach', 'check', 'other')),
  claimed_cents   bigint not null check (claimed_cents between 1 and 1000000000000),
  status          text not null default 'reported' check (status in ('reported', 'confirmed', 'rejected', 'duplicate')),
  reference       text check (reference is null or char_length(reference) <= 120),
  sent_on         date,
  note            text check (note is null or char_length(note) <= 300),
  reported_by     uuid not null,   -- no FK on purpose: an audit reference that must survive account deletion
  idempotency_key uuid not null,
  confirmed_cents bigint,
  received_on     date,
  bank_reference  text check (bank_reference is null or char_length(bank_reference) <= 120),
  reviewed_by     uuid,
  reviewed_at     timestamptz,
  review_note     text check (review_note is null or char_length(review_note) <= 300),
  created_at      timestamptz not null default clock_timestamp(),
  updated_at      timestamptz not null default clock_timestamp(),
  constraint payments_invoice_org_fk foreign key (invoice_id, organization_id) references public.invoices (id, organization_id) on delete restrict,
  constraint payments_idempotency_key unique (organization_id, reported_by, idempotency_key),
  constraint payments_review_consistent check (
       (status = 'reported'  and reviewed_by is null and reviewed_at is null and confirmed_cents is null and received_on is null)
    or (status = 'confirmed' and reviewed_by is not null and reviewed_at is not null and confirmed_cents between 1 and 1000000000000 and received_on is not null)
    or (status in ('rejected', 'duplicate') and reviewed_by is not null and reviewed_at is not null and confirmed_cents is null and review_note is not null))
);
create index payments_status_created_idx on public.payments (status, created_at);
create index payments_invoice_idx on public.payments (invoice_id);

create table public.payment_events (
  id            uuid primary key default gen_random_uuid(),
  payment_id    uuid not null references public.payments (id) on delete restrict,
  from_status   text,
  to_status     text not null check (to_status in ('reported', 'confirmed', 'rejected', 'duplicate')),
  amount_cents  bigint,
  actor_user_id uuid,
  actor_kind    text not null check (actor_kind in ('staff', 'organization_user')),
  note          text check (note is null or char_length(note) <= 300),
  created_at    timestamptz not null default clock_timestamp()
);
create index payment_events_payment_idx on public.payment_events (payment_id, created_at);

-- Wallet: built but LOCKED. The flag is pinned to false by a check constraint; a later migration may relax it only after Gate G3 (legal/payment approval) is recorded.
create table public.platform_flags (
  key        text primary key check (key ~ '^[a-z_]{1,64}$'),
  enabled    boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint wallet_locked_until_gate_g3 check (key <> 'wallet_enabled' or enabled = false)
);
insert into public.platform_flags (key) values ('wallet_enabled');

-- Append-only ledger of signed cents per organization; the balance is the sum. No customer top-up exists while the wallet is locked.
create table public.wallet_entries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  entry_type      text not null check (entry_type in ('topup', 'invoice_payment', 'refund', 'adjustment')),
  amount_cents    bigint not null check (amount_cents <> 0 and amount_cents between -1000000000000 and 1000000000000),
  ref_type        text check (ref_type is null or char_length(ref_type) <= 40),
  ref_id          text check (ref_id is null or char_length(ref_id) <= 80),
  note            text check (note is null or char_length(note) <= 300),
  idempotency_key uuid not null unique,
  created_by      uuid not null,
  created_at      timestamptz not null default clock_timestamp()
);
create index wallet_entries_org_idx on public.wallet_entries (organization_id, created_at);

alter table public.invoices       enable row level security;
alter table public.invoice_lines  enable row level security;
alter table public.payments       enable row level security;
alter table public.payment_events enable row level security;
alter table public.platform_flags enable row level security;
alter table public.wallet_entries enable row level security;

-- 2. Private helpers and guards -------------------------------------------------------------------------------------------------------
create function private.pay_invoice_transition_ok(p_from text, p_to text) returns boolean
language sql immutable set search_path = ''
as $$
  select (p_from, p_to) in (('open', 'partially_paid'), ('open', 'paid'), ('open', 'void'), ('partially_paid', 'paid'));
$$;

create function private.pay_payment_transition_ok(p_from text, p_to text) returns boolean
language sql immutable set search_path = ''
as $$
  select (p_from, p_to) in (('reported', 'confirmed'), ('reported', 'rejected'), ('reported', 'duplicate'));
$$;

-- TRUE only for an ACTIVE owner of an ACTIVE organization (members may view invoices but not report payments).
create function private.pay_org_owner_ok(p_org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_org is not null
     and private.shop_org_ok(p_org) is true
     and exists (select 1 from public.organization_members m
                  where m.organization_id = p_org and m.user_id = (select auth.uid()) and m.role = 'owner' and m.status = 'active');
$$;

create function private.pay_wallet_enabled() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select fl.enabled from public.platform_flags fl where fl.key = 'wallet_enabled'), false);
$$;

create function private.guard_pay_invoices() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'invoices cannot be deleted' using errcode = '23514'; end if;
  if new.id <> old.id or new.invoice_number <> old.invoice_number or new.organization_id <> old.organization_id or new.order_id <> old.order_id
     or new.total_cents <> old.total_cents or new.currency <> old.currency or new.terms <> old.terms or new.issued_at <> old.issued_at
     or new.due_at <> old.due_at or new.created_at <> old.created_at then
    raise exception 'invoice identity, amounts and terms are immutable' using errcode = '23514';
  end if;
  if new.paid_cents < old.paid_cents then raise exception 'paid amount cannot decrease (refunds are not part of P4)' using errcode = '23514'; end if;
  if new.status <> old.status and not private.pay_invoice_transition_ok(old.status, new.status) then
    raise exception 'illegal invoice status transition' using errcode = '23514';
  end if;
  if old.status in ('paid', 'void') and (new.paid_cents <> old.paid_cents or new.voided_at is distinct from old.voided_at or new.void_reason is distinct from old.void_reason) then
    raise exception 'a paid or void invoice is final' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function private.guard_pay_payments() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'payments cannot be deleted' using errcode = '23514'; end if;
  if new.id <> old.id or new.organization_id <> old.organization_id or new.invoice_id <> old.invoice_id or new.method <> old.method
     or new.claimed_cents <> old.claimed_cents or new.reference is distinct from old.reference or new.sent_on is distinct from old.sent_on
     or new.note is distinct from old.note or new.reported_by <> old.reported_by or new.idempotency_key <> old.idempotency_key or new.created_at <> old.created_at then
    raise exception 'payment identity and the customer claim are immutable' using errcode = '23514';
  end if;
  if old.status <> 'reported' then
    -- a reviewed payment is final: nothing but the touch of updated_at may change
    if new.status <> old.status or new.confirmed_cents is distinct from old.confirmed_cents or new.received_on is distinct from old.received_on
       or new.bank_reference is distinct from old.bank_reference or new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at or new.review_note is distinct from old.review_note then
      raise exception 'a reviewed payment is final' using errcode = '23514';
    end if;
  elsif new.status <> old.status and not private.pay_payment_transition_ok(old.status, new.status) then
    raise exception 'illegal payment status transition' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function private.guard_pay_append_only() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '23514';
  return null;
end;
$$;

create function private.guard_pay_flags() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'platform flags cannot be deleted' using errcode = '23514'; end if;
  if new.key <> old.key then raise exception 'flag keys are immutable' using errcode = '23514'; end if;
  return new;
end;
$$;

-- An invoice is created together with its order (rpc_checkout below) or, once, for orders that already exist (backfill). Lines are copied from the immutable order snapshot.
create function private.pay_invoice_create(p_order uuid) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  o       record;
  v_terms text;
  v_days  integer;
  v_id    uuid;
  v_sum   bigint;
begin
  select x.id, x.organization_id, x.total_cents into o from public.orders x where x.id = p_order;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  select g.payment_terms into v_terms from public.organizations g where g.id = o.organization_id;
  v_days := case when v_terms = 'prepay' then 0
                 when v_terms ~ '^net_?[0-9]{1,3}$' then regexp_replace(v_terms, '[^0-9]', '', 'g')::integer
                 else 30 end;
  if v_days > 365 then v_days := 30; end if;
  insert into public.invoices (organization_id, order_id, total_cents, terms, due_at)
  values (o.organization_id, o.id, o.total_cents, v_terms, clock_timestamp() + make_interval(days => v_days))
  returning id into v_id;
  insert into public.invoice_lines (invoice_id, line_type, description, quantity, unit_price_cents, line_total_cents)
  select v_id, 'wholesale', left(i.product_name || ' - ' || i.spec, 300), i.quantity, i.unit_price_cents, i.line_total_cents
    from public.order_items i where i.order_id = p_order;
  select coalesce(sum(l.line_total_cents), 0) into v_sum from public.invoice_lines l where l.invoice_id = v_id;
  if v_sum <> o.total_cents then raise exception 'invoice lines do not match the order total' using errcode = '23514'; end if;
  return v_id;
end;
$$;

-- Cancelling an order voids its invoice while nothing has been paid. A paid or partly paid invoice stays as it is (a refund is a later, finance-only step).
create function private.pay_order_cancel_voids_invoice() returns trigger
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.invoices set status = 'void', voided_at = clock_timestamp(), void_reason = 'order cancelled'
     where order_id = new.id and status = 'open';
  end if;
  return null;
end;
$$;

create trigger invoices_guard before update or delete on public.invoices for each row execute function private.guard_pay_invoices();
create trigger payments_guard before update or delete on public.payments for each row execute function private.guard_pay_payments();
create trigger invoice_lines_append_only before update or delete on public.invoice_lines for each row execute function private.guard_pay_append_only();
create trigger payment_events_append_only before update or delete on public.payment_events for each row execute function private.guard_pay_append_only();
create trigger wallet_entries_append_only before update or delete on public.wallet_entries for each row execute function private.guard_pay_append_only();
create trigger platform_flags_guard before update or delete on public.platform_flags for each row execute function private.guard_pay_flags();
create trigger invoices_no_truncate before truncate on public.invoices for each statement execute function private.block_truncate();
create trigger invoice_lines_no_truncate before truncate on public.invoice_lines for each statement execute function private.block_truncate();
create trigger payments_no_truncate before truncate on public.payments for each statement execute function private.block_truncate();
create trigger payment_events_no_truncate before truncate on public.payment_events for each statement execute function private.block_truncate();
create trigger platform_flags_no_truncate before truncate on public.platform_flags for each statement execute function private.block_truncate();
create trigger wallet_entries_no_truncate before truncate on public.wallet_entries for each statement execute function private.block_truncate();
create trigger invoices_touch before update on public.invoices for each row execute function private.touch_updated_at();
create trigger payments_touch before update on public.payments for each row execute function private.touch_updated_at();
create trigger platform_flags_touch before update on public.platform_flags for each row execute function private.touch_updated_at();
create trigger orders_cancel_voids_invoice after update of status on public.orders for each row execute function private.pay_order_cancel_voids_invoice();

-- 3. Checkout now issues the invoice in the same transaction as the order ---------------------------------------------------------------
-- Replaces the P3 function (same signature, so existing grants stay). The only changes: the invoice step after the order lines, and invoice_number in the answer.
create or replace function public.rpc_checkout(p_organization_id uuid, p_ship_to jsonb, p_notes text, p_idempotency_key uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor    uuid := (select auth.uid());
  v_cart     uuid;
  v_lines    jsonb;
  v_bad      jsonb;
  v_n        integer;
  v_subtotal bigint;
  v_order    uuid;
  v_number   text;
  v_total    bigint;
  v_invoice  text;
  v_notes    text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_idempotency_key is null or private.shop_ship_to_ok(p_ship_to) is not true or (v_notes is not null and char_length(v_notes) > 500) then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if not (p_organization_id in (select private.my_org_ids())) or not private.shop_org_ok(p_organization_id) then
    return jsonb_build_object('ok', false, 'code', 'organization_not_found');
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shop:pricing', 0));
  select c.id into v_cart from public.carts c where c.organization_id = p_organization_id and c.user_id = v_actor for update;
  select o.id, o.order_number, o.total_cents into v_order, v_number, v_total
    from public.orders o where o.organization_id = p_organization_id and o.placed_by = v_actor and o.idempotency_key = p_idempotency_key;
  if found then
    select i.invoice_number into v_invoice from public.invoices i where i.order_id = v_order;
    return jsonb_build_object('ok', true, 'code', 'order_placed', 'order_id', v_order, 'order_number', v_number, 'total_cents', v_total, 'invoice_number', v_invoice, 'replay', true);
  end if;
  if v_cart is null or not exists (select 1 from public.cart_items i where i.cart_id = v_cart) then
    return jsonb_build_object('ok', false, 'code', 'cart_empty');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('variant_id', l.variant_id, 'product_name', l.product_name, 'spec', l.spec, 'sku', l.sku, 'quantity', l.quantity,
                                               'base', l.base, 'floor', l.floor, 'pricing', l.pr) order by l.variant_id) filter (where l.ok), '[]'::jsonb),
         coalesce(jsonb_agg(l.variant_id) filter (where not l.ok), '[]'::jsonb)
    into v_lines, v_bad
    from (select ci.variant_id, pr.name as product_name, v.spec, v.sku, ci.quantity, v.base_price_cents as base, v.min_price_cents as floor, b.pr,
                 (b.pr is not null and pr.status = 'active' and v.status = 'active' and op.available is true) as ok
            from public.cart_items ci
            join public.product_variants v on v.id = ci.variant_id
            join public.products pr on pr.id = v.product_id
            left join public.organization_products op on op.organization_id = p_organization_id and op.product_id = pr.id
            cross join lateral (select private.shop_price_breakdown(p_organization_id, pr.id, v.base_price_cents, v.min_price_cents) as pr) b
           where ci.cart_id = v_cart) l;
  if jsonb_array_length(v_bad) > 0 then
    return jsonb_build_object('ok', false, 'code', 'cart_not_purchasable', 'variant_ids', v_bad);
  end if;

  select sum((e ->> 'quantity')::bigint * (e -> 'pricing' ->> 'unit')::bigint), count(*) into v_subtotal, v_n from jsonb_array_elements(v_lines) e;
  if v_subtotal > 1000000000000 then
    return jsonb_build_object('ok', false, 'code', 'order_too_large');
  end if;

  begin
    insert into public.orders (organization_id, placed_by, idempotency_key, subtotal_cents, total_cents, ship_to, notes)
    values (p_organization_id, v_actor, p_idempotency_key, v_subtotal, v_subtotal, p_ship_to, v_notes)
    returning id, order_number into v_order, v_number;
  exception when unique_violation then
    select o.id, o.order_number, o.total_cents into v_order, v_number, v_total
      from public.orders o where o.organization_id = p_organization_id and o.placed_by = v_actor and o.idempotency_key = p_idempotency_key;
    if found then
      select i.invoice_number into v_invoice from public.invoices i where i.order_id = v_order;
      return jsonb_build_object('ok', true, 'code', 'order_placed', 'order_id', v_order, 'order_number', v_number, 'total_cents', v_total, 'invoice_number', v_invoice, 'replay', true);
    end if;
    raise;
  end;

  insert into public.order_items (order_id, variant_id, product_name, spec, sku, quantity, base_price_cents, floor_cents, unit_price_cents, line_total_cents, pricing)
  select v_order, (e ->> 'variant_id')::uuid, e ->> 'product_name', e ->> 'spec', e ->> 'sku', (e ->> 'quantity')::integer, (e ->> 'base')::integer, (e ->> 'floor')::integer,
         (e -> 'pricing' ->> 'unit')::integer, (e -> 'pricing' ->> 'unit')::bigint * (e ->> 'quantity')::bigint, e -> 'pricing'
    from jsonb_array_elements(v_lines) e;

  perform private.pay_invoice_create(v_order);
  select i.invoice_number into v_invoice from public.invoices i where i.order_id = v_order;

  insert into public.order_events (order_id, from_status, to_status, actor_user_id, actor_kind) values (v_order, null, 'placed', v_actor, 'organization_user');
  delete from public.cart_items where cart_id = v_cart;
  update public.carts set updated_at = now() where id = v_cart;
  perform private.write_audit(v_actor, 'organization_user', 'order.place', 'success', p_organization_id, 'order', v_order::text,
                              jsonb_build_object('order_number', v_number, 'lines', v_n, 'total_cents', v_subtotal, 'invoice_number', v_invoice));
  return jsonb_build_object('ok', true, 'code', 'order_placed', 'order_id', v_order, 'order_number', v_number, 'total_cents', v_subtotal, 'invoice_number', v_invoice, 'replay', false);
end;
$$;

-- Orders that exist before P4 get their invoice now; invoices of already cancelled orders are void.
select private.pay_invoice_create(o.id) from public.orders o where not exists (select 1 from public.invoices i where i.order_id = o.id);
update public.invoices i set status = 'void', voided_at = clock_timestamp(), void_reason = 'order cancelled'
  where i.status = 'open' and exists (select 1 from public.orders o where o.id = i.order_id and o.status = 'cancelled');

-- 4. Customer RPCs (tenant boundary: private.my_org_ids() + active organization; reporting a payment also needs the owner role) -----------
create function public.rpc_billing_summary(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  s       record;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not (p_organization_id in (select private.my_org_ids())) or not private.shop_org_ok(p_organization_id) then
    return jsonb_build_object('ok', false, 'code', 'organization_not_found');
  end if;
  select count(*) filter (where i.status in ('open', 'partially_paid')) as unpaid_count,
         coalesce(sum(i.total_cents - i.paid_cents) filter (where i.status in ('open', 'partially_paid')), 0) as unpaid_cents,
         count(*) filter (where i.status in ('open', 'partially_paid') and i.due_at < clock_timestamp()) as overdue_count,
         coalesce(sum(i.paid_cents), 0) as paid_cents
    into s from public.invoices i where i.organization_id = p_organization_id;
  return jsonb_build_object('ok', true, 'unpaid_count', s.unpaid_count, 'unpaid_cents', s.unpaid_cents, 'overdue_count', s.overdue_count, 'paid_cents', s.paid_cents,
                            'wallet_enabled', private.pay_wallet_enabled(), 'can_report_payment', private.pay_org_owner_ok(p_organization_id));
end;
$$;

create function public.rpc_invoices_list(p_organization_id uuid, p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_rows  jsonb;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not (p_organization_id in (select private.my_org_ids())) or not private.shop_org_ok(p_organization_id) then
    return jsonb_build_object('ok', false, 'code', 'organization_not_found');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('invoice_id', i.id, 'invoice_number', i.invoice_number, 'order_number', o.order_number, 'status', i.status,
                                               'total_cents', i.total_cents, 'paid_cents', i.paid_cents, 'issued_at', i.issued_at, 'due_at', i.due_at,
                                               'pending_payments', (select count(*) from public.payments p where p.invoice_id = i.id and p.status = 'reported'))
                            order by i.issued_at desc), '[]'::jsonb)
    into v_rows
    from (select x.id, x.invoice_number, x.order_id, x.status, x.total_cents, x.paid_cents, x.issued_at, x.due_at from public.invoices x
           where x.organization_id = p_organization_id order by x.issued_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) i
    join public.orders o on o.id = i.order_id;
  return jsonb_build_object('ok', true, 'invoices', v_rows);
end;
$$;

create function public.rpc_invoice_get(p_organization_id uuid, p_invoice_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  i       record;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not (p_organization_id in (select private.my_org_ids())) or not private.shop_org_ok(p_organization_id) then
    return jsonb_build_object('ok', false, 'code', 'organization_not_found');
  end if;
  select x.id, x.invoice_number, x.order_id, x.status, x.total_cents, x.paid_cents, x.currency, x.terms, x.issued_at, x.due_at, x.voided_at, x.void_reason, o.order_number
    into i from public.invoices x join public.orders o on o.id = x.order_id where x.id = p_invoice_id and x.organization_id = p_organization_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'invoice_not_found'); end if;
  return jsonb_build_object('ok', true,
    'invoice', jsonb_build_object('invoice_id', i.id, 'invoice_number', i.invoice_number, 'order_id', i.order_id, 'order_number', i.order_number, 'status', i.status,
                                  'total_cents', i.total_cents, 'paid_cents', i.paid_cents, 'currency', i.currency, 'terms', i.terms, 'issued_at', i.issued_at,
                                  'due_at', i.due_at, 'voided_at', i.voided_at, 'void_reason', i.void_reason),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('line_type', l.line_type, 'description', l.description, 'quantity', l.quantity,
                       'unit_price_cents', l.unit_price_cents, 'line_total_cents', l.line_total_cents) order by l.description), '[]'::jsonb)
                from public.invoice_lines l where l.invoice_id = i.id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('payment_id', p.id, 'method', p.method, 'status', p.status, 'claimed_cents', p.claimed_cents,
                       'confirmed_cents', p.confirmed_cents, 'reference', p.reference, 'sent_on', p.sent_on, 'received_on', p.received_on, 'created_at', p.created_at)
                       order by p.created_at), '[]'::jsonb)
                from public.payments p where p.invoice_id = i.id),
    'can_report_payment', private.pay_org_owner_ok(p_organization_id));
end;
$$;

-- "I've sent payment": records a CLAIM. It never changes the invoice. Replay-safe through the idempotency key.
create function public.rpc_payment_report(p_organization_id uuid, p_invoice_id uuid, p_method text, p_amount_cents bigint, p_reference text, p_sent_on date,
                                          p_note text, p_idempotency_key uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_ref     text := nullif(btrim(coalesce(p_reference, '')), '');
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_pay     uuid;
  i         record;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_idempotency_key is null or p_invoice_id is null or p_method is null or p_method not in ('wire', 'zelle', 'ach', 'check', 'other')
     or p_amount_cents is null or p_amount_cents < 1 or p_amount_cents > 1000000000000
     or (v_ref is not null and char_length(v_ref) > 120) or (v_note is not null and char_length(v_note) > 300)
     or (p_sent_on is not null and p_sent_on > (clock_timestamp() at time zone 'utc')::date + 1) then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if not (p_organization_id in (select private.my_org_ids())) or not private.shop_org_ok(p_organization_id) then
    return jsonb_build_object('ok', false, 'code', 'organization_not_found');
  end if;
  if not private.pay_org_owner_ok(p_organization_id) then
    return jsonb_build_object('ok', false, 'code', 'owner_required');
  end if;
  select p.id into v_pay from public.payments p where p.organization_id = p_organization_id and p.reported_by = v_actor and p.idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('ok', true, 'code', 'payment_reported', 'payment_id', v_pay, 'replay', true);
  end if;
  select x.id, x.status, x.total_cents, x.paid_cents into i from public.invoices x where x.id = p_invoice_id and x.organization_id = p_organization_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'invoice_not_found'); end if;
  if i.status not in ('open', 'partially_paid') then return jsonb_build_object('ok', false, 'code', 'invoice_not_payable'); end if;
  if (select count(*) from public.payments p where p.invoice_id = i.id and p.status = 'reported') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'too_many_pending');
  end if;
  if p_amount_cents > i.total_cents - i.paid_cents then return jsonb_build_object('ok', false, 'code', 'exceeds_balance'); end if;

  insert into public.payments (organization_id, invoice_id, method, claimed_cents, reference, sent_on, note, reported_by, idempotency_key)
  values (p_organization_id, i.id, p_method, p_amount_cents, v_ref, p_sent_on, v_note, v_actor, p_idempotency_key)
  returning id into v_pay;
  insert into public.payment_events (payment_id, from_status, to_status, amount_cents, actor_user_id, actor_kind)
  values (v_pay, null, 'reported', p_amount_cents, v_actor, 'organization_user');
  perform private.write_audit(v_actor, 'organization_user', 'payment.report', 'success', p_organization_id, 'payment', v_pay::text,
                              jsonb_build_object('invoice_id', i.id, 'method', p_method, 'claimed_cents', p_amount_cents));
  return jsonb_build_object('ok', true, 'code', 'payment_reported', 'payment_id', v_pay, 'replay', false);
end;
$$;

-- 5. Staff RPCs (staff_gate: verified staff session + capability [+ fresh step-up]; a denial is audited and RETURNED) --------------------
create function public.rpc_admin_invoices_list(p_status text default null, p_limit integer default 100) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
  v_rows jsonb;
begin
  v_gate := private.staff_gate('org.billing.read', 'staff.invoice.list', false, 'invoice', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_status is not null and p_status not in ('open', 'partially_paid', 'paid', 'void') then raise exception 'invalid arguments' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('invoice_id', i.id, 'invoice_number', i.invoice_number, 'order_number', o.order_number, 'organization_id', g.id,
                                               'organization_name', g.name, 'organization_code', g.code, 'status', i.status, 'total_cents', i.total_cents,
                                               'paid_cents', i.paid_cents, 'issued_at', i.issued_at, 'due_at', i.due_at,
                                               'pending_payments', (select count(*) from public.payments p where p.invoice_id = i.id and p.status = 'reported'))
                            order by i.issued_at desc), '[]'::jsonb)
    into v_rows
    from (select x.id, x.invoice_number, x.order_id, x.organization_id, x.status, x.total_cents, x.paid_cents, x.issued_at, x.due_at from public.invoices x
           where p_status is null or x.status = p_status order by x.issued_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) i
    join public.orders o on o.id = i.order_id
    join public.organizations g on g.id = i.organization_id;
  return jsonb_build_object('ok', true, 'invoices', v_rows);
end;
$$;

create function public.rpc_admin_invoice_get(p_invoice_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
  i      record;
begin
  v_gate := private.staff_gate('org.billing.read', 'staff.invoice.get', false, 'invoice', p_invoice_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  select x.id, x.invoice_number, x.order_id, x.organization_id, x.status, x.total_cents, x.paid_cents, x.currency, x.terms, x.issued_at, x.due_at, x.voided_at, x.void_reason,
         o.order_number, g.name as org_name, g.code as org_code into i
    from public.invoices x join public.orders o on o.id = x.order_id join public.organizations g on g.id = x.organization_id where x.id = p_invoice_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'invoice_not_found'); end if;
  return jsonb_build_object('ok', true,
    'invoice', jsonb_build_object('invoice_id', i.id, 'invoice_number', i.invoice_number, 'order_id', i.order_id, 'order_number', i.order_number, 'status', i.status,
                                  'total_cents', i.total_cents, 'paid_cents', i.paid_cents, 'currency', i.currency, 'terms', i.terms, 'issued_at', i.issued_at,
                                  'due_at', i.due_at, 'voided_at', i.voided_at, 'void_reason', i.void_reason,
                                  'organization_id', i.organization_id, 'organization_name', i.org_name, 'organization_code', i.org_code),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('line_type', l.line_type, 'description', l.description, 'quantity', l.quantity,
                       'unit_price_cents', l.unit_price_cents, 'line_total_cents', l.line_total_cents) order by l.description), '[]'::jsonb)
                from public.invoice_lines l where l.invoice_id = i.id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('payment_id', p.id, 'method', p.method, 'status', p.status, 'claimed_cents', p.claimed_cents,
                       'confirmed_cents', p.confirmed_cents, 'reference', p.reference, 'sent_on', p.sent_on, 'received_on', p.received_on,
                       'bank_reference', p.bank_reference, 'review_note', p.review_note, 'reviewed_at', p.reviewed_at, 'created_at', p.created_at)
                       order by p.created_at), '[]'::jsonb)
                from public.payments p where p.invoice_id = i.id));
end;
$$;

create function public.rpc_admin_payments_list(p_status text default 'reported', p_limit integer default 100) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
  v_rows jsonb;
begin
  v_gate := private.staff_gate('payments.reconcile', 'staff.payment.list', false, 'payment', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_status is not null and p_status not in ('reported', 'confirmed', 'rejected', 'duplicate') then raise exception 'invalid arguments' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('payment_id', p.id, 'invoice_id', i.id, 'invoice_number', i.invoice_number, 'invoice_status', i.status,
                                               'invoice_total_cents', i.total_cents, 'invoice_paid_cents', i.paid_cents, 'organization_name', g.name,
                                               'organization_code', g.code, 'method', p.method, 'status', p.status, 'claimed_cents', p.claimed_cents,
                                               'confirmed_cents', p.confirmed_cents, 'reference', p.reference, 'sent_on', p.sent_on, 'note', p.note,
                                               'created_at', p.created_at) order by p.created_at), '[]'::jsonb)
    into v_rows
    from (select x.id, x.invoice_id, x.organization_id, x.method, x.status, x.claimed_cents, x.confirmed_cents, x.reference, x.sent_on, x.note, x.created_at from public.payments x
           where p_status is null or x.status = p_status order by x.created_at limit least(greatest(coalesce(p_limit, 100), 1), 500)) p
    join public.invoices i on i.id = p.invoice_id
    join public.organizations g on g.id = p.organization_id;
  return jsonb_build_object('ok', true, 'payments', v_rows);
end;
$$;

-- Confirmation is the ONLY path that moves an invoice's paid amount. Lock order: invoice, then payment (the customer report locks the invoice only).
create function public.rpc_admin_payment_confirm(p_payment_id uuid, p_confirmed_cents bigint, p_received_on date, p_bank_reference text default null,
                                                 p_note text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_inv    uuid;
  v_org    uuid;
  v_status text;
  v_paid   bigint;
  v_new    text;
  v_bank   text := nullif(btrim(coalesce(p_bank_reference, '')), '');
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
  i        record;
begin
  v_gate := private.staff_gate('payments.confirm', 'staff.payment.confirm', true, 'payment', p_payment_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_payment_id is null or p_confirmed_cents is null or p_confirmed_cents < 1 or p_confirmed_cents > 1000000000000 or p_received_on is null
     or p_received_on > (clock_timestamp() at time zone 'utc')::date + 1 or p_received_on < date '2020-01-01'
     or (v_bank is not null and char_length(v_bank) > 120) or (v_note is not null and char_length(v_note) > 300) then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  select p.invoice_id, p.organization_id into v_inv, v_org from public.payments p where p.id = p_payment_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'payment_not_found'); end if;
  select x.status, x.total_cents, x.paid_cents into i from public.invoices x where x.id = v_inv for update;
  select p.status into v_status from public.payments p where p.id = p_payment_id for update;
  if v_status <> 'reported' then return jsonb_build_object('ok', false, 'code', 'payment_already_reviewed'); end if;
  if i.status not in ('open', 'partially_paid') then return jsonb_build_object('ok', false, 'code', 'invoice_not_payable'); end if;
  if p_confirmed_cents > i.total_cents - i.paid_cents then return jsonb_build_object('ok', false, 'code', 'exceeds_balance'); end if;

  update public.payments set status = 'confirmed', confirmed_cents = p_confirmed_cents, received_on = p_received_on, bank_reference = v_bank,
                             reviewed_by = v_actor, reviewed_at = clock_timestamp(), review_note = v_note
   where id = p_payment_id;
  select coalesce(sum(p.confirmed_cents), 0) into v_paid from public.payments p where p.invoice_id = v_inv and p.status = 'confirmed';
  v_new := case when v_paid >= i.total_cents then 'paid' else 'partially_paid' end;
  update public.invoices set paid_cents = v_paid, status = v_new where id = v_inv;
  insert into public.payment_events (payment_id, from_status, to_status, amount_cents, actor_user_id, actor_kind, note)
  values (p_payment_id, 'reported', 'confirmed', p_confirmed_cents, v_actor, 'staff', v_note);
  perform private.write_audit(v_actor, 'staff', 'staff.payment.confirm', 'success', v_org, 'payment', p_payment_id::text,
                              jsonb_build_object('invoice_id', v_inv, 'confirmed_cents', p_confirmed_cents, 'invoice_status', v_new, 'paid_cents', v_paid));
  return jsonb_build_object('ok', true, 'code', 'confirmed', 'invoice_status', v_new, 'paid_cents', v_paid);
end;
$$;

create function public.rpc_admin_payment_reject(p_payment_id uuid, p_outcome text, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_inv    uuid;
  v_org    uuid;
  v_status text;
  v_claim  bigint;
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
begin
  v_gate := private.staff_gate('payments.reconcile', 'staff.payment.reject', false, 'payment', p_payment_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_payment_id is null or p_outcome is null or p_outcome not in ('rejected', 'duplicate') or v_note is null or char_length(v_note) > 300 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  select p.invoice_id, p.organization_id into v_inv, v_org from public.payments p where p.id = p_payment_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'payment_not_found'); end if;
  perform 1 from public.invoices x where x.id = v_inv for update;
  select p.status, p.claimed_cents into v_status, v_claim from public.payments p where p.id = p_payment_id for update;
  if v_status <> 'reported' then return jsonb_build_object('ok', false, 'code', 'payment_already_reviewed'); end if;
  update public.payments set status = p_outcome, reviewed_by = v_actor, reviewed_at = clock_timestamp(), review_note = v_note where id = p_payment_id;
  insert into public.payment_events (payment_id, from_status, to_status, amount_cents, actor_user_id, actor_kind, note)
  values (p_payment_id, 'reported', p_outcome, v_claim, v_actor, 'staff', v_note);
  perform private.write_audit(v_actor, 'staff', 'staff.payment.reject', 'success', v_org, 'payment', p_payment_id::text,
                              jsonb_build_object('invoice_id', v_inv, 'outcome', p_outcome));
  return jsonb_build_object('ok', true, 'code', p_outcome);
end;
$$;

-- Voiding is allowed only while nothing has been confirmed. Payments still awaiting review on the invoice are rejected with the same reason.
create function public.rpc_admin_invoice_void(p_invoice_id uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  i        record;
begin
  v_gate := private.staff_gate('financial.write', 'staff.invoice.void', true, 'invoice', p_invoice_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_invoice_id is null or v_reason is null or char_length(v_reason) > 300 then raise exception 'invalid arguments' using errcode = '22023'; end if;
  select x.status, x.paid_cents, x.organization_id into i from public.invoices x where x.id = p_invoice_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'invoice_not_found'); end if;
  if i.status = 'void' then return jsonb_build_object('ok', false, 'code', 'already_void'); end if;
  if i.paid_cents > 0 or i.status <> 'open' then return jsonb_build_object('ok', false, 'code', 'has_payments'); end if;
  insert into public.payment_events (payment_id, from_status, to_status, amount_cents, actor_user_id, actor_kind, note)
  select p.id, 'reported', 'rejected', p.claimed_cents, v_actor, 'staff', 'invoice voided' from public.payments p where p.invoice_id = p_invoice_id and p.status = 'reported';
  update public.payments set status = 'rejected', reviewed_by = v_actor, reviewed_at = clock_timestamp(), review_note = 'invoice voided'
   where invoice_id = p_invoice_id and status = 'reported';
  update public.invoices set status = 'void', voided_at = clock_timestamp(), void_reason = v_reason where id = p_invoice_id;
  perform private.write_audit(v_actor, 'staff', 'staff.invoice.void', 'success', i.organization_id, 'invoice', p_invoice_id::text, jsonb_build_object('reason', v_reason));
  return jsonb_build_object('ok', true, 'code', 'voided');
end;
$$;

-- 6. Wallet (locked): every wallet RPC answers wallet_disabled while platform_flags.wallet_enabled is false, which the table constraint guarantees until Gate G3 ----
create function public.rpc_wallet_get(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not (p_organization_id in (select private.my_org_ids())) or not private.shop_org_ok(p_organization_id) then
    return jsonb_build_object('ok', false, 'code', 'organization_not_found');
  end if;
  if not private.pay_wallet_enabled() then return jsonb_build_object('ok', false, 'code', 'wallet_disabled'); end if;
  return jsonb_build_object('ok', true, 'balance_cents', (select coalesce(sum(e.amount_cents), 0) from public.wallet_entries e where e.organization_id = p_organization_id));
end;
$$;

create function public.rpc_admin_wallet_adjust(p_organization_id uuid, p_amount_cents bigint, p_reason text, p_idempotency_key uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_id     uuid;
begin
  v_gate := private.staff_gate('financial.write', 'staff.wallet.adjust', true, 'organization', p_organization_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if not private.pay_wallet_enabled() then return jsonb_build_object('ok', false, 'code', 'wallet_disabled'); end if;
  if p_organization_id is null or p_amount_cents is null or p_amount_cents = 0 or abs(p_amount_cents) > 1000000000000 or v_reason is null
     or char_length(v_reason) > 300 or p_idempotency_key is null or not exists (select 1 from public.organizations g where g.id = p_organization_id) then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  insert into public.wallet_entries (organization_id, entry_type, amount_cents, note, idempotency_key, created_by)
  values (p_organization_id, 'adjustment', p_amount_cents, v_reason, p_idempotency_key, v_actor) returning id into v_id;
  perform private.write_audit(v_actor, 'staff', 'staff.wallet.adjust', 'success', p_organization_id, 'wallet_entry', v_id::text, jsonb_build_object('amount_cents', p_amount_cents));
  return jsonb_build_object('ok', true, 'code', 'adjusted', 'entry_id', v_id);
end;
$$;

-- 7. Privileges -------------------------------------------------------------------------------------------------------------------------
revoke all on table public.invoices, public.invoice_lines, public.payments, public.payment_events, public.platform_flags, public.wallet_entries
  from public, anon, authenticated, service_role;
revoke all on sequence public.invoice_number_seq from public, anon, authenticated, service_role;

revoke all on function private.pay_invoice_transition_ok(text, text), private.pay_payment_transition_ok(text, text), private.pay_org_owner_ok(uuid), private.pay_wallet_enabled(),
                       private.guard_pay_invoices(), private.guard_pay_payments(), private.guard_pay_append_only(), private.guard_pay_flags(),
                       private.pay_invoice_create(uuid), private.pay_order_cancel_voids_invoice()
  from public, anon, authenticated, service_role;

revoke all on function public.rpc_billing_summary(uuid), public.rpc_invoices_list(uuid, integer), public.rpc_invoice_get(uuid, uuid),
                       public.rpc_payment_report(uuid, uuid, text, bigint, text, date, text, uuid),
                       public.rpc_admin_invoices_list(text, integer), public.rpc_admin_invoice_get(uuid), public.rpc_admin_payments_list(text, integer),
                       public.rpc_admin_payment_confirm(uuid, bigint, date, text, text), public.rpc_admin_payment_reject(uuid, text, text),
                       public.rpc_admin_invoice_void(uuid, text), public.rpc_wallet_get(uuid), public.rpc_admin_wallet_adjust(uuid, bigint, text, uuid),
                       public.rpc_checkout(uuid, jsonb, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_billing_summary(uuid), public.rpc_invoices_list(uuid, integer), public.rpc_invoice_get(uuid, uuid),
                          public.rpc_payment_report(uuid, uuid, text, bigint, text, date, text, uuid),
                          public.rpc_admin_invoices_list(text, integer), public.rpc_admin_invoice_get(uuid), public.rpc_admin_payments_list(text, integer),
                          public.rpc_admin_payment_confirm(uuid, bigint, date, text, text), public.rpc_admin_payment_reject(uuid, text, text),
                          public.rpc_admin_invoice_void(uuid, text), public.rpc_wallet_get(uuid), public.rpc_admin_wallet_adjust(uuid, bigint, text, uuid),
                          public.rpc_checkout(uuid, jsonb, text, uuid)
  to authenticated;

-- 8. Self-check: the migration fails if the posture is not what the design says ---------------------------------------------------------
do $$
declare
  t text;
  p text;
begin
  foreach t in array array['public.invoices', 'public.invoice_lines', 'public.payments', 'public.payment_events', 'public.platform_flags', 'public.wallet_entries'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = t::regclass) then raise exception 'self-check: RLS not enabled on %', t; end if;
    foreach p in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
      if has_table_privilege('anon', t, p) or has_table_privilege('authenticated', t, p) or has_table_privilege('service_role', t, p) then
        raise exception 'self-check: an API role has % on %', p, t;
      end if;
    end loop;
  end loop;
  if (select count(*) from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
       where n.nspname = 'public' and pr.proname in ('rpc_billing_summary', 'rpc_invoices_list', 'rpc_invoice_get', 'rpc_payment_report', 'rpc_admin_invoices_list',
             'rpc_admin_invoice_get', 'rpc_admin_payments_list', 'rpc_admin_payment_confirm', 'rpc_admin_payment_reject', 'rpc_admin_invoice_void',
             'rpc_wallet_get', 'rpc_admin_wallet_adjust', 'rpc_checkout')
         and pr.prosecdef and has_function_privilege('authenticated', pr.oid, 'execute')
         and not has_function_privilege('anon', pr.oid, 'execute') and not has_function_privilege('service_role', pr.oid, 'execute') and not has_function_privilege('public', pr.oid, 'execute')
         and exists (select 1 from unnest(pr.proconfig) c where regexp_replace(c, '[\s"'']', '', 'g') ~* '^search_path=$')) <> 13 then
    raise exception 'self-check: RPC definer, search_path or grant state is wrong';
  end if;
  if exists (select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
              where n.nspname = 'private' and pr.proname like 'pay\_%' and (has_function_privilege('authenticated', pr.oid, 'execute') or has_function_privilege('anon', pr.oid, 'execute'))) then
    raise exception 'self-check: a payment private helper is executable by an API role';
  end if;
  if exists (select 1 from public.orders o where not exists (select 1 from public.invoices i where i.order_id = o.id)) then
    raise exception 'self-check: an order has no invoice after the backfill';
  end if;
  if exists (select 1 from public.invoices i where i.total_cents <> (select coalesce(sum(l.line_total_cents), 0) from public.invoice_lines l where l.invoice_id = i.id)) then
    raise exception 'self-check: an invoice total differs from the sum of its lines';
  end if;
  if exists (select 1 from public.payments) or exists (select 1 from public.wallet_entries) then raise exception 'self-check: payment and wallet tables must be empty at install'; end if;
  if (select count(*) from pg_trigger tg where not tg.tgisinternal and tg.tgrelid in ('public.invoices'::regclass, 'public.invoice_lines'::regclass, 'public.payments'::regclass,
        'public.payment_events'::regclass, 'public.wallet_entries'::regclass, 'public.platform_flags'::regclass)) <> 15 then
    raise exception 'self-check: expected 15 triggers on the P4 tables';
  end if;
  -- the wallet is locked: the flag cannot be switched on, and it starts off
  if private.pay_wallet_enabled() then raise exception 'self-check: the wallet must start disabled'; end if;
  begin
    update public.platform_flags set enabled = true where key = 'wallet_enabled';
    raise exception 'self-check: the wallet flag could be enabled';
  exception when check_violation then null;
  end;
  if not private.pay_invoice_transition_ok('open', 'paid') or private.pay_invoice_transition_ok('paid', 'void') or private.pay_invoice_transition_ok('void', 'open')
     or not private.pay_payment_transition_ok('reported', 'confirmed') or private.pay_payment_transition_ok('confirmed', 'rejected') then
    raise exception 'self-check: transitions';
  end if;
end;
$$;
