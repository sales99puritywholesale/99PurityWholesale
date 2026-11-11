-- =====================================================================================================================================
-- P6 DRAFT. NOT APPLIED. NOT EXECUTED. NEVER PARSED BY POSTGRESQL.
-- API keys, key-authenticated order intake (sandbox first), idempotency, webhook endpoints and deliveries, and the delivery worker credential.
-- Depends on migrations 0001 to 0004, P3, P4 and P5 (sku_mappings, onboarding instances). TypeScript mirror: src/lib/portal/integrations/.
-- ANONYMOUS-CALLABLE FUNCTIONS: exactly five (rpc_api_order_create, rpc_api_order_get, rpc_api_orders_list, rpc_worker_claim_deliveries, rpc_worker_record_result). Their credential
-- is the API key (or worker token) HASH checked inside every function; the plaintext never reaches the database. No other function is executable by anon.
-- =====================================================================================================================================

-- 1. Tables ---------------------------------------------------------------------------------------------------------------------------
create sequence public.fulfillment_order_seq start 1000 minvalue 1000;

create table public.api_keys (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name            text not null check (char_length(btrim(name)) between 1 and 80),
  environment     text not null check (environment in ('test', 'live')),
  prefix          text not null unique check (prefix ~ '^99pw_(test|live)_[0-9a-f]{6}$'),
  key_hash        text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),   -- sha256 of the whole key; the plaintext is never stored
  scopes          text[] not null default array['orders:write', 'orders:read'] check (cardinality(scopes) >= 1 and scopes <@ array['orders:write', 'orders:read']),
  created_by      uuid not null,
  created_at      timestamptz not null default clock_timestamp(),
  last_used_at    timestamptz,
  revoked_at      timestamptz,
  revoked_by      uuid,
  constraint api_keys_prefix_matches_environment check ((environment = 'test' and prefix like '99pw\_test\_%') or (environment = 'live' and prefix like '99pw\_live\_%')),
  constraint api_keys_revoked_consistent check ((revoked_at is null) = (revoked_by is null))
);
create index api_keys_org_idx on public.api_keys (organization_id, created_at desc);

create table public.idempotency_records (
  organization_id uuid not null references public.organizations (id) on delete restrict,
  idem_key        text not null check (idem_key ~ '^[A-Za-z0-9_.:-]{8,80}$'),
  request_hash    text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  response        jsonb not null check (jsonb_typeof(response) = 'object' and pg_column_size(response) <= 16384),
  created_at      timestamptz not null default clock_timestamp(),
  expires_at      timestamptz not null default (clock_timestamp() + interval '24 hours'),
  primary key (organization_id, idem_key)
);

-- Orders received through the API. Sandbox (test key) orders never allocate stock, invoice, or ship: the guard below keeps them pending or cancelled.
create table public.fulfillment_orders (
  id              uuid primary key default gen_random_uuid(),
  order_number    text not null unique default ('FO-' || lpad(nextval('public.fulfillment_order_seq')::text, 8, '0')),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  source          text not null default 'api' check (source in ('api', 'manual')),
  external_ref    text not null check (external_ref ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'),
  is_sandbox      boolean not null,
  status          text not null default 'pending' check (status in ('pending', 'queued', 'allocated', 'picked', 'packed', 'ready', 'shipped', 'delivered', 'cancelled')),
  recipient       jsonb not null check (jsonb_typeof(recipient) = 'object' and pg_column_size(recipient) <= 4096),
  api_key_id      uuid references public.api_keys (id) on delete restrict,
  created_at      timestamptz not null default clock_timestamp(),
  updated_at      timestamptz not null default clock_timestamp(),
  constraint fulfillment_orders_ref_key unique (organization_id, is_sandbox, external_ref)
);
create index fulfillment_orders_org_idx on public.fulfillment_orders (organization_id, created_at desc);
create index fulfillment_orders_status_idx on public.fulfillment_orders (status, created_at);

create table public.fulfillment_order_lines (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.fulfillment_orders (id) on delete restrict,
  sku_mapping_id uuid not null references public.sku_mappings (id) on delete restrict,
  external_sku   text not null,
  internal_sku   text not null,
  quantity       integer not null check (quantity between 1 and 10000),
  constraint fulfillment_order_lines_key unique (order_id, sku_mapping_id)
);

-- The signing secret must be readable by the sender, so it is stored (no table grants; only definer functions read it). It is shown to the owner once.
create table public.webhook_endpoints (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  url               text not null check (char_length(url) <= 300),
  signing_key       text not null check (signing_key ~ '^whsec_[0-9a-f]{48}$'),
  events            text[] not null check (cardinality(events) >= 1 and events <@ array['order.created', 'order.status_changed', 'ping']),
  active            boolean not null default true,
  created_by        uuid not null,
  created_at        timestamptz not null default clock_timestamp(),
  secret_rotated_at timestamptz,
  constraint webhook_endpoints_org_url_key unique (organization_id, url)
);

create table public.webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  endpoint_id     uuid not null references public.webhook_endpoints (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  event_type      text not null check (event_type in ('order.created', 'order.status_changed', 'ping')),
  payload         jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 8192),
  status          text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts        integer not null default 0 check (attempts between 0 and 6),
  next_attempt_at timestamptz not null default clock_timestamp(),
  last_http_status integer check (last_http_status is null or last_http_status between 100 and 599),
  last_error      text check (last_error is null or last_error ~ '^[a-z_]{1,40}$'),
  created_at      timestamptz not null default clock_timestamp(),
  delivered_at    timestamptz,
  constraint webhook_deliveries_delivered_consistent check ((status = 'delivered') = (delivered_at is not null))
);
create index webhook_deliveries_due_idx on public.webhook_deliveries (status, next_attempt_at);
create index webhook_deliveries_org_idx on public.webhook_deliveries (organization_id, created_at desc);

