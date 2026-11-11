import { INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, isInvoiceStatus, isPaymentStatus, type InvoiceStatus, type PaymentStatus } from '@/lib/portal/billing/invoices';
import { PortalStatusPill } from './portal-status';

export const dateOnly = (iso: string): string => new Date(iso).toISOString().slice(0, 10);

const INVOICE_TONE: Record<InvoiceStatus, 'warning' | 'info' | 'success' | 'danger'> = { open: 'warning', partially_paid: 'info', paid: 'success', void: 'danger' };
const PAYMENT_TONE: Record<PaymentStatus, 'warning' | 'success' | 'danger' | 'info'> = { reported: 'warning', confirmed: 'success', rejected: 'danger', duplicate: 'info' };

export const InvoiceStatusPill = ({ status }: { status: string }) =>
  isInvoiceStatus(status) ? <PortalStatusPill label={INVOICE_STATUS_LABELS[status]} tone={INVOICE_TONE[status]} /> : <PortalStatusPill label={status} tone="info" />;

export const PaymentStatusPill = ({ status }: { status: string }) =>
  isPaymentStatus(status) ? <PortalStatusPill label={PAYMENT_STATUS_LABELS[status]} tone={PAYMENT_TONE[status]} /> : <PortalStatusPill label={status} tone="info" />;

export const methodLabel = (m: keyof typeof PAYMENT_METHOD_LABELS): string => PAYMENT_METHOD_LABELS[m];
