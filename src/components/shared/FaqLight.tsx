import React from 'react';
import FaqSchema from '@/components/seo/FaqSchema';
import { Section } from '@/components/home/page-kit';

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
    return <React.Fragment key={i}>{segment}</React.Fragment>;
  });
}

/** Light FAQ accordion in the homepage style (used by the glossary, wholesale application and calculator pages). */
export default function FaqLight({
  id = 'faq',
  eyebrow = 'FAQ',
  title,
  subtitle,
  items,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  items: FaqItem[];
}) {
  if (!items || items.length === 0) return null;
  return (
    <Section id={id} eyebrow={eyebrow} title={title} description={subtitle}>
      <FaqSchema items={items} />
      <div className="overflow-hidden rounded-[1.25rem] border border-[#E6EAF1] bg-white">
        {items.map((faq, i) => (
          <details key={i} className="group border-b border-[#E6EAF1] last:border-b-0">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 outline-none focus-visible:ring-2 focus-visible:ring-[#4FC3D0] md:px-8 md:py-6 [&::-webkit-details-marker]:hidden">
              <span className="flex items-baseline gap-4">
                <span className="font-dm-mono text-[10px] tracking-[0.16em] text-[#0B0F14]/40">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="text-[1.05rem] font-medium leading-snug tracking-[-0.02em] text-[#0B0F14] md:text-[1.15rem]">{faq.q}</h3>
              </span>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#E6EAF1] text-lg font-light text-[#0B0F14]/60 transition-transform duration-300 group-open:rotate-45">+</span>
            </summary>
            <div className="px-5 pb-6 md:px-8 md:pb-8 md:pl-[4.25rem]">
              <p className="max-w-3xl text-[14px] leading-relaxed text-[#0B0F14]/65">{renderAnswer(faq.a)}</p>
              {faq.link && (
                <a href={faq.link} {...(faq.link.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="mt-4 inline-block font-dm-mono text-[11px] uppercase tracking-[0.14em] text-[#0B6F7B]">
                  {faq.linkText ?? 'Learn more'} &rarr;
                </a>
              )}
            </div>
          </details>
        ))}
      </div>
    </Section>
  );
}
