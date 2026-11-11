-- =====================================================================================
-- 20261110000100_p3_catalog_pricing_orders.sql   (revision 2: Aspen-compatible pricing, review findings M2 to M5 and L1 to L5 fixed)
-- *** P3 DRAFT. NOT APPLIED. NOT EXECUTED. NEVER PARSED BY POSTGRESQL. Lives in supabase/review/p3/ until the project owner approves applying it. ***
-- *** REVISION CANDIDATE rev2 of the approved migration (sha256 bfd391c1...a799e, left unchanged in the sibling file). Differences: private.shop_ship_to_ok returns an explicit boolean (coalesce) and
-- *** rpc_checkout rejects with "shop_ship_to_ok(...) is not true". Nothing else differs. Needs its own review, dry execution and approval. ***
-- Scope: catalog, organization catalog assignment, base prices and mandatory floors, Aspen-style markup rules (percent or fixed, product-specific, organization then
-- representative, representative bounds), carts, orders with immutable price snapshots, order status history. Depends on 0001 to 0004 (applied). Does NOT depend on 0005.
-- Capabilities: NO new capability rows. Catalog, assignment, markup rules, organization creation: org.manage (admin). Members: members.manage (admin).
-- Order management: fulfillment.process (operations, admin). Order reading: org.read (admin, finance, operations, support).
-- Rules: default deny; no table privilege to any API role (RLS enabled, no policy); ALL access through SECURITY DEFINER RPCs with search_path = '';
-- money is integer cents; prices are computed ONLY here; order lines are immutable snapshots; every privileged mutation and every checkout is audited.
--
-- PRICING (reproduces AspenWholesale supabase/migrations/20261013000000_markup_payments_phase6.sql: markup_amount, pick_markup_rule, rep_bounds, compute_markup_price):
--   base = the variant's wholesale price (cents, > 0); floor = the variant's minimum selling price (cents, > 0): BOTH are required, otherwise the variant is not listed and not purchasable.
--   org rule  = the active kind 'organization' rule of the organization: the product-specific rule beats the default (all products) rule.
--   org price = base + org amount.          rep rule = the active kind 'representative' rule chosen the same way; its VALUE is clamped to the organization rule's representative bounds
--   (percent bounds for a percent rule, fixed bounds for a fixed rule; a bound is applied only when set; no representative rule means no representative markup).
--   rep amount = markup_amount(type, clamped value, ORG PRICE)   (the representative markup is computed on the organization-adjusted price: it compounds).
--   unit = greatest(org price + rep amount, floor).
--   markup_amount: percent -> round(price * value / 100, 2 decimals) ; fixed -> round(value, 2 decimals). Aspen's numeric round() rounds half away from zero; the values are kept in
--   units of 1e-4 (percent: value x 10000; fixed: dollars x 10000), the same four decimals as Aspen's numeric(10,4), and rounded to cents with integer arithmetic.
--   Prices apply to FUTURE checkouts only: a checkout snapshots the full breakdown into order_items and nothing ever rewrites it.
-- Representative assumption: P3 has no partner entity; ONE representative rule set per organization (scope: all products or one product) plays the role of Aspen's partner rule.
-- The Supabase CLI wraps each migration file in one implicit transaction; no explicit BEGIN/COMMIT here.
-- =====================================================================================

