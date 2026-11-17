import { Link } from '@/i18n/routing';
import { Eyebrow, PillButton, h2 } from '@/components/home/page-kit';

/** Closing dark panel (homepage style) with a locale-aware secondary link and an optional email link. */
export default function ProductsCta({
  eyebrow,
  title,
  description,
  primary,
  secondary,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  primary: { label: string; href: string; external?: boolean };
  secondary?: { label: string; href: string; external?: boolean };
}) {
  const secCls = 'inline-flex items-center rounded-full border border-white/25 px-5 py-[0.9rem] text-[13px] font-medium transition-colors hover:bg-white hover:text-[#0B0F14]';
  return (
    <section className="px-3 pb-3 pt-6 md:px-4 md:pb-4">
      <div className="relative mx-auto max-w-[1760px] overflow-hidden rounded-[1.75rem] bg-[#0B0D10] px-6 py-20 text-center text-white md:py-28">
        {eyebrow && <Eyebrow light className="mb-6 justify-center">{eyebrow}</Eyebrow>}
        <h2 className={`${h2} mx-auto mb-6 max-w-4xl !text-white`}>{title}</h2>
        {description && <p className="mx-auto mb-9 max-w-xl text-[14px] leading-relaxed text-white/55">{description}</p>}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <PillButton href={primary.href} external={primary.external} variant="teal">{primary.label}</PillButton>
          {secondary &&
            (secondary.external ? (
              <a href={secondary.href} className={secCls}>{secondary.label}</a>
            ) : (
              <Link href={secondary.href} className={secCls}>{secondary.label}</Link>
            ))}
        </div>
      </div>
    </section>
  );
}
