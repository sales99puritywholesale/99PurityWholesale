import type { ReactNode } from 'react';
import { Eyebrow, PillButton, h2, card } from './ui';
import { RevealGroup, SplitHeading } from './Reveal';

/**
 * Shared building blocks for the public (non-portal) pages, matching the homepage:
 * light #F3F5FA canvas, DM Sans light headings, mono eyebrows with a teal square, white rounded cards,
 * dark rounded closing panel, pill buttons. Server components except where Reveal/SplitHeading animate.
 */

export const WRAP = 'mx-auto w-full max-w-[1440px] px-5 md:px-10';
export const SECTION = 'py-16 md:py-24';
export { Eyebrow, PillButton, RevealGroup, SplitHeading, h2, card };

/** Page canvas. Put every public page inside this (replaces the old per-page backgrounds and negative-margin hacks). */
export function PageShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div data-gsap-owned className={`relative overflow-x-clip bg-[#F3F5FA] font-dm-sans text-[#0B0F14] selection:bg-[#4FC3D0]/30 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Editorial page header: eyebrow, big light headline that slides up word by word, intro copy,
 * optional actions, and an optional row of facts. `aside` renders on the right on large screens
 * (an image, a card, anything).
 */
export function PageHero({
  eyebrow,
  title,
  intro,
  actions,
  facts,
  aside,
  as = 'h1',
}: {
  eyebrow?: string;
  title: string;
  intro?: ReactNode;
  actions?: ReactNode;
  facts?: Array<{ value: string; label: string }>;
  aside?: ReactNode;
  as?: 'h1' | 'h2';
}) {
  return (
    <section className="pb-12 pt-6 md:pb-16 md:pt-10">
      <div className={WRAP}>
        <div className={`grid items-end gap-10 ${aside ? 'lg:grid-cols-[1.25fr_1fr]' : ''}`}>
          <div>
            {eyebrow && <Eyebrow className="mb-6">{eyebrow}</Eyebrow>}
            <SplitHeading as={as} text={title} className="font-dm-sans text-[clamp(2.4rem,6vw,5.4rem)] font-light leading-[0.98] tracking-[-0.05em] text-[#0B0F14]" />
            {intro && <div className="mt-7 max-w-2xl text-[15px] leading-relaxed text-[#0B0F14]/60 md:text-[16px]">{intro}</div>}
            {actions && <div className="mt-8 flex flex-wrap items-center gap-3">{actions}</div>}
          </div>
          {aside && <div>{aside}</div>}
        </div>
        {facts && facts.length > 0 && (
          <dl className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-[1.25rem] border border-[#E6EAF1] bg-[#E6EAF1] md:mt-16 md:grid-cols-4">
            {facts.map((f) => (
              <div key={f.label} className="bg-white p-5 md:p-6">
                <dt className="font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/50">{f.label}</dt>
                <dd className="mt-2 text-[clamp(1.6rem,2.6vw,2.2rem)] font-light leading-none tracking-[-0.04em]">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}

/** Standard section: optional eyebrow/title/description header, then content. */
export function Section({
  eyebrow,
  title,
  description,
  children,
  className = '',
  align = 'left',
  id,
}: {
  eyebrow?: string;
  title?: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  align?: 'left' | 'center';
  id?: string;
}) {
  const center = align === 'center';
  return (
    <section id={id} className={`${SECTION} ${className}`}>
      <div className={WRAP}>
        {(eyebrow || title || description) && (
          <div className={`mb-10 md:mb-14 ${center ? 'mx-auto max-w-3xl text-center' : 'flex flex-col justify-between gap-6 lg:flex-row lg:items-end'}`}>
            <div className={center ? '' : 'max-w-3xl'}>
              {eyebrow && <Eyebrow className={`mb-5 ${center ? 'justify-center' : ''}`}>{eyebrow}</Eyebrow>}
              {title && <SplitHeading text={title} className={h2} />}
            </div>
            {description && <div className={`text-[14px] leading-relaxed text-[#0B0F14]/60 ${center ? 'mx-auto mt-5 max-w-xl' : 'max-w-sm'}`}>{description}</div>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

/** Grid whose children (mark them `data-reveal`) cascade in on scroll. */
export function CardGrid({ children, cols = 3, className = '' }: { children: ReactNode; cols?: 2 | 3 | 4; className?: string }) {
  const c = cols === 2 ? 'md:grid-cols-2' : cols === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-2 lg:grid-cols-3';
  return (
    <RevealGroup className={`grid gap-4 ${c} ${className}`}>
      {children}
    </RevealGroup>
  );
}

/** White rounded card with optional icon/number slot. Add `data-reveal` through props when inside CardGrid. */
export function InfoCard({ icon, title, children, className = '' }: { icon?: ReactNode; title?: string; children?: ReactNode; className?: string }) {
  return (
    <div data-reveal className={`${card} p-6 md:p-7 ${className}`}>
      {icon && <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F5FA] text-[#0B6F7B]">{icon}</div>}
      {title && <h3 className="mb-2 text-[1.15rem] font-medium leading-snug tracking-[-0.02em]">{title}</h3>}
      {children && <div className="text-[13.5px] leading-relaxed text-[#0B0F14]/60">{children}</div>}
    </div>
  );
}

/** Long-form text (legal, policies, glossary entries): readable measure, light headings. */
export function Prose({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`mx-auto max-w-3xl text-[15px] leading-[1.75] text-[#0B0F14]/70
      [&_h2]:mb-4 [&_h2]:mt-12 [&_h2]:font-light [&_h2]:tracking-[-0.03em] [&_h2]:text-[#0B0F14] [&_h2]:text-[clamp(1.5rem,2.6vw,2rem)] [&_h2]:leading-tight
      [&_h3]:mb-3 [&_h3]:mt-8 [&_h3]:text-[1.1rem] [&_h3]:font-medium [&_h3]:text-[#0B0F14]
      [&_p]:mb-4 [&_ul]:mb-5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1.5
      [&_a]:text-[#0B6F7B] [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-medium [&_strong]:text-[#0B0F14] ${className}`}
    >
      {children}
    </div>
  );
}

/** White panel wrapper for forms and dense content. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`${card} p-6 md:p-9 ${className}`}>{children}</div>;
}

/** Closing dark rounded panel, same as the homepage final CTA. */
export function CtaBand({
  eyebrow,
  title,
  description,
  primary,
  secondary,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  primary?: { label: string; href: string; external?: boolean };
  secondary?: { label: string; href: string };
}) {
  return (
    <section className="px-3 pb-3 pt-6 md:px-4 md:pb-4">
      <div className="relative mx-auto max-w-[1760px] overflow-hidden rounded-[1.75rem] bg-[#0B0D10] px-6 py-20 text-center text-white md:py-28">
        {eyebrow && <Eyebrow light className="mb-6 justify-center">{eyebrow}</Eyebrow>}
        <h2 className={`${h2} mx-auto mb-6 max-w-4xl !text-white`}>{title}</h2>
        {description && <p className="mx-auto mb-9 max-w-xl text-[14px] leading-relaxed text-white/55">{description}</p>}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {primary && <PillButton href={primary.href} external={primary.external} variant="teal">{primary.label}</PillButton>}
          {secondary && (
            <a href={secondary.href} className="inline-flex items-center rounded-full border border-white/25 px-5 py-[0.9rem] text-[13px] font-medium transition-colors hover:bg-white hover:text-[#0B0F14]">
              {secondary.label}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