-- 1. Tables -----------------------------------------------------------------------------------------------------------------------
create table public.products (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,100}$'),
  name               text not null check (char_length(btrim(name)) between 1 and 200),
  category           text not null check (category ~ '^[a-z0-9-]{1,60}$'),
  cas                text check (cas is null or char_length(cas) <= 40),
  description        text check (description is null or char_length(description) <= 2000),
  -- who maintains name, category, CAS and description: 'seed' content may be refreshed by the catalog seed; 'admin' content is never touched by the seed (L5)
  content_managed_by text not null default 'seed' check (content_managed_by in ('seed', 'admin')),
  status             text not null default 'active' check (status in ('active', 'archived')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.product_variants (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references public.products (id) on delete restrict,
  spec              text not null check (char_length(btrim(spec)) between 1 and 60),
  sku               text not null unique check (sku ~ '^[A-Z0-9][A-Z0-9._-]{2,63}$'),
  base_price_cents  integer check (base_price_cents is null or base_price_cents between 1 and 100000000),   -- wholesale price; NULL = not set
  min_price_cents   integer check (min_price_cents is null or min_price_cents between 1 and 100000000),     -- minimum selling price (floor); REQUIRED to list or sell
  status            text not null default 'active' check (status in ('active', 'archived')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint product_variants_product_spec_key unique (product_id, spec)
);

-- A row = the product is assigned (published) to the organization; available = false keeps it visible but not purchasable.
create table public.organization_products (
  organization_id uuid not null references public.organizations (id) on delete restrict,
  product_id      uuid not null references public.products (id) on delete restrict,
  available       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (organization_id, product_id)
);

-- Aspen markup_rules. value_e4: percent x 10000 (0 to 1000 %), or dollars x 10000 for a fixed amount. Representative bounds exist on organization rules only.
create table public.markup_rules (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  kind                text not null check (kind in ('organization', 'representative')),
  product_id          uuid references public.products (id) on delete restrict,   -- NULL = every product
  markup_type         text not null check (markup_type in ('percent', 'fixed')),
  value_e4            bigint not null check (value_e4 >= 0),
  rep_min_percent_e4  bigint check (rep_min_percent_e4 is null or rep_min_percent_e4 between 0 and 10000000),
  rep_max_percent_e4  bigint check (rep_max_percent_e4 is null or rep_max_percent_e4 between 0 and 10000000),
  rep_min_fixed_e4    bigint check (rep_min_fixed_e4 is null or rep_min_fixed_e4 between 0 and 10000000000),
  rep_max_fixed_e4    bigint check (rep_max_fixed_e4 is null or rep_max_fixed_e4 between 0 and 10000000000),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint markup_rules_value_cap check ((markup_type = 'percent' and value_e4 <= 10000000) or (markup_type = 'fixed' and value_e4 <= 10000000000)),
  constraint markup_rules_bounds_order check ((rep_min_percent_e4 is null or rep_max_percent_e4 is null or rep_min_percent_e4 <= rep_max_percent_e4)
                                          and (rep_min_fixed_e4 is null or rep_max_fixed_e4 is null or rep_min_fixed_e4 <= rep_max_fixed_e4)),
  constraint markup_rules_bounds_org_only check (kind = 'organization' or num_nonnulls(rep_min_percent_e4, rep_max_percent_e4, rep_min_fixed_e4, rep_max_fixed_e4) = 0)
);
create unique index markup_rules_scope_idx on public.markup_rules (organization_id, kind, coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.carts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id         uuid not null references auth.users (id) on delete cascade,
  updated_at      timestamptz not null default now(),
  constraint carts_org_user_key unique (organization_id, user_id)
);
create index carts_user_idx on public.carts (user_id);   -- the cascade from auth.users looks carts up by user (L4)

-- Prices are NEVER stored in a cart: they are computed on every read and at checkout.
create table public.cart_items (
  cart_id    uuid not null references public.carts (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  quantity   integer not null check (quantity between 1 and 10000),
  primary key (cart_id, variant_id)
);

create sequence public.order_number_seq start 1000 minvalue 1000;

create table public.orders (
  id              uuid primary key default gen_random_uuid(),
  order_number    text not null unique default ('ORD-' || lpad(nextval('public.order_number_seq')::text, 8, '0')),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  placed_by       uuid not null,   -- no FK on purpose: an audit reference that must survive account deletion
  idempotency_key uuid not null,   -- one order per (organization, user, key): a repeated submit returns the same order (L1)
  status          text not null default 'placed' check (status in ('placed', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
  subtotal_cents  bigint not null check (subtotal_cents between 0 and 1000000000000),
  total_cents     bigint not null check (total_cents between 0 and 1000000000000),
  currency        text not null default 'USD' check (currency = 'USD'),
  ship_to         jsonb not null check (jsonb_typeof(ship_to) = 'object' and pg_column_size(ship_to) <= 4096),
  notes           text check (notes is null or char_length(notes) <= 500),
  created_at      timestamptz not null default clock_timestamp(),
  updated_at      timestamptz not null default clock_timestamp(),
  constraint orders_total_matches_subtotal check (total_cents = subtotal_cents),   -- shipping and tax arrive with P4
  constraint orders_idempotency_key unique (organization_id, placed_by, idempotency_key)
);
create index orders_org_created_idx on public.orders (organization_id, created_at desc);
create index orders_status_created_idx on public.orders (status, created_at desc);

-- Immutable snapshot of what was sold: base, floor and the full markup breakdown at the moment of checkout.
create table public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders (id) on delete restrict,
  variant_id        uuid not null references public.product_variants (id) on delete restrict,
  product_name      text not null,
  spec              text not null,
  sku               text not null,
  quantity          integer not null check (quantity between 1 and 10000),
  base_price_cents  integer not null check (base_price_cents between 1 and 100000000),
  floor_cents       integer not null check (floor_cents between 1 and 100000000),
  unit_price_cents  integer not null check (unit_price_cents between 1 and 100000000),
  line_total_cents  bigint not null,
  pricing           jsonb not null check (jsonb_typeof(pricing) = 'object' and pg_column_size(pricing) <= 2048),   -- the breakdown of private.shop_compose
  constraint order_items_order_variant_key unique (order_id, variant_id),
  constraint order_items_line_total check (line_total_cents = unit_price_cents::bigint * quantity),
  constraint order_items_pricing_matches check ((pricing ->> 'unit')::bigint = unit_price_cents and (pricing ->> 'base')::bigint = base_price_cents and (pricing ->> 'floor')::bigint = floor_cents)
);

create table public.order_events (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete restrict,
  from_status   text,
  to_status     text not null check (to_status in ('placed', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
  actor_user_id uuid,
  actor_kind    text not null check (actor_kind in ('staff', 'organization_user')),
  note          text check (note is null or char_length(note) <= 300),
  created_at    timestamptz not null default clock_timestamp()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

alter table public.products              enable row level security;
alter table public.product_variants      enable row level security;
alter table public.organization_products enable row level security;
alter table public.markup_rules          enable row level security;
alter table public.carts                 enable row level security;
alter table public.cart_items            enable row level security;
alter table public.orders                enable row level security;
alter table public.order_items           enable row level security;
alter table public.order_events          enable row level security;

-- 2. Pure helpers, pricing and guards ----------------------------------------------------------------------------------------------------
-- Aspen private.markup_amount in cents. percent: round(price * value / 100) with value in units of 1e-4 percent; fixed: round(value) with value in units of 1e-4 dollars.
-- Both operands are non-negative, so adding half the divisor before integer division rounds half away from zero exactly like numeric round().
create function private.shop_markup_amount(p_type text, p_value_e4 bigint, p_price_cents bigint) returns bigint
language sql immutable set search_path = ''
as $$
  select case p_type
           when 'percent' then (p_price_cents * p_value_e4 + 500000) / 1000000
           when 'fixed'   then (p_value_e4 + 50) / 100
         end;
$$;

-- Aspen compute_markup_price, with the rules already chosen by the caller. NULL (not purchasable) unless base and floor are both set. Immutable and side-effect free.
create function private.shop_compose(p_base integer, p_floor integer, p_org_type text, p_org_value_e4 bigint, p_rep_type text, p_rep_value_e4 bigint,
                                     p_min_pct_e4 bigint, p_max_pct_e4 bigint, p_min_fixed_e4 bigint, p_max_fixed_e4 bigint) returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  v_org_amt   bigint := 0;
  v_org_price bigint;
  v_val       bigint := p_rep_value_e4;
  v_lo        bigint;
  v_hi        bigint;
  v_clamped   boolean := false;
  v_rep_amt   bigint := 0;
  v_raw       bigint;
  v_unit      bigint;
begin
  if p_base is null or p_base <= 0 or p_floor is null or p_floor <= 0 then
    return null;
  end if;
  if p_org_type is not null then
    v_org_amt := private.shop_markup_amount(p_org_type, p_org_value_e4, p_base);
  end if;
  v_org_price := p_base + v_org_amt;
  if p_rep_type is not null then
    v_lo := case p_rep_type when 'percent' then p_min_pct_e4 else p_min_fixed_e4 end;
    v_hi := case p_rep_type when 'percent' then p_max_pct_e4 else p_max_fixed_e4 end;
    if v_lo is not null and v_val < v_lo then v_val := v_lo; v_clamped := true; end if;
    if v_hi is not null and v_val > v_hi then v_val := v_hi; v_clamped := true; end if;
    v_rep_amt := private.shop_markup_amount(p_rep_type, v_val, v_org_price);
  end if;
  v_raw := v_org_price + v_rep_amt;
  v_unit := greatest(v_raw, p_floor);
  if v_unit > 100000000 then
    return null;
  end if;
  return jsonb_build_object('base', p_base, 'floor', p_floor,
                            'org_type', p_org_type, 'org_value_e4', p_org_value_e4, 'org_amount', v_org_amt, 'org_price', v_org_price,
                            'rep_type', p_rep_type, 'rep_value_e4', case when p_rep_type is null then null else v_val end, 'rep_amount', v_rep_amt, 'rep_clamped', v_clamped,
                            'raw', v_raw, 'floor_applied', v_raw < p_floor, 'unit', v_unit);
end;
$$;

-- Picks the rules of ONE organization and product (the product-specific active rule beats the default rule, as Aspen pick_markup_rule) and composes the price.
create function private.shop_price_breakdown(p_org uuid, p_product uuid, p_base integer, p_floor integer) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ot text; v_ov bigint; v_minp bigint; v_maxp bigint; v_minf bigint; v_maxf bigint;
  v_rt text; v_rv bigint;
begin
  select r.markup_type, r.value_e4, r.rep_min_percent_e4, r.rep_max_percent_e4, r.rep_min_fixed_e4, r.rep_max_fixed_e4
    into v_ot, v_ov, v_minp, v_maxp, v_minf, v_maxf
    from public.markup_rules r
   where r.organization_id = p_org and r.kind = 'organization' and r.is_active and (r.product_id = p_product or r.product_id is null)
   order by (r.product_id is null) limit 1;
  select r.markup_type, r.value_e4 into v_rt, v_rv
    from public.markup_rules r
   where r.organization_id = p_org and r.kind = 'representative' and r.is_active and (r.product_id = p_product or r.product_id is null)
   order by (r.product_id is null) limit 1;
  return private.shop_compose(p_base, p_floor, v_ot, v_ov, v_rt, v_rv, v_minp, v_maxp, v_minf, v_maxf);
end;
$$;

create function private.shop_order_transition_ok(p_from text, p_to text) returns boolean
language sql immutable set search_path = ''
as $$
  select (p_from, p_to) in (('placed', 'confirmed'), ('placed', 'cancelled'), ('confirmed', 'processing'), ('confirmed', 'cancelled'),
                            ('processing', 'shipped'), ('processing', 'cancelled'), ('shipped', 'delivered'));
$$;

create function private.shop_ship_to_ok(p_ship jsonb) returns boolean
language plpgsql immutable set search_path = ''
as $$
declare
  k text;
begin
  if p_ship is null or jsonb_typeof(p_ship) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(p_ship) loop
    if k not in ('name', 'line1', 'line2', 'city', 'region', 'postal', 'country') then return false; end if;
  end loop;
  -- rev2: a MISSING required key makes jsonb_typeof(p_ship -> 'key') SQL NULL, which can turn the whole conjunction into NULL (NULL AND TRUE = NULL). The caller's
  -- "if not shop_ship_to_ok(...)" then does not reject. The explicit coalesce guarantees a non-NULL boolean: anything that is not provably valid is invalid.
  return coalesce(
         jsonb_typeof(p_ship -> 'name') = 'string' and char_length(btrim(p_ship ->> 'name')) between 1 and 120
     and jsonb_typeof(p_ship -> 'line1') = 'string' and char_length(btrim(p_ship ->> 'line1')) between 1 and 160
     and (not (p_ship ? 'line2') or (jsonb_typeof(p_ship -> 'line2') = 'string' and char_length(p_ship ->> 'line2') <= 160))
     and jsonb_typeof(p_ship -> 'city') = 'string' and char_length(btrim(p_ship ->> 'city')) between 1 and 80
     and jsonb_typeof(p_ship -> 'region') = 'string' and char_length(btrim(p_ship ->> 'region')) between 1 and 80
     and jsonb_typeof(p_ship -> 'postal') = 'string' and char_length(btrim(p_ship ->> 'postal')) between 1 and 20
     and jsonb_typeof(p_ship -> 'country') = 'string' and (p_ship ->> 'country') ~ '^[A-Z]{2}$',
         false);
end;
$$;

-- TRUE only for an ACTIVE organization the caller is an ACTIVE member of (staff are never members: 0002). The tenant boundary of every customer RPC.
create function private.shop_org_ok(p_org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_org is not null
     and exists (select 1 from private.my_org_ids() o(id) where o.id = p_org)
     and exists (select 1 from public.organizations g where g.id = p_org and g.status = 'active');
$$;

create function private.guard_shop_orders() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'orders cannot be deleted' using errcode = '23514';
  end if;
  if new.id <> old.id or new.order_number <> old.order_number or new.organization_id <> old.organization_id or new.placed_by <> old.placed_by
     or new.idempotency_key <> old.idempotency_key or new.subtotal_cents <> old.subtotal_cents or new.total_cents <> old.total_cents or new.currency <> old.currency
     or new.ship_to <> old.ship_to or new.notes is distinct from old.notes or new.created_at <> old.created_at then
    raise exception 'order identity, amounts, address and notes are immutable' using errcode = '23514';
  end if;
  if new.status <> old.status and not private.shop_order_transition_ok(old.status, new.status) then
    raise exception 'illegal order status transition' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function private.guard_shop_append_only() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '23514';
  return null;
end;
$$;

create trigger orders_guard before update or delete on public.orders for each row execute function private.guard_shop_orders();
create trigger order_items_append_only before update or delete on public.order_items for each row execute function private.guard_shop_append_only();
create trigger order_events_append_only before update or delete on public.order_events for each row execute function private.guard_shop_append_only();
create trigger orders_no_truncate before truncate on public.orders for each statement execute function private.block_truncate();
create trigger order_items_no_truncate before truncate on public.order_items for each statement execute function private.block_truncate();
create trigger order_events_no_truncate before truncate on public.order_events for each statement execute function private.block_truncate();

create trigger products_touch before update on public.products for each row execute function private.touch_updated_at();
create trigger product_variants_touch before update on public.product_variants for each row execute function private.touch_updated_at();
create trigger organization_products_touch before update on public.organization_products for each row execute function private.touch_updated_at();
create trigger markup_rules_touch before update on public.markup_rules for each row execute function private.touch_updated_at();

-- 3. Customer RPCs (tenant boundary: private.my_org_ids() + active organization) ---------------------------------------------------------
-- Storefront: products assigned to the organization that have at least one fully priced variant (base AND floor), with the organization's price per variant.
-- Base price, floor and markups are never returned.
create function public.rpc_catalog_list(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_items jsonb;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not (p_organization_id in (select private.my_org_ids())) or not private.shop_org_ok(p_organization_id) then
    return jsonb_build_object('ok', false, 'code', 'organization_not_found');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'product_id', pr.id, 'slug', pr.slug, 'name', pr.name, 'category', pr.category, 'cas', pr.cas, 'description', pr.description,
           'available', op.available,
           'variants', (select jsonb_agg(jsonb_build_object('variant_id', v.id, 'spec', v.spec, 'sku', v.sku, 'unit_cents', (b.pr ->> 'unit')::integer) order by v.spec)
                          from public.product_variants v
                          cross join lateral (select private.shop_price_breakdown(p_organization_id, pr.id, v.base_price_cents, v.min_price_cents) as pr) b
                         where v.product_id = pr.id and v.status = 'active' and b.pr is not null)
         ) order by pr.name), '[]'::jsonb)
    into v_items
    from public.organization_products op
    join public.products pr on pr.id = op.product_id and pr.status = 'active'
   where op.organization_id = p_organization_id
     and exists (select 1 from public.product_variants v2
                  where v2.product_id = pr.id and v2.status = 'active' and private.shop_price_breakdown(p_organization_id, pr.id, v2.base_price_cents, v2.min_price_cents) is not null);
  return jsonb_build_object('ok', true, 'items', v_items);
end;
$$;

-- The caller's cart for one organization, priced now. A line is purchasable only if the product is active, assigned and available, the variant is active and has a base
-- price AND a floor. Quantities and variant ids are the only things the client ever sends.
create function public.rpc_cart_get(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_lines jsonb;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not (p_organization_id in (select private.my_org_ids())) or not private.shop_org_ok(p_organization_id) then
    return jsonb_build_object('ok', false, 'code', 'organization_not_found');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'variant_id', v.id, 'product_name', pr.name, 'spec', v.spec, 'sku', v.sku, 'quantity', ci.quantity,
           'unit_cents', (u.pr ->> 'unit')::integer, 'line_cents', case when u.pr is null then null else (u.pr ->> 'unit')::bigint * ci.quantity end,
           'purchasable', (u.pr is not null and pr.status = 'active' and v.status = 'active' and op.available is true)) order by pr.name, v.spec), '[]'::jsonb)
    into v_lines
    from public.carts c
    join public.cart_items ci on ci.cart_id = c.id
    join public.product_variants v on v.id = ci.variant_id
    join public.products pr on pr.id = v.product_id
    left join public.organization_products op on op.organization_id = c.organization_id and op.product_id = pr.id
    cross join lateral (select private.shop_price_breakdown(c.organization_id, pr.id, v.base_price_cents, v.min_price_cents) as pr) u
   where c.organization_id = p_organization_id and c.user_id = v_actor;
  return jsonb_build_object('ok', true, 'lines', v_lines);
end;
$$;

-- Set one cart line (quantity 0 removes it). Only a purchasable variant of this organization may be added; at most 100 lines. NOT audited (M2): a cart edit is not a
-- privileged or financial action; the checkout and the administrative actions are.
create function public.rpc_cart_put_item(p_organization_id uuid, p_variant_id uuid, p_quantity integer) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_cart   uuid;
  v_lines  integer;
  v_exists boolean;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_variant_id is null or p_quantity is null or p_quantity not between 0 and 10000 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if not (p_organization_id in (select private.my_org_ids())) or not private.shop_org_ok(p_organization_id) then
    return jsonb_build_object('ok', false, 'code', 'organization_not_found');
  end if;
  insert into public.carts (organization_id, user_id) values (p_organization_id, v_actor) on conflict (organization_id, user_id) do nothing;
  select c.id into v_cart from public.carts c where c.organization_id = p_organization_id and c.user_id = v_actor for update;
  if p_quantity = 0 then
    delete from public.cart_items where cart_id = v_cart and variant_id = p_variant_id;
  else
    if not exists (select 1 from public.product_variants v
                     join public.products pr on pr.id = v.product_id and pr.status = 'active'
                     join public.organization_products op on op.product_id = pr.id and op.organization_id = p_organization_id and op.available
                    where v.id = p_variant_id and v.status = 'active'
                      and private.shop_price_breakdown(p_organization_id, pr.id, v.base_price_cents, v.min_price_cents) is not null) then
      return jsonb_build_object('ok', false, 'code', 'not_available');
    end if;
    select exists (select 1 from public.cart_items i where i.cart_id = v_cart and i.variant_id = p_variant_id) into v_exists;
    select count(*) into v_lines from public.cart_items i where i.cart_id = v_cart;
    if not v_exists and v_lines >= 100 then
      return jsonb_build_object('ok', false, 'code', 'cart_full');
    end if;
    insert into public.cart_items (cart_id, variant_id, quantity) values (v_cart, p_variant_id, p_quantity)
      on conflict (cart_id, variant_id) do update set quantity = excluded.quantity;
  end if;
  update public.carts set updated_at = now() where id = v_cart;
  return jsonb_build_object('ok', true, 'code', 'updated');
end;
$$;

create function public.rpc_cart_empty(p_organization_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not (p_organization_id in (select private.my_org_ids())) or not private.shop_org_ok(p_organization_id) then
    return jsonb_build_object('ok', false, 'code', 'organization_not_found');
  end if;
  delete from public.cart_items where cart_id in (select c.id from public.carts c where c.organization_id = p_organization_id and c.user_id = v_actor);
  return jsonb_build_object('ok', true, 'code', 'emptied');
end;
$$;

-- Checkout. The client sends the organization, the address, notes and an IDEMPOTENCY KEY (a fresh uuid per rendered checkout form); NO price, total or line.
-- (1) the shared pricing lock: every privileged change to products, variants, assignments or markup rules takes the same lock EXCLUSIVELY, so a checkout never overlaps one
--     and cannot see a price, status, assignment or rule change half way (M5); concurrent checkouts only share it;
-- (2) the cart row lock serializes a double submit; (3) a repeated key returns the SAME order (L1), even after the cart was emptied;
-- (4) every line is priced in ONE statement (one snapshot) into v_lines, which then alone feeds the total, the order items and the audit row: nothing is priced twice;
-- (5) an order whose total would exceed the limit is refused with a clear code instead of a constraint error (L2).
-- Lock order: pricing lock (shared), then the cart row. The administrative RPCs take only the pricing lock (exclusive), never a cart row: no cycle.
create function public.rpc_checkout(p_organization_id uuid, p_ship_to jsonb, p_notes text, p_idempotency_key uuid) returns jsonb
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
  v_notes    text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  -- rev2: "is not true" (not "not ...") so that a NULL answer from the validator can never skip the rejection (defence in depth beside the coalesce inside shop_ship_to_ok)
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
    return jsonb_build_object('ok', true, 'code', 'order_placed', 'order_id', v_order, 'order_number', v_number, 'total_cents', v_total, 'replay', true);
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
    -- backstop for the idempotency key (the cart lock already serializes the same user): return the order that won
    select o.id, o.order_number, o.total_cents into v_order, v_number, v_total
      from public.orders o where o.organization_id = p_organization_id and o.placed_by = v_actor and o.idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('ok', true, 'code', 'order_placed', 'order_id', v_order, 'order_number', v_number, 'total_cents', v_total, 'replay', true);
    end if;
    raise;
  end;

  insert into public.order_items (order_id, variant_id, product_name, spec, sku, quantity, base_price_cents, floor_cents, unit_price_cents, line_total_cents, pricing)
  select v_order, (e ->> 'variant_id')::uuid, e ->> 'product_name', e ->> 'spec', e ->> 'sku', (e ->> 'quantity')::integer, (e ->> 'base')::integer, (e ->> 'floor')::integer,
         (e -> 'pricing' ->> 'unit')::integer, (e -> 'pricing' ->> 'unit')::bigint * (e ->> 'quantity')::bigint, e -> 'pricing'
    from jsonb_array_elements(v_lines) e;

  insert into public.order_events (order_id, from_status, to_status, actor_user_id, actor_kind) values (v_order, null, 'placed', v_actor, 'organization_user');
  delete from public.cart_items where cart_id = v_cart;
  update public.carts set updated_at = now() where id = v_cart;
  perform private.write_audit(v_actor, 'organization_user', 'order.place', 'success', p_organization_id, 'order', v_order::text,
                              jsonb_build_object('order_number', v_number, 'lines', v_n, 'total_cents', v_subtotal));
  return jsonb_build_object('ok', true, 'code', 'order_placed', 'order_id', v_order, 'order_number', v_number, 'total_cents', v_subtotal, 'replay', false);
end;
$$;

create function public.rpc_orders_list(p_organization_id uuid, p_limit integer default 50) returns jsonb
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
  select coalesce(jsonb_agg(jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'status', o.status, 'total_cents', o.total_cents,
                                               'created_at', o.created_at) order by o.created_at desc), '[]'::jsonb)
    into v_rows
    from (select * from public.orders x where x.organization_id = p_organization_id order by x.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) o;
  return jsonb_build_object('ok', true, 'orders', v_rows);
end;
$$;

create function public.rpc_order_get(p_organization_id uuid, p_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  o       record;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not (p_organization_id in (select private.my_org_ids())) or not private.shop_org_ok(p_organization_id) then
    return jsonb_build_object('ok', false, 'code', 'organization_not_found');
  end if;
  select * into o from public.orders x where x.id = p_order_id and x.organization_id = p_organization_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'order_not_found'); end if;
  return jsonb_build_object('ok', true,
    'order', jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'status', o.status, 'subtotal_cents', o.subtotal_cents, 'total_cents', o.total_cents,
                                'currency', o.currency, 'ship_to', o.ship_to, 'notes', o.notes, 'created_at', o.created_at),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('product_name', i.product_name, 'spec', i.spec, 'sku', i.sku, 'quantity', i.quantity,
                       'unit_price_cents', i.unit_price_cents, 'line_total_cents', i.line_total_cents) order by i.product_name, i.spec), '[]'::jsonb)
                from public.order_items i where i.order_id = o.id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('from_status', e.from_status, 'to_status', e.to_status, 'at', e.created_at) order by e.created_at), '[]'::jsonb)
                 from public.order_events e where e.order_id = o.id));