create table public.integration_worker_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz
);

alter table public.api_keys                 enable row level security;
alter table public.idempotency_records      enable row level security;
alter table public.fulfillment_orders       enable row level security;
alter table public.fulfillment_order_lines  enable row level security;
alter table public.webhook_endpoints        enable row level security;
alter table public.webhook_deliveries       enable row level security;
alter table public.integration_worker_tokens enable row level security;

-- 2. Private helpers and guards -------------------------------------------------------------------------------------------------------
-- The same rules as isSafeWebhookUrl in TypeScript: https only, port 443, a real DNS name (not an IP literal, not localhost or an internal suffix), no credentials or fragment.
create function private.int_url_ok(p_url text) returns boolean
language sql immutable set search_path = ''
as $$
  select p_url is not null and char_length(p_url) <= 300
     and p_url ~* '^https://[a-z0-9][a-z0-9.-]*\.[a-z0-9-]+(:443)?(/[^[:space:]#@]*)?$'
     and p_url !~* '^https://([0-9]{1,3}\.){3}[0-9]{1,3}(:|/|$)'
     and p_url !~* '^https://[^/:]*\.(local|localhost|internal|lan|home|corp|intranet|arpa)(:|/|$)'
     and p_url !~ '\.\.';
$$;

create function private.int_backoff_seconds(p_attempts integer) returns integer
language sql immutable set search_path = ''
as $$
  select case p_attempts when 1 then 60 when 2 then 300 when 3 then 1800 when 4 then 7200 else 43200 end;
$$;

create function private.fo_transition_ok(p_from text, p_to text) returns boolean
language sql immutable set search_path = ''
as $$
  select (p_from, p_to) in (('pending', 'queued'), ('pending', 'cancelled'), ('queued', 'allocated'), ('queued', 'cancelled'), ('allocated', 'picked'), ('allocated', 'cancelled'),
                            ('picked', 'packed'), ('picked', 'cancelled'), ('packed', 'ready'), ('packed', 'cancelled'), ('ready', 'shipped'), ('shipped', 'delivered'));
$$;

create function private.guard_int_api_keys() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'API keys cannot be deleted' using errcode = '23514'; end if;
  if new.id <> old.id or new.organization_id <> old.organization_id or new.name <> old.name or new.environment <> old.environment or new.prefix <> old.prefix
     or new.key_hash <> old.key_hash or new.scopes <> old.scopes or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'API key identity is immutable' using errcode = '23514';
  end if;
  if old.revoked_at is not null and (new.revoked_at is distinct from old.revoked_at or new.revoked_by is distinct from old.revoked_by) then raise exception 'a revoked key stays revoked' using errcode = '23514'; end if;
  return new;
end;
$$;

create function private.guard_fulfillment_orders() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'fulfillment orders cannot be deleted' using errcode = '23514'; end if;
  if new.id <> old.id or new.order_number <> old.order_number or new.organization_id <> old.organization_id or new.source <> old.source or new.external_ref <> old.external_ref
     or new.is_sandbox <> old.is_sandbox or new.recipient <> old.recipient or new.api_key_id is distinct from old.api_key_id or new.created_at <> old.created_at then
    raise exception 'fulfillment order identity and recipient are immutable' using errcode = '23514';
  end if;
  if new.status <> old.status and not private.fo_transition_ok(old.status, new.status) then raise exception 'illegal fulfillment order status transition' using errcode = '23514'; end if;
  if new.is_sandbox and new.status not in ('pending', 'cancelled') then raise exception 'sandbox orders never progress past pending' using errcode = '23514'; end if;
  return new;
end;
$$;

create function private.guard_webhook_deliveries() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'webhook deliveries cannot be deleted' using errcode = '23514'; end if;
  if new.id <> old.id or new.endpoint_id <> old.endpoint_id or new.organization_id <> old.organization_id or new.event_type <> old.event_type or new.payload <> old.payload or new.created_at <> old.created_at then
    raise exception 'delivery identity and payload are immutable' using errcode = '23514';
  end if;
  if old.status <> 'pending' and (new.status <> old.status or new.attempts <> old.attempts) then raise exception 'a finished delivery is final' using errcode = '23514'; end if;
  if new.attempts < old.attempts then raise exception 'attempts cannot decrease' using errcode = '23514'; end if;
  return new;
end;
$$;

create function private.guard_int_append_only() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '23514';
  return null;
end;
$$;

