-- =====================================================================================================================================
-- P7 DRAFT. NOT APPLIED. NOT EXECUTED. NEVER PARSED BY POSTGRESQL.
-- Inventory and warehouse: warehouses and locations, lots, an append-only movement ledger with derived balances, inbound notices and receiving, FEFO allocation,
-- the fulfillment order lifecycle (queued, allocated, picked, packed, ready, shipped, delivered, cancelled), shipments with tracking, and exceptions.
-- Depends on 0001 to 0004, P3 to P6 (sku_mappings, fulfillment_orders, int_emit_event). Reuses existing capabilities: inventory.adjust, fulfillment.process, org.read, org.manage.
-- Scope: customer-owned stock (the fulfillment service). Company-owned wholesale stock and fee invoicing are not part of P7 (see docs/P5-P9-BUILD-PLAN.md).
-- TypeScript mirror: src/lib/portal/inventory/.
-- =====================================================================================================================================

-- 1. Tables ---------------------------------------------------------------------------------------------------------------------------
create table public.warehouses (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$'),
  name       text not null check (char_length(btrim(name)) between 1 and 120),
  active     boolean not null default true,
  created_at timestamptz not null default clock_timestamp()
);

create table public.warehouse_locations (
  id           uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  code         text not null check (code ~ '^[A-Z0-9][A-Z0-9._-]{0,19}$'),
  kind         text not null check (kind in ('receiving', 'storage', 'pick', 'quarantine')),
  active       boolean not null default true,
  created_at   timestamptz not null default clock_timestamp(),
  constraint warehouse_locations_code_key unique (warehouse_id, code)
);

