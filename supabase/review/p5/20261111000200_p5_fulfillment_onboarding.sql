-- =====================================================================================================================================
-- P5 DRAFT. NOT APPLIED. NOT EXECUTED. NEVER PARSED BY POSTGRESQL.
-- Fulfillment onboarding: documents and private storage, the nine-step engine, products/labels/packaging/store/agreement/funding, compliance gates, go-live,
-- and setup (non-order) invoices. Depends on migrations 0001 to 0004, P3 and P4. Reuses existing capabilities only (onboarding.review, onboarding.golive,
-- financial.write, gates.read, gates.write, documents.read): no change to the staff catalog. TypeScript mirror: src/lib/portal/onboarding/steps.ts.
-- =====================================================================================================================================

-- 1. Documents and private storage ----------------------------------------------------------------------------------------------------
-- One private bucket; the first path segment is the organization id. Customers never write the documents table: a registered row is created by an RPC that
-- reads the REAL uploaded object (size and type come from storage, not from the caller).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portal-documents', 'portal-documents', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg']);

create table public.documents (
  id              uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  kind            text not null check (kind in ('label_artwork', 'agreement', 'agreement_signed', 'certificate', 'payment_proof', 'gate_evidence', 'other')),
  file_name       text not null check (char_length(file_name) between 1 and 200),
  content_type    text not null check (content_type in ('application/pdf', 'image/png', 'image/jpeg')),
  size_bytes      bigint not null check (size_bytes between 1 and 10485760),
  storage_path    text not null unique,
  uploaded_by     uuid not null,   -- no FK on purpose: an audit reference that must survive account deletion
  uploader_kind   text not null check (uploader_kind in ('staff', 'organization_user')),
  created_at      timestamptz not null default clock_timestamp(),
  constraint documents_id_org_key unique (id, organization_id),
  constraint documents_path_prefix check (storage_path like organization_id::text || '/%')
);
create index documents_org_idx on public.documents (organization_id, created_at desc);

-- 2. Onboarding engine ------------------------------------------------------------------------------------------------------------------
create table public.onboarding_step_defs (
  step_no    integer primary key check (step_no between 1 and 9),
  key        text not null unique,
  title      text not null,
  owner      text not null check (owner in ('customer', 'staff')),
  depends_on integer[] not null default '{}'
);
insert into public.onboarding_step_defs (step_no, key, title, owner, depends_on) values
  (1, 'products', 'Add your products', 'customer', '{}'),
  (2, 'labels', 'Design your labels', 'customer', '{1}'),
  (3, 'packaging', 'Choose how we pack', 'customer', '{1}'),
  (4, 'store', 'Connect your store', 'customer', '{1}'),
  (5, 'test_order', 'Send a test order', 'customer', '{1,4}'),
  (6, 'agreement', 'Sign your agreement and pay setup', 'staff', '{1,2,3}'),
  (7, 'funding', 'Meet the funding requirement', 'customer', '{6}'),
  (8, 'launch_review', 'Launch review', 'customer', '{1,2,3,4,5,6,7}'),
  (9, 'go_live', 'Go live', 'staff', '{8}');

create table public.onboarding_instances (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete restrict,
  status          text not null default 'in_progress' check (status in ('in_progress', 'live')),
  live_at         timestamptz,
  live_by         uuid,
  created_at      timestamptz not null default clock_timestamp(),
  updated_at      timestamptz not null default clock_timestamp(),
  constraint onboarding_live_consistent check ((status = 'live') = (live_at is not null))
);

create table public.onboarding_steps (
  instance_id         uuid not null references public.onboarding_instances (id) on delete restrict,
  step_no             integer not null references public.onboarding_step_defs (step_no),
  status              text not null default 'todo' check (status in ('todo', 'in_progress', 'submitted', 'approved', 'rejected')),
  version             integer not null default 0 check (version >= 0),
  submitted_at        timestamptz,
  submitted_by        uuid,
  reviewed_at         timestamptz,
  reviewed_by         uuid,
  review_reason       text check (review_reason is null or char_length(review_reason) <= 300),
  review_instructions text check (review_instructions is null or char_length(review_instructions) <= 500),
  updated_at          timestamptz not null default clock_timestamp(),
  primary key (instance_id, step_no),
  constraint onboarding_steps_status_consistent check (
       (status in ('todo', 'in_progress'))
    or (status = 'submitted' and submitted_at is not null and submitted_by is not null)
    or (status = 'approved' and reviewed_at is not null and reviewed_by is not null)
    or (status = 'rejected' and reviewed_at is not null and reviewed_by is not null and review_reason is not null))
);

create table public.onboarding_submissions (
  id           uuid primary key default gen_random_uuid(),
  instance_id  uuid not null,
  step_no      integer not null,
  version      integer not null check (version >= 1),
  data         jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 16384),
  submitted_by uuid not null,
  submitted_at timestamptz not null default clock_timestamp(),
  constraint onboarding_submissions_step_fk foreign key (instance_id, step_no) references public.onboarding_steps (instance_id, step_no) on delete restrict,
  constraint onboarding_submissions_version_key unique (instance_id, step_no, version)
);

create table public.onboarding_events (
  id            uuid primary key default gen_random_uuid(),
  instance_id   uuid not null references public.onboarding_instances (id) on delete restrict,
  step_no       integer,
  event         text not null check (char_length(event) between 1 and 60),
  actor_user_id uuid,
  actor_kind    text not null check (actor_kind in ('staff', 'organization_user')),
  note          text check (note is null or char_length(note) <= 500),
  created_at    timestamptz not null default clock_timestamp()
);
create index onboarding_events_instance_idx on public.onboarding_events (instance_id, created_at);

-- 3. Products, labels, packaging, store, agreement, funding, gates -----------------------------------------------------------------------
create sequence public.fulfillment_sku_seq start 1 minvalue 1;

create table public.sku_mappings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  source          text not null check (source in ('catalog', 'private')),
  variant_id      uuid references public.product_variants (id) on delete restrict,
  product_name    text check (product_name is null or char_length(btrim(product_name)) between 1 and 160),
  spec            text check (spec is null or char_length(spec) <= 120),
  internal_sku    text not null unique default ('FS-' || lpad(nextval('public.fulfillment_sku_seq')::text, 6, '0')),
  external_sku    text not null check (external_sku ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'),
  units_per_pack  integer not null check (units_per_pack between 1 and 10000),
  barcode         text check (barcode is null or barcode ~ '^[0-9]{8,14}$'),
  weight_grams    integer check (weight_grams is null or weight_grams between 1 and 100000),
  status          text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected')),
  review_reason   text check (review_reason is null or char_length(review_reason) <= 300),
  created_by      uuid not null,
  reviewed_by     uuid,
  created_at      timestamptz not null default clock_timestamp(),
  updated_at      timestamptz not null default clock_timestamp(),
  constraint sku_mappings_org_external_key unique (organization_id, external_sku),
  constraint sku_mappings_id_org_key unique (id, organization_id),
  constraint sku_mappings_source_shape check ((source = 'catalog' and variant_id is not null and product_name is null) or (source = 'private' and variant_id is null and product_name is not null))
);
create index sku_mappings_org_idx on public.sku_mappings (organization_id, created_at);

create table public.label_designs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sku_mapping_id  uuid not null,
  template        text not null check (template in ('ml3', 'ml10')),
  document_id     uuid not null,
  status          text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected')),
  review_reason   text check (review_reason is null or char_length(review_reason) <= 300),
  created_by      uuid not null,
  reviewed_by     uuid,
  created_at      timestamptz not null default clock_timestamp(),
  updated_at      timestamptz not null default clock_timestamp(),
  constraint label_designs_mapping_fk foreign key (sku_mapping_id, organization_id) references public.sku_mappings (id, organization_id) on delete restrict,
  constraint label_designs_document_fk foreign key (document_id, organization_id) references public.documents (id, organization_id) on delete restrict
);
create index label_designs_org_idx on public.label_designs (organization_id, created_at);

create table public.packaging_options (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[a-z0-9_]{2,40}$'),
  name        text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 500),
  fee_cents   bigint not null default 0 check (fee_cents between 0 and 100000000),
  active      boolean not null default true
);
insert into public.packaging_options (code, name, description, fee_cents) values ('standard', 'Standard box and padding', 'Standard shipping box with protective padding.', 0);

create table public.packaging_selections (
  organization_id uuid primary key references public.organizations (id) on delete restrict,
  option_id       uuid not null references public.packaging_options (id) on delete restrict,
  notes           text check (notes is null or char_length(notes) <= 300),
  selected_by     uuid not null,
  updated_at      timestamptz not null default clock_timestamp()
);

create table public.store_connections (
  organization_id uuid primary key references public.organizations (id) on delete restrict,
  method          text not null check (method in ('api', 'woocommerce', 'shopify', 'manual')),
  store_url       text check (store_url is null or (store_url ~ '^https://' and char_length(store_url) <= 300)),
  webhook_url     text check (webhook_url is null or (webhook_url ~ '^https://' and char_length(webhook_url) <= 300)),
  notes           text check (notes is null or char_length(notes) <= 500),
  status          text not null default 'draft' check (status in ('draft', 'submitted', 'verified', 'rejected')),
  review_reason   text check (review_reason is null or char_length(review_reason) <= 300),
  updated_by      uuid not null,
  updated_at      timestamptz not null default clock_timestamp(),
  constraint store_connections_url_needed check (method = 'manual' or store_url is not null)
);