-- The API key credential. Returns NULL for anything that is not an active key of an active organization; touches last_used_at at most once a minute.
create function private.int_key_auth(p_hash text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  select jsonb_build_object('key_id', k.id, 'organization_id', k.organization_id, 'environment', k.environment, 'scopes', to_jsonb(k.scopes)) into v_out
    from public.api_keys k join public.organizations g on g.id = k.organization_id where k.key_hash = p_hash and k.revoked_at is null and g.status = 'active';
  if v_out is null then return null; end if;
  update public.api_keys set last_used_at = clock_timestamp() where key_hash = p_hash and (last_used_at is null or last_used_at < clock_timestamp() - interval '1 minute');
  return v_out;
end;
$$;

create function private.int_worker_ok(p_hash text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_hash is not null and p_hash ~ '^[0-9a-f]{64}$' and exists (select 1 from public.integration_worker_tokens w where w.token_hash = p_hash and w.revoked_at is null);
$$;

-- One pending delivery per active endpoint of the organization that subscribes to the event. Returns how many were queued.
create function private.int_emit_event(p_org uuid, p_event text, p_payload jsonb) returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_n integer;
begin
  insert into public.webhook_deliveries (endpoint_id, organization_id, event_type, payload)
  select e.id, e.organization_id, p_event, p_payload from public.webhook_endpoints e where e.organization_id = p_org and e.active and p_event = any (e.events);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create function private.int_order_json(p_order uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('id', o.id, 'order_number', o.order_number, 'external_ref', o.external_ref, 'status', o.status, 'sandbox', o.is_sandbox, 'created_at', o.created_at,
                            'lines', (select coalesce(jsonb_agg(jsonb_build_object('sku', l.external_sku, 'quantity', l.quantity) order by l.external_sku), '[]'::jsonb)
                                        from public.fulfillment_order_lines l where l.order_id = o.id))
    from public.fulfillment_orders o where o.id = p_order;
$$;

-- Step 5 of the onboarding (P5) is satisfied by a sandbox order received through the API; this replaces the P5 stub.
create or replace function private.ob_test_order_ok(p_org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.fulfillment_orders o where o.organization_id = p_org and o.is_sandbox and o.source = 'api');
$$;

create trigger api_keys_guard before update or delete on public.api_keys for each row execute function private.guard_int_api_keys();
create trigger fulfillment_orders_guard before update or delete on public.fulfillment_orders for each row execute function private.guard_fulfillment_orders();
create trigger fulfillment_order_lines_append_only before update or delete on public.fulfillment_order_lines for each row execute function private.guard_int_append_only();
create trigger webhook_deliveries_guard before update or delete on public.webhook_deliveries for each row execute function private.guard_webhook_deliveries();
create trigger api_keys_no_truncate before truncate on public.api_keys for each statement execute function private.block_truncate();
create trigger fulfillment_orders_no_truncate before truncate on public.fulfillment_orders for each statement execute function private.block_truncate();
create trigger fulfillment_order_lines_no_truncate before truncate on public.fulfillment_order_lines for each statement execute function private.block_truncate();
create trigger webhook_deliveries_no_truncate before truncate on public.webhook_deliveries for each statement execute function private.block_truncate();
create trigger fulfillment_orders_touch before update on public.fulfillment_orders for each row execute function private.touch_updated_at();

-- 3. Customer RPCs (tenant boundary: private.my_org_ids() + active organization; changes need the owner role) ---------------------------------
create function public.rpc_api_keys_list(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not (p_organization_id in (select private.my_org_ids())) or private.shop_org_ok(p_organization_id) is not true then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  return jsonb_build_object('ok', true, 'live_available', coalesce((select i.status = 'live' from public.onboarding_instances i where i.organization_id = p_organization_id), false),
    'can_edit', private.pay_org_owner_ok(p_organization_id),
    'keys', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'environment', k.environment, 'prefix', k.prefix, 'scopes', to_jsonb(k.scopes), 'created_at', k.created_at,
                                                          'last_used_at', k.last_used_at, 'revoked_at', k.revoked_at) order by k.created_at desc), '[]'::jsonb)
               from public.api_keys k where k.organization_id = p_organization_id));
end;
$$;

-- The caller (the server) generated the key, hashes it and sends only the hash and the 16-character prefix; the database never sees the plaintext.
create function public.rpc_api_key_create(p_organization_id uuid, p_name text, p_environment text, p_prefix text, p_key_hash text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_name  text := nullif(btrim(coalesce(p_name, '')), '');
  v_id    uuid;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if v_name is null or char_length(v_name) > 80 or p_environment is null or p_environment not in ('test', 'live') or p_prefix is null or p_prefix !~ '^99pw_(test|live)_[0-9a-f]{6}$'
     or p_prefix not like '99pw\_' || p_environment || '\_%' or p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  v_gate := private.ob_owner_gate(p_organization_id);
  if v_gate is not null then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_environment = 'live' and not coalesce((select i.status = 'live' from public.onboarding_instances i where i.organization_id = p_organization_id), false) then return jsonb_build_object('ok', false, 'code', 'not_live'); end if;
  if (select count(*) from public.api_keys k where k.organization_id = p_organization_id and k.revoked_at is null) >= 10 then return jsonb_build_object('ok', false, 'code', 'too_many_keys'); end if;
  insert into public.api_keys (organization_id, name, environment, prefix, key_hash, created_by) values (p_organization_id, v_name, p_environment, p_prefix, p_key_hash, v_actor) returning id into v_id;
  perform private.write_audit(v_actor, 'organization_user', 'api.key.create', 'success', p_organization_id, 'api_key', v_id::text, jsonb_build_object('environment', p_environment, 'prefix', p_prefix));
  return jsonb_build_object('ok', true, 'code', 'created', 'id', v_id, 'prefix', p_prefix);
end;
$$;

create function public.rpc_api_key_revoke(p_organization_id uuid, p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_rev   timestamptz;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  v_gate := private.ob_owner_gate(p_organization_id);
  if v_gate is not null then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  select k.revoked_at into v_rev from public.api_keys k where k.id = p_id and k.organization_id = p_organization_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'key_not_found'); end if;
  if v_rev is not null then return jsonb_build_object('ok', false, 'code', 'already_revoked'); end if;
  update public.api_keys set revoked_at = clock_timestamp(), revoked_by = v_actor where id = p_id;
  perform private.write_audit(v_actor, 'organization_user', 'api.key.revoke', 'success', p_organization_id, 'api_key', p_id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'code', 'revoked');
end;
$$;

create function public.rpc_webhook_endpoints_list(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not (p_organization_id in (select private.my_org_ids())) or private.shop_org_ok(p_organization_id) is not true then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  return jsonb_build_object('ok', true, 'can_edit', private.pay_org_owner_ok(p_organization_id),
    'endpoints', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'url', e.url, 'events', to_jsonb(e.events), 'active', e.active, 'created_at', e.created_at, 'secret_rotated_at', e.secret_rotated_at,
                                                               'delivered', (select count(*)::int from public.webhook_deliveries d where d.endpoint_id = e.id and d.status = 'delivered'),
                                                               'failed', (select count(*)::int from public.webhook_deliveries d where d.endpoint_id = e.id and d.status = 'failed'),
                                                               'pending', (select count(*)::int from public.webhook_deliveries d where d.endpoint_id = e.id and d.status = 'pending'))
                                          order by e.created_at), '[]'::jsonb)
                    from public.webhook_endpoints e where e.organization_id = p_organization_id));