create table public.inventory_lots (
  id              uuid primary key default gen_random_uuid(),
  sku_mapping_id  uuid not null,
  organization_id uuid not null,
  lot_number      text not null check (lot_number ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$'),
  expires_on      date,
  created_by      uuid not null,
  created_at      timestamptz not null default clock_timestamp(),
  constraint inventory_lots_mapping_fk foreign key (sku_mapping_id, organization_id) references public.sku_mappings (id, organization_id) on delete restrict,
  constraint inventory_lots_key unique (sku_mapping_id, lot_number),
  constraint inventory_lots_id_sku_key unique (id, sku_mapping_id)
);

-- Derived balances: written ONLY by private.inv_move, inside the same transaction as the movement. The constraints make a negative balance and an over-reservation impossible.
create table public.inventory_balances (
  sku_mapping_id  uuid not null,
  lot_id          uuid not null,
  location_id     uuid not null references public.warehouse_locations (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  on_hand         integer not null default 0 check (on_hand >= 0),
  reserved        integer not null default 0 check (reserved >= 0),
  updated_at      timestamptz not null default clock_timestamp(),
  primary key (sku_mapping_id, lot_id, location_id),
  constraint inventory_balances_lot_fk foreign key (lot_id, sku_mapping_id) references public.inventory_lots (id, sku_mapping_id) on delete restrict,
  constraint inventory_balances_reserved_le_on_hand check (reserved <= on_hand)
);
create index inventory_balances_org_idx on public.inventory_balances (organization_id, sku_mapping_id);

create table public.inventory_movements (
  id              uuid primary key default gen_random_uuid(),
  movement_type   text not null check (movement_type in ('receive', 'adjust_plus', 'adjust_minus', 'reserve', 'release', 'consume')),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  sku_mapping_id  uuid not null,
  lot_id          uuid not null,
  location_id     uuid not null references public.warehouse_locations (id) on delete restrict,
  qty             integer not null check (qty between 1 and 1000000),
  ref_type        text check (ref_type is null or char_length(ref_type) <= 40),
  ref_id          text check (ref_id is null or char_length(ref_id) <= 80),
  reason          text check (reason is null or char_length(reason) <= 300),
  idempotency_key uuid not null unique,
  created_by      uuid not null,
  created_at      timestamptz not null default clock_timestamp(),
  constraint inventory_movements_lot_fk foreign key (lot_id, sku_mapping_id) references public.inventory_lots (id, sku_mapping_id) on delete restrict,
  constraint inventory_movements_adjust_reason check (movement_type not in ('adjust_plus', 'adjust_minus') or reason is not null)
);
create index inventory_movements_sku_idx on public.inventory_movements (sku_mapping_id, created_at desc);
create index inventory_movements_org_idx on public.inventory_movements (organization_id, created_at desc);

create table public.inbound_receipts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  warehouse_id    uuid not null references public.warehouses (id) on delete restrict,
  reference       text not null check (char_length(btrim(reference)) between 1 and 80),
  status          text not null default 'expected' check (status in ('expected', 'received', 'cancelled')),
  created_by      uuid not null,
  created_at      timestamptz not null default clock_timestamp(),
  received_by     uuid,
  received_at     timestamptz,
  constraint inbound_receipts_received_consistent check ((status = 'received') = (received_at is not null and received_by is not null))
);
create index inbound_receipts_org_idx on public.inbound_receipts (organization_id, created_at desc);
create index inbound_receipts_status_idx on public.inbound_receipts (status, created_at);

create table public.inbound_receipt_lines (
  id             uuid primary key default gen_random_uuid(),
  receipt_id     uuid not null references public.inbound_receipts (id) on delete restrict,
  sku_mapping_id uuid not null references public.sku_mappings (id) on delete restrict,
  expected_units integer not null check (expected_units between 1 and 1000000),
  received_units integer check (received_units is null or received_units between 0 and 1000000),
  lot_id         uuid references public.inventory_lots (id) on delete restrict,
  location_id    uuid references public.warehouse_locations (id) on delete restrict,
  constraint inbound_receipt_lines_key unique (receipt_id, sku_mapping_id)
);

create table public.inventory_reservations (
  id              uuid primary key default gen_random_uuid(),
  order_line_id   uuid not null references public.fulfillment_order_lines (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  sku_mapping_id  uuid not null,
  lot_id          uuid not null,
  location_id     uuid not null,
  qty             integer not null check (qty between 1 and 1000000),
  status          text not null default 'active' check (status in ('active', 'released', 'consumed')),
  created_at      timestamptz not null default clock_timestamp(),
  closed_at       timestamptz,
  constraint inventory_reservations_balance_fk foreign key (sku_mapping_id, lot_id, location_id) references public.inventory_balances (sku_mapping_id, lot_id, location_id) on delete restrict,
  constraint inventory_reservations_closed_consistent check ((status = 'active') = (closed_at is null))
);
create index inventory_reservations_line_idx on public.inventory_reservations (order_line_id, status);

create table public.shipments (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null unique references public.fulfillment_orders (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  carrier         text not null check (char_length(btrim(carrier)) between 1 and 60),
  service         text check (service is null or char_length(service) <= 60),
  tracking_number text not null check (char_length(btrim(tracking_number)) between 1 and 80),
  shipped_at      timestamptz not null default clock_timestamp(),
  shipped_by      uuid not null,
  delivered_at    timestamptz
);

create table public.fulfillment_order_events (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.fulfillment_orders (id) on delete restrict,
  from_status   text,
  to_status     text not null check (to_status in ('pending', 'queued', 'allocated', 'picked', 'packed', 'ready', 'shipped', 'delivered', 'cancelled')),
  actor_user_id uuid,
  actor_kind    text not null check (actor_kind in ('staff', 'organization_user', 'system')),
  note          text check (note is null or char_length(note) <= 300),
  created_at    timestamptz not null default clock_timestamp()
);
create index fulfillment_order_events_order_idx on public.fulfillment_order_events (order_id, created_at);

create table public.fulfillment_exceptions (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.fulfillment_orders (id) on delete restrict,
  kind        text not null check (kind in ('insufficient_stock', 'other')),
  status      text not null default 'open' check (status in ('open', 'resolved')),
  detail      text check (detail is null or char_length(detail) <= 300),
  created_by  uuid,
  created_at  timestamptz not null default clock_timestamp(),
  resolved_by uuid,
  resolved_at timestamptz,
  resolution  text check (resolution is null or char_length(resolution) <= 300),
  constraint fulfillment_exceptions_resolved_consistent check ((status = 'resolved') = (resolved_at is not null and resolved_by is not null))
);
create unique index fulfillment_exceptions_open_key on public.fulfillment_exceptions (order_id, kind) where status = 'open';

alter table public.warehouses               enable row level security;
alter table public.warehouse_locations      enable row level security;
alter table public.inventory_lots           enable row level security;
alter table public.inventory_balances       enable row level security;
alter table public.inventory_movements      enable row level security;
alter table public.inbound_receipts         enable row level security;
alter table public.inbound_receipt_lines    enable row level security;
alter table public.inventory_reservations   enable row level security;
alter table public.shipments                enable row level security;
alter table public.fulfillment_order_events enable row level security;
alter table public.fulfillment_exceptions   enable row level security;

-- 2. Private helpers and guards -------------------------------------------------------------------------------------------------------
create function private.guard_inv_append_only() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '23514';
  return null;
end;
$$;

create function private.guard_inv_receipts() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'receipts cannot be deleted' using errcode = '23514'; end if;
  if new.id <> old.id or new.organization_id <> old.organization_id or new.warehouse_id <> old.warehouse_id or new.reference <> old.reference or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'receipt identity is immutable' using errcode = '23514';
  end if;
  if old.status <> 'expected' and (new.status <> old.status or new.received_at is distinct from old.received_at) then raise exception 'a finished receipt is final' using errcode = '23514'; end if;
  return new;
end;
$$;

create function private.guard_inv_reservations() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'reservations cannot be deleted' using errcode = '23514'; end if;
  if new.id <> old.id or new.order_line_id <> old.order_line_id or new.sku_mapping_id <> old.sku_mapping_id or new.lot_id <> old.lot_id or new.location_id <> old.location_id or new.qty <> old.qty then
    raise exception 'reservation identity is immutable' using errcode = '23514';
  end if;
  if old.status <> 'active' and new.status <> old.status then raise exception 'a closed reservation is final' using errcode = '23514'; end if;
  return new;
end;
$$;

create function private.guard_inv_shipments() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'shipments cannot be deleted' using errcode = '23514'; end if;
  if new.id <> old.id or new.order_id <> old.order_id or new.carrier <> old.carrier or new.service is distinct from old.service or new.tracking_number <> old.tracking_number or new.shipped_at <> old.shipped_at or new.shipped_by <> old.shipped_by then
    raise exception 'shipment details are immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function private.guard_inv_exceptions() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'exceptions cannot be deleted' using errcode = '23514'; end if;
  if new.id <> old.id or new.order_id <> old.order_id or new.kind <> old.kind or new.created_at <> old.created_at then raise exception 'exception identity is immutable' using errcode = '23514'; end if;
  if old.status = 'resolved' and new.status <> 'resolved' then raise exception 'a resolved exception is final' using errcode = '23514'; end if;
  return new;
end;
$$;

-- THE ONLY writer of balances. A movement row and its balance change happen together; the table constraints reject a negative balance and reserved > on_hand.
--   receive, adjust_plus: on_hand + qty      adjust_minus: on_hand - qty      reserve: reserved + qty      release: reserved - qty      consume (ship): on_hand - qty and reserved - qty
create function private.inv_move(p_type text, p_org uuid, p_sku uuid, p_lot uuid, p_loc uuid, p_qty integer, p_ref_type text, p_ref_id text, p_reason text, p_idem uuid, p_actor uuid) returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  insert into public.inventory_movements (movement_type, organization_id, sku_mapping_id, lot_id, location_id, qty, ref_type, ref_id, reason, idempotency_key, created_by)
  values (p_type, p_org, p_sku, p_lot, p_loc, p_qty, p_ref_type, p_ref_id, p_reason, p_idem, p_actor);
  if p_type in ('receive', 'adjust_plus') then
    insert into public.inventory_balances as bal (sku_mapping_id, lot_id, location_id, organization_id, on_hand) values (p_sku, p_lot, p_loc, p_org, p_qty)
    on conflict (sku_mapping_id, lot_id, location_id) do update set on_hand = bal.on_hand + excluded.on_hand, updated_at = clock_timestamp();
    return;
  end if;
  if p_type = 'adjust_minus' then
    update public.inventory_balances set on_hand = on_hand - p_qty, updated_at = clock_timestamp() where sku_mapping_id = p_sku and lot_id = p_lot and location_id = p_loc;
  elsif p_type = 'reserve' then
    update public.inventory_balances set reserved = reserved + p_qty, updated_at = clock_timestamp() where sku_mapping_id = p_sku and lot_id = p_lot and location_id = p_loc;
  elsif p_type = 'release' then
    update public.inventory_balances set reserved = reserved - p_qty, updated_at = clock_timestamp() where sku_mapping_id = p_sku and lot_id = p_lot and location_id = p_loc;
  elsif p_type = 'consume' then
    update public.inventory_balances set on_hand = on_hand - p_qty, reserved = reserved - p_qty, updated_at = clock_timestamp() where sku_mapping_id = p_sku and lot_id = p_lot and location_id = p_loc;
  else
    raise exception 'unknown movement type' using errcode = '22023';
  end if;
  if not found then raise exception 'no balance for this movement' using errcode = '23514'; end if;
end;
$$;

-- Balances must equal the ledger: on_hand = receipts and adjustments in minus adjustments out and shipped; reserved = reserved minus released and shipped. Returns the number of drifting balance rows.
create function private.inv_reconcile() returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::int from public.inventory_balances bal
   where bal.on_hand <> coalesce((select sum(case when m.movement_type in ('receive', 'adjust_plus') then m.qty else -m.qty end)
                                    from public.inventory_movements m
                                   where m.sku_mapping_id = bal.sku_mapping_id and m.lot_id = bal.lot_id and m.location_id = bal.location_id
                                     and m.movement_type in ('receive', 'adjust_plus', 'adjust_minus', 'consume')), 0)
      or bal.reserved <> coalesce((select sum(case when m.movement_type = 'reserve' then m.qty else -m.qty end)
                                    from public.inventory_movements m
                                   where m.sku_mapping_id = bal.sku_mapping_id and m.lot_id = bal.lot_id and m.location_id = bal.location_id
                                     and m.movement_type in ('reserve', 'release', 'consume')), 0);
$$;

-- Units that can still be promised for a SKU: on hand minus reserved, only in lots that have not expired and only outside quarantine locations.
create function private.inv_available(p_sku uuid, p_org uuid) returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(bal.on_hand - bal.reserved), 0)::int
    from public.inventory_balances bal
    join public.inventory_lots lo on lo.id = bal.lot_id
    join public.warehouse_locations wl on wl.id = bal.location_id
   where bal.sku_mapping_id = p_sku and bal.organization_id = p_org and wl.kind <> 'quarantine' and wl.active and (lo.expires_on is null or lo.expires_on >= current_date);
$$;

-- First-expiry-first-out allocation for ALL lines of an order, all or nothing. Locks the candidate balances in a fixed order (no deadlocks between orders), checks the whole
-- order first, then reserves. Returns NULL on success or 'insufficient_stock'.
create function private.fo_allocate(p_order uuid, p_actor uuid) returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org  uuid;
  v_line record;
  v_bal  record;
  v_need integer;
  v_take integer;
begin
  select o.organization_id into v_org from public.fulfillment_orders o where o.id = p_order;
  perform 1 from public.inventory_balances bal join public.fulfillment_order_lines l on l.sku_mapping_id = bal.sku_mapping_id
   where l.order_id = p_order and bal.organization_id = v_org order by bal.sku_mapping_id, bal.lot_id, bal.location_id for update of bal;
  -- the SUMMED need of each SKU is compared with what is available (the unique key already allows one line per SKU; this keeps the check correct on its own)
  if exists (select 1 from (select l.sku_mapping_id, sum(l.quantity) as q from public.fulfillment_order_lines l where l.order_id = p_order group by l.sku_mapping_id) need
              where need.q > private.inv_available(need.sku_mapping_id, v_org)) then return 'insufficient_stock'; end if;
  for v_line in select l.id, l.sku_mapping_id, l.quantity from public.fulfillment_order_lines l where l.order_id = p_order order by l.sku_mapping_id loop
    v_need := v_line.quantity;
    for v_bal in
      select bal.lot_id, bal.location_id, bal.on_hand - bal.reserved as avail
        from public.inventory_balances bal join public.inventory_lots lo on lo.id = bal.lot_id join public.warehouse_locations wl on wl.id = bal.location_id
       where bal.sku_mapping_id = v_line.sku_mapping_id and bal.organization_id = v_org and bal.on_hand - bal.reserved > 0 and wl.kind <> 'quarantine' and wl.active
         and (lo.expires_on is null or lo.expires_on >= current_date)
       order by lo.expires_on nulls last, lo.created_at, bal.location_id
    loop
      exit when v_need = 0;
      v_take := least(v_need, v_bal.avail);
      insert into public.inventory_reservations (order_line_id, organization_id, sku_mapping_id, lot_id, location_id, qty) values (v_line.id, v_org, v_line.sku_mapping_id, v_bal.lot_id, v_bal.location_id, v_take);
      perform private.inv_move('reserve', v_org, v_line.sku_mapping_id, v_bal.lot_id, v_bal.location_id, v_take, 'fulfillment_order', p_order::text, null, gen_random_uuid(), p_actor);
      v_need := v_need - v_take;
    end loop;
  end loop;
  return null;
end;
$$;

-- Closes every active reservation of an order: 'consumed' (stock leaves on shipment) or 'released' (cancellation).
create function private.fo_close_reservations(p_order uuid, p_consume boolean, p_actor uuid) returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in select res.id, res.organization_id, res.sku_mapping_id, res.lot_id, res.location_id, res.qty
             from public.inventory_reservations res join public.fulfillment_order_lines l on l.id = res.order_line_id
            where l.order_id = p_order and res.status = 'active' order by res.sku_mapping_id, res.lot_id, res.location_id for update of res loop
    perform private.inv_move(case when p_consume then 'consume' else 'release' end, r.organization_id, r.sku_mapping_id, r.lot_id, r.location_id, r.qty, 'fulfillment_order', p_order::text, null, gen_random_uuid(), p_actor);
    update public.inventory_reservations set status = case when p_consume then 'consumed' else 'released' end, closed_at = clock_timestamp() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Everything a customer or staff member sees about one fulfillment order.
create function private.fo_detail(p_order uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select private.int_order_json(o.id) || jsonb_build_object(
    'shipment', (select jsonb_build_object('carrier', s.carrier, 'service', s.service, 'tracking_number', s.tracking_number, 'shipped_at', s.shipped_at, 'delivered_at', s.delivered_at) from public.shipments s where s.order_id = o.id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('from_status', e.from_status, 'to_status', e.to_status, 'actor_kind', e.actor_kind, 'at', e.created_at) order by e.created_at), '[]'::jsonb)
                 from public.fulfillment_order_events e where e.order_id = o.id),
    'open_exceptions', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'detail', x.detail, 'created_at', x.created_at) order by x.created_at), '[]'::jsonb)
                          from public.fulfillment_exceptions x where x.order_id = o.id and x.status = 'open'))
    from public.fulfillment_orders o where o.id = p_order;