create table public.onboarding_agreements (
  organization_id    uuid primary key references public.organizations (id) on delete restrict,
  offered_document_id uuid not null,
  offered_by         uuid not null,
  offered_at         timestamptz not null default clock_timestamp(),
  status             text not null default 'offered' check (status in ('offered', 'signed')),
  signer_name        text check (signer_name is null or char_length(btrim(signer_name)) between 1 and 120),
  signer_title       text check (signer_title is null or char_length(btrim(signer_title)) between 1 and 120),
  signed_by          uuid,
  signed_at          timestamptz,
  signed_document_id uuid,
  constraint agreements_offered_fk foreign key (offered_document_id, organization_id) references public.documents (id, organization_id) on delete restrict,
  constraint agreements_signed_fk foreign key (signed_document_id, organization_id) references public.documents (id, organization_id) on delete restrict,
  constraint agreements_signed_consistent check ((status = 'signed') = (signed_at is not null and signer_name is not null and signer_title is not null and signed_by is not null))
);

-- One funding requirement per organization. "Met" is derived: a paid invoice, approved credit terms, or a staff waiver; a customer claim never meets it.
create table public.funding_requirements (
  organization_id uuid primary key references public.organizations (id) on delete restrict,
  type            text not null check (type in ('prepay_invoice', 'deposit_invoice', 'credit_terms', 'waived')),
  amount_cents    bigint not null check (amount_cents between 0 and 1000000000000),
  status          text not null default 'unmet' check (status in ('unmet', 'met', 'waived')),
  invoice_id      uuid unique,
  reason          text check (reason is null or char_length(reason) <= 300),
  set_by          uuid not null,
  updated_at      timestamptz not null default clock_timestamp(),
  constraint funding_waived_consistent check ((type = 'waived') = (status = 'waived')),
  constraint funding_reason_needed check (type not in ('waived', 'credit_terms') or reason is not null)
);

create table public.compliance_gates (
  code        text primary key check (code in ('G1', 'G2', 'G3', 'G4', 'G5', 'G6')),
  status      text not null default 'not_recorded' check (status in ('not_recorded', 'recorded', 'revoked')),
  note        text check (note is null or char_length(note) <= 500),
  recorded_by uuid,
  recorded_at timestamptz,
  updated_at  timestamptz not null default clock_timestamp(),
  constraint gates_recorded_consistent check ((status = 'not_recorded') or (recorded_by is not null and recorded_at is not null and note is not null))
);
insert into public.compliance_gates (code) values ('G1'), ('G2'), ('G3'), ('G4'), ('G5'), ('G6');

alter table public.documents              enable row level security;
alter table public.onboarding_step_defs   enable row level security;
alter table public.onboarding_instances  enable row level security;
alter table public.onboarding_steps       enable row level security;
alter table public.onboarding_submissions enable row level security;
alter table public.onboarding_events      enable row level security;
alter table public.sku_mappings           enable row level security;
alter table public.label_designs          enable row level security;
alter table public.packaging_options      enable row level security;
alter table public.packaging_selections   enable row level security;
alter table public.store_connections      enable row level security;
alter table public.onboarding_agreements  enable row level security;
alter table public.funding_requirements   enable row level security;
alter table public.compliance_gates       enable row level security;

-- 4. Setup (non-order) invoices: P4 invoices may now exist without an order ------------------------------------------------------------
alter table public.invoices alter column order_id drop not null;
alter table public.invoices add column kind text not null default 'order' check (kind in ('order', 'setup', 'funding'));
alter table public.invoices add constraint invoices_kind_matches_order check ((kind = 'order') = (order_id is not null));
alter table public.invoice_lines drop constraint invoice_lines_line_type_check;
alter table public.invoice_lines add constraint invoice_lines_line_type_check
  check (line_type in ('wholesale', 'setup_fee', 'funding', 'fulfillment_fee', 'packaging_fee', 'shipping_fee', 'storage_fee', 'adjustment'));

-- the P4 guard compared order_id with <>, which is NULL (not true) when it is NULL: use "is distinct from" and protect the new kind column
create or replace function private.guard_pay_invoices() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'invoices cannot be deleted' using errcode = '23514'; end if;
  if new.id <> old.id or new.invoice_number <> old.invoice_number or new.organization_id <> old.organization_id or new.order_id is distinct from old.order_id
     or new.kind <> old.kind or new.total_cents <> old.total_cents or new.currency <> old.currency or new.terms <> old.terms or new.issued_at <> old.issued_at
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

-- A setup or funding invoice: one line, issued now, due by the organization's terms. Returns the invoice id.
create function private.ob_fee_invoice_create(p_org uuid, p_kind text, p_description text, p_cents bigint) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_terms text;
  v_days  integer;
  v_id    uuid;
begin
  if p_kind not in ('setup', 'funding') or p_cents is null or p_cents < 1 or p_cents > 1000000000000 then raise exception 'invalid arguments' using errcode = '22023'; end if;
  select g.payment_terms into v_terms from public.organizations g where g.id = p_org;
  if not found then raise exception 'organization not found' using errcode = 'P0002'; end if;
  v_days := case when v_terms = 'prepay' then 0 when v_terms ~ '^net_?[0-9]{1,3}$' then regexp_replace(v_terms, '[^0-9]', '', 'g')::integer else 30 end;
  if v_days > 365 then v_days := 30; end if;
  insert into public.invoices (organization_id, order_id, kind, total_cents, terms, due_at)
  values (p_org, null, p_kind, p_cents, v_terms, clock_timestamp() + make_interval(days => v_days)) returning id into v_id;
  insert into public.invoice_lines (invoice_id, line_type, description, quantity, unit_price_cents, line_total_cents)
  values (v_id, case when p_kind = 'setup' then 'setup_fee' else 'funding' end, left(p_description, 300), 1, p_cents, p_cents);
  return v_id;
end;
$$;

-- 5. Private helpers and guards -----------------------------------------------------------------------------------------------------------
create function private.ob_step_transition_ok(p_from text, p_to text) returns boolean
language sql immutable set search_path = ''
as $$
  select (p_from, p_to) in (('todo', 'in_progress'), ('todo', 'submitted'), ('todo', 'approved'), ('todo', 'rejected'), ('in_progress', 'submitted'), ('in_progress', 'approved'),
                            ('in_progress', 'rejected'), ('submitted', 'approved'), ('submitted', 'rejected'), ('rejected', 'submitted'), ('rejected', 'approved'));
$$;

create function private.ob_review_transition_ok(p_from text, p_to text) returns boolean
language sql immutable set search_path = ''
as $$
  select (p_from, p_to) in (('draft', 'submitted'), ('rejected', 'draft'), ('rejected', 'submitted'), ('submitted', 'approved'), ('submitted', 'rejected'));
$$;

create function private.guard_ob_steps() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'onboarding steps cannot be deleted' using errcode = '23514'; end if;
  if new.instance_id <> old.instance_id or new.step_no <> old.step_no then raise exception 'step identity is immutable' using errcode = '23514'; end if;
  if new.version < old.version then raise exception 'step version cannot decrease' using errcode = '23514'; end if;
  if new.status <> old.status and not private.ob_step_transition_ok(old.status, new.status) then raise exception 'illegal step status transition' using errcode = '23514'; end if;
  if old.status = 'approved' and (new.status <> 'approved' or new.reviewed_by is distinct from old.reviewed_by) then raise exception 'an approved step is final' using errcode = '23514'; end if;
  return new;
end;
$$;

-- mapping and label designs: an approved row is final; other changes follow the review transitions
create function private.guard_ob_items() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'approved' then raise exception 'an approved item cannot be deleted' using errcode = '23514'; end if;
    return old;
  end if;
  if new.id <> old.id or new.organization_id <> old.organization_id or new.created_by <> old.created_by then raise exception 'item identity is immutable' using errcode = '23514'; end if;
  if old.status = 'approved' then raise exception 'an approved item is final' using errcode = '23514'; end if;
  if new.status <> old.status and not private.ob_review_transition_ok(old.status, new.status) then raise exception 'illegal item status transition' using errcode = '23514'; end if;
  return new;
end;
$$;

create function private.guard_ob_append_only() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '23514';
  return null;
end;
$$;