end;
$$;

create function public.rpc_webhook_endpoint_create(p_organization_id uuid, p_url text, p_events text[], p_signing_key text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_url   text := btrim(coalesce(p_url, ''));
  v_id    uuid;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_signing_key is null or p_signing_key !~ '^whsec_[0-9a-f]{48}$' or p_events is null or cardinality(p_events) < 1 or not (p_events <@ array['order.created', 'order.status_changed', 'ping']) then raise exception 'invalid arguments' using errcode = '22023'; end if;
  v_gate := private.ob_owner_gate(p_organization_id);
  if v_gate is not null then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if private.int_url_ok(v_url) is not true then return jsonb_build_object('ok', false, 'code', 'invalid_url'); end if;
  if (select count(*) from public.webhook_endpoints e where e.organization_id = p_organization_id) >= 5 then return jsonb_build_object('ok', false, 'code', 'too_many_endpoints'); end if;
  begin
    insert into public.webhook_endpoints (organization_id, url, signing_key, events, created_by) values (p_organization_id, v_url, p_signing_key, p_events, v_actor) returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'duplicate_endpoint');
  end;
  perform private.write_audit(v_actor, 'organization_user', 'api.webhook.create', 'success', p_organization_id, 'webhook_endpoint', v_id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'code', 'created', 'id', v_id);
end;
$$;

create function public.rpc_webhook_endpoint_set_active(p_organization_id uuid, p_id uuid, p_active boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_id is null or p_active is null then raise exception 'invalid arguments' using errcode = '22023'; end if;
  v_gate := private.ob_owner_gate(p_organization_id);
  if v_gate is not null then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  update public.webhook_endpoints set active = p_active where id = p_id and organization_id = p_organization_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'endpoint_not_found'); end if;
  perform private.write_audit(v_actor, 'organization_user', 'api.webhook.active', 'success', p_organization_id, 'webhook_endpoint', p_id::text, jsonb_build_object('active', p_active));
  return jsonb_build_object('ok', true, 'code', 'updated');
end;
$$;

create function public.rpc_webhook_endpoint_rotate(p_organization_id uuid, p_id uuid, p_signing_key text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_id is null or p_signing_key is null or p_signing_key !~ '^whsec_[0-9a-f]{48}$' then raise exception 'invalid arguments' using errcode = '22023'; end if;
  v_gate := private.ob_owner_gate(p_organization_id);
  if v_gate is not null then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  update public.webhook_endpoints set signing_key = p_signing_key, secret_rotated_at = clock_timestamp() where id = p_id and organization_id = p_organization_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'endpoint_not_found'); end if;
  perform private.write_audit(v_actor, 'organization_user', 'api.webhook.rotate', 'success', p_organization_id, 'webhook_endpoint', p_id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'code', 'rotated');
end;
$$;

-- Queues a "ping" delivery to ONE endpoint so the owner can check the receiver. The worker sends it with the next run.
create function public.rpc_webhook_test(p_organization_id uuid, p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_active boolean;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_id is null then raise exception 'invalid arguments' using errcode = '22023'; end if;
  v_gate := private.ob_owner_gate(p_organization_id);
  if v_gate is not null then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  select e.active into v_active from public.webhook_endpoints e where e.id = p_id and e.organization_id = p_organization_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'endpoint_not_found'); end if;
  if not v_active then return jsonb_build_object('ok', false, 'code', 'inactive'); end if;
  if (select count(*) from public.webhook_deliveries d where d.endpoint_id = p_id and d.event_type = 'ping' and d.created_at > clock_timestamp() - interval '1 minute') >= 3 then return jsonb_build_object('ok', false, 'code', 'too_many_pending'); end if;
  insert into public.webhook_deliveries (endpoint_id, organization_id, event_type, payload) values (p_id, p_organization_id, 'ping', jsonb_build_object('message', 'This is a test event from 99 Purity.'));
  return jsonb_build_object('ok', true, 'code', 'queued');
end;
$$;

create function public.rpc_webhook_deliveries_list(p_organization_id uuid, p_limit integer default 30) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not (p_organization_id in (select private.my_org_ids())) or private.shop_org_ok(p_organization_id) is not true then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  return jsonb_build_object('ok', true, 'deliveries',
    (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'url', e.url, 'event_type', d.event_type, 'status', d.status, 'attempts', d.attempts, 'last_http_status', d.last_http_status,
                                                  'last_error', d.last_error, 'created_at', d.created_at, 'delivered_at', d.delivered_at) order by d.created_at desc), '[]'::jsonb)
       from (select x.id, x.endpoint_id, x.event_type, x.status, x.attempts, x.last_http_status, x.last_error, x.created_at, x.delivered_at from public.webhook_deliveries x
              where x.organization_id = p_organization_id order by x.created_at desc limit least(greatest(coalesce(p_limit, 30), 1), 100)) d
       join public.webhook_endpoints e on e.id = d.endpoint_id));
