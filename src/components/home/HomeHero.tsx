'use client';

import { useRef } from 'react';
import { Link } from '@/i18n/routing';
import { ArrowRight } from 'lucide-react';
import { registerGsap, useIsoLayoutEffect, clearInline, words, MOTION_OK } from './gsap-setup';
import { Photo } from './ui';

export interface HeroProps {
  image: string | null;
  badge: string;
  title: string;
  subtitle: string;
  primaryCta: string;
  primaryHref: string;
  secondaryCta: string;
  secondaryHref: string;
  imageAlt: string;
  facts: Array<{ value: string; label: string }>;
}

/** Inset rounded photo hero: headline bottom-left, copy + actions bottom-right. */
export default function HomeHero(p: HeroProps) {
  const root = useRef<HTMLElement>(null);
  const titleWords = words(p.title);

  useIsoLayoutEffect(() => {
    const { gsap } = registerGsap();
    const el = root.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      const tl = gsap.timeline({ defaults: { ease: 'power4.out' }, delay: 0.1 });
      tl.fromTo(q('.hero-img-wrap'), { clipPath: 'inset(100% 0% 0% 0% round 1.75rem)' }, { clipPath: 'inset(0% 0% 0% 0% round 1.75rem)', duration: 1.4, ease: 'power4.inOut' }, 0)
        .fromTo(q('[data-hero-img]'), { scale: 1.2 }, { scale: 1, duration: 2.2 }, 0)
        .fromTo(q('.hero-word'), { yPercent: 110, y: 0, autoAlpha: 0 }, { yPercent: 0, y: 0, autoAlpha: 1, duration: 1.1, stagger: 0.06 }, 0.7)
        .fromTo(q('[data-hero-fade]'), { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.1 }, 1.0);

      gsap.to(q('[data-hero-img]'), { yPercent: 8, ease: 'none', scrollTrigger: { trigger: el, start: 'top top', end: 'bottom top', scrub: true } });
    });
    return () => {
      mm.revert();
      clearInline(q('.hero-word,[data-hero-img],.hero-img-wrap'), 'transform');
    };
  }, []);

  return (
    <section ref={root} className="px-3 pt-24 md:px-4 md:pt-32">
      <div className="hero-img-wrap relative mx-auto min-h-[680px] max-w-[1760px] overflow-hidden rounded-[1.75rem] bg-[#0B0F14] h-[calc(100svh-8.5rem)]">
        <div data-hero-img className="absolute -inset-y-[6%] inset-x-0">
          <Photo src={p.image} alt={p.imageAlt} priority sizes="100vw" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-[#06090d]/95 via-[#06090d]/55 to-[#06090d]/20 md:via-[#06090d]/45 md:to-[#06090d]/15" />

        {/* top row */}
        <div className="absolute left-5 right-5 top-5 flex items-start justify-between gap-4 md:left-8 md:right-8 md:top-8">
          <span data-hero-fade className="hero-in rounded-full border border-white/25 bg-white/10 px-4 py-2 font-dm-mono text-[10px] uppercase tracking-[0.18em] text-white backdrop-blur-md">
            {p.badge}
          </span>
          <div data-hero-fade className="hero-in hidden w-56 rounded-2xl border border-white/20 bg-white/10 p-4 text-white backdrop-blur-xl md:block">
            {p.facts.map((f, i) => (
              <div key={f.label} className={i ? 'mt-3 border-t border-white/15 pt-3' : ''}>
                <div className="font-dm-sans text-2xl font-light tracking-[-0.03em]">{f.value}</div>
                <div className="mt-0.5 font-dm-mono text-[9px] uppercase tracking-[0.18em] text-white/60">{f.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* bottom row */}
        <div className="absolute inset-x-5 bottom-6 grid items-end gap-8 md:inset-x-8 md:bottom-9 lg:grid-cols-12">
          <h1 className="font-dm-sans text-[clamp(2rem,4.6vw,4.4rem)] font-light leading-[1.02] tracking-[-0.04em] text-white lg:col-span-8">
            {titleWords.map((w, i) => (
              <span key={i} className="inline-block overflow-hidden pb-[0.12em] align-bottom -mb-[0.12em]">
                <span className="hero-word inline-block will-change-transform">
                  {w}
                  {i < titleWords.length - 1 ? ' ' : ''}
                </span>
              </span>
            ))}
          </h1>
          <div data-hero-fade className="hero-in lg:col-span-4 lg:pl-6">
            <p className="mb-6 max-w-md font-dm-sans text-sm leading-relaxed text-white/75 md:text-[15px]">{p.subtitle}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href={p.primaryHref} className="group inline-flex items-center gap-3 rounded-full bg-[#4FC3D0] py-2 pl-5 pr-2 font-dm-sans text-[13px] font-medium text-[#0B0F14] transition-colors hover:bg-[#7ad8e2]">
                {p.primaryCta}
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0B0F14] text-white transition-transform duration-300 group-hover:-rotate-45">
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
              <Link href={p.secondaryHref} className="inline-flex items-center rounded-full border border-white/35 px-5 py-[0.9rem] font-dm-sans text-[13px] font-medium text-white transition-colors hover:bg-white hover:text-[#0B0F14]">
                {p.secondaryCta}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
