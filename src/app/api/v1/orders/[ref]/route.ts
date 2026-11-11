import { handleGetOrder } from '@/lib/portal/integrations/handlers';
import { realApiDeps } from '@/lib/portal/integrations/anon-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = (req: Request, { params }: { params: { ref: string } }) => handleGetOrder(req, decodeURIComponent(params.ref), realApiDeps);
