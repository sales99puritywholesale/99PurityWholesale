import { promises as dns } from 'node:dns';
import { handleWebhookCron } from '@/lib/portal/integrations/handlers';
import { realWorkerClaim, realWorkerRecord } from '@/lib/portal/integrations/anon-db';

// Webhook delivery worker. Called by a scheduler (for example Vercel Cron) with `Authorization: Bearer $CRON_SECRET`. It needs two environment variables:
// CRON_SECRET (protects this route) and INTEGRATION_WORKER_TOKEN (the delivery worker credential an administrator created in the portal; the database stores only its hash).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = (req: Request) =>
  handleWebhookCron(req, {
    claim: realWorkerClaim,
    record: realWorkerRecord,
    resolve: async (host) => (await dns.lookup(host, { all: true })).map((a) => a.address),
    fetchImpl: (url, init) => fetch(url, init),
    now: () => Date.now(),
    cronSecret: process.env.CRON_SECRET,
    workerToken: process.env.INTEGRATION_WORKER_TOKEN,
  });