-- the tenant boundary for customer onboarding writes: NULL when the caller is an owner of an active organization, otherwise the refusal code
create function private.ob_owner_gate(p_org uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select case when p_org is null or not (p_org in (select private.my_org_ids())) or private.shop_org_ok(p_org) is not true then 'organization_not_found'
              when not private.pay_org_owner_ok(p_org) then 'owner_required' else null end;
$$;

create function private.ob_ensure_instance(p_org uuid) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  select i.id into v_id from public.onboarding_instances i where i.organization_id = p_org;
  if v_id is null then
    insert into public.onboarding_instances (organization_id) values (p_org) on conflict (organization_id) do nothing;
    select i.id into v_id from public.onboarding_instances i where i.organization_id = p_org;
  end if;
  insert into public.onboarding_steps (instance_id, step_no) select v_id, d.step_no from public.onboarding_step_defs d on conflict (instance_id, step_no) do nothing;
  return v_id;
end;
$$;

create function private.ob_event(p_instance uuid, p_step integer, p_event text, p_actor uuid, p_kind text, p_note text) returns void
language sql volatile security definer set search_path = ''
as $$
  insert into public.onboarding_events (instance_id, step_no, event, actor_user_id, actor_kind, note) values (p_instance, p_step, p_event, p_actor, p_kind, left(p_note, 500));
$$;

-- every prerequisite of the step is approved
create function private.ob_deps_ok(p_instance uuid, p_step integer) returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (select 1 from public.onboarding_step_defs d cross join lateral unnest(d.depends_on) dep(n)
                      where d.step_no = p_step and not exists (select 1 from public.onboarding_steps s where s.instance_id = p_instance and s.step_no = dep.n and s.status = 'approved'));
$$;

-- number of the given gates that are NOT currently recorded
create function private.ob_gates_missing(p_codes text[]) returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::int from unnest(p_codes) c(code) where not exists (select 1 from public.compliance_gates g where g.code = c.code and g.status = 'recorded');
$$;

create function private.ob_funding_met(p_org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.funding_requirements fr left join public.invoices i on i.id = fr.invoice_id
                  where fr.organization_id = p_org and (fr.status = 'waived' or (fr.type = 'credit_terms' and fr.status = 'met') or (fr.invoice_id is not null and i.status = 'paid')));
$$;

create function private.ob_setup_paid(p_org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.invoices i where i.organization_id = p_org and i.kind = 'setup' and i.status = 'paid')
      or exists (select 1 from public.funding_requirements fr where fr.organization_id = p_org and fr.type = 'waived');
$$;

-- Step 5 needs a sandbox test order, which arrives with the integration platform (P6, which replaces this function). Until then no organization is ready;
-- staff may approve step 5 directly after checking a test order by hand.
create function private.ob_test_order_ok(p_org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select false;
$$;

-- NULL when the customer may submit the step now, otherwise the refusal code
create function private.ob_step_ready(p_org uuid, p_instance uuid, p_step integer, p_data jsonb) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if p_step = 1 then
    return case when exists (select 1 from public.sku_mappings m where m.organization_id = p_org and m.status in ('draft', 'rejected', 'submitted', 'approved')) then null else 'nothing_to_submit' end;
  elsif p_step = 2 then
    return case when exists (select 1 from public.label_designs d where d.organization_id = p_org) then null else 'nothing_to_submit' end;
  elsif p_step = 3 then
    return case when exists (select 1 from public.packaging_selections s where s.organization_id = p_org) then null else 'nothing_to_submit' end;
  elsif p_step = 4 then
    return case when exists (select 1 from public.store_connections c where c.organization_id = p_org) then null else 'nothing_to_submit' end;
  elsif p_step = 5 then
    return case when private.ob_test_order_ok(p_org) then null else 'not_ready' end;
  elsif p_step = 7 then
    if not exists (select 1 from public.funding_requirements fr where fr.organization_id = p_org) then return 'not_ready'; end if;
    return case when coalesce(p_data ->> 'acknowledge', '') = 'true' then null else 'not_ready' end;
  elsif p_step = 8 then
    v_ok := jsonb_typeof(p_data -> 'contacts') = 'array' and jsonb_array_length(p_data -> 'contacts') between 1 and 5
        and jsonb_typeof(p_data -> 'escalation') = 'object' and private.shop_ship_to_ok(p_data -> 'returnAddress') is true
        and (p_data -> 'confirmations' ->> 'accurate') = 'true' and (p_data -> 'confirmations' ->> 'labelsApproved') = 'true' and (p_data -> 'confirmations' ->> 'terms') = 'true';
    return case when coalesce(v_ok, false) then null else 'not_ready' end;
  end if;
  return 'step_not_submittable';
end;
$$;

-- the whole onboarding state of one organization as JSON (customer and staff views share it; staff-only fields are added by the staff RPCs)
create function private.ob_state(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_inst  uuid;
  v_inst_status text;
  v_live  timestamptz;
begin
  select i.id, i.status, i.live_at into v_inst, v_inst_status, v_live from public.onboarding_instances i where i.organization_id = p_org;
  return jsonb_build_object(
    'started', v_inst is not null,
    'instance', jsonb_build_object('status', coalesce(v_inst_status, 'in_progress'), 'live_at', v_live),
    'steps', (select coalesce(jsonb_agg(jsonb_build_object('step_no', d.step_no, 'key', d.key, 'title', d.title, 'owner', d.owner, 'depends_on', d.depends_on,
                         'status', coalesce(s.status, 'todo'), 'version', coalesce(s.version, 0), 'submitted_at', s.submitted_at, 'review_reason', s.review_reason,
                         'review_instructions', s.review_instructions) order by d.step_no), '[]'::jsonb)
                from public.onboarding_step_defs d left join public.onboarding_steps s on s.instance_id = v_inst and s.step_no = d.step_no),
    'mappings', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'source', m.source, 'variant_id', m.variant_id, 'product_name', coalesce(m.product_name, pr.name),
                         'spec', coalesce(m.spec, v.spec), 'internal_sku', m.internal_sku, 'external_sku', m.external_sku, 'units_per_pack', m.units_per_pack,
                         'barcode', m.barcode, 'weight_grams', m.weight_grams, 'status', m.status, 'review_reason', m.review_reason) order by m.created_at), '[]'::jsonb)
                   from public.sku_mappings m left join public.product_variants v on v.id = m.variant_id left join public.products pr on pr.id = v.product_id
                  where m.organization_id = p_org),
    'labels', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'sku_mapping_id', l.sku_mapping_id, 'template', l.template, 'status', l.status, 'review_reason', l.review_reason,
                         'document_id', l.document_id, 'file_name', dc.file_name, 'storage_path', dc.storage_path) order by l.created_at), '[]'::jsonb)
                 from public.label_designs l join public.documents dc on dc.id = l.document_id where l.organization_id = p_org),
    'packaging', jsonb_build_object(
       'options', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'code', o.code, 'name', o.name, 'description', o.description, 'fee_cents', o.fee_cents) order by o.name), '[]'::jsonb)
                     from public.packaging_options o where o.active),
       'selection', (select jsonb_build_object('option_id', ps.option_id, 'notes', ps.notes) from public.packaging_selections ps where ps.organization_id = p_org)),
    'store', (select jsonb_build_object('method', c.method, 'store_url', c.store_url, 'webhook_url', c.webhook_url, 'notes', c.notes, 'status', c.status, 'review_reason', c.review_reason)
                from public.store_connections c where c.organization_id = p_org),
    'agreement', (select jsonb_build_object('status', a.status, 'signer_name', a.signer_name, 'signer_title', a.signer_title, 'signed_at', a.signed_at,
                         'offered_document', jsonb_build_object('id', od.id, 'file_name', od.file_name, 'storage_path', od.storage_path),
                         'signed_document', case when sd.id is null then null else jsonb_build_object('id', sd.id, 'file_name', sd.file_name, 'storage_path', sd.storage_path) end)
                    from public.onboarding_agreements a join public.documents od on od.id = a.offered_document_id left join public.documents sd on sd.id = a.signed_document_id
                   where a.organization_id = p_org),
    'funding', (select jsonb_build_object('type', fr.type, 'amount_cents', fr.amount_cents, 'status', fr.status, 'met', private.ob_funding_met(p_org),
                         'invoice_id', fr.invoice_id, 'invoice_number', fi.invoice_number, 'invoice_status', fi.status)
                  from public.funding_requirements fr left join public.invoices fi on fi.id = fr.invoice_id where fr.organization_id = p_org),
    'setup_invoice', (select jsonb_build_object('invoice_id', si.id, 'invoice_number', si.invoice_number, 'status', si.status, 'total_cents', si.total_cents, 'paid_cents', si.paid_cents)
                        from public.invoices si where si.organization_id = p_org and si.kind = 'setup' order by si.issued_at desc limit 1),
    'test_order_ready', private.ob_test_order_ok(p_org));
end;
$$;

create trigger onboarding_steps_guard before update or delete on public.onboarding_steps for each row execute function private.guard_ob_steps();
create trigger sku_mappings_guard before update or delete on public.sku_mappings for each row execute function private.guard_ob_items();
create trigger label_designs_guard before update or delete on public.label_designs for each row execute function private.guard_ob_items();
create trigger documents_append_only before update or delete on public.documents for each row execute function private.guard_ob_append_only();
create trigger onboarding_submissions_append_only before update or delete on public.onboarding_submissions for each row execute function private.guard_ob_append_only();
create trigger onboarding_events_append_only before update or delete on public.onboarding_events for each row execute function private.guard_ob_append_only();
create trigger onboarding_step_defs_append_only before update or delete on public.onboarding_step_defs for each row execute function private.guard_ob_append_only();
create trigger documents_no_truncate before truncate on public.documents for each statement execute function private.block_truncate();
create trigger onboarding_steps_no_truncate before truncate on public.onboarding_steps for each statement execute function private.block_truncate();
create trigger onboarding_submissions_no_truncate before truncate on public.onboarding_submissions for each statement execute function private.block_truncate();
create trigger onboarding_events_no_truncate before truncate on public.onboarding_events for each statement execute function private.block_truncate();
create trigger sku_mappings_no_truncate before truncate on public.sku_mappings for each statement execute function private.block_truncate();
create trigger label_designs_no_truncate before truncate on public.label_designs for each statement execute function private.block_truncate();
create trigger onboarding_instances_touch before update on public.onboarding_instances for each row execute function private.touch_updated_at();
create trigger onboarding_steps_touch before update on public.onboarding_steps for each row execute function private.touch_updated_at();
create trigger sku_mappings_touch before update on public.sku_mappings for each row execute function private.touch_updated_at();
create trigger label_designs_touch before update on public.label_designs for each row execute function private.touch_updated_at();
create trigger packaging_selections_touch before update on public.packaging_selections for each row execute function private.touch_updated_at();
create trigger store_connections_touch before update on public.store_connections for each row execute function private.touch_updated_at();
create trigger funding_requirements_touch before update on public.funding_requirements for each row execute function private.touch_updated_at();
create trigger compliance_gates_touch before update on public.compliance_gates for each row execute function private.touch_updated_at();