$$;

create trigger inventory_lots_append_only before update or delete on public.inventory_lots for each row execute function private.guard_inv_append_only();
create trigger inventory_movements_append_only before update or delete on public.inventory_movements for each row execute function private.guard_inv_append_only();
create trigger fulfillment_order_events_append_only before update or delete on public.fulfillment_order_events for each row execute function private.guard_inv_append_only();
create trigger inbound_receipts_guard before update or delete on public.inbound_receipts for each row execute function private.guard_inv_receipts();
create trigger inventory_reservations_guard before update or delete on public.inventory_reservations for each row execute function private.guard_inv_reservations();
create trigger shipments_guard before update or delete on public.shipments for each row execute function private.guard_inv_shipments();
create trigger fulfillment_exceptions_guard before update or delete on public.fulfillment_exceptions for each row execute function private.guard_inv_exceptions();
create trigger inventory_lots_no_truncate before truncate on public.inventory_lots for each statement execute function private.block_truncate();
create trigger inventory_balances_no_truncate before truncate on public.inventory_balances for each statement execute function private.block_truncate();
create trigger inventory_movements_no_truncate before truncate on public.inventory_movements for each statement execute function private.block_truncate();
create trigger inventory_reservations_no_truncate before truncate on public.inventory_reservations for each statement execute function private.block_truncate();
create trigger shipments_no_truncate before truncate on public.shipments for each statement execute function private.block_truncate();
create trigger fulfillment_order_events_no_truncate before truncate on public.fulfillment_order_events for each statement execute function private.block_truncate();

