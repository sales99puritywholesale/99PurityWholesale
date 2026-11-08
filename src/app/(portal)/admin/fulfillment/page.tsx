import type { Metadata } from 'next';
import { portalCopy } from '@/lib/portal/copy';
import { AdminModulePage } from '@/components/portal/portal-module-page';

export const metadata: Metadata = { title: portalCopy.admin.modules.fulfillment.title };

export default function Page() {
  return <AdminModulePage moduleKey="fulfillment" />;
}