end;
$$;

create function public.rpc_integration_orders_list(p_organization_id uuid, p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not (p_organization_id in (select private.my_org_ids())) or private.shop_org_ok(p_organization_id) is not true then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  return jsonb_build_object('ok', true, 'orders',
    (select coalesce(jsonb_agg(private.int_order_json(o.id) order by o.created_at desc), '[]'::jsonb)
       from (select x.id, x.created_at from public.fulfillment_orders x where x.organization_id = p_organization_id order by x.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) o));
end;
$$;

-- 4. Staff RPCs ---------------------------------------------------------------------------------------------------------------------------
create function public.rpc_admin_api_keys_list() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
begin
  v_gate := private.staff_gate('org.read', 'staff.api.keys.list', false, 'api_key', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  return jsonb_build_object('ok', true, 'keys',
    (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'organization_id', g.id, 'organization_name', g.name, 'organization_code', g.code, 'name', k.name, 'environment', k.environment,
                                                  'prefix', k.prefix, 'created_at', k.created_at, 'last_used_at', k.last_used_at, 'revoked_at', k.revoked_at) order by k.created_at desc), '[]'::jsonb)
       from (select x.id, x.organization_id, x.name, x.environment, x.prefix, x.created_at, x.last_used_at, x.revoked_at from public.api_keys x order by x.created_at desc limit 200) k join public.organizations g on g.id = k.organization_id));
end;
$$;

