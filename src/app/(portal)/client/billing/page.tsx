import type { Metadata } from 'next';
import { portalCopy } from '@/lib/portal/copy';
import { ClientModulePage } from '@/components/portal/portal-module-page';

export const metadata: Metadata = { title: portalCopy.client.modules.billing.title };

export default function Page() {
  return <ClientModulePage moduleKey="billing" href="/client/billing" />;
}