end;
$$;

-- 4. Staff RPCs (staff_gate: verified staff session + capability [+ fresh step-up]; a denial is audited and RETURNED) ---------------------------------
-- Every change that can alter a price, a status or an assignment takes the pricing lock EXCLUSIVELY (after the gate, before any row lock), see rpc_checkout.
create function public.rpc_admin_orgs_list() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  v_gate := private.staff_gate('org.read', 'staff.org.list', false, 'organization', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  return jsonb_build_object('ok', true, 'organizations', (
    select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'code', o.code, 'name', o.name, 'status', o.status,
             'members', (select count(*) from public.organization_members m where m.organization_id = o.id and m.status = 'active'),
             'rules', (select count(*) from public.markup_rules r where r.organization_id = o.id and r.is_active),
             'assigned_products', (select count(*) from public.organization_products op where op.organization_id = o.id)) order by o.name), '[]'::jsonb)
      from public.organizations o));
end;
$$;

create function public.rpc_admin_org_create(p_name text, p_code text, p_payment_terms text default 'prepay') returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_name  text := btrim(coalesce(p_name, ''));
  v_id    uuid;
begin
  v_gate := private.staff_gate('org.manage', 'staff.org.create', true, 'organization', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if char_length(v_name) not between 1 and 200 or p_code is null or p_code !~ '^[A-Z0-9][A-Z0-9-]{2,19}$' or p_payment_terms is null or p_payment_terms !~ '^[a-z0-9_]{1,32}$' then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  begin
    insert into public.organizations (name, code, payment_terms) values (v_name, p_code, p_payment_terms) returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'code_taken');
  end;
  perform private.write_audit(v_actor, 'staff', 'staff.org.create', 'success', v_id, 'organization', v_id::text, jsonb_build_object('code', p_code));
  return jsonb_build_object('ok', true, 'code', 'created', 'organization_id', v_id);