-- 3. Customer RPCs (tenant boundary: private.my_org_ids() + active organization; changes need the owner role) ---------------------------------
create function public.rpc_stock_list(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not (p_organization_id in (select private.my_org_ids())) or private.shop_org_ok(p_organization_id) is not true then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  return jsonb_build_object('ok', true, 'items',
    (select coalesce(jsonb_agg(jsonb_build_object('sku_mapping_id', m.id, 'internal_sku', m.internal_sku, 'external_sku', m.external_sku, 'product_name', coalesce(m.product_name, pr.name), 'spec', coalesce(m.spec, v.spec),
                                                  'on_hand', coalesce(t.on_hand, 0), 'reserved', coalesce(t.reserved, 0), 'available', private.inv_available(m.id, m.organization_id),
                                                  'lots', coalesce(t.lots, '[]'::jsonb)) order by m.external_sku), '[]'::jsonb)
       from public.sku_mappings m left join public.product_variants v on v.id = m.variant_id left join public.products pr on pr.id = v.product_id
       left join lateral (select sum(bal.on_hand)::int as on_hand, sum(bal.reserved)::int as reserved,
                                 jsonb_agg(jsonb_build_object('lot_number', lo.lot_number, 'expires_on', lo.expires_on, 'location', wl.code, 'on_hand', bal.on_hand, 'reserved', bal.reserved) order by lo.expires_on nulls last, lo.lot_number) as lots
                            from public.inventory_balances bal join public.inventory_lots lo on lo.id = bal.lot_id join public.warehouse_locations wl on wl.id = bal.location_id
                           where bal.sku_mapping_id = m.id and bal.on_hand > 0) t on true
      where m.organization_id = p_organization_id and m.status = 'approved'));
end;
$$;

create function public.rpc_inbound_list(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not (p_organization_id in (select private.my_org_ids())) or private.shop_org_ok(p_organization_id) is not true then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  return jsonb_build_object('ok', true, 'can_edit', private.pay_org_owner_ok(p_organization_id),
    'warehouse_ready', exists (select 1 from public.warehouses w where w.active),
    'receipts', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'reference', r.reference, 'status', r.status, 'created_at', r.created_at, 'received_at', r.received_at,
                                                              'lines', (select coalesce(jsonb_agg(jsonb_build_object('external_sku', m.external_sku, 'expected_units', l.expected_units, 'received_units', l.received_units) order by m.external_sku), '[]'::jsonb)
                                                                          from public.inbound_receipt_lines l join public.sku_mappings m on m.id = l.sku_mapping_id where l.receipt_id = r.id)) order by r.created_at desc), '[]'::jsonb)
                   from (select x.id, x.reference, x.status, x.created_at, x.received_at from public.inbound_receipts x where x.organization_id = p_organization_id order by x.created_at desc limit 50) r));
end;
$$;

-- Announce an inbound shipment (ASN): the units are NOT stock until staff receive them.
create function public.rpc_inbound_create(p_organization_id uuid, p_reference text, p_lines jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_ref   text := nullif(btrim(coalesce(p_reference, '')), '');
  v_wh    uuid;
  v_id    uuid;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if v_ref is null or char_length(v_ref) > 80 or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 50 then raise exception 'invalid arguments' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) e where jsonb_typeof(e) <> 'object' or (e ->> 'sku_mapping_id') !~ '^[0-9a-f-]{36}$' or (e ->> 'expected_units') !~ '^[0-9]{1,7}$'
                or (e ->> 'expected_units')::int not between 1 and 1000000)
     or (select count(distinct e ->> 'sku_mapping_id') from jsonb_array_elements(p_lines) e) <> jsonb_array_length(p_lines) then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  v_gate := private.ob_owner_gate(p_organization_id);
  if v_gate is not null then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if exists (select 1 from jsonb_array_elements(p_lines) e where not exists (select 1 from public.sku_mappings m where m.id = (e ->> 'sku_mapping_id')::uuid and m.organization_id = p_organization_id and m.status = 'approved')) then
    return jsonb_build_object('ok', false, 'code', 'mapping_not_found');
  end if;
  select w.id into v_wh from public.warehouses w where w.active order by w.code limit 1;
  if v_wh is null then return jsonb_build_object('ok', false, 'code', 'no_warehouse'); end if;
  insert into public.inbound_receipts (organization_id, warehouse_id, reference, created_by) values (p_organization_id, v_wh, v_ref, v_actor) returning id into v_id;
  insert into public.inbound_receipt_lines (receipt_id, sku_mapping_id, expected_units) select v_id, (e ->> 'sku_mapping_id')::uuid, (e ->> 'expected_units')::int from jsonb_array_elements(p_lines) e;
  perform private.write_audit(v_actor, 'organization_user', 'inventory.inbound.create', 'success', p_organization_id, 'inbound_receipt', v_id::text, jsonb_build_object('lines', jsonb_array_length(p_lines)));
  return jsonb_build_object('ok', true, 'code', 'created', 'id', v_id);
end;
$$;

create function public.rpc_inbound_cancel(p_organization_id uuid, p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_status text;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  v_gate := private.ob_owner_gate(p_organization_id);
  if v_gate is not null then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  select r.status into v_status from public.inbound_receipts r where r.id = p_id and r.organization_id = p_organization_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'receipt_not_found'); end if;
  if v_status <> 'expected' then return jsonb_build_object('ok', false, 'code', 'already_reviewed'); end if;
  update public.inbound_receipts set status = 'cancelled' where id = p_id;
  perform private.write_audit(v_actor, 'organization_user', 'inventory.inbound.cancel', 'success', p_organization_id, 'inbound_receipt', p_id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'code', 'cancelled');
end;
$$;

create function public.rpc_fulfillment_orders_list(p_organization_id uuid, p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not (p_organization_id in (select private.my_org_ids())) or private.shop_org_ok(p_organization_id) is not true then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  return jsonb_build_object('ok', true, 'orders',
    (select coalesce(jsonb_agg(private.fo_detail(o.id) order by o.created_at desc), '[]'::jsonb)
       from (select x.id, x.created_at from public.fulfillment_orders x where x.organization_id = p_organization_id order by x.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) o));
end;
$$;

create function public.rpc_fulfillment_order_get(p_organization_id uuid, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not (p_organization_id in (select private.my_org_ids())) or private.shop_org_ok(p_organization_id) is not true then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  if not exists (select 1 from public.fulfillment_orders o where o.id = p_id and o.organization_id = p_organization_id) then return jsonb_build_object('ok', false, 'code', 'order_not_found'); end if;
  return jsonb_build_object('ok', true, 'order', private.fo_detail(p_id));
end;
$$;

-- A customer owner may cancel an order that has not been allocated yet (pending or queued).
create function public.rpc_fulfillment_order_cancel(p_organization_id uuid, p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_status text;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  v_gate := private.ob_owner_gate(p_organization_id);
  if v_gate is not null then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  select o.status into v_status from public.fulfillment_orders o where o.id = p_id and o.organization_id = p_organization_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'order_not_found'); end if;
  if v_status not in ('pending', 'queued') then return jsonb_build_object('ok', false, 'code', 'invalid_transition'); end if;
  update public.fulfillment_orders set status = 'cancelled' where id = p_id;
  insert into public.fulfillment_order_events (order_id, from_status, to_status, actor_user_id, actor_kind) values (p_id, v_status, 'cancelled', v_actor, 'organization_user');
  perform private.int_emit_event(p_organization_id, 'order.status_changed', jsonb_build_object('order', private.int_order_json(p_id)));
  perform private.write_audit(v_actor, 'organization_user', 'fulfillment.order.cancel', 'success', p_organization_id, 'fulfillment_order', p_id::text, jsonb_build_object('from', v_status));
  return jsonb_build_object('ok', true, 'code', 'cancelled');
end;
$$;

-- 4. Staff RPCs ---------------------------------------------------------------------------------------------------------------------------
create function public.rpc_admin_inventory_overview() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
begin
  v_gate := private.staff_gate('org.read', 'staff.inventory.overview', false, 'inventory', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  return jsonb_build_object('ok', true, 'drift_count', private.inv_reconcile(),
    'open_receipts', (select count(*)::int from public.inbound_receipts r where r.status = 'expected'),
    'open_exceptions', (select count(*)::int from public.fulfillment_exceptions x where x.status = 'open'),
    'warehouses', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'code', w.code, 'name', w.name, 'active', w.active,
                      'locations', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'code', l.code, 'kind', l.kind, 'active', l.active) order by l.code), '[]'::jsonb) from public.warehouse_locations l where l.warehouse_id = w.id)) order by w.code), '[]'::jsonb)
                     from public.warehouses w));