-- 6. Storage policies (policies run as the caller: only the four helpers that the API roles may execute are used) -------------------------------
create policy portal_documents_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'portal-documents' and split_part(name, '/', 1) in (select o::text from private.my_owner_org_ids() o));
create policy portal_documents_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'portal-documents' and private.staff_session_ok() and private.has_capability('onboarding.review'));
create policy portal_documents_member_select on storage.objects for select to authenticated
  using (bucket_id = 'portal-documents' and split_part(name, '/', 1) in (select o::text from private.my_org_ids() o));
create policy portal_documents_staff_select on storage.objects for select to authenticated
  using (bucket_id = 'portal-documents' and private.staff_session_ok() and private.has_capability('documents.read'));

-- 4b. The four invoice read RPCs now accept invoices without an order (left join) and return the invoice kind. Same signatures, so the P4 grants stay.

create or replace function public.rpc_invoices_list(p_organization_id uuid, p_limit integer default 50) returns jsonb
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
  select coalesce(jsonb_agg(jsonb_build_object('invoice_id', i.id, 'invoice_number', i.invoice_number, 'kind', i.kind, 'order_number', o.order_number, 'status', i.status,
                                               'total_cents', i.total_cents, 'paid_cents', i.paid_cents, 'issued_at', i.issued_at, 'due_at', i.due_at,
                                               'pending_payments', (select count(*) from public.payments p where p.invoice_id = i.id and p.status = 'reported'))
                            order by i.issued_at desc), '[]'::jsonb)
    into v_rows
    from (select x.id, x.invoice_number, x.order_id, x.kind, x.status, x.total_cents, x.paid_cents, x.issued_at, x.due_at from public.invoices x
           where x.organization_id = p_organization_id order by x.issued_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) i
    left join public.orders o on o.id = i.order_id;
  return jsonb_build_object('ok', true, 'invoices', v_rows);
end;
$$;

