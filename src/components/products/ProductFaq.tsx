import FaqSchema from '@/components/seo/FaqSchema';
import { Eyebrow, SplitHeading, h2, WRAP, SECTION } from '@/components/home/page-kit';

interface FaqItem {
  q: string;
  a: string;
  link?: string;
  linkText?: string;
}

function renderAnswer(text: string) {
  const segments = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return segments.map((segment, i) => {
    const match = segment.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (match) {
      const [, label, href] = match;
      const external = href.startsWith('http');
      return (
        <a key={i} href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="text-[#0B6F7B] underline underline-offset-2">
          {label}
        </a>
      );
    }
    return <span key={i}>{segment}</span>;
  });
}

/** FAQ accordion in the homepage style. Emits the same FAQPage JSON-LD as the shared FaqSection. */
export default function ProductFaq({
  id = 'faq',
  eyebrow = 'FAQ',
  title,
  subtitle,
  items,
  className = '',
  includeSchema = true,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  items: FaqItem[];
  className?: string;
  includeSchema?: boolean;
}) {
  if (!items || items.length === 0) return null;
  return (
    <section id={id} className={`${SECTION} ${className}`}>
      {includeSchema && <FaqSchema items={items} />}
      <div className={WRAP}>
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-20">
          <div>
            <Eyebrow className="mb-5">{eyebrow}</Eyebrow>
            <SplitHeading text={title} className={h2} />
            {subtitle && <p className="mt-6 max-w-md text-[14px] leading-relaxed text-[#0B0F14]/60">{subtitle}</p>}
          </div>
          <div className="divide-y divide-[#E6EAF1] border-y border-[#E6EAF1]">
            {items.map((faq, i) => (
              <details key={i} className="group py-1" {...(i === 0 ? { open: true } : {})}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 outline-none focus-visible:ring-2 focus-visible:ring-[#4FC3D0] [&::-webkit-details-marker]:hidden">
                  <h3 className="text-[1.02rem] font-normal leading-snug tracking-[-0.02em] md:text-[1.15rem]">{faq.q}</h3>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#0B0F14]/15 text-xl font-light leading-none transition-transform duration-300 group-open:rotate-45 group-open:bg-[#4FC3D0] group-open:text-[#0B0F14]" aria-hidden>
                    +
                  </span>
                </summary>
                <div className="max-w-2xl pb-6 pr-12 text-[14px] leading-relaxed text-[#0B0F14]/60">
                  <p>{renderAnswer(faq.a)}</p>
                  {faq.link && (
                    <a href={faq.link} {...(faq.link.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="mt-3 inline-block font-dm-mono text-[11px] uppercase tracking-[0.14em] text-[#0B6F7B]">
                      {faq.linkText ?? 'Learn more'} →
                    </a>
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
