import type { Metadata } from 'next';
import Link from 'next/link';
import { portalCopy } from '@/lib/portal/copy';
import { requireUser } from '@/lib/portal/auth';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';

export const metadata: Metadata = { title: portalCopy.client.modules.apiDocs.title };

const Code = ({ children }: { children: string }) => (
  <pre className="mt-2 overflow-x-auto rounded-lg bg-portal-canvas p-3 text-xs leading-relaxed text-portal-text">{children}</pre>
);

const ORDER = `{
  "external_ref": "SHOP-1001",
  "recipient": { "name": "Jane Lab", "line1": "1 Main St", "city": "Austin", "region": "TX", "postal": "78701", "country": "US" },
  "lines": [ { "sku": "YOUR-SKU-1", "quantity": 2 } ]
}`;
const RESPONSE = `{
  "order": {
    "id": "3f0c1e0a-6b1d-4b8e-9f3a-2d5c7a9e1b11",
    "order_number": "FO-00001000",
    "external_ref": "SHOP-1001",
    "status": "pending",
    "sandbox": true,
    "created_at": "2026-11-11T12:00:00Z",
    "lines": [ { "sku": "YOUR-SKU-1", "quantity": 2 } ]
  },
  "replay": false
}`;
const VERIFY = `import { createHmac, timingSafeEqual } from 'node:crypto';

// header looks like: t=1700000000,v1=<hex>
export function verify(signingKey, header, rawBody, nowSeconds = Math.floor(Date.now() / 1000)) {
  const m = /^t=(\\d+),v1=([0-9a-f]{64})$/.exec(header ?? '');
  if (!m || Math.abs(nowSeconds - Number(m[1])) > 300) return false;
  const expected = createHmac('sha256', signingKey).update(m[1] + '.' + rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(m[2], 'hex'));
}`;

export default async function Page() {
  await requireUser('/client/docs');
  const t = portalCopy.client.modules.apiDocs;
  return (
    <>
      <PortalPageHeader area="client" title={t.title} description={t.description} />
      <div className="space-y-4">
        <PortalCard title="Overview">
          <p className="text-sm text-portal-text">
            Send your store&apos;s orders to 99 Purity with one HTTPS call and receive status updates by webhook. Base URL: <span className="portal-id">/api/v1</span>. Bodies are JSON.
            Create keys and webhook endpoints in <Link className="underline" href="/client/api-keys">API Keys</Link>.
          </p>
        </PortalCard>
        <PortalCard title="Authentication and environments">
          <p className="text-sm text-portal-text">Send your key as <span className="portal-id">Authorization: Bearer 99pw_test_...</span>. A key is shown once when you create it; store it like a password and revoke it if it leaks.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-portal-text">
            <li><strong>Test keys</strong> (<span className="portal-id">99pw_test_</span>) create <em>sandbox</em> orders: they are validated and stored but never reserve stock, invoice, ship or charge anything. A sandbox order is also what completes step 5 of your fulfillment setup.</li>
            <li><strong>Live keys</strong> (<span className="portal-id">99pw_live_</span>) are available after your setup has gone live.</li>
            <li>Each environment only sees its own orders.</li>
          </ul>
        </PortalCard>
        <PortalCard title="Create an order">
          <p className="text-sm text-portal-text"><span className="portal-id">POST /api/v1/orders</span>. Every <span className="portal-id">sku</span> must be a product you added and that our team approved in your setup. Prices are never accepted from the request.</p>
          <Code>{`curl -X POST https://YOUR-PORTAL-HOST/api/v1/orders \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: shop-1001-attempt-1" \\
  -d '${ORDER.replace(/\n\s*/g, ' ')}'`}</Code>
          <p className="mt-3 text-sm text-portal-text">Request body:</p>
          <Code>{ORDER}</Code>
          <p className="mt-3 text-sm text-portal-text">Response <span className="portal-id">201</span>:</p>
          <Code>{RESPONSE}</Code>
        </PortalCard>
        <PortalCard title="Read orders">
          <p className="text-sm text-portal-text"><span className="portal-id">GET /api/v1/orders/{'{external_ref or order_number}'}</span> returns one order. <span className="portal-id">GET /api/v1/orders?limit=50</span> returns your latest orders (1 to 100).</p>
        </PortalCard>
        <PortalCard title="Idempotency">
          <p className="text-sm text-portal-text">Send an <span className="portal-id">Idempotency-Key</span> (8 to 80 characters: letters, digits, <span className="portal-id">_ . : -</span>) with every create call. Repeating the same request with the same key returns the original order with <span className="portal-id">200</span> and <span className="portal-id">&quot;replay&quot;: true</span> instead of creating a second one. The same key with a different body returns <span className="portal-id">409</span>. Keys are remembered for 24 hours. Each <span className="portal-id">external_ref</span> can only be used once per environment.</p>
        </PortalCard>
        <PortalCard title="Errors">
          <p className="text-sm text-portal-text">Errors have the shape <span className="portal-id">{'{ "error": { "code", "message" } }'}</span>.</p>
          <ul className="mt-2 grid gap-1 text-sm text-portal-text sm:grid-cols-2">
            <li><span className="portal-id">400 invalid_request</span> the body or a header is not valid (field names are listed)</li>
            <li><span className="portal-id">401 unauthorized</span> missing, invalid or revoked key</li>
            <li><span className="portal-id">403 forbidden_scope / not_live</span> the key may not do this</li>
            <li><span className="portal-id">404 not_found</span> no such order</li>
            <li><span className="portal-id">409 duplicate_order / idempotency_conflict</span></li>
            <li><span className="portal-id">413, 415</span> body too large (32 KB) or not JSON</li>
            <li><span className="portal-id">422 unknown_sku</span> unapproved SKU (listed in <span className="portal-id">skus</span>)</li>
            <li><span className="portal-id">503</span> temporary problem: retry with the same Idempotency-Key</li>
          </ul>
        </PortalCard>
        <PortalCard title="Webhooks">
          <p className="text-sm text-portal-text">Register an HTTPS endpoint (public domain name, port 443) in <Link className="underline" href="/client/api-keys">API Keys</Link>. We POST JSON <span className="portal-id">{'{ id, type, created_at, data }'}</span> for <span className="portal-id">order.created</span>, <span className="portal-id">order.status_changed</span> and <span className="portal-id">ping</span> (the test button). Reply with any <span className="portal-id">2xx</span> within 10 seconds; redirects are not followed. Failed deliveries are retried after 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours, then marked failed. Use the <span className="portal-id">id</span> to ignore repeats.</p>
          <p className="mt-3 text-sm text-portal-text">Every delivery carries <span className="portal-id">X-99PW-Signature: t=&lt;unix seconds&gt;,v1=&lt;hex&gt;</span>, an HMAC-SHA256 of <span className="portal-id">t + &quot;.&quot; + raw body</span> with your endpoint signing key. Verify it, and reject timestamps older than 5 minutes:</p>
          <Code>{VERIFY}</Code>
        </PortalCard>
      </div>
    </>
  );
}