end;
$$;

create function public.rpc_admin_warehouse_save(p_id uuid, p_code text, p_name text, p_active boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_name  text := nullif(btrim(coalesce(p_name, '')), '');
  v_id    uuid;
begin
  v_gate := private.staff_gate('org.manage', 'staff.warehouse.save', false, 'warehouse', p_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_code is null or p_code !~ '^[A-Z0-9][A-Z0-9-]{1,19}$' or v_name is null or char_length(v_name) > 120 or p_active is null then raise exception 'invalid arguments' using errcode = '22023'; end if;
  begin
    if p_id is null then
      insert into public.warehouses (code, name, active) values (p_code, v_name, p_active) returning id into v_id;
    else
      update public.warehouses set code = p_code, name = v_name, active = p_active where id = p_id returning id into v_id;
      if v_id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
    end if;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'duplicate_code');
  end;
  perform private.write_audit(v_actor, 'staff', 'staff.warehouse.save', 'success', null, 'warehouse', v_id::text, jsonb_build_object('code', p_code, 'active', p_active));
  return jsonb_build_object('ok', true, 'code', 'saved', 'id', v_id);
end;
$$;

create function public.rpc_admin_location_save(p_id uuid, p_warehouse_id uuid, p_code text, p_kind text, p_active boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_id    uuid;
begin
  v_gate := private.staff_gate('org.manage', 'staff.location.save', false, 'warehouse_location', p_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_warehouse_id is null or p_code is null or p_code !~ '^[A-Z0-9][A-Z0-9._-]{0,19}$' or p_kind is null or p_kind not in ('receiving', 'storage', 'pick', 'quarantine') or p_active is null then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if not exists (select 1 from public.warehouses w where w.id = p_warehouse_id) then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  begin
    if p_id is null then
      insert into public.warehouse_locations (warehouse_id, code, kind, active) values (p_warehouse_id, p_code, p_kind, p_active) returning id into v_id;
    else
      update public.warehouse_locations set code = p_code, kind = p_kind, active = p_active where id = p_id and warehouse_id = p_warehouse_id returning id into v_id;
      if v_id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
    end if;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'duplicate_code');
  end;
  perform private.write_audit(v_actor, 'staff', 'staff.location.save', 'success', null, 'warehouse_location', v_id::text, jsonb_build_object('kind', p_kind, 'active', p_active));
  return jsonb_build_object('ok', true, 'code', 'saved', 'id', v_id);
end;
$$;

create function public.rpc_admin_stock_list(p_organization_id uuid default null, p_limit integer default 200) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
begin
  v_gate := private.staff_gate('org.read', 'staff.stock.list', false, 'inventory', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  return jsonb_build_object('ok', true, 'rows',
    (select coalesce(jsonb_agg(jsonb_build_object('sku_mapping_id', bal.sku_mapping_id, 'lot_id', bal.lot_id, 'location_id', bal.location_id, 'organization_name', g.name, 'organization_code', g.code,
                                                  'external_sku', m.external_sku, 'internal_sku', m.internal_sku, 'product_name', coalesce(m.product_name, pr.name), 'lot_number', lo.lot_number, 'expires_on', lo.expires_on,
                                                  'location', wl.code, 'location_kind', wl.kind, 'on_hand', bal.on_hand, 'reserved', bal.reserved) order by g.code, m.external_sku, lo.expires_on nulls last), '[]'::jsonb)
       from (select b2.sku_mapping_id, b2.lot_id, b2.location_id, b2.organization_id, b2.on_hand, b2.reserved from public.inventory_balances b2
              where p_organization_id is null or b2.organization_id = p_organization_id order by b2.organization_id, b2.sku_mapping_id limit least(greatest(coalesce(p_limit, 200), 1), 500)) bal
       join public.organizations g on g.id = bal.organization_id join public.sku_mappings m on m.id = bal.sku_mapping_id
       left join public.product_variants v on v.id = m.variant_id left join public.products pr on pr.id = v.product_id
       join public.inventory_lots lo on lo.id = bal.lot_id join public.warehouse_locations wl on wl.id = bal.location_id));
end;
$$;

create function public.rpc_admin_movements_list(p_sku_mapping_id uuid default null, p_limit integer default 100) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
begin
  v_gate := private.staff_gate('org.read', 'staff.movements.list', false, 'inventory', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  return jsonb_build_object('ok', true, 'movements',
    (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'movement_type', x.movement_type, 'qty', x.qty, 'external_sku', m.external_sku, 'organization_code', g.code, 'lot_number', lo.lot_number,
                                                  'location', wl.code, 'ref_type', x.ref_type, 'ref_id', x.ref_id, 'reason', x.reason, 'created_at', x.created_at) order by x.created_at desc), '[]'::jsonb)
       from (select y.id, y.movement_type, y.qty, y.organization_id, y.sku_mapping_id, y.lot_id, y.location_id, y.ref_type, y.ref_id, y.reason, y.created_at from public.inventory_movements y
              where p_sku_mapping_id is null or y.sku_mapping_id = p_sku_mapping_id order by y.created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 300)) x
       join public.sku_mappings m on m.id = x.sku_mapping_id join public.organizations g on g.id = x.organization_id join public.inventory_lots lo on lo.id = x.lot_id join public.warehouse_locations wl on wl.id = x.location_id));
end;
$$;

create function public.rpc_admin_receipts_list(p_status text default 'expected') returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
begin
  v_gate := private.staff_gate('org.read', 'staff.receipts.list', false, 'inbound_receipt', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_status is not null and p_status not in ('expected', 'received', 'cancelled') then raise exception 'invalid arguments' using errcode = '22023'; end if;
  return jsonb_build_object('ok', true, 'receipts',
    (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'reference', r.reference, 'status', r.status, 'organization_name', g.name, 'organization_code', g.code, 'created_at', r.created_at,
                                                  'units', (select coalesce(sum(l.expected_units), 0)::int from public.inbound_receipt_lines l where l.receipt_id = r.id)) order by r.created_at), '[]'::jsonb)
       from (select x.id, x.reference, x.status, x.organization_id, x.created_at from public.inbound_receipts x where p_status is null or x.status = p_status order by x.created_at limit 200) r
       join public.organizations g on g.id = r.organization_id));
end;
$$;

create function public.rpc_admin_receipt_get(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
  r      record;
begin
  v_gate := private.staff_gate('org.read', 'staff.receipt.get', false, 'inbound_receipt', p_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  select x.id, x.reference, x.status, x.warehouse_id, x.organization_id, x.created_at, x.received_at, g.name as org_name, g.code as org_code, w.code as warehouse_code
    into r from public.inbound_receipts x join public.organizations g on g.id = x.organization_id join public.warehouses w on w.id = x.warehouse_id where x.id = p_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'receipt_not_found'); end if;
  return jsonb_build_object('ok', true,
    'receipt', jsonb_build_object('id', r.id, 'reference', r.reference, 'status', r.status, 'organization_name', r.org_name, 'organization_code', r.org_code, 'warehouse_id', r.warehouse_id, 'warehouse_code', r.warehouse_code,
                                  'created_at', r.created_at, 'received_at', r.received_at),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'sku_mapping_id', l.sku_mapping_id, 'external_sku', m.external_sku, 'internal_sku', m.internal_sku, 'expected_units', l.expected_units,
                                                           'received_units', l.received_units) order by m.external_sku), '[]'::jsonb)
                from public.inbound_receipt_lines l join public.sku_mappings m on m.id = l.sku_mapping_id where l.receipt_id = r.id),
    'locations', (select coalesce(jsonb_agg(jsonb_build_object('id', wl.id, 'code', wl.code, 'kind', wl.kind) order by wl.code), '[]'::jsonb) from public.warehouse_locations wl where wl.warehouse_id = r.warehouse_id and wl.active));
