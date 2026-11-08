# Integration Architecture

Revision 2, 2026-11-07. Specification only.

## 1. Evidence and scope decision
- Observed in USW customer screenshots: nav items **API Keys** and **API Docs** [OBS]; onboarding step "Connect your store" [OBS]; text "Create your test key… sandbox orders only" [OBS]; SKU mapping with CSV import [OBS].
- **Not observed:** any named e-commerce platform, the API payload, webhook features, key scopes, or the API docs content.
- **Decision:** build a **provider-independent, API-first** integration layer. **No Shopify (or other platform) adapter is planned until evidence shows one is required.** Adapters are added later behind the same interface. Status: **requires business confirmation** which platforms customers actually use.

## 2. Components
```
Customer system ──HTTPS──► Public API  (/api/portal/v1/*, Next route handlers)
                              │ auth: API key → org, env, scopes
                              │ rate limit, idempotency, validation
                              ▼
                      Ingestion service ──► fulfillment_orders (live or sandbox)
                              │                    │
                              ▼                    ▼
                      integration_events      domain events (outbox)
                                                   │
                                      ┌────────────┴─────────────┐
                                      ▼                          ▼
                              Webhook dispatcher          Adapter dispatcher
                              (HMAC signed, retries)      (platform adapters, later)
```
- **Public API**: Next.js route handlers, server-side only, Node runtime; business logic in Postgres RPCs, handlers are thin.
- **Domain event outbox**: every state change inserts an `event_outbox` row in the same transaction (transactional outbox); dispatchers consume it. No event loss on crash.
- **Workers**: scheduled/queued jobs (Vercel Cron or Supabase scheduled functions / pg_cron + `pg_net`, final choice in M1 spike) pull due deliveries with `FOR UPDATE SKIP LOCKED`. Jobs are idempotent and record attempts.

## 3. API keys
| Aspect | Design |
|---|---|
| Format | `pk_test_<8-char prefix>_<secret>` / `pk_live_…`; ≥32 random bytes; shown **once** |
| Storage | `key_prefix` + `key_hash` (HMAC-SHA-256 with server-side pepper held in secrets); plaintext never stored or logged |
| Scoping | belongs to one organization and one environment (test/live); optional IP allow-list |
| Scopes | `orders:write`, `orders:read`, `products:read`, `skus:write`, `inventory:read`, `shipments:read`, `webhooks:manage`, `account:read`; least privilege default |
| Lifecycle | create, rotate (overlap window), suspend, revoke (immediate), expiry; `last_used_at/ip` |
| Live keys | cannot be issued until onboarding step 9 approved and org live flag on (Gate G6, go-live authorization) |
| Abuse | per-key and per-org rate limits (token bucket in Postgres or Upstash-class store, decision in M6); lockout on repeated failures |
| Management | owner/developer roles in customer portal; staff can revoke/suspend; secrets never visible to staff either |

## 4. Order submission API (v1 draft, subject to M6 design)
- `POST /api/portal/v1/orders` with header `Idempotency-Key` (required), body: external order id, recipient, line items (`sku` = customer's mapped SKU, `quantity` in individual units [OBS "units"]), shipping preferences, metadata.
- Server: authenticate key → resolve org/env → validate schema → map SKUs → create `fulfillment_order` (sandbox flag from key env) → return `202` with our order id and status.
- **Idempotency**: `(organization_id, idempotency_key)` unique; stores request hash and response; same key + same body returns stored response; same key + different body returns `409`. Keys retained ≥24 h (configurable).
- **Validation errors** are structured (`code`, `field`, `message`), never internal errors.
- Other endpoints: `GET /orders/{id}`, list orders, cancel request, `GET/PUT /skus`, `GET /inventory`, `GET /shipments/{id}`, webhook endpoint CRUD.
- Versioning in the URL; deprecations announced in `/client/docs` changelog.
- **Never trusts client prices**: orders carry no prices for fulfillment; fees come from the fee schedule server-side.

## 5. Product and SKU mapping
`sku_mappings(organization_id, external_sku, variant_id | private_product_id, units_per_pack, status)`; unique `(organization_id, external_sku)`; CSV import with dry-run and error report [OBS CSV import]; unmapped SKUs produce `SKU_UNMAPPED` exceptions at ingestion; mappings require product-configuration approval before live use.

## 6. Webhooks
- **Endpoints**: HTTPS only; destination validated (no private/loopback/link-local IPs, DNS re-resolved at send time to prevent SSRF/rebinding); per-endpoint signing secret (shown once, stored encrypted or in vault).
- **Events**: `order.accepted`, `order.rejected`, `order.status_changed`, `order.shipped`, `order.delivered`, `order.cancelled`, `order.exception`, `return.received`, `inventory.low`, `inventory.received`, `onboarding.step_changed`, `integration.key_revoked`.
- **Payload**: `{id, type, created_at, api_version, data}`; `id` stable across retries so receivers can de-duplicate.
- **Signature**: header `X-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, t + "." + body)>`; receivers must reject if timestamp skew >5 min; docs include verification code samples; secret rotation with dual-signing for an overlap window.
- **Retries**: exponential backoff with jitter (e.g. 1 m, 5 m, 30 m, 2 h, 6 h, 24 h), max attempts configurable, then `dead` status visible in logs with manual redeliver; 2xx = success; timeouts 10 s.
- **Ordering**: no strict ordering guarantee; events carry a sequence/`created_at` and `GET` resources are authoritative.
- **Auto-disable**: endpoint paused after sustained failures, owner notified.

## 7. Inbound webhooks / adapters (future)
Adapter interface (TypeScript, defined in M6, implemented only with evidence): `verifyInbound(request)`, `normalizeOrder(payload) → CanonicalOrder`, `pushStatus(order, status)`, `syncProducts()`, `healthCheck()`. Per-adapter credentials stored via vault reference; inbound payload signature verification per platform; raw payload retained for replay. First adapters chosen from customer demand [BIZ].

## 8. Sandbox
- Sandbox keys create `is_sandbox` orders, which **never** reserve inventory, create invoices/fees, call carriers, or email real recipients.
- Deterministic simulator: staff and customers can trigger status progressions and failures; test SKUs/addresses to exercise exceptions.
- Satisfies onboarding step 5 when a sandbox order passes validation end-to-end.
- Sandbox data separated by flag and by RLS; purge job after N days.

## 9. Integration event logs and health
- `integration_events(organization_id, direction[in|out], kind, status, http_status, latency_ms, request_hash, error_code, payload_ref (redacted), related_order_id)`; payloads stored with secrets/PII fields masked, retention-limited.
- Customer view `/client/integrations/logs`; staff view `/admin/api`.
- Health per connection: last success, 24 h error rate, webhook backlog, oldest undelivered, key last-used; alerts to customer (email) and staff dashboards; error-code catalog documented in API Docs.

## 10. Security requirements (summary; details in SECURITY-ASSESSMENT.md)
Hashed keys; HMAC webhooks; SSRF guard; idempotency; rate limiting; secrets only server-side; no secret in logs; replay protection; per-org isolation by key→org resolution then RLS-equivalent checks inside RPCs (API uses a dedicated Postgres role with narrow grants, not the broad service role where practical); full audit of key and endpoint changes.

## 11. Open questions [BIZ]
Which platforms customers use; required API surface; SLA for webhooks; rate limits; whether customers need bulk upload; whether inbound carrier webhooks are needed; sandbox retention.
