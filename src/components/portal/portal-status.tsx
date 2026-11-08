export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<StatusTone, string> = {
  neutral: 'bg-portal-canvas text-portal-muted border-portal-border',
  success: 'bg-portal-success-soft text-portal-success border-[#ABEFC6]',
  warning: 'bg-portal-warning-soft text-portal-warning border-[#FEDF89]',
  danger: 'bg-portal-danger-soft text-portal-danger border-[#FECDCA]',
  info: 'bg-[#E6F6F8] text-portal-accent-strong border-[#B7E4EA]',
};

/**
 * Single shared status pill. Meaning is carried by the text, never by colour alone.
 * Order and invoice status mappings will live next to this component in later milestones (one place, internal vs display).
 */
export function PortalStatusPill({ label, tone = 'neutral' }: { label: string; tone?: StatusTone }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>{label}</span>
  );
}