create function public.rpc_admin_api_key_revoke(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_org   uuid;
  v_rev   timestamptz;
begin
  v_gate := private.staff_gate('org.manage', 'staff.api.key.revoke', false, 'api_key', p_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_id is null then raise exception 'invalid arguments' using errcode = '22023'; end if;
  select k.organization_id, k.revoked_at into v_org, v_rev from public.api_keys k where k.id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'key_not_found'); end if;
  if v_rev is not null then return jsonb_build_object('ok', false, 'code', 'already_revoked'); end if;
  update public.api_keys set revoked_at = clock_timestamp(), revoked_by = v_actor where id = p_id;
  perform private.write_audit(v_actor, 'staff', 'staff.api.key.revoke', 'success', v_org, 'api_key', p_id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'code', 'revoked');
end;
$$;

create function public.rpc_admin_deliveries_overview() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate text;
begin
  v_gate := private.staff_gate('org.read', 'staff.api.deliveries', false, 'webhook_delivery', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  return jsonb_build_object('ok', true,
    'pending', (select count(*)::int from public.webhook_deliveries d where d.status = 'pending'),
    'failed_24h', (select count(*)::int from public.webhook_deliveries d where d.status = 'failed' and d.created_at > clock_timestamp() - interval '24 hours'),
    'delivered_24h', (select count(*)::int from public.webhook_deliveries d where d.status = 'delivered' and d.delivered_at > clock_timestamp() - interval '24 hours'),
    'worker_token_active', exists (select 1 from public.integration_worker_tokens w where w.revoked_at is null),
    'recent_failures', (select coalesce(jsonb_agg(jsonb_build_object('id', fd.id, 'organization_name', g.name, 'url', e.url, 'event_type', fd.event_type, 'attempts', fd.attempts, 'last_http_status', fd.last_http_status,
                                                                      'last_error', fd.last_error, 'created_at', fd.created_at) order by fd.created_at desc), '[]'::jsonb)
                          from (select x.id, x.endpoint_id, x.organization_id, x.event_type, x.attempts, x.last_http_status, x.last_error, x.created_at from public.webhook_deliveries x
                                 where x.status = 'failed' order by x.created_at desc limit 20) fd
                          join public.webhook_endpoints e on e.id = fd.endpoint_id join public.organizations g on g.id = fd.organization_id));
end;
$$;

-- Registers a NEW delivery worker credential (hash only) and revokes the previous ones. Admin only (flags.write) with a fresh step-up.
create function public.rpc_admin_worker_token_create(p_token_hash text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
begin
  v_gate := private.staff_gate('flags.write', 'staff.worker.token.create', true, 'worker_token', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid arguments' using errcode = '22023'; end if;
  update public.integration_worker_tokens set revoked_at = clock_timestamp() where revoked_at is null;
  insert into public.integration_worker_tokens (token_hash, created_by) values (p_token_hash, v_actor);
  perform private.write_audit(v_actor, 'staff', 'staff.worker.token.create', 'success', null, 'worker_token', null, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'code', 'created');
end;
$$;

-- 5. Key-authenticated functions (callable by anon: the API key hash or worker token hash IS the credential, checked inside) -------------------
-- They never raise for a bad credential (the same answer for unknown, revoked and malformed) and never return another organization's data.
create function public.rpc_api_order_create(p_key_hash text, p_idempotency_key text, p_request_hash text, p_order jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  k          jsonb := private.int_key_auth(p_key_hash);
  v_org      uuid;
  v_env      text;
  v_key      uuid;
  v_ref      text;
  v_lines    jsonb;
  v_bad      jsonb;
  v_id       uuid;
  v_number   text;
  v_prev     record;
  v_resp     jsonb;
begin
  if k is null then return jsonb_build_object('ok', false, 'code', 'unauthorized'); end if;
  v_org := (k ->> 'organization_id')::uuid; v_env := k ->> 'environment'; v_key := (k ->> 'key_id')::uuid;
  if not ((k -> 'scopes') ? 'orders:write') then return jsonb_build_object('ok', false, 'code', 'forbidden_scope'); end if;
  if p_order is null or jsonb_typeof(p_order) <> 'object' or pg_column_size(p_order) > 32768 then return jsonb_build_object('ok', false, 'code', 'invalid_request'); end if;
  v_ref := p_order ->> 'external_ref'; v_lines := p_order -> 'lines';
  if v_ref is null or v_ref !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$' or private.shop_ship_to_ok(p_order -> 'recipient') is not true
     or jsonb_typeof(v_lines) is distinct from 'array' or jsonb_array_length(v_lines) not between 1 and 50
     or (p_idempotency_key is not null and (p_idempotency_key !~ '^[A-Za-z0-9_.:-]{8,80}$' or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$')) then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;
  if exists (select 1 from jsonb_array_elements(v_lines) e where jsonb_typeof(e) <> 'object' or jsonb_typeof(e -> 'sku') is distinct from 'string' or char_length(e ->> 'sku') not between 1 and 64
                or (e ->> 'quantity') is null or (e ->> 'quantity') !~ '^[0-9]{1,5}$' or (e ->> 'quantity')::int not between 1 and 10000)
     or (select count(distinct e ->> 'sku') from jsonb_array_elements(v_lines) e) <> jsonb_array_length(v_lines) then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('api:orders:' || v_org::text, 0));
  if p_idempotency_key is not null then
    select r.request_hash, r.response into v_prev from public.idempotency_records r where r.organization_id = v_org and r.idem_key = p_idempotency_key and r.expires_at > clock_timestamp();
    if found then
      if v_prev.request_hash = p_request_hash then return v_prev.response || jsonb_build_object('replay', true); end if;
      return jsonb_build_object('ok', false, 'code', 'idempotency_conflict');
    end if;
    delete from public.idempotency_records r where r.organization_id = v_org and r.idem_key = p_idempotency_key;
  end if;
  if v_env = 'live' and not coalesce((select i.status = 'live' from public.onboarding_instances i where i.organization_id = v_org), false) then return jsonb_build_object('ok', false, 'code', 'not_live'); end if;
  select coalesce(jsonb_agg(e ->> 'sku'), '[]'::jsonb) into v_bad
    from jsonb_array_elements(v_lines) e
   where not exists (select 1 from public.sku_mappings m where m.organization_id = v_org and m.external_sku = e ->> 'sku' and m.status = 'approved');
  if jsonb_array_length(v_bad) > 0 then return jsonb_build_object('ok', false, 'code', 'unknown_sku', 'skus', v_bad); end if;
  begin
    insert into public.fulfillment_orders (organization_id, source, external_ref, is_sandbox, recipient, api_key_id) values (v_org, 'api', v_ref, v_env = 'test', p_order -> 'recipient', v_key)
    returning id, order_number into v_id, v_number;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'duplicate_order');
  end;
  insert into public.fulfillment_order_lines (order_id, sku_mapping_id, external_sku, internal_sku, quantity)
  select v_id, m.id, m.external_sku, m.internal_sku, (e ->> 'quantity')::int
    from jsonb_array_elements(v_lines) e join public.sku_mappings m on m.organization_id = v_org and m.external_sku = e ->> 'sku' and m.status = 'approved';
  perform private.int_emit_event(v_org, 'order.created', jsonb_build_object('order', private.int_order_json(v_id)));
  v_resp := jsonb_build_object('ok', true, 'code', 'created', 'order', private.int_order_json(v_id));
  if p_idempotency_key is not null then insert into public.idempotency_records (organization_id, idem_key, request_hash, response) values (v_org, p_idempotency_key, p_request_hash, v_resp); end if;
  perform private.write_audit(null, 'system', 'api.order.create', 'success', v_org, 'fulfillment_order', v_id::text, jsonb_build_object('order_number', v_number, 'sandbox', v_env = 'test', 'lines', jsonb_array_length(v_lines)));
  return v_resp || jsonb_build_object('replay', false);
end;
$$;

create function public.rpc_api_order_get(p_key_hash text, p_ref text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  k     jsonb := private.int_key_auth(p_key_hash);
  v_id  uuid;
begin
  if k is null then return jsonb_build_object('ok', false, 'code', 'unauthorized'); end if;
  if not ((k -> 'scopes') ? 'orders:read') then return jsonb_build_object('ok', false, 'code', 'forbidden_scope'); end if;
  if p_ref is null or char_length(p_ref) > 64 then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  select o.id into v_id from public.fulfillment_orders o
   where o.organization_id = (k ->> 'organization_id')::uuid and o.is_sandbox = ((k ->> 'environment') = 'test') and (o.external_ref = p_ref or o.order_number = p_ref) limit 1;
  if v_id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'order', private.int_order_json(v_id));
end;
$$;

create function public.rpc_api_orders_list(p_key_hash text, p_limit integer default 50) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  k jsonb := private.int_key_auth(p_key_hash);
begin
  if k is null then return jsonb_build_object('ok', false, 'code', 'unauthorized'); end if;
  if not ((k -> 'scopes') ? 'orders:read') then return jsonb_build_object('ok', false, 'code', 'forbidden_scope'); end if;
  return jsonb_build_object('ok', true, 'orders',
    (select coalesce(jsonb_agg(private.int_order_json(o.id) order by o.created_at desc), '[]'::jsonb)
       from (select x.id, x.created_at from public.fulfillment_orders x
              where x.organization_id = (k ->> 'organization_id')::uuid and x.is_sandbox = ((k ->> 'environment') = 'test') order by x.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 100)) o));
end;
$$;

-- The delivery worker (a protected cron route) claims due deliveries, sends them, and reports each result. A claim hides a delivery for 10 minutes (so a crash retries it later).
create function public.rpc_worker_claim_deliveries(p_token_hash text, p_limit integer default 20) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_rows  jsonb;
begin
  if not private.int_worker_ok(p_token_hash) then return jsonb_build_object('ok', false, 'code', 'unauthorized'); end if;
  update public.webhook_deliveries d set status = 'failed' where d.status = 'pending' and d.attempts >= 6 and d.next_attempt_at <= clock_timestamp();
  with due as (
    select d.id from public.webhook_deliveries d join public.webhook_endpoints e on e.id = d.endpoint_id
     where d.status = 'pending' and d.attempts < 6 and d.next_attempt_at <= clock_timestamp() and e.active
     order by d.next_attempt_at limit v_limit for update of d skip locked),
  upd as (
    update public.webhook_deliveries d set attempts = d.attempts + 1, next_attempt_at = clock_timestamp() + interval '10 minutes'
      from due where d.id = due.id returning d.id, d.endpoint_id, d.event_type, d.payload, d.attempts, d.created_at)
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'url', e.url, 'signing_key', e.signing_key, 'event_type', u.event_type, 'payload', u.payload, 'attempt', u.attempts, 'created_at', u.created_at)), '[]'::jsonb)
    into v_rows from upd u join public.webhook_endpoints e on e.id = u.endpoint_id;
  return jsonb_build_object('ok', true, 'deliveries', v_rows);
end;
$$;

create function public.rpc_worker_record_result(p_token_hash text, p_delivery_id uuid, p_http_status integer, p_ok boolean, p_error text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_status   text;
  v_attempts integer;
  v_http     integer := case when p_http_status between 100 and 599 then p_http_status else null end;
  v_err      text := case when p_error ~ '^[a-z_]{1,40}$' then p_error else null end;
begin
  if not private.int_worker_ok(p_token_hash) then return jsonb_build_object('ok', false, 'code', 'unauthorized'); end if;
  if p_delivery_id is null or p_ok is null then return jsonb_build_object('ok', false, 'code', 'invalid_request'); end if;
  select d.status, d.attempts into v_status, v_attempts from public.webhook_deliveries d where d.id = p_delivery_id for update;
  if not found or v_status <> 'pending' then return jsonb_build_object('ok', true, 'code', 'noop'); end if;
  if p_ok then
    update public.webhook_deliveries set status = 'delivered', delivered_at = clock_timestamp(), last_http_status = v_http, last_error = null where id = p_delivery_id;
  elsif v_attempts >= 6 then
    update public.webhook_deliveries set status = 'failed', last_http_status = v_http, last_error = v_err where id = p_delivery_id;
  else
    update public.webhook_deliveries set next_attempt_at = clock_timestamp() + make_interval(secs => private.int_backoff_seconds(v_attempts)), last_http_status = v_http, last_error = v_err where id = p_delivery_id;
  end if;
  return jsonb_build_object('ok', true, 'code', 'recorded');
end;
$$;

-- 6. Privileges ---------------------------------------------------------------------------------------------------------------------------
revoke all on table public.api_keys, public.idempotency_records, public.fulfillment_orders, public.fulfillment_order_lines, public.webhook_endpoints, public.webhook_deliveries,
                    public.integration_worker_tokens from public, anon, authenticated, service_role;
revoke all on sequence public.fulfillment_order_seq from public, anon, authenticated, service_role;

revoke all on function private.int_url_ok(text), private.int_backoff_seconds(integer), private.fo_transition_ok(text, text), private.guard_int_api_keys(), private.guard_fulfillment_orders(),
                       private.guard_webhook_deliveries(), private.guard_int_append_only(), private.int_key_auth(text), private.int_worker_ok(text), private.int_emit_event(uuid, text, jsonb),
                       private.int_order_json(uuid), private.ob_test_order_ok(uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.rpc_api_keys_list(uuid), public.rpc_api_key_create(uuid, text, text, text, text), public.rpc_api_key_revoke(uuid, uuid), public.rpc_webhook_endpoints_list(uuid),
                       public.rpc_webhook_endpoint_create(uuid, text, text[], text), public.rpc_webhook_endpoint_set_active(uuid, uuid, boolean), public.rpc_webhook_endpoint_rotate(uuid, uuid, text),
                       public.rpc_webhook_test(uuid, uuid), public.rpc_webhook_deliveries_list(uuid, integer), public.rpc_integration_orders_list(uuid, integer),
                       public.rpc_admin_api_keys_list(), public.rpc_admin_api_key_revoke(uuid), public.rpc_admin_deliveries_overview(), public.rpc_admin_worker_token_create(text),
                       public.rpc_api_order_create(text, text, text, jsonb), public.rpc_api_order_get(text, text), public.rpc_api_orders_list(text, integer),
                       public.rpc_worker_claim_deliveries(text, integer), public.rpc_worker_record_result(text, uuid, integer, boolean, text)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_api_keys_list(uuid), public.rpc_api_key_create(uuid, text, text, text, text), public.rpc_api_key_revoke(uuid, uuid), public.rpc_webhook_endpoints_list(uuid),
                          public.rpc_webhook_endpoint_create(uuid, text, text[], text), public.rpc_webhook_endpoint_set_active(uuid, uuid, boolean), public.rpc_webhook_endpoint_rotate(uuid, uuid, text),
                          public.rpc_webhook_test(uuid, uuid), public.rpc_webhook_deliveries_list(uuid, integer), public.rpc_integration_orders_list(uuid, integer),
                          public.rpc_admin_api_keys_list(), public.rpc_admin_api_key_revoke(uuid), public.rpc_admin_deliveries_overview(), public.rpc_admin_worker_token_create(text)
  to authenticated;
-- the ONLY anon grants of the whole schema (pinned by name in the static checker and in tests/portal/integrations-sql.test.ts)
grant execute on function public.rpc_api_order_create(text, text, text, jsonb), public.rpc_api_order_get(text, text), public.rpc_api_orders_list(text, integer),
                          public.rpc_worker_claim_deliveries(text, integer), public.rpc_worker_record_result(text, uuid, integer, boolean, text)
  to anon;

-- 7. Self-check ---------------------------------------------------------------------------------------------------------------------------
do $$
declare
  t text;
  p text;
begin
  foreach t in array array['public.api_keys', 'public.idempotency_records', 'public.fulfillment_orders', 'public.fulfillment_order_lines', 'public.webhook_endpoints', 'public.webhook_deliveries', 'public.integration_worker_tokens'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = t::regclass) then raise exception 'self-check: RLS not enabled on %', t; end if;
    foreach p in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
      if has_table_privilege('anon', t, p) or has_table_privilege('authenticated', t, p) or has_table_privilege('service_role', t, p) then raise exception 'self-check: an API role has % on %', p, t; end if;
    end loop;
  end loop;
  if (select count(*) from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
       where n.nspname = 'public' and pr.proname in ('rpc_api_keys_list', 'rpc_api_key_create', 'rpc_api_key_revoke', 'rpc_webhook_endpoints_list', 'rpc_webhook_endpoint_create', 'rpc_webhook_endpoint_set_active',
             'rpc_webhook_endpoint_rotate', 'rpc_webhook_test', 'rpc_webhook_deliveries_list', 'rpc_integration_orders_list', 'rpc_admin_api_keys_list', 'rpc_admin_api_key_revoke',
             'rpc_admin_deliveries_overview', 'rpc_admin_worker_token_create')
         and pr.prosecdef and has_function_privilege('authenticated', pr.oid, 'execute') and not has_function_privilege('anon', pr.oid, 'execute')
         and not has_function_privilege('service_role', pr.oid, 'execute') and not has_function_privilege('public', pr.oid, 'execute')
         and exists (select 1 from unnest(pr.proconfig) c where regexp_replace(c, '[\s"'']', '', 'g') ~* '^search_path=$')) <> 14 then
    raise exception 'self-check: authenticated RPC definer, search_path or grant state is wrong';
  end if;
  -- exactly the five key-authenticated functions are executable by anon: no more, no fewer, and none by PUBLIC or service_role
  if (select array_agg(pr.proname::text order by pr.proname) from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
       where n.nspname = 'public' and has_function_privilege('anon', pr.oid, 'execute'))
     is distinct from array['rpc_api_order_create', 'rpc_api_order_get', 'rpc_api_orders_list', 'rpc_worker_claim_deliveries', 'rpc_worker_record_result'] then
    raise exception 'self-check: the set of anon-executable public functions is not exactly the five key-authenticated RPCs';
  end if;
  if exists (select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
              where n.nspname = 'public' and pr.proname in ('rpc_api_order_create', 'rpc_api_order_get', 'rpc_api_orders_list', 'rpc_worker_claim_deliveries', 'rpc_worker_record_result')
                and (not pr.prosecdef or has_function_privilege('service_role', pr.oid, 'execute') or has_function_privilege('public', pr.oid, 'execute')
                     or not exists (select 1 from unnest(pr.proconfig) c where regexp_replace(c, '[\s"'']', '', 'g') ~* '^search_path=$'))) then
    raise exception 'self-check: an anon-callable function is not a definer with a pinned search_path, or is executable by PUBLIC or service_role';
  end if;
  if exists (select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
              where n.nspname = 'private' and (pr.proname like 'int\_%' or pr.proname like 'fo\_%' or pr.proname like 'guard\_int\_%' or pr.proname = 'guard_fulfillment_orders' or pr.proname = 'guard_webhook_deliveries')
                and (has_function_privilege('authenticated', pr.oid, 'execute') or has_function_privilege('anon', pr.oid, 'execute'))) then
    raise exception 'self-check: an integration private helper is executable by an API role';
  end if;
  if exists (select 1 from public.api_keys) or exists (select 1 from public.fulfillment_orders) or exists (select 1 from public.webhook_endpoints) or exists (select 1 from public.integration_worker_tokens) then
    raise exception 'self-check: integration tables must be empty at install';
  end if;
  if (select count(*) from pg_trigger tg where not tg.tgisinternal and tg.tgrelid in ('public.api_keys'::regclass, 'public.fulfillment_orders'::regclass, 'public.fulfillment_order_lines'::regclass, 'public.webhook_deliveries'::regclass)) <> 9 then
    raise exception 'self-check: expected 9 triggers on the integration tables';
  end if;
  if not private.int_url_ok('https://hooks.example.com/x') or private.int_url_ok('http://hooks.example.com/x') or private.int_url_ok('https://127.0.0.1/x') or private.int_url_ok('https://localhost/x')
     or private.int_url_ok('https://printer.local/x') or private.int_url_ok('https://hooks.example.com:8443/x') or private.int_url_ok('https://u:p@hooks.example.com/x') or private.int_url_ok('https://metadata.google.internal/') then
    raise exception 'self-check: webhook URL rules';
  end if;
  if not private.fo_transition_ok('pending', 'queued') or private.fo_transition_ok('shipped', 'cancelled') or private.fo_transition_ok('delivered', 'pending') then raise exception 'self-check: fulfillment transitions'; end if;
  if private.ob_test_order_ok(null) then raise exception 'self-check: no organization can have a sandbox order at install'; end if;
end;
$$;