end;
$$;

-- Makes an existing, confirmed, not deleted and not banned account an organization member (invitation emails belong to the later admin-operations phase).
-- Staff accounts are refused by the 0002 guard. An existing OWNER is never silently demoted (M3): the answer is owner_downgrade_not_allowed. The audit row states
-- exactly what changed: added, reactivated or role_changed, with the old and the new role and status. No change, no audit row.
create function public.rpc_admin_org_member_add(p_organization_id uuid, p_email text, p_role text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor      uuid := (select auth.uid());
  v_gate       text;
  v_email      text := lower(btrim(coalesce(p_email, '')));
  v_user       uuid;
  v_old_role   text;
  v_old_status text;
  v_change     text;
begin
  v_gate := private.staff_gate('members.manage', 'staff.org.member.add', true, 'organization', p_organization_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_organization_id is null or char_length(v_email) not between 3 and 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' or p_role is null or p_role not in ('owner', 'member') then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_organization_id and o.status = 'active') then
    return jsonb_build_object('ok', false, 'code', 'organization_not_found');
  end if;
  select u.id into v_user from auth.users u
   where lower(u.email) = v_email and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now()) limit 1;
  if v_user is null then return jsonb_build_object('ok', false, 'code', 'user_not_found'); end if;
  select m.role, m.status into v_old_role, v_old_status from public.organization_members m
   where m.organization_id = p_organization_id and m.user_id = v_user for update;
  if found then
    if v_old_status = 'active' and v_old_role = p_role then
      return jsonb_build_object('ok', true, 'code', 'already_member');
    end if;
    if v_old_status = 'active' and v_old_role = 'owner' and p_role = 'member' then
      return jsonb_build_object('ok', false, 'code', 'owner_downgrade_not_allowed');
    end if;
    v_change := case when v_old_status = 'removed' then 'reactivated' else 'role_changed' end;
    begin
      update public.organization_members set role = p_role, status = 'active', removed_at = null where organization_id = p_organization_id and user_id = v_user;
    exception when sqlstate '23514' then
      return jsonb_build_object('ok', false, 'code', 'member_not_allowed');
    end;
  else
    v_change := 'added';
    begin
      insert into public.organization_members (organization_id, user_id, role) values (p_organization_id, v_user, p_role);
    exception when sqlstate '23514' then
      return jsonb_build_object('ok', false, 'code', 'member_not_allowed');
    end;
  end if;
  perform private.write_audit(v_actor, 'staff', 'staff.org.member.add', 'success', p_organization_id, 'user', v_user::text,
                              jsonb_build_object('change', v_change, 'old_role', v_old_role, 'old_status', v_old_status, 'new_role', p_role, 'new_status', 'active'));
  return jsonb_build_object('ok', true, 'code', case v_change when 'added' then 'added' when 'reactivated' then 'reactivated' else 'role_changed' end);
end;
$$;

create function public.rpc_admin_catalog_list() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  v_gate := private.staff_gate('org.manage', 'staff.catalog.list', false, 'catalog', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  return jsonb_build_object('ok', true, 'products', (
    select coalesce(jsonb_agg(jsonb_build_object('product_id', p.id, 'slug', p.slug, 'name', p.name, 'category', p.category, 'status', p.status,
             'variants', (select coalesce(jsonb_agg(jsonb_build_object('variant_id', v.id, 'spec', v.spec, 'sku', v.sku, 'base_price_cents', v.base_price_cents,
                                   'min_price_cents', v.min_price_cents, 'status', v.status) order by v.spec), '[]'::jsonb)
                            from public.product_variants v where v.product_id = p.id)) order by p.name), '[]'::jsonb)
      from public.products p));
end;
$$;

-- Sets the base price and the floor of one variant (both required to sell; either may be cleared). Fresh step-up. Applies to FUTURE checkouts only.
create function public.rpc_admin_variant_set_price(p_variant_id uuid, p_base_cents integer, p_min_cents integer) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  o       record;
begin
  v_gate := private.staff_gate('org.manage', 'staff.variant.price.set', true, 'product_variant', p_variant_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_variant_id is null or (p_base_cents is not null and p_base_cents not between 1 and 100000000) or (p_min_cents is not null and p_min_cents not between 1 and 100000000) then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('shop:pricing', 0));
  select v.base_price_cents, v.min_price_cents into o from public.product_variants v where v.id = p_variant_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'variant_not_found'); end if;
  update public.product_variants set base_price_cents = p_base_cents, min_price_cents = p_min_cents where id = p_variant_id;
  perform private.write_audit(v_actor, 'staff', 'staff.variant.price.set', 'success', null, 'product_variant', p_variant_id::text,
                              jsonb_build_object('old_base', o.base_price_cents, 'new_base', p_base_cents, 'old_min', o.min_price_cents, 'new_min', p_min_cents));
  return jsonb_build_object('ok', true, 'code', 'updated');
end;
$$;

create function public.rpc_admin_product_set_status(p_product_id uuid, p_status text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
begin
  v_gate := private.staff_gate('org.manage', 'staff.product.status.set', false, 'product', p_product_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_product_id is null or p_status is null or p_status not in ('active', 'archived') then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('shop:pricing', 0));
  update public.products set status = p_status where id = p_product_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'product_not_found'); end if;
  perform private.write_audit(v_actor, 'staff', 'staff.product.status.set', 'success', null, 'product', p_product_id::text, jsonb_build_object('status', p_status));
  return jsonb_build_object('ok', true, 'code', 'updated');
end;
$$;

create function public.rpc_admin_org_catalog_get(p_organization_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  v_gate := private.staff_gate('org.manage', 'staff.org.catalog.get', false, 'organization', p_organization_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if not exists (select 1 from public.organizations o where o.id = p_organization_id) then
    return jsonb_build_object('ok', false, 'code', 'organization_not_found');
  end if;
  return jsonb_build_object('ok', true,
    'rules', (select coalesce(jsonb_agg(jsonb_build_object('rule_id', r.id, 'kind', r.kind, 'product_id', r.product_id, 'product_name', pr.name, 'markup_type', r.markup_type,
                          'value_e4', r.value_e4, 'rep_min_percent_e4', r.rep_min_percent_e4, 'rep_max_percent_e4', r.rep_max_percent_e4,
                          'rep_min_fixed_e4', r.rep_min_fixed_e4, 'rep_max_fixed_e4', r.rep_max_fixed_e4, 'is_active', r.is_active)
                          order by r.kind, (r.product_id is not null), pr.name), '[]'::jsonb)
                from public.markup_rules r left join public.products pr on pr.id = r.product_id where r.organization_id = p_organization_id),
    'products', (select coalesce(jsonb_agg(jsonb_build_object('product_id', pr.id, 'name', pr.name, 'slug', pr.slug, 'status', pr.status,
                          'assigned', op.product_id is not null, 'available', coalesce(op.available, false),
                          'priced', exists (select 1 from public.product_variants v where v.product_id = pr.id and v.status = 'active' and v.base_price_cents is not null and v.min_price_cents is not null))
                          order by pr.name), '[]'::jsonb)
                   from public.products pr left join public.organization_products op on op.product_id = pr.id and op.organization_id = p_organization_id));
end;
$$;

-- Publishes (assigns) or unpublishes a product for an organization. A product can be PUBLISHED only if it has at least one active variant with a base price AND a floor.
create function public.rpc_admin_org_product_set(p_organization_id uuid, p_product_id uuid, p_assigned boolean, p_available boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
begin
  v_gate := private.staff_gate('org.manage', 'staff.org.product.set', false, 'organization', p_organization_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_organization_id is null or p_product_id is null or p_assigned is null or p_available is null then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('shop:pricing', 0));
  if not exists (select 1 from public.organizations o where o.id = p_organization_id) or not exists (select 1 from public.products p where p.id = p_product_id) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if p_assigned and not exists (select 1 from public.product_variants v
                                 where v.product_id = p_product_id and v.status = 'active' and v.base_price_cents is not null and v.min_price_cents is not null) then
    return jsonb_build_object('ok', false, 'code', 'product_not_priced');
  end if;
  if p_assigned then
    insert into public.organization_products (organization_id, product_id, available) values (p_organization_id, p_product_id, p_available)
      on conflict (organization_id, product_id) do update set available = excluded.available;
  else
    delete from public.organization_products where organization_id = p_organization_id and product_id = p_product_id;
  end if;
  perform private.write_audit(v_actor, 'staff', 'staff.org.product.set', 'success', p_organization_id, 'product', p_product_id::text,
                              jsonb_build_object('assigned', p_assigned, 'available', p_available));
  return jsonb_build_object('ok', true, 'code', 'updated');
end;
$$;

-- Creates or updates ONE markup rule (scope: organization, kind, product or all products), the Aspen admin_set_markup_rule. Fresh step-up. Applies to FUTURE checkouts only.
-- Representative bounds are accepted on organization rules only. Rules are deactivated (is_active = false), never deleted.
create function public.rpc_admin_markup_rule_set(p_organization_id uuid, p_kind text, p_product_id uuid, p_markup_type text, p_value_e4 bigint,
                                                 p_rep_min_percent_e4 bigint, p_rep_max_percent_e4 bigint, p_rep_min_fixed_e4 bigint, p_rep_max_fixed_e4 bigint,
                                                 p_active boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_id     uuid;
  v_old_t  text;
  v_old_v  bigint;
  v_old_a  boolean;
begin
  v_gate := private.staff_gate('org.manage', 'staff.markup_rule.set', true, 'organization', p_organization_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_organization_id is null or p_kind is null or p_kind not in ('organization', 'representative') or p_markup_type is null or p_markup_type not in ('percent', 'fixed')
     or p_value_e4 is null or p_value_e4 < 0 or (p_markup_type = 'percent' and p_value_e4 > 10000000) or (p_markup_type = 'fixed' and p_value_e4 > 10000000000)
     or p_active is null
     or (p_kind = 'representative' and num_nonnulls(p_rep_min_percent_e4, p_rep_max_percent_e4, p_rep_min_fixed_e4, p_rep_max_fixed_e4) <> 0)
     or (p_rep_min_percent_e4 is not null and p_rep_min_percent_e4 not between 0 and 10000000) or (p_rep_max_percent_e4 is not null and p_rep_max_percent_e4 not between 0 and 10000000)
     or (p_rep_min_fixed_e4 is not null and p_rep_min_fixed_e4 not between 0 and 10000000000) or (p_rep_max_fixed_e4 is not null and p_rep_max_fixed_e4 not between 0 and 10000000000)
     or (p_rep_min_percent_e4 is not null and p_rep_max_percent_e4 is not null and p_rep_min_percent_e4 > p_rep_max_percent_e4)
     or (p_rep_min_fixed_e4 is not null and p_rep_max_fixed_e4 is not null and p_rep_min_fixed_e4 > p_rep_max_fixed_e4) then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('shop:pricing', 0));
  if not exists (select 1 from public.organizations o where o.id = p_organization_id) then
    return jsonb_build_object('ok', false, 'code', 'organization_not_found');
  end if;
  if p_product_id is not null and not exists (select 1 from public.products p where p.id = p_product_id) then
    return jsonb_build_object('ok', false, 'code', 'product_not_found');
  end if;
  select r.id, r.markup_type, r.value_e4, r.is_active into v_id, v_old_t, v_old_v, v_old_a from public.markup_rules r
   where r.organization_id = p_organization_id and r.kind = p_kind and r.product_id is not distinct from p_product_id for update;
  if found then
    update public.markup_rules set markup_type = p_markup_type, value_e4 = p_value_e4, rep_min_percent_e4 = p_rep_min_percent_e4, rep_max_percent_e4 = p_rep_max_percent_e4,
           rep_min_fixed_e4 = p_rep_min_fixed_e4, rep_max_fixed_e4 = p_rep_max_fixed_e4, is_active = p_active where id = v_id;
  else
    insert into public.markup_rules (organization_id, kind, product_id, markup_type, value_e4, rep_min_percent_e4, rep_max_percent_e4, rep_min_fixed_e4, rep_max_fixed_e4, is_active)
    values (p_organization_id, p_kind, p_product_id, p_markup_type, p_value_e4, p_rep_min_percent_e4, p_rep_max_percent_e4, p_rep_min_fixed_e4, p_rep_max_fixed_e4, p_active)
    returning id into v_id;
  end if;
  perform private.write_audit(v_actor, 'staff', 'staff.markup_rule.set', 'success', p_organization_id, 'organization', p_organization_id::text,
                              jsonb_build_object('rule_id', v_id, 'kind', p_kind, 'product_id', p_product_id, 'old_type', v_old_t, 'old_value_e4', v_old_v, 'old_active', v_old_a,
                                                 'new_type', p_markup_type, 'new_value_e4', p_value_e4, 'new_active', p_active));
  return jsonb_build_object('ok', true, 'code', 'updated', 'rule_id', v_id);
end;
$$;

create function public.rpc_admin_orders_list(p_status text default null, p_limit integer default 100) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  v_gate := private.staff_gate('org.read', 'staff.orders.list', false, 'orders', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_status is not null and p_status not in ('placed', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled') then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  return jsonb_build_object('ok', true, 'orders', (
    select coalesce(jsonb_agg(jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'status', o.status, 'total_cents', o.total_cents,
             'organization_id', o.organization_id, 'organization_name', g.name, 'organization_code', g.code, 'created_at', o.created_at) order by o.created_at desc), '[]'::jsonb)
      from (select * from public.orders x where p_status is null or x.status = p_status order by x.created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) o
      join public.organizations g on g.id = o.organization_id));
end;
$$;

create function public.rpc_admin_order_get(p_order_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  o       record;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  v_gate := private.staff_gate('org.read', 'staff.order.get', false, 'order', p_order_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  select x.*, g.name as org_name, g.code as org_code into o from public.orders x join public.organizations g on g.id = x.organization_id where x.id = p_order_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'order_not_found'); end if;
  return jsonb_build_object('ok', true,
    'order', jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'status', o.status, 'subtotal_cents', o.subtotal_cents, 'total_cents', o.total_cents,
                                'currency', o.currency, 'ship_to', o.ship_to, 'notes', o.notes, 'created_at', o.created_at,
                                'organization_id', o.organization_id, 'organization_name', o.org_name, 'organization_code', o.org_code),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('product_name', i.product_name, 'spec', i.spec, 'sku', i.sku, 'quantity', i.quantity,
                       'base_price_cents', i.base_price_cents, 'floor_cents', i.floor_cents, 'pricing', i.pricing,
                       'unit_price_cents', i.unit_price_cents, 'line_total_cents', i.line_total_cents) order by i.product_name, i.spec), '[]'::jsonb)
                from public.order_items i where i.order_id = o.id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('from_status', e.from_status, 'to_status', e.to_status, 'actor_kind', e.actor_kind, 'note', e.note, 'at', e.created_at)
                                         order by e.created_at), '[]'::jsonb) from public.order_events e where e.order_id = o.id));