end;
$$;

-- Receiving: every line of the receipt is answered once (received units may differ from expected, including 0). Creates the lot if it is new and posts a 'receive' movement.
create function public.rpc_admin_receipt_receive(p_id uuid, p_lines jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_org    uuid;
  v_wh     uuid;
  v_status text;
  v_line   record;
  e        jsonb;
  v_units  integer;
  v_loc    uuid;
  v_lot    uuid;
  v_lotno  text;
  v_exp    date;
  v_total  integer := 0;
begin
  v_gate := private.staff_gate('inventory.adjust', 'staff.receipt.receive', false, 'inbound_receipt', p_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_id is null or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 50 then raise exception 'invalid arguments' using errcode = '22023'; end if;
  select r.organization_id, r.warehouse_id, r.status into v_org, v_wh, v_status from public.inbound_receipts r where r.id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'receipt_not_found'); end if;
  if v_status <> 'expected' then return jsonb_build_object('ok', false, 'code', 'already_reviewed'); end if;
  if jsonb_array_length(p_lines) <> (select count(*) from public.inbound_receipt_lines l where l.receipt_id = p_id)
     or exists (select 1 from jsonb_array_elements(p_lines) x where not exists (select 1 from public.inbound_receipt_lines l where l.receipt_id = p_id and l.id::text = x ->> 'line_id')) then
    return jsonb_build_object('ok', false, 'code', 'not_ready');
  end if;
  for e in select x from jsonb_array_elements(p_lines) x loop
    if (e ->> 'received_units') is null or (e ->> 'received_units') !~ '^[0-9]{1,7}$' or (e ->> 'received_units')::int > 1000000 then raise exception 'invalid arguments' using errcode = '22023'; end if;
    v_units := (e ->> 'received_units')::int;
    select l.id, l.sku_mapping_id into v_line from public.inbound_receipt_lines l where l.receipt_id = p_id and l.id::text = e ->> 'line_id' for update;
    if v_units > 0 then
      v_lotno := btrim(coalesce(e ->> 'lot_number', ''));
      if v_lotno !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$' or (e ->> 'location_id') !~ '^[0-9a-f-]{36}$' or (coalesce(e ->> 'expires_on', '') <> '' and (e ->> 'expires_on') !~ '^\d{4}-\d{2}-\d{2}$') then raise exception 'invalid arguments' using errcode = '22023'; end if;
      v_exp := nullif(e ->> 'expires_on', '')::date;
      select wl.id into v_loc from public.warehouse_locations wl where wl.id = (e ->> 'location_id')::uuid and wl.warehouse_id = v_wh and wl.active;
      if v_loc is null then return jsonb_build_object('ok', false, 'code', 'location_not_found'); end if;
      select lo.id into v_lot from public.inventory_lots lo where lo.sku_mapping_id = v_line.sku_mapping_id and lo.lot_number = v_lotno;
      if v_lot is null then
        insert into public.inventory_lots (sku_mapping_id, organization_id, lot_number, expires_on, created_by) values (v_line.sku_mapping_id, v_org, v_lotno, v_exp, v_actor) returning id into v_lot;
      end if;
      perform private.inv_move('receive', v_org, v_line.sku_mapping_id, v_lot, v_loc, v_units, 'inbound_receipt', p_id::text, null, gen_random_uuid(), v_actor);
      update public.inbound_receipt_lines set received_units = v_units, lot_id = v_lot, location_id = v_loc where id = v_line.id;
      v_total := v_total + v_units;
    else
      update public.inbound_receipt_lines set received_units = 0 where id = v_line.id;
    end if;
  end loop;
  update public.inbound_receipts set status = 'received', received_at = clock_timestamp(), received_by = v_actor where id = p_id;
  perform private.write_audit(v_actor, 'staff', 'staff.receipt.receive', 'success', v_org, 'inbound_receipt', p_id::text, jsonb_build_object('units', v_total));
  return jsonb_build_object('ok', true, 'code', 'received', 'units', v_total);
end;
$$;

-- Stock correction (shrink, found stock, damage): a reason is required, a fresh step-up is needed, it can never take stock below what is reserved, and a repeated request is a no-op.
create function public.rpc_admin_stock_adjust(p_sku_mapping_id uuid, p_lot_id uuid, p_location_id uuid, p_delta integer, p_reason text, p_idempotency_key uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_org    uuid;
  v_on     integer;
  v_res    integer;
begin
  v_gate := private.staff_gate('inventory.adjust', 'staff.stock.adjust', true, 'inventory', p_sku_mapping_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_sku_mapping_id is null or p_lot_id is null or p_location_id is null or p_delta is null or p_delta = 0 or abs(p_delta) > 1000000 or v_reason is null or char_length(v_reason) > 300 or p_idempotency_key is null then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if exists (select 1 from public.inventory_movements m where m.idempotency_key = p_idempotency_key) then return jsonb_build_object('ok', true, 'code', 'adjusted', 'replay', true); end if;
  select lo.organization_id into v_org from public.inventory_lots lo where lo.id = p_lot_id and lo.sku_mapping_id = p_sku_mapping_id;
  if v_org is null or not exists (select 1 from public.warehouse_locations wl where wl.id = p_location_id and wl.active) then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  select bal.on_hand, bal.reserved into v_on, v_res from public.inventory_balances bal where bal.sku_mapping_id = p_sku_mapping_id and bal.lot_id = p_lot_id and bal.location_id = p_location_id for update;
  if p_delta < 0 and (not found or v_on - v_res < -p_delta) then return jsonb_build_object('ok', false, 'code', 'below_reserved'); end if;
  perform private.inv_move(case when p_delta > 0 then 'adjust_plus' else 'adjust_minus' end, v_org, p_sku_mapping_id, p_lot_id, p_location_id, abs(p_delta), 'adjustment', null, v_reason, p_idempotency_key, v_actor);
  perform private.write_audit(v_actor, 'staff', 'staff.stock.adjust', 'success', v_org, 'inventory', p_sku_mapping_id::text, jsonb_build_object('delta', p_delta, 'reason', v_reason));
  return jsonb_build_object('ok', true, 'code', 'adjusted', 'replay', false);
end;
$$;

create function public.rpc_admin_fo_list(p_status text default null, p_limit integer default 100) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
begin
  v_gate := private.staff_gate('org.read', 'staff.fo.list', false, 'fulfillment_order', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_status is not null and p_status not in ('pending', 'queued', 'allocated', 'picked', 'packed', 'ready', 'shipped', 'delivered', 'cancelled') then raise exception 'invalid arguments' using errcode = '22023'; end if;
  return jsonb_build_object('ok', true, 'orders',
    (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'order_number', o.order_number, 'external_ref', o.external_ref, 'status', o.status, 'sandbox', o.is_sandbox, 'organization_name', g.name,
                                                  'organization_code', g.code, 'created_at', o.created_at,
                                                  'units', (select coalesce(sum(l.quantity), 0)::int from public.fulfillment_order_lines l where l.order_id = o.id),
                                                  'open_exceptions', (select count(*)::int from public.fulfillment_exceptions x where x.order_id = o.id and x.status = 'open')) order by o.created_at), '[]'::jsonb)
       from (select y.id, y.order_number, y.external_ref, y.status, y.is_sandbox, y.organization_id, y.created_at from public.fulfillment_orders y where p_status is null or y.status = p_status
              order by y.created_at limit least(greatest(coalesce(p_limit, 100), 1), 300)) o join public.organizations g on g.id = o.organization_id));
end;
$$;

create function public.rpc_admin_fo_get(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
  v_name text;
  v_code text;
begin
  v_gate := private.staff_gate('org.read', 'staff.fo.get', false, 'fulfillment_order', p_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  select g.name, g.code into v_name, v_code from public.fulfillment_orders o join public.organizations g on g.id = o.organization_id where o.id = p_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'order_not_found'); end if;
  return jsonb_build_object('ok', true, 'organization_name', v_name, 'organization_code', v_code, 'order', private.fo_detail(p_id),
    'recipient', (select o.recipient from public.fulfillment_orders o where o.id = p_id),
    'reservations', (select coalesce(jsonb_agg(jsonb_build_object('external_sku', m.external_sku, 'lot_number', lo.lot_number, 'location', wl.code, 'qty', res.qty, 'status', res.status) order by m.external_sku, lo.lot_number), '[]'::jsonb)
                       from public.inventory_reservations res join public.fulfillment_order_lines l on l.id = res.order_line_id join public.sku_mappings m on m.id = res.sku_mapping_id
                       join public.inventory_lots lo on lo.id = res.lot_id join public.warehouse_locations wl on wl.id = res.location_id where l.order_id = p_id));
end;
$$;

-- One RPC for the whole lifecycle. Sandbox orders are refused. 'allocated' reserves stock (FEFO) or opens an insufficient_stock exception; 'shipped' records the shipment and consumes
-- the reserved stock; 'cancelled' releases it. Every successful change writes the history, queues the order.status_changed webhook and writes the audit row.
create function public.rpc_admin_fo_transition(p_order_id uuid, p_to_status text, p_details jsonb default '{}'::jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_gate    text;
  v_from    text;
  v_org     uuid;
  v_sandbox boolean;
  v_det     jsonb := coalesce(p_details, '{}'::jsonb);
  v_code    text;
  v_carrier text;
  v_track   text;
  v_service text;
  v_note    text;
begin
  v_gate := private.staff_gate('fulfillment.process', 'staff.fo.transition', false, 'fulfillment_order', p_order_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_order_id is null or p_to_status is null or p_to_status not in ('queued', 'allocated', 'picked', 'packed', 'ready', 'shipped', 'delivered', 'cancelled') or jsonb_typeof(v_det) <> 'object' or pg_column_size(v_det) > 2048 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  select o.status, o.organization_id, o.is_sandbox into v_from, v_org, v_sandbox from public.fulfillment_orders o where o.id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'order_not_found'); end if;
  if v_sandbox then return jsonb_build_object('ok', false, 'code', 'sandbox_order'); end if;
  if not private.fo_transition_ok(v_from, p_to_status) then return jsonb_build_object('ok', false, 'code', 'invalid_transition'); end if;
  if p_to_status = 'queued' and not coalesce((select i.status = 'live' from public.onboarding_instances i where i.organization_id = v_org), false) then return jsonb_build_object('ok', false, 'code', 'not_live'); end if;
  if p_to_status = 'allocated' then
    v_code := private.fo_allocate(p_order_id, v_actor);
    if v_code is not null then
      insert into public.fulfillment_exceptions (order_id, kind, detail, created_by) values (p_order_id, 'insufficient_stock', 'not enough available stock to allocate every line', v_actor) on conflict (order_id, kind) where status = 'open' do nothing;
      perform private.write_audit(v_actor, 'staff', 'staff.fo.transition', 'denied', v_org, 'fulfillment_order', p_order_id::text, jsonb_build_object('reason', v_code, 'to', p_to_status));
      return jsonb_build_object('ok', false, 'code', v_code);
    end if;
    update public.fulfillment_exceptions set status = 'resolved', resolved_by = v_actor, resolved_at = clock_timestamp(), resolution = 'allocated' where order_id = p_order_id and kind = 'insufficient_stock' and status = 'open';
  elsif p_to_status = 'shipped' then
    v_carrier := nullif(btrim(coalesce(v_det ->> 'carrier', '')), '');
    v_track := nullif(btrim(coalesce(v_det ->> 'tracking_number', '')), '');
    v_service := nullif(btrim(coalesce(v_det ->> 'service', '')), '');
    if v_carrier is null or v_track is null or char_length(v_carrier) > 60 or char_length(v_track) > 80 or (v_service is not null and char_length(v_service) > 60) then return jsonb_build_object('ok', false, 'code', 'not_ready'); end if;
    insert into public.shipments (order_id, organization_id, carrier, service, tracking_number, shipped_by) values (p_order_id, v_org, v_carrier, v_service, v_track, v_actor);
    perform private.fo_close_reservations(p_order_id, true, v_actor);
  elsif p_to_status = 'delivered' then
    update public.shipments set delivered_at = clock_timestamp() where order_id = p_order_id;
  elsif p_to_status = 'cancelled' then
    v_note := nullif(btrim(coalesce(v_det ->> 'reason', '')), '');
    if v_note is null or char_length(v_note) > 300 then return jsonb_build_object('ok', false, 'code', 'not_ready'); end if;
    perform private.fo_close_reservations(p_order_id, false, v_actor);
    update public.fulfillment_exceptions set status = 'resolved', resolved_by = v_actor, resolved_at = clock_timestamp(), resolution = 'order cancelled' where order_id = p_order_id and status = 'open';
  end if;
  update public.fulfillment_orders set status = p_to_status where id = p_order_id;
  insert into public.fulfillment_order_events (order_id, from_status, to_status, actor_user_id, actor_kind, note) values (p_order_id, v_from, p_to_status, v_actor, 'staff', v_note);
  perform private.int_emit_event(v_org, 'order.status_changed', jsonb_build_object('order', private.fo_detail(p_order_id)));
  perform private.write_audit(v_actor, 'staff', 'staff.fo.transition', 'success', v_org, 'fulfillment_order', p_order_id::text, jsonb_build_object('from', v_from, 'to', p_to_status));
  return jsonb_build_object('ok', true, 'code', p_to_status);
end;
$$;

create function public.rpc_admin_exception_resolve(p_id uuid, p_resolution text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_res   text := nullif(btrim(coalesce(p_resolution, '')), '');
  v_order uuid;
  v_org   uuid;
begin
  v_gate := private.staff_gate('fulfillment.process', 'staff.fo.exception.resolve', false, 'fulfillment_exception', p_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_id is null or v_res is null or char_length(v_res) > 300 then raise exception 'invalid arguments' using errcode = '22023'; end if;
  select x.order_id, o.organization_id into v_order, v_org from public.fulfillment_exceptions x join public.fulfillment_orders o on o.id = x.order_id where x.id = p_id and x.status = 'open' for update of x;
  if not found then return jsonb_build_object('ok', false, 'code', 'nothing_to_review'); end if;
  update public.fulfillment_exceptions set status = 'resolved', resolved_by = v_actor, resolved_at = clock_timestamp(), resolution = v_res where id = p_id;
  perform private.write_audit(v_actor, 'staff', 'staff.fo.exception.resolve', 'success', v_org, 'fulfillment_exception', p_id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'code', 'resolved');
end;
$$;

-- 5. Privileges ---------------------------------------------------------------------------------------------------------------------------
revoke all on table public.warehouses, public.warehouse_locations, public.inventory_lots, public.inventory_balances, public.inventory_movements, public.inbound_receipts, public.inbound_receipt_lines,
                    public.inventory_reservations, public.shipments, public.fulfillment_order_events, public.fulfillment_exceptions from public, anon, authenticated, service_role;

revoke all on function private.guard_inv_append_only(), private.guard_inv_receipts(), private.guard_inv_reservations(), private.guard_inv_shipments(), private.guard_inv_exceptions(),
                       private.inv_move(text, uuid, uuid, uuid, uuid, integer, text, text, text, uuid, uuid), private.inv_reconcile(), private.inv_available(uuid, uuid), private.fo_allocate(uuid, uuid),
                       private.fo_close_reservations(uuid, boolean, uuid), private.fo_detail(uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.rpc_stock_list(uuid), public.rpc_inbound_list(uuid), public.rpc_inbound_create(uuid, text, jsonb), public.rpc_inbound_cancel(uuid, uuid), public.rpc_fulfillment_orders_list(uuid, integer),
                       public.rpc_fulfillment_order_get(uuid, uuid), public.rpc_fulfillment_order_cancel(uuid, uuid), public.rpc_admin_inventory_overview(), public.rpc_admin_warehouse_save(uuid, text, text, boolean),
                       public.rpc_admin_location_save(uuid, uuid, text, text, boolean), public.rpc_admin_stock_list(uuid, integer), public.rpc_admin_movements_list(uuid, integer),
                       public.rpc_admin_receipts_list(text), public.rpc_admin_receipt_get(uuid), public.rpc_admin_receipt_receive(uuid, jsonb), public.rpc_admin_stock_adjust(uuid, uuid, uuid, integer, text, uuid),
                       public.rpc_admin_fo_list(text, integer), public.rpc_admin_fo_get(uuid), public.rpc_admin_fo_transition(uuid, text, jsonb), public.rpc_admin_exception_resolve(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_stock_list(uuid), public.rpc_inbound_list(uuid), public.rpc_inbound_create(uuid, text, jsonb), public.rpc_inbound_cancel(uuid, uuid), public.rpc_fulfillment_orders_list(uuid, integer),
                          public.rpc_fulfillment_order_get(uuid, uuid), public.rpc_fulfillment_order_cancel(uuid, uuid), public.rpc_admin_inventory_overview(), public.rpc_admin_warehouse_save(uuid, text, text, boolean),
                          public.rpc_admin_location_save(uuid, uuid, text, text, boolean), public.rpc_admin_stock_list(uuid, integer), public.rpc_admin_movements_list(uuid, integer),
                          public.rpc_admin_receipts_list(text), public.rpc_admin_receipt_get(uuid), public.rpc_admin_receipt_receive(uuid, jsonb), public.rpc_admin_stock_adjust(uuid, uuid, uuid, integer, text, uuid),
                          public.rpc_admin_fo_list(text, integer), public.rpc_admin_fo_get(uuid), public.rpc_admin_fo_transition(uuid, text, jsonb), public.rpc_admin_exception_resolve(uuid, text)
  to authenticated;

-- 6. Self-check ---------------------------------------------------------------------------------------------------------------------------
do $$
declare
  t text;
  p text;
begin
  foreach t in array array['public.warehouses', 'public.warehouse_locations', 'public.inventory_lots', 'public.inventory_balances', 'public.inventory_movements', 'public.inbound_receipts',
                           'public.inbound_receipt_lines', 'public.inventory_reservations', 'public.shipments', 'public.fulfillment_order_events', 'public.fulfillment_exceptions'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = t::regclass) then raise exception 'self-check: RLS not enabled on %', t; end if;
    foreach p in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
      if has_table_privilege('anon', t, p) or has_table_privilege('authenticated', t, p) or has_table_privilege('service_role', t, p) then raise exception 'self-check: an API role has % on %', p, t; end if;
    end loop;
  end loop;
  if (select count(*) from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
       where n.nspname = 'public' and pr.proname in ('rpc_stock_list', 'rpc_inbound_list', 'rpc_inbound_create', 'rpc_inbound_cancel', 'rpc_fulfillment_orders_list', 'rpc_fulfillment_order_get',
             'rpc_fulfillment_order_cancel', 'rpc_admin_inventory_overview', 'rpc_admin_warehouse_save', 'rpc_admin_location_save', 'rpc_admin_stock_list', 'rpc_admin_movements_list', 'rpc_admin_receipts_list',
             'rpc_admin_receipt_get', 'rpc_admin_receipt_receive', 'rpc_admin_stock_adjust', 'rpc_admin_fo_list', 'rpc_admin_fo_get', 'rpc_admin_fo_transition', 'rpc_admin_exception_resolve')
         and pr.prosecdef and has_function_privilege('authenticated', pr.oid, 'execute') and not has_function_privilege('anon', pr.oid, 'execute')
         and not has_function_privilege('service_role', pr.oid, 'execute') and not has_function_privilege('public', pr.oid, 'execute')
         and exists (select 1 from unnest(pr.proconfig) c where regexp_replace(c, '[\s"'']', '', 'g') ~* '^search_path=$')) <> 20 then
    raise exception 'self-check: RPC definer, search_path or grant state is wrong';
  end if;
  if (select array_agg(pr.proname::text order by pr.proname) from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace where n.nspname = 'public' and has_function_privilege('anon', pr.oid, 'execute'))
     is distinct from array['rpc_api_order_create', 'rpc_api_order_get', 'rpc_api_orders_list', 'rpc_worker_claim_deliveries', 'rpc_worker_record_result'] then
    raise exception 'self-check: the anon-executable set changed (it must stay exactly the five key-authenticated RPCs)';
  end if;
  if exists (select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
              where n.nspname = 'private' and (pr.proname like 'inv\_%' or pr.proname like 'fo\_%' or pr.proname like 'guard\_inv\_%') and pr.proname <> 'fo_transition_ok'
                and (has_function_privilege('authenticated', pr.oid, 'execute') or has_function_privilege('anon', pr.oid, 'execute'))) then
    raise exception 'self-check: an inventory private helper is executable by an API role';
  end if;
  if exists (select 1 from public.warehouses) or exists (select 1 from public.inventory_movements) or exists (select 1 from public.inventory_balances) or exists (select 1 from public.shipments) then
    raise exception 'self-check: inventory tables must be empty at install';
  end if;
  if private.inv_reconcile() <> 0 then raise exception 'self-check: balances do not match the ledger'; end if;
  if (select count(*) from pg_trigger tg where not tg.tgisinternal and tg.tgrelid in ('public.inventory_lots'::regclass, 'public.inventory_balances'::regclass, 'public.inventory_movements'::regclass,
        'public.inbound_receipts'::regclass, 'public.inventory_reservations'::regclass, 'public.shipments'::regclass, 'public.fulfillment_order_events'::regclass, 'public.fulfillment_exceptions'::regclass)) <> 13 then
    raise exception 'self-check: expected 13 triggers on the inventory tables';
  end if;
end;
$$;
