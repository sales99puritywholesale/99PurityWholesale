"use client";

import React from 'react';
import FaqSchema from '@/components/seo/FaqSchema';
import { Plus } from 'lucide-react';
import { Eyebrow, h2 } from '@/components/home/ui';
import { RevealGroup, SplitHeading } from '@/components/home/Reveal';

interface FaqItem {
  q: string;
  a: string;
  link?: string;
  linkText?: string;
}

interface FaqSectionProps {
  id?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  items: FaqItem[];
  theme?: 'light' | 'dark' | 'white';
  /** Set to false when the caller renders its own <FaqSchema> (e.g. with markdown-stripped answer text) to avoid emitting duplicate JSON-LD. */
  includeSchema?: boolean;
}

function renderAnswer(text: string) {
  return text.split(/(\[[^\]]+\]\([^)]+\))/g).map((segment, i) => {
    const match = segment.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (!match) return <React.Fragment key={i}>{segment}</React.Fragment>;
    const [, label, href] = match;
    const external = href.startsWith('http');
    return (
      <a key={i} href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="underline underline-offset-2">
        {label}
      </a>
    );
  });
}

/**
 * FAQ in the homepage style: eyebrow + split headline on the left, numbered native <details> rows on the right.
 * Every answer is real HTML (crawlable) and the rows work without JavaScript.
 */
export default function FaqSection({ id = 'faq', eyebrow = 'FAQ', title, subtitle, items = [], theme = 'light', includeSchema = true }: FaqSectionProps) {
  if (!items || items.length === 0) return null;
  const dark = theme === 'dark';
  const cleanEyebrow = eyebrow.replace(/^\(|\)$/g, '');

  const body = (
    <div className="mx-auto w-full max-w-[1440px] px-5 md:px-10">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.4fr] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Eyebrow light={dark} className="mb-5">{cleanEyebrow}</Eyebrow>
          <SplitHeading text={title} className={`${h2} ${dark ? '!text-white' : ''}`} />
          {subtitle && <p className={`mt-6 max-w-sm text-[14px] leading-relaxed ${dark ? 'text-white/60' : 'text-[#0B0F14]/60'}`}>{subtitle}</p>}
        </div>

        <RevealGroup className={`divide-y border-y ${dark ? 'divide-white/10 border-white/10' : 'divide-[#0B0F14]/10 border-[#0B0F14]/10'}`}>
          {items.map((faq, i) => (
            <details key={i} data-reveal className="group">
              <summary className="flex cursor-pointer list-none items-center gap-5 py-6 outline-none md:gap-8 md:py-7 [&::-webkit-details-marker]:hidden">
                <span className={`font-dm-mono text-[10px] tracking-[0.2em] ${dark ? 'text-white/40' : 'text-[#0B0F14]/40'}`}>{String(i + 1).padStart(2, '0')}</span>
                <h3 className={`flex-1 text-[1.05rem] font-light leading-snug tracking-[-0.02em] md:text-[1.3rem] ${dark ? 'text-white' : 'text-[#0B0F14]'}`}>{faq.q}</h3>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-transform duration-300 group-open:rotate-45 ${dark ? 'border-white/20 text-white' : 'border-[#0B0F14]/15 text-[#0B0F14]'}`}>
                  <Plus className="h-4 w-4" />
                </span>
              </summary>
              <div className="pb-7 pl-[2.6rem] pr-14 md:pl-[3.4rem]">
                <p className={`max-w-2xl text-[14px] leading-relaxed ${dark ? 'text-white/60' : 'text-[#0B0F14]/65'}`}>{renderAnswer(faq.a)}</p>
                {faq.link && (
                  <a
                    href={faq.link}
                    {...(faq.link.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className={`mt-4 inline-flex items-center gap-2 font-dm-mono text-[10px] uppercase tracking-[0.18em] ${dark ? 'text-[#4FC3D0]' : 'text-[#0B6F7B]'}`}
                  >
                    {faq.linkText ?? 'Learn more'} →
                  </a>
                )}
              </div>
            </details>
          ))}
        </RevealGroup>
      </div>
    </div>
  );

  return (
    <section id={id} className="relative z-10 py-16 md:py-24">
      {includeSchema && <FaqSchema items={items} />}
      {dark ? <div className="mx-3 rounded-[1.75rem] bg-[#0B0D10] py-16 md:mx-4 md:py-24">{body}</div> : body}
    </section>
  );
}