end;
$$;

create function public.rpc_admin_order_set_status(p_order_id uuid, p_to_status text, p_note text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_from  text;
  v_org   uuid;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
begin
  v_gate := private.staff_gate('fulfillment.process', 'staff.order.status.set', false, 'order', p_order_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_order_id is null or p_to_status is null or p_to_status not in ('placed', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')
     or (v_note is not null and char_length(v_note) > 300) then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  select o.status, o.organization_id into v_from, v_org from public.orders o where o.id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'order_not_found'); end if;
  if not private.shop_order_transition_ok(v_from, p_to_status) then
    perform private.write_audit(v_actor, 'staff', 'staff.order.status.set', 'denied', v_org, 'order', p_order_id::text,
                                jsonb_build_object('reason', 'invalid_transition', 'from', v_from, 'to', p_to_status));
    return jsonb_build_object('ok', false, 'code', 'invalid_transition');
  end if;
  update public.orders set status = p_to_status, updated_at = clock_timestamp() where id = p_order_id;
  insert into public.order_events (order_id, from_status, to_status, actor_user_id, actor_kind, note) values (p_order_id, v_from, p_to_status, v_actor, 'staff', v_note);
  perform private.write_audit(v_actor, 'staff', 'staff.order.status.set', 'success', v_org, 'order', p_order_id::text, jsonb_build_object('from', v_from, 'to', p_to_status));
  return jsonb_build_object('ok', true, 'code', 'updated', 'status', p_to_status);
end;
$$;

-- 5. Privileges -------------------------------------------------------------------------------------------------------------------------
revoke all on table public.products, public.product_variants, public.organization_products, public.markup_rules, public.carts, public.cart_items,
                    public.orders, public.order_items, public.order_events from public, anon, authenticated, service_role;
revoke all on sequence public.order_number_seq from public, anon, authenticated, service_role;

revoke all on function private.shop_markup_amount(text, bigint, bigint), private.shop_compose(integer, integer, text, bigint, text, bigint, bigint, bigint, bigint, bigint),
                       private.shop_price_breakdown(uuid, uuid, integer, integer), private.shop_order_transition_ok(text, text), private.shop_ship_to_ok(jsonb),
                       private.shop_org_ok(uuid), private.guard_shop_orders(), private.guard_shop_append_only()
  from public, anon, authenticated, service_role;

revoke all on function public.rpc_catalog_list(uuid), public.rpc_cart_get(uuid), public.rpc_cart_put_item(uuid, uuid, integer), public.rpc_cart_empty(uuid),
                       public.rpc_checkout(uuid, jsonb, text, uuid), public.rpc_orders_list(uuid, integer), public.rpc_order_get(uuid, uuid),
                       public.rpc_admin_orgs_list(), public.rpc_admin_org_create(text, text, text), public.rpc_admin_org_member_add(uuid, text, text),
                       public.rpc_admin_catalog_list(), public.rpc_admin_variant_set_price(uuid, integer, integer), public.rpc_admin_product_set_status(uuid, text),
                       public.rpc_admin_org_catalog_get(uuid), public.rpc_admin_org_product_set(uuid, uuid, boolean, boolean),
                       public.rpc_admin_markup_rule_set(uuid, text, uuid, text, bigint, bigint, bigint, bigint, bigint, boolean),
                       public.rpc_admin_orders_list(text, integer), public.rpc_admin_order_get(uuid), public.rpc_admin_order_set_status(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_catalog_list(uuid), public.rpc_cart_get(uuid), public.rpc_cart_put_item(uuid, uuid, integer), public.rpc_cart_empty(uuid),
                          public.rpc_checkout(uuid, jsonb, text, uuid), public.rpc_orders_list(uuid, integer), public.rpc_order_get(uuid, uuid),
                          public.rpc_admin_orgs_list(), public.rpc_admin_org_create(text, text, text), public.rpc_admin_org_member_add(uuid, text, text),
                          public.rpc_admin_catalog_list(), public.rpc_admin_variant_set_price(uuid, integer, integer), public.rpc_admin_product_set_status(uuid, text),
                          public.rpc_admin_org_catalog_get(uuid), public.rpc_admin_org_product_set(uuid, uuid, boolean, boolean),
                          public.rpc_admin_markup_rule_set(uuid, text, uuid, text, bigint, bigint, bigint, bigint, bigint, boolean),
                          public.rpc_admin_orders_list(text, integer), public.rpc_admin_order_get(uuid), public.rpc_admin_order_set_status(uuid, text, text)
  to authenticated;

-- 6. Self-check: the migration fails if the posture or the pricing is not what the design says --------------------------------------------------
do $$
declare
  t text;
  p text;
begin
  foreach t in array array['public.products', 'public.product_variants', 'public.organization_products', 'public.markup_rules', 'public.carts', 'public.cart_items',
                           'public.orders', 'public.order_items', 'public.order_events'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = t::regclass) then raise exception 'self-check: RLS not enabled on %', t; end if;
    foreach p in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
      if has_table_privilege('anon', t, p) or has_table_privilege('authenticated', t, p) or has_table_privilege('service_role', t, p) then
        raise exception 'self-check: an API role has % on %', p, t;
      end if;
    end loop;
  end loop;
  if exists (select 1 from public.products) or exists (select 1 from public.orders) or exists (select 1 from public.carts) or exists (select 1 from public.markup_rules) then
    raise exception 'self-check: tables must be empty at install';
  end if;
  if (select count(*) from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
       where n.nspname = 'public' and pr.proname in ('rpc_catalog_list', 'rpc_cart_get', 'rpc_cart_put_item', 'rpc_cart_empty', 'rpc_checkout', 'rpc_orders_list', 'rpc_order_get',
             'rpc_admin_orgs_list', 'rpc_admin_org_create', 'rpc_admin_org_member_add', 'rpc_admin_catalog_list', 'rpc_admin_variant_set_price', 'rpc_admin_product_set_status',
             'rpc_admin_org_catalog_get', 'rpc_admin_org_product_set', 'rpc_admin_markup_rule_set', 'rpc_admin_orders_list', 'rpc_admin_order_get', 'rpc_admin_order_set_status')
         and pr.prosecdef and has_function_privilege('authenticated', pr.oid, 'execute')
         and not has_function_privilege('anon', pr.oid, 'execute') and not has_function_privilege('service_role', pr.oid, 'execute') and not has_function_privilege('public', pr.oid, 'execute')
         and exists (select 1 from unnest(pr.proconfig) c where regexp_replace(c, '[\s"'']', '', 'g') ~* '^search_path=$')) <> 19 then
    raise exception 'self-check: RPC definer, search_path or grant state is wrong';
  end if;
  if exists (select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
              where n.nspname = 'private' and pr.proname like 'shop\_%' and (has_function_privilege('authenticated', pr.oid, 'execute') or has_function_privilege('anon', pr.oid, 'execute'))) then
    raise exception 'self-check: a shop private helper is executable by an API role';
  end if;
  if (select count(*) from pg_trigger tg where not tg.tgisinternal and tg.tgrelid in ('public.orders'::regclass, 'public.order_items'::regclass, 'public.order_events'::regclass)) <> 6 then
    raise exception 'self-check: expected 6 guard triggers on the order tables';
  end if;
  -- Aspen parity vectors (cents). Same vectors as tests/portal/p3-pricing-aspen-parity.test.ts, which reads them from this file and recomputes them with the TypeScript model.
  -- VECTOR base floor org_type org_value_e4 rep_type rep_value_e4 min_pct max_pct min_fixed max_fixed -> unit
  if private.shop_compose(10000, 1000, null, null, null, null, null, null, null, null) ->> 'unit' <> '10000'
     or private.shop_compose(10000, 1000, 'percent', 250000, null, null, null, null, null, null) ->> 'unit' <> '12500'
     or private.shop_compose(10000, 1000, 'fixed', 50000, null, null, null, null, null, null) ->> 'unit' <> '10500'
     or private.shop_compose(10000, 1000, 'percent', 250000, 'percent', 50000, null, null, null, null) ->> 'unit' <> '13125'
     or private.shop_compose(333, 100, 'percent', 100000, 'percent', 100000, null, null, null, null) ->> 'unit' <> '403'
     or private.shop_compose(335, 100, 'percent', 100000, null, null, null, null, null, null) ->> 'unit' <> '369'
     or private.shop_compose(10000, 15000, 'percent', 250000, null, null, null, null, null, null) ->> 'unit' <> '15000'
     or private.shop_compose(10000, 1000, 'percent', 100000, 'percent', 10000, 20000, 50000, null, null) ->> 'unit' <> '11220'
     or private.shop_compose(10000, 1000, 'percent', 100000, 'percent', 900000, 20000, 50000, null, null) ->> 'unit' <> '11550'
     or private.shop_compose(10000, 1000, 'percent', 0, 'fixed', 20000, null, null, 10000, 30000) ->> 'unit' <> '10200'
     or private.shop_compose(10000, 1000, 'fixed', 50000, 'fixed', 100, null, null, 20000, 30000) ->> 'unit' <> '10700'
     or private.shop_compose(0, 1000, null, null, null, null, null, null, null, null) is not null
     or private.shop_compose(10000, null, null, null, null, null, null, null, null, null) is not null
     or private.shop_compose(100000000, 1000, 'percent', 10000000, null, null, null, null, null, null) is not null then
    raise exception 'self-check: shop_compose does not reproduce the Aspen pricing vectors';
  end if;
  if not private.shop_order_transition_ok('placed', 'confirmed') or private.shop_order_transition_ok('shipped', 'cancelled') or private.shop_order_transition_ok('delivered', 'placed') then
    raise exception 'self-check: order transitions';
  end if;
end;
$$;
