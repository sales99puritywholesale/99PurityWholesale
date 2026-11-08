import type { Metadata } from 'next';
import { portalCopy } from '@/lib/portal/copy';
import { ClientModulePage } from '@/components/portal/portal-module-page';

export const metadata: Metadata = { title: portalCopy.client.modules.fulfillment.title };

export default function Page() {
  return <ClientModulePage moduleKey="fulfillment" href="/client/fulfillment/setup" />;
}
