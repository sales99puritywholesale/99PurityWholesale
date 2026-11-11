import { handleCreateOrder, handleListOrders } from '@/lib/portal/integrations/handlers';
import { realApiDeps } from '@/lib/portal/integrations/anon-db';

// Public API (authenticated by API key, not by a user session; /api is outside the portal middleware by design). Test keys create sandbox orders only.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = (req: Request) => handleCreateOrder(req, realApiDeps);
export const GET = (req: Request) => handleListOrders(req, realApiDeps);