create or replace function public.rpc_invoice_get(p_organization_id uuid, p_invoice_id uuid) returns jsonb
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
  select x.id, x.invoice_number, x.order_id, x.kind, x.status, x.total_cents, x.paid_cents, x.currency, x.terms, x.issued_at, x.due_at, x.voided_at, x.void_reason, o.order_number
    into i from public.invoices x left join public.orders o on o.id = x.order_id where x.id = p_invoice_id and x.organization_id = p_organization_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'invoice_not_found'); end if;
  return jsonb_build_object('ok', true,
    'invoice', jsonb_build_object('invoice_id', i.id, 'invoice_number', i.invoice_number, 'order_id', i.order_id, 'kind', i.kind, 'order_number', i.order_number, 'status', i.status,
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

create or replace function public.rpc_admin_invoices_list(p_status text default null, p_limit integer default 100) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
  v_rows jsonb;
begin
  v_gate := private.staff_gate('org.billing.read', 'staff.invoice.list', false, 'invoice', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_status is not null and p_status not in ('open', 'partially_paid', 'paid', 'void') then raise exception 'invalid arguments' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('invoice_id', i.id, 'invoice_number', i.invoice_number, 'kind', i.kind, 'order_number', o.order_number, 'organization_id', g.id,
                                               'organization_name', g.name, 'organization_code', g.code, 'status', i.status, 'total_cents', i.total_cents,
                                               'paid_cents', i.paid_cents, 'issued_at', i.issued_at, 'due_at', i.due_at,
                                               'pending_payments', (select count(*) from public.payments p where p.invoice_id = i.id and p.status = 'reported'))
                            order by i.issued_at desc), '[]'::jsonb)
    into v_rows
    from (select x.id, x.invoice_number, x.order_id, x.kind, x.organization_id, x.status, x.total_cents, x.paid_cents, x.issued_at, x.due_at from public.invoices x
           where p_status is null or x.status = p_status order by x.issued_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) i
    left join public.orders o on o.id = i.order_id
    join public.organizations g on g.id = i.organization_id;
  return jsonb_build_object('ok', true, 'invoices', v_rows);
end;
$$;

create or replace function public.rpc_admin_invoice_get(p_invoice_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
  i      record;
begin
  v_gate := private.staff_gate('org.billing.read', 'staff.invoice.get', false, 'invoice', p_invoice_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  select x.id, x.invoice_number, x.order_id, x.kind, x.organization_id, x.status, x.total_cents, x.paid_cents, x.currency, x.terms, x.issued_at, x.due_at, x.voided_at, x.void_reason,
         o.order_number, g.name as org_name, g.code as org_code into i
    from public.invoices x left join public.orders o on o.id = x.order_id join public.organizations g on g.id = x.organization_id where x.id = p_invoice_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'invoice_not_found'); end if;
  return jsonb_build_object('ok', true,
    'invoice', jsonb_build_object('invoice_id', i.id, 'invoice_number', i.invoice_number, 'order_id', i.order_id, 'kind', i.kind, 'order_number', i.order_number, 'status', i.status,
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


-- 7. Customer RPCs ------------------------------------------------------------------------------------------------------------------------
-- The state of the organization's onboarding. Any member may read; an owner starts it (creates the nine step rows) on first view.
create function public.rpc_onboarding_get(p_organization_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not (p_organization_id in (select private.my_org_ids())) or private.shop_org_ok(p_organization_id) is not true then
    return jsonb_build_object('ok', false, 'code', 'organization_not_found');
  end if;
  if private.pay_org_owner_ok(p_organization_id) then perform private.ob_ensure_instance(p_organization_id); end if;
  return jsonb_build_object('ok', true, 'state', private.ob_state(p_organization_id), 'can_edit', private.pay_org_owner_ok(p_organization_id));
end;
$$;

create function public.rpc_document_register(p_organization_id uuid, p_document_id uuid, p_kind text, p_file_name text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_name  text := nullif(btrim(coalesce(p_file_name, '')), '');
  v_path  text;
  v_size  bigint;
  v_type  text;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_document_id is null or p_kind is null or p_kind not in ('label_artwork', 'agreement_signed', 'payment_proof', 'other') or v_name is null or char_length(v_name) > 200 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  v_gate := private.ob_owner_gate(p_organization_id);
  if v_gate is not null then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  select o.name, (o.metadata ->> 'size')::bigint, o.metadata ->> 'mimetype' into v_path, v_size, v_type
    from storage.objects o where o.bucket_id = 'portal-documents' and o.name like p_organization_id::text || '/' || p_document_id::text || '.%';
  if v_path is null then return jsonb_build_object('ok', false, 'code', 'document_not_found'); end if;
  if v_type is null or v_type not in ('application/pdf', 'image/png', 'image/jpeg') or v_size is null or v_size < 1 or v_size > 10485760 then
    return jsonb_build_object('ok', false, 'code', 'document_invalid');
  end if;
  insert into public.documents (id, organization_id, kind, file_name, content_type, size_bytes, storage_path, uploaded_by, uploader_kind)
  values (p_document_id, p_organization_id, p_kind, v_name, v_type, v_size, v_path, v_actor, 'organization_user') on conflict (id) do nothing;
  perform private.write_audit(v_actor, 'organization_user', 'document.register', 'success', p_organization_id, 'document', p_document_id::text, jsonb_build_object('kind', p_kind, 'size_bytes', v_size));
  return jsonb_build_object('ok', true, 'code', 'registered', 'document_id', p_document_id);
end;
$$;

create function public.rpc_sku_mapping_save(p_organization_id uuid, p_id uuid, p_source text, p_variant_id uuid, p_product_name text, p_spec text, p_external_sku text,
                                            p_units_per_pack integer, p_barcode text, p_weight_grams integer) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_name  text := nullif(btrim(coalesce(p_product_name, '')), '');
  v_spec  text := nullif(btrim(coalesce(p_spec, '')), '');
  v_sku   text := btrim(coalesce(p_external_sku, ''));
  v_id    uuid;
  v_status text;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_source is null or p_source not in ('catalog', 'private') or v_sku !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$' or p_units_per_pack is null or p_units_per_pack not between 1 and 10000
     or (p_source = 'catalog' and (p_variant_id is null or v_name is not null)) or (p_source = 'private' and (p_variant_id is not null or v_name is null))
     or (v_name is not null and char_length(v_name) > 160) or (v_spec is not null and char_length(v_spec) > 120)
     or (p_barcode is not null and p_barcode !~ '^[0-9]{8,14}$') or (p_weight_grams is not null and p_weight_grams not between 1 and 100000) then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  v_gate := private.ob_owner_gate(p_organization_id);
  if v_gate is not null then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_source = 'catalog' and not exists (select 1 from public.product_variants v join public.organization_products op on op.product_id = v.product_id and op.organization_id = p_organization_id
                                           where v.id = p_variant_id and op.available) then
    return jsonb_build_object('ok', false, 'code', 'not_available');
  end if;
  perform private.ob_ensure_instance(p_organization_id);
  begin
    if p_id is null then
      insert into public.sku_mappings (organization_id, source, variant_id, product_name, spec, external_sku, units_per_pack, barcode, weight_grams, created_by)
      values (p_organization_id, p_source, p_variant_id, v_name, v_spec, v_sku, p_units_per_pack, p_barcode, p_weight_grams, v_actor) returning id into v_id;
    else
      select m.status into v_status from public.sku_mappings m where m.id = p_id and m.organization_id = p_organization_id for update;
      if not found then return jsonb_build_object('ok', false, 'code', 'mapping_not_found'); end if;
      if v_status not in ('draft', 'rejected') then return jsonb_build_object('ok', false, 'code', 'step_not_submittable'); end if;
      update public.sku_mappings set source = p_source, variant_id = p_variant_id, product_name = v_name, spec = v_spec, external_sku = v_sku, units_per_pack = p_units_per_pack,
                                     barcode = p_barcode, weight_grams = p_weight_grams, status = 'draft', review_reason = null where id = p_id;
      v_id := p_id;
    end if;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'duplicate_sku');
  end;
  perform private.write_audit(v_actor, 'organization_user', 'onboarding.sku.save', 'success', p_organization_id, 'sku_mapping', v_id::text, jsonb_build_object('external_sku', v_sku));
  return jsonb_build_object('ok', true, 'code', 'saved', 'id', v_id);
end;
$$;

create function public.rpc_sku_mapping_delete(p_organization_id uuid, p_id uuid) returns jsonb
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
  select m.status into v_status from public.sku_mappings m where m.id = p_id and m.organization_id = p_organization_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'mapping_not_found'); end if;
  if v_status not in ('draft', 'rejected') or exists (select 1 from public.label_designs d where d.sku_mapping_id = p_id) then return jsonb_build_object('ok', false, 'code', 'step_not_submittable'); end if;
  delete from public.sku_mappings where id = p_id;
  perform private.write_audit(v_actor, 'organization_user', 'onboarding.sku.delete', 'success', p_organization_id, 'sku_mapping', p_id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'code', 'deleted');
end;
$$;

create function public.rpc_label_design_add(p_organization_id uuid, p_sku_mapping_id uuid, p_template text, p_document_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_id    uuid;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_template is null or p_template not in ('ml3', 'ml10') or p_sku_mapping_id is null or p_document_id is null then raise exception 'invalid arguments' using errcode = '22023'; end if;
  v_gate := private.ob_owner_gate(p_organization_id);
  if v_gate is not null then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if not exists (select 1 from public.sku_mappings m where m.id = p_sku_mapping_id and m.organization_id = p_organization_id) then return jsonb_build_object('ok', false, 'code', 'mapping_not_found'); end if;
  if not exists (select 1 from public.documents dc where dc.id = p_document_id and dc.organization_id = p_organization_id and dc.kind = 'label_artwork') then return jsonb_build_object('ok', false, 'code', 'document_not_found'); end if;
  perform private.ob_ensure_instance(p_organization_id);
  insert into public.label_designs (organization_id, sku_mapping_id, template, document_id, created_by) values (p_organization_id, p_sku_mapping_id, p_template, p_document_id, v_actor) returning id into v_id;
  perform private.write_audit(v_actor, 'organization_user', 'onboarding.label.add', 'success', p_organization_id, 'label_design', v_id::text, jsonb_build_object('template', p_template));
  return jsonb_build_object('ok', true, 'code', 'saved', 'id', v_id);
end;
$$;

create function public.rpc_packaging_select(p_organization_id uuid, p_option_id uuid, p_notes text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_option_id is null or (v_notes is not null and char_length(v_notes) > 300) then raise exception 'invalid arguments' using errcode = '22023'; end if;
  v_gate := private.ob_owner_gate(p_organization_id);
  if v_gate is not null then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if not exists (select 1 from public.packaging_options o where o.id = p_option_id and o.active) then return jsonb_build_object('ok', false, 'code', 'option_not_found'); end if;
  perform private.ob_ensure_instance(p_organization_id);
  insert into public.packaging_selections (organization_id, option_id, notes, selected_by) values (p_organization_id, p_option_id, v_notes, v_actor)
  on conflict (organization_id) do update set option_id = excluded.option_id, notes = excluded.notes, selected_by = excluded.selected_by;
  perform private.write_audit(v_actor, 'organization_user', 'onboarding.packaging.select', 'success', p_organization_id, 'packaging_option', p_option_id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'code', 'saved');
end;
$$;

create function public.rpc_store_connection_save(p_organization_id uuid, p_method text, p_store_url text, p_webhook_url text, p_notes text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_store text := nullif(btrim(coalesce(p_store_url, '')), '');
  v_hook  text := nullif(btrim(coalesce(p_webhook_url, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_method is null or p_method not in ('api', 'woocommerce', 'shopify', 'manual') or (p_method <> 'manual' and v_store is null)
     or (v_store is not null and (v_store !~ '^https://' or char_length(v_store) > 300)) or (v_hook is not null and (v_hook !~ '^https://' or char_length(v_hook) > 300))
     or (v_notes is not null and char_length(v_notes) > 500) then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  v_gate := private.ob_owner_gate(p_organization_id);
  if v_gate is not null then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  perform private.ob_ensure_instance(p_organization_id);
  insert into public.store_connections (organization_id, method, store_url, webhook_url, notes, status, updated_by)
  values (p_organization_id, p_method, v_store, v_hook, v_notes, 'draft', v_actor)
  on conflict (organization_id) do update set method = excluded.method, store_url = excluded.store_url, webhook_url = excluded.webhook_url, notes = excluded.notes,
                                              status = 'draft', review_reason = null, updated_by = excluded.updated_by;
  perform private.write_audit(v_actor, 'organization_user', 'onboarding.store.save', 'success', p_organization_id, 'store_connection', p_organization_id::text, jsonb_build_object('method', p_method));
  return jsonb_build_object('ok', true, 'code', 'saved');
end;
$$;

-- Signing is a typed name and title (and optionally an uploaded signed copy). Staff verify it when they approve step 6; the agreement itself is offered by staff.
create function public.rpc_agreement_accept(p_organization_id uuid, p_signer_name text, p_signer_title text, p_signed_document_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_name  text := nullif(btrim(coalesce(p_signer_name, '')), '');
  v_title text := nullif(btrim(coalesce(p_signer_title, '')), '');
  v_status text;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if v_name is null or v_title is null or char_length(v_name) > 120 or char_length(v_title) > 120 then raise exception 'invalid arguments' using errcode = '22023'; end if;
  v_gate := private.ob_owner_gate(p_organization_id);
  if v_gate is not null then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  select a.status into v_status from public.onboarding_agreements a where a.organization_id = p_organization_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_ready'); end if;
  if v_status = 'signed' then return jsonb_build_object('ok', false, 'code', 'already_reviewed'); end if;
  if p_signed_document_id is not null and not exists (select 1 from public.documents dc where dc.id = p_signed_document_id and dc.organization_id = p_organization_id and dc.kind = 'agreement_signed') then
    return jsonb_build_object('ok', false, 'code', 'document_not_found');
  end if;
  update public.onboarding_agreements set status = 'signed', signer_name = v_name, signer_title = v_title, signed_by = v_actor, signed_at = clock_timestamp(), signed_document_id = p_signed_document_id
   where organization_id = p_organization_id;
  perform private.ob_event((select i.id from public.onboarding_instances i where i.organization_id = p_organization_id), 6, 'agreement.signed', v_actor, 'organization_user', null);
  perform private.write_audit(v_actor, 'organization_user', 'onboarding.agreement.accept', 'success', p_organization_id, 'agreement', p_organization_id::text, jsonb_build_object('signer_title', v_title));
  return jsonb_build_object('ok', true, 'code', 'signed');
end;
$$;

-- Submit a customer-owned step (1 to 5, 7, 8) for staff review. The database re-checks the lock, the preconditions and the data.
create function public.rpc_onboarding_step_submit(p_organization_id uuid, p_step_no integer, p_data jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_inst   uuid;
  v_status text;
  v_ver    integer;
  v_code   text;
  v_data   jsonb := coalesce(p_data, '{}'::jsonb);
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_step_no is null or p_step_no not in (1, 2, 3, 4, 5, 7, 8) or jsonb_typeof(v_data) <> 'object' or pg_column_size(v_data) > 16384 then raise exception 'invalid arguments' using errcode = '22023'; end if;
  v_gate := private.ob_owner_gate(p_organization_id);
  if v_gate is not null then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  v_inst := private.ob_ensure_instance(p_organization_id);
  select s.status, s.version into v_status, v_ver from public.onboarding_steps s where s.instance_id = v_inst and s.step_no = p_step_no for update;
  if v_status not in ('todo', 'in_progress', 'rejected') then return jsonb_build_object('ok', false, 'code', 'step_not_submittable'); end if;
  if not private.ob_deps_ok(v_inst, p_step_no) then return jsonb_build_object('ok', false, 'code', 'step_locked'); end if;
  v_code := private.ob_step_ready(p_organization_id, v_inst, p_step_no, v_data);
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;
  v_ver := v_ver + 1;
  insert into public.onboarding_submissions (instance_id, step_no, version, data, submitted_by) values (v_inst, p_step_no, v_ver, v_data, v_actor);
  update public.onboarding_steps set status = 'submitted', version = v_ver, submitted_at = clock_timestamp(), submitted_by = v_actor, reviewed_at = null, reviewed_by = null,
                                     review_reason = null, review_instructions = null where instance_id = v_inst and step_no = p_step_no;
  if p_step_no = 1 then update public.sku_mappings set status = 'submitted' where organization_id = p_organization_id and status in ('draft', 'rejected'); end if;
  if p_step_no = 2 then update public.label_designs set status = 'submitted' where organization_id = p_organization_id and status in ('draft', 'rejected'); end if;
  if p_step_no = 4 then update public.store_connections set status = 'submitted' where organization_id = p_organization_id and status in ('draft', 'rejected'); end if;
  perform private.ob_event(v_inst, p_step_no, 'step.submitted', v_actor, 'organization_user', null);
  perform private.write_audit(v_actor, 'organization_user', 'onboarding.step.submit', 'success', p_organization_id, 'onboarding_step', p_step_no::text, jsonb_build_object('version', v_ver));
  return jsonb_build_object('ok', true, 'code', 'submitted', 'version', v_ver);
end;
$$;

-- 8. Staff RPCs ---------------------------------------------------------------------------------------------------------------------------
create function public.rpc_admin_onboarding_list() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
  v_rows jsonb;
begin
  v_gate := private.staff_gate('onboarding.review', 'staff.onboarding.list', false, 'onboarding', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  select coalesce(jsonb_agg(jsonb_build_object('organization_id', g.id, 'organization_name', g.name, 'organization_code', g.code, 'started', i.id is not null,
                                               'status', coalesce(i.status, 'in_progress'),
                                               'approved', (select count(*)::int from public.onboarding_steps s where s.instance_id = i.id and s.status = 'approved'),
                                               'submitted_steps', (select coalesce(jsonb_agg(s.step_no order by s.step_no), '[]'::jsonb) from public.onboarding_steps s where s.instance_id = i.id and s.status = 'submitted'))
                            order by g.name), '[]'::jsonb)
    into v_rows from public.organizations g left join public.onboarding_instances i on i.organization_id = g.id where g.status = 'active';
  return jsonb_build_object('ok', true, 'organizations', v_rows);
end;
$$;

create function public.rpc_admin_onboarding_get(p_organization_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
  g      record;
begin
  v_gate := private.staff_gate('onboarding.review', 'staff.onboarding.get', false, 'organization', p_organization_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  select o.id, o.name, o.code, o.payment_terms into g from public.organizations o where o.id = p_organization_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  return jsonb_build_object('ok', true, 'organization', jsonb_build_object('id', g.id, 'name', g.name, 'code', g.code, 'payment_terms', g.payment_terms),
    'state', private.ob_state(p_organization_id),
    'gates', (select coalesce(jsonb_agg(jsonb_build_object('code', x.code, 'status', x.status, 'note', x.note, 'recorded_at', x.recorded_at) order by x.code), '[]'::jsonb) from public.compliance_gates x),
    'submissions', (select coalesce(jsonb_agg(jsonb_build_object('step_no', su.step_no, 'version', su.version, 'data', su.data, 'submitted_at', su.submitted_at) order by su.step_no, su.version), '[]'::jsonb)
                      from public.onboarding_submissions su join public.onboarding_instances ii on ii.id = su.instance_id where ii.organization_id = p_organization_id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('step_no', e.step_no, 'event', e.event, 'actor_kind', e.actor_kind, 'note', e.note, 'at', e.created_at) order by e.created_at), '[]'::jsonb)
                 from public.onboarding_events e join public.onboarding_instances ii on ii.id = e.instance_id where ii.organization_id = p_organization_id));
end;
$$;

create function public.rpc_admin_document_register(p_organization_id uuid, p_document_id uuid, p_kind text, p_file_name text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_name  text := nullif(btrim(coalesce(p_file_name, '')), '');
  v_path  text;
  v_size  bigint;
  v_type  text;
begin
  v_gate := private.staff_gate('onboarding.review', 'staff.document.register', false, 'document', p_document_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_organization_id is null or p_document_id is null or p_kind is null or p_kind not in ('agreement', 'certificate', 'gate_evidence', 'other') or v_name is null or char_length(v_name) > 200 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organizations g where g.id = p_organization_id) then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  select o.name, (o.metadata ->> 'size')::bigint, o.metadata ->> 'mimetype' into v_path, v_size, v_type
    from storage.objects o where o.bucket_id = 'portal-documents' and o.name like p_organization_id::text || '/' || p_document_id::text || '.%';
  if v_path is null then return jsonb_build_object('ok', false, 'code', 'document_not_found'); end if;
  if v_type is null or v_type not in ('application/pdf', 'image/png', 'image/jpeg') or v_size is null or v_size < 1 or v_size > 10485760 then return jsonb_build_object('ok', false, 'code', 'document_invalid'); end if;
  insert into public.documents (id, organization_id, kind, file_name, content_type, size_bytes, storage_path, uploaded_by, uploader_kind)
  values (p_document_id, p_organization_id, p_kind, v_name, v_type, v_size, v_path, v_actor, 'staff') on conflict (id) do nothing;
  perform private.write_audit(v_actor, 'staff', 'staff.document.register', 'success', p_organization_id, 'document', p_document_id::text, jsonb_build_object('kind', p_kind));
  return jsonb_build_object('ok', true, 'code', 'registered', 'document_id', p_document_id);
end;
$$;

create function public.rpc_admin_agreement_offer(p_organization_id uuid, p_document_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_status text;
begin
  v_gate := private.staff_gate('onboarding.review', 'staff.agreement.offer', false, 'organization', p_organization_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_organization_id is null or p_document_id is null then raise exception 'invalid arguments' using errcode = '22023'; end if;
  if not exists (select 1 from public.documents dc where dc.id = p_document_id and dc.organization_id = p_organization_id and dc.kind = 'agreement') then return jsonb_build_object('ok', false, 'code', 'document_not_found'); end if;
  perform private.ob_ensure_instance(p_organization_id);
  select a.status into v_status from public.onboarding_agreements a where a.organization_id = p_organization_id for update;
  if v_status = 'signed' then return jsonb_build_object('ok', false, 'code', 'already_reviewed'); end if;
  insert into public.onboarding_agreements (organization_id, offered_document_id, offered_by) values (p_organization_id, p_document_id, v_actor)
  on conflict (organization_id) do update set offered_document_id = excluded.offered_document_id, offered_by = excluded.offered_by, offered_at = clock_timestamp();
  perform private.ob_event((select i.id from public.onboarding_instances i where i.organization_id = p_organization_id), 6, 'agreement.offered', v_actor, 'staff', null);
  perform private.write_audit(v_actor, 'staff', 'staff.agreement.offer', 'success', p_organization_id, 'agreement', p_organization_id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'code', 'offered');
end;
$$;

create function public.rpc_admin_mapping_review(p_id uuid, p_decision text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_org    uuid;
  v_status text;
begin
  v_gate := private.staff_gate('onboarding.review', 'staff.mapping.review', false, 'sku_mapping', p_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_id is null or p_decision is null or p_decision not in ('approve', 'reject') or (p_decision = 'reject' and v_reason is null) or (v_reason is not null and char_length(v_reason) > 300) then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  select m.organization_id, m.status into v_org, v_status from public.sku_mappings m where m.id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'mapping_not_found'); end if;
  if v_status <> 'submitted' then return jsonb_build_object('ok', false, 'code', 'nothing_to_review'); end if;
  update public.sku_mappings set status = case when p_decision = 'approve' then 'approved' else 'rejected' end, review_reason = case when p_decision = 'reject' then v_reason else null end, reviewed_by = v_actor where id = p_id;
  perform private.write_audit(v_actor, 'staff', 'staff.mapping.review', 'success', v_org, 'sku_mapping', p_id::text, jsonb_build_object('decision', p_decision));
  return jsonb_build_object('ok', true, 'code', p_decision);
end;
$$;

create function public.rpc_admin_label_review(p_id uuid, p_decision text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_org    uuid;
  v_status text;
begin
  v_gate := private.staff_gate('onboarding.review', 'staff.label.review', false, 'label_design', p_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_id is null or p_decision is null or p_decision not in ('approve', 'reject') or (p_decision = 'reject' and v_reason is null) or (v_reason is not null and char_length(v_reason) > 300) then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  select d.organization_id, d.status into v_org, v_status from public.label_designs d where d.id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'label_not_found'); end if;
  if v_status <> 'submitted' then return jsonb_build_object('ok', false, 'code', 'nothing_to_review'); end if;
  if p_decision = 'approve' and private.ob_gates_missing(array['G2']) > 0 then return jsonb_build_object('ok', false, 'code', 'gate_required'); end if;
  update public.label_designs set status = case when p_decision = 'approve' then 'approved' else 'rejected' end, review_reason = case when p_decision = 'reject' then v_reason else null end, reviewed_by = v_actor where id = p_id;
  perform private.write_audit(v_actor, 'staff', 'staff.label.review', 'success', v_org, 'label_design', p_id::text, jsonb_build_object('decision', p_decision));
  return jsonb_build_object('ok', true, 'code', p_decision);
end;
$$;

-- Decide a step. Customer steps need a submission to review; the staff-owned step 6 can be decided once unlocked. Step 9 is decided only by rpc_admin_go_live.
create function public.rpc_admin_step_review(p_organization_id uuid, p_step_no integer, p_decision text, p_reason text, p_instructions text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_instr  text := nullif(btrim(coalesce(p_instructions, '')), '');
  v_inst   uuid;
  v_status text;
  v_by     uuid;
  v_owner  text;
begin
  v_gate := private.staff_gate('onboarding.review', 'staff.step.review', false, 'onboarding_step', p_organization_id::text || ':' || coalesce(p_step_no::text, ''));
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_organization_id is null or p_step_no is null or p_step_no not between 1 and 8 or p_decision is null or p_decision not in ('approve', 'reject') or (p_decision = 'reject' and v_reason is null)
     or (v_reason is not null and char_length(v_reason) > 300) or (v_instr is not null and char_length(v_instr) > 500) then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  select i.id into v_inst from public.onboarding_instances i where i.organization_id = p_organization_id;
  if v_inst is null then return jsonb_build_object('ok', false, 'code', 'nothing_to_review'); end if;
  select s.status, s.submitted_by, d.owner into v_status, v_by, v_owner from public.onboarding_steps s join public.onboarding_step_defs d on d.step_no = s.step_no
   where s.instance_id = v_inst and s.step_no = p_step_no for update of s;
  if v_status = 'approved' then return jsonb_build_object('ok', false, 'code', 'already_reviewed'); end if;
  if not private.ob_deps_ok(v_inst, p_step_no) then return jsonb_build_object('ok', false, 'code', 'step_locked'); end if;
  if v_owner = 'customer' and v_status <> 'submitted' and not (p_step_no = 5 and p_decision = 'approve') then return jsonb_build_object('ok', false, 'code', 'nothing_to_review'); end if;
  if v_by is not null and v_by = v_actor then return jsonb_build_object('ok', false, 'code', 'same_person'); end if;
  if p_decision = 'approve' then
    if p_step_no = 1 and (not exists (select 1 from public.sku_mappings m where m.organization_id = p_organization_id and m.status = 'approved')
                          or exists (select 1 from public.sku_mappings m where m.organization_id = p_organization_id and m.status = 'submitted')) then return jsonb_build_object('ok', false, 'code', 'not_ready'); end if;
    if p_step_no = 2 then
      if private.ob_gates_missing(array['G2']) > 0 then return jsonb_build_object('ok', false, 'code', 'gate_required'); end if;
      if not exists (select 1 from public.label_designs d where d.organization_id = p_organization_id and d.status = 'approved')
         or exists (select 1 from public.label_designs d where d.organization_id = p_organization_id and d.status = 'submitted') then return jsonb_build_object('ok', false, 'code', 'not_ready'); end if;
    end if;
    if p_step_no = 3 and not exists (select 1 from public.packaging_selections ps where ps.organization_id = p_organization_id) then return jsonb_build_object('ok', false, 'code', 'not_ready'); end if;
    if p_step_no = 4 then
      if not exists (select 1 from public.store_connections c where c.organization_id = p_organization_id) then return jsonb_build_object('ok', false, 'code', 'not_ready'); end if;
      update public.store_connections set status = 'verified', review_reason = null where organization_id = p_organization_id;
    end if;
    if p_step_no = 6 then
      if not exists (select 1 from public.onboarding_agreements a where a.organization_id = p_organization_id and a.status = 'signed') then return jsonb_build_object('ok', false, 'code', 'agreement_not_signed'); end if;
      if not private.ob_setup_paid(p_organization_id) then return jsonb_build_object('ok', false, 'code', 'setup_unpaid'); end if;
    end if;
    if p_step_no = 7 and not private.ob_funding_met(p_organization_id) then return jsonb_build_object('ok', false, 'code', 'funding_unmet'); end if;
    update public.onboarding_steps set status = 'approved', reviewed_at = clock_timestamp(), reviewed_by = v_actor, review_reason = null, review_instructions = null
     where instance_id = v_inst and step_no = p_step_no;
  else
    if p_step_no = 4 then update public.store_connections set status = 'rejected', review_reason = v_reason where organization_id = p_organization_id; end if;
    update public.onboarding_steps set status = 'rejected', reviewed_at = clock_timestamp(), reviewed_by = v_actor, review_reason = v_reason, review_instructions = v_instr
     where instance_id = v_inst and step_no = p_step_no;
  end if;
  perform private.ob_event(v_inst, p_step_no, case when p_decision = 'approve' then 'step.approved' else 'step.rejected' end, v_actor, 'staff', v_reason);
  perform private.write_audit(v_actor, 'staff', 'staff.step.review', 'success', p_organization_id, 'onboarding_step', p_step_no::text, jsonb_build_object('decision', p_decision));
  return jsonb_build_object('ok', true, 'code', p_decision);
end;
$$;

-- Creates the setup-fee invoice and the funding invoice together with the funding requirement (one per organization). Amounts of zero create no invoice.
create function public.rpc_admin_setup_invoices_create(p_organization_id uuid, p_setup_cents bigint, p_funding_cents bigint) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_setup uuid;
  v_fund  uuid;
begin
  v_gate := private.staff_gate('financial.write', 'staff.setup.invoices', true, 'organization', p_organization_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_organization_id is null or p_setup_cents is null or p_funding_cents is null or p_setup_cents < 0 or p_funding_cents < 0 or p_setup_cents > 1000000000000 or p_funding_cents > 1000000000000
     or p_setup_cents + p_funding_cents = 0 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organizations g where g.id = p_organization_id and g.status = 'active') then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  if exists (select 1 from public.funding_requirements fr where fr.organization_id = p_organization_id) or exists (select 1 from public.invoices i where i.organization_id = p_organization_id and i.kind in ('setup', 'funding')) then
    return jsonb_build_object('ok', false, 'code', 'invoice_exists');
  end if;
  perform private.ob_ensure_instance(p_organization_id);
  if p_setup_cents > 0 then v_setup := private.ob_fee_invoice_create(p_organization_id, 'setup', 'Fulfillment setup fee', p_setup_cents); end if;
  if p_funding_cents > 0 then v_fund := private.ob_fee_invoice_create(p_organization_id, 'funding', 'Prepaid funding requirement', p_funding_cents); end if;
  if v_fund is not null then
    insert into public.funding_requirements (organization_id, type, amount_cents, invoice_id, set_by) values (p_organization_id, 'prepay_invoice', p_funding_cents, v_fund, v_actor);
  else
    insert into public.funding_requirements (organization_id, type, amount_cents, status, reason, set_by) values (p_organization_id, 'waived', 0, 'waived', 'no funding amount required', v_actor);
  end if;
  perform private.ob_event((select i.id from public.onboarding_instances i where i.organization_id = p_organization_id), 6, 'setup.invoices.created', v_actor, 'staff', null);
  perform private.write_audit(v_actor, 'staff', 'staff.setup.invoices', 'success', p_organization_id, 'organization', p_organization_id::text, jsonb_build_object('setup_cents', p_setup_cents, 'funding_cents', p_funding_cents));
  return jsonb_build_object('ok', true, 'code', 'created');
end;
$$;

-- Staff decision that replaces an invoice-based funding requirement: a waiver or approved credit terms, with a recorded reason.
create function public.rpc_admin_funding_set(p_organization_id uuid, p_type text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  v_gate := private.staff_gate('financial.write', 'staff.funding.set', true, 'organization', p_organization_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_organization_id is null or p_type is null or p_type not in ('waived', 'credit_terms') or v_reason is null or char_length(v_reason) > 300 then raise exception 'invalid arguments' using errcode = '22023'; end if;
  if not exists (select 1 from public.organizations g where g.id = p_organization_id and g.status = 'active') then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  perform private.ob_ensure_instance(p_organization_id);
  insert into public.funding_requirements (organization_id, type, amount_cents, status, reason, set_by)
  values (p_organization_id, p_type, 0, case when p_type = 'waived' then 'waived' else 'met' end, v_reason, v_actor)
  on conflict (organization_id) do update set type = excluded.type, status = excluded.status, reason = excluded.reason, set_by = excluded.set_by, invoice_id = null;
  perform private.ob_event((select i.id from public.onboarding_instances i where i.organization_id = p_organization_id), 7, 'funding.' || p_type, v_actor, 'staff', v_reason);
  perform private.write_audit(v_actor, 'staff', 'staff.funding.set', 'success', p_organization_id, 'organization', p_organization_id::text, jsonb_build_object('type', p_type));
  return jsonb_build_object('ok', true, 'code', 'set');
end;
$$;

create function public.rpc_admin_gates_list() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
begin
  v_gate := private.staff_gate('gates.read', 'staff.gates.list', false, 'gate', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  return jsonb_build_object('ok', true, 'gates', (select coalesce(jsonb_agg(jsonb_build_object('code', g.code, 'status', g.status, 'note', g.note, 'recorded_at', g.recorded_at) order by g.code), '[]'::jsonb) from public.compliance_gates g));
end;
$$;

create function public.rpc_admin_gate_record(p_code text, p_status text, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
begin
  v_gate := private.staff_gate('gates.write', 'staff.gate.record', true, 'gate', p_code);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_code is null or p_code not in ('G1', 'G2', 'G3', 'G4', 'G5', 'G6') or p_status is null or p_status not in ('recorded', 'revoked') or v_note is null or char_length(v_note) > 500 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  update public.compliance_gates set status = p_status, note = v_note, recorded_by = v_actor, recorded_at = clock_timestamp() where code = p_code;
  perform private.write_audit(v_actor, 'staff', 'staff.gate.record', 'success', null, 'gate', p_code, jsonb_build_object('status', p_status));
  return jsonb_build_object('ok', true, 'code', p_status);
end;
$$;

-- Go live: steps 1 to 8 approved and gates G1, G2, G4, G5, G6 recorded. Admin only (onboarding.golive) with a fresh step-up.
create function public.rpc_admin_go_live(p_organization_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_inst   uuid;
  v_status text;
begin
  v_gate := private.staff_gate('onboarding.golive', 'staff.onboarding.golive', true, 'organization', p_organization_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_organization_id is null then raise exception 'invalid arguments' using errcode = '22023'; end if;
  select i.id, i.status into v_inst, v_status from public.onboarding_instances i where i.organization_id = p_organization_id for update;
  if v_inst is null then return jsonb_build_object('ok', false, 'code', 'not_all_approved'); end if;
  if v_status = 'live' then return jsonb_build_object('ok', false, 'code', 'already_live'); end if;
  if not private.ob_deps_ok(v_inst, 9) then return jsonb_build_object('ok', false, 'code', 'not_all_approved'); end if;
  if private.ob_gates_missing(array['G1', 'G2', 'G4', 'G5', 'G6']) > 0 then return jsonb_build_object('ok', false, 'code', 'gate_required'); end if;
  update public.onboarding_steps set status = 'approved', reviewed_at = clock_timestamp(), reviewed_by = v_actor where instance_id = v_inst and step_no = 9;
  update public.onboarding_instances set status = 'live', live_at = clock_timestamp(), live_by = v_actor where id = v_inst;
  perform private.ob_event(v_inst, 9, 'go_live', v_actor, 'staff', null);
  perform private.write_audit(v_actor, 'staff', 'staff.onboarding.golive', 'success', p_organization_id, 'organization', p_organization_id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'code', 'live');
end;
$$;

-- 9. Privileges ---------------------------------------------------------------------------------------------------------------------------
revoke all on table public.documents, public.onboarding_step_defs, public.onboarding_instances, public.onboarding_steps, public.onboarding_submissions, public.onboarding_events,
                    public.sku_mappings, public.label_designs, public.packaging_options, public.packaging_selections, public.store_connections, public.onboarding_agreements,
                    public.funding_requirements, public.compliance_gates from public, anon, authenticated, service_role;
revoke all on sequence public.fulfillment_sku_seq from public, anon, authenticated, service_role;

revoke all on function private.ob_fee_invoice_create(uuid, text, text, bigint), private.ob_step_transition_ok(text, text), private.ob_review_transition_ok(text, text),
                       private.guard_ob_steps(), private.guard_ob_items(), private.guard_ob_append_only(), private.ob_owner_gate(uuid), private.ob_ensure_instance(uuid),
                       private.ob_event(uuid, integer, text, uuid, text, text), private.ob_deps_ok(uuid, integer), private.ob_gates_missing(text[]), private.ob_funding_met(uuid),
                       private.ob_setup_paid(uuid), private.ob_test_order_ok(uuid), private.ob_step_ready(uuid, uuid, integer, jsonb), private.ob_state(uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.rpc_onboarding_get(uuid), public.rpc_document_register(uuid, uuid, text, text),
                       public.rpc_sku_mapping_save(uuid, uuid, text, uuid, text, text, text, integer, text, integer), public.rpc_sku_mapping_delete(uuid, uuid),
                       public.rpc_label_design_add(uuid, uuid, text, uuid), public.rpc_packaging_select(uuid, uuid, text), public.rpc_store_connection_save(uuid, text, text, text, text),
                       public.rpc_agreement_accept(uuid, text, text, uuid), public.rpc_onboarding_step_submit(uuid, integer, jsonb),
                       public.rpc_admin_onboarding_list(), public.rpc_admin_onboarding_get(uuid), public.rpc_admin_document_register(uuid, uuid, text, text),
                       public.rpc_admin_agreement_offer(uuid, uuid), public.rpc_admin_mapping_review(uuid, text, text), public.rpc_admin_label_review(uuid, text, text),
                       public.rpc_admin_step_review(uuid, integer, text, text, text), public.rpc_admin_setup_invoices_create(uuid, bigint, bigint),
                       public.rpc_admin_funding_set(uuid, text, text), public.rpc_admin_gates_list(), public.rpc_admin_gate_record(text, text, text), public.rpc_admin_go_live(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_onboarding_get(uuid), public.rpc_document_register(uuid, uuid, text, text),
                          public.rpc_sku_mapping_save(uuid, uuid, text, uuid, text, text, text, integer, text, integer), public.rpc_sku_mapping_delete(uuid, uuid),
                          public.rpc_label_design_add(uuid, uuid, text, uuid), public.rpc_packaging_select(uuid, uuid, text), public.rpc_store_connection_save(uuid, text, text, text, text),
                          public.rpc_agreement_accept(uuid, text, text, uuid), public.rpc_onboarding_step_submit(uuid, integer, jsonb),
                          public.rpc_admin_onboarding_list(), public.rpc_admin_onboarding_get(uuid), public.rpc_admin_document_register(uuid, uuid, text, text),
                          public.rpc_admin_agreement_offer(uuid, uuid), public.rpc_admin_mapping_review(uuid, text, text), public.rpc_admin_label_review(uuid, text, text),
                          public.rpc_admin_step_review(uuid, integer, text, text, text), public.rpc_admin_setup_invoices_create(uuid, bigint, bigint),
                          public.rpc_admin_funding_set(uuid, text, text), public.rpc_admin_gates_list(), public.rpc_admin_gate_record(text, text, text), public.rpc_admin_go_live(uuid)
  to authenticated;

-- 10. Self-check --------------------------------------------------------------------------------------------------------------------------
do $$
declare
  t text;
  p text;
begin
  foreach t in array array['public.documents', 'public.onboarding_step_defs', 'public.onboarding_instances', 'public.onboarding_steps', 'public.onboarding_submissions', 'public.onboarding_events',
                           'public.sku_mappings', 'public.label_designs', 'public.packaging_options', 'public.packaging_selections', 'public.store_connections', 'public.onboarding_agreements',
                           'public.funding_requirements', 'public.compliance_gates'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = t::regclass) then raise exception 'self-check: RLS not enabled on %', t; end if;
    foreach p in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
      if has_table_privilege('anon', t, p) or has_table_privilege('authenticated', t, p) or has_table_privilege('service_role', t, p) then raise exception 'self-check: an API role has % on %', p, t; end if;
    end loop;
  end loop;
  if (select count(*) from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
       where n.nspname = 'public' and pr.proname in ('rpc_onboarding_get', 'rpc_document_register', 'rpc_sku_mapping_save', 'rpc_sku_mapping_delete', 'rpc_label_design_add', 'rpc_packaging_select',
             'rpc_store_connection_save', 'rpc_agreement_accept', 'rpc_onboarding_step_submit', 'rpc_admin_onboarding_list', 'rpc_admin_onboarding_get', 'rpc_admin_document_register',
             'rpc_admin_agreement_offer', 'rpc_admin_mapping_review', 'rpc_admin_label_review', 'rpc_admin_step_review', 'rpc_admin_setup_invoices_create', 'rpc_admin_funding_set',
             'rpc_admin_gates_list', 'rpc_admin_gate_record', 'rpc_admin_go_live', 'rpc_invoices_list', 'rpc_invoice_get', 'rpc_admin_invoices_list', 'rpc_admin_invoice_get')
         and pr.prosecdef and has_function_privilege('authenticated', pr.oid, 'execute')
         and not has_function_privilege('anon', pr.oid, 'execute') and not has_function_privilege('service_role', pr.oid, 'execute') and not has_function_privilege('public', pr.oid, 'execute')
         and exists (select 1 from unnest(pr.proconfig) c where regexp_replace(c, '[\s"'']', '', 'g') ~* '^search_path=$')) <> 25 then
    raise exception 'self-check: RPC definer, search_path or grant state is wrong';
  end if;
  if exists (select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
              where n.nspname = 'private' and pr.proname like 'ob\_%' and (has_function_privilege('authenticated', pr.oid, 'execute') or has_function_privilege('anon', pr.oid, 'execute'))) then
    raise exception 'self-check: an onboarding private helper is executable by an API role';
  end if;
  if (select count(*) from public.onboarding_step_defs) <> 9 or (select count(*) from public.compliance_gates where status = 'not_recorded') <> 6 or (select count(*) from public.packaging_options) <> 1 then
    raise exception 'self-check: seed data';
  end if;
  if exists (select 1 from public.onboarding_instances) or exists (select 1 from public.sku_mappings) or exists (select 1 from public.documents) then raise exception 'self-check: onboarding tables must be empty at install'; end if;
  if not exists (select 1 from storage.buckets b where b.id = 'portal-documents' and b.public = false and b.file_size_limit = 10485760) then raise exception 'self-check: the documents bucket is missing or public'; end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'portal\_documents\_%') <> 4 then raise exception 'self-check: expected 4 storage policies'; end if;
  if exists (select 1 from pg_attribute a where a.attrelid = 'public.invoices'::regclass and a.attname = 'order_id' and a.attnotnull) then raise exception 'self-check: invoices.order_id must be nullable'; end if;
  if exists (select 1 from public.invoices i where i.kind <> 'order') then raise exception 'self-check: only order invoices exist at install'; end if;
  if not private.ob_step_transition_ok('submitted', 'approved') or private.ob_step_transition_ok('approved', 'rejected') or private.ob_review_transition_ok('approved', 'rejected') then raise exception 'self-check: transitions'; end if;
  if private.ob_test_order_ok(null) then raise exception 'self-check: the test order stub must be false'; end if;
end;
$$;
