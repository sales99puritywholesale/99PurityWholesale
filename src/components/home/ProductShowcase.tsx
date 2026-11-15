'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { Link } from '@/i18n/routing';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { registerGsap, useIsoLayoutEffect, MOTION_OK, DESKTOP } from './gsap-setup';

export interface ShowcaseItem {
  slug: string;
  name: string;
  spec: string;
  desc: string;
  img: string;
  category: string;
}

export interface ShowcaseProps {
  eyebrow: string;
  titleLead: string;
  titleAccent: string;
  subtitle: string;
  items: ShowcaseItem[];
  labels: { viewSpecs: string; technicalGrade: string; verifiedPurity: string; browseAll: string; hint: string };
}

/**
 * Desktop: the section pins and the card rail travels sideways as you scroll
 * (with inner image parallax). Mobile / reduced motion: a native swipe rail.
 */
export default function ProductShowcase({ eyebrow, titleLead, titleAccent, subtitle, items, labels }: ShowcaseProps) {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const counter = useRef<HTMLSpanElement>(null);

  useIsoLayoutEffect(() => {
    const { gsap, ScrollTrigger } = registerGsap();
    const sec = section.current;
    const rail = track.current;
    if (!sec || !rail) return;
    const mm = gsap.matchMedia();

    mm.add(`${DESKTOP} and ${MOTION_OK}`, () => {
      gsap.set(rail, { overflow: 'visible', scrollSnapType: 'none' });
      const cards = Array.from(rail.querySelectorAll<HTMLElement>('[data-card]'));
      const distance = () => Math.max(0, rail.scrollWidth - window.innerWidth + 96);

      const tween = gsap.to(rail, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: {
          trigger: sec,
          start: 'top top',
          end: () => `+=${distance() + window.innerHeight * 0.25}`,
          pin: true,
          scrub: 0.8,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            if (bar.current) bar.current.style.transform = `scaleX(${self.progress})`;
            if (counter.current) {
              const idx = Math.min(items.length, Math.max(1, Math.round(self.progress * (items.length - 1)) + 1));
              counter.current.textContent = String(idx).padStart(2, '0');
            }
          },
        },
      });

      // inner parallax per card, driven by the horizontal tween
      cards.forEach((card) => {
        const img = card.querySelector('[data-card-img]');
        if (!img) return;
        gsap.fromTo(
          img,
          { xPercent: 9 },
          {
            xPercent: -9,
            ease: 'none',
            scrollTrigger: { trigger: card, containerAnimation: tween, start: 'left 100%', end: 'right 0%', scrub: true },
          }
        );
      });
    });

    // mobile / reduced-motion: just reveal the cards as they appear
    mm.add(`(max-width: 1023px) and ${MOTION_OK}`, () => {
      const head = sec.querySelectorAll('[data-sc-head]');
      gsap.from(head, { y: 36, autoAlpha: 0, duration: 1, stagger: 0.1, ease: 'power3.out', scrollTrigger: { trigger: sec, start: 'top 80%', once: true } });
    });

    return () => mm.revert();
  }, [items.length]);

  return (
    <section ref={section} className="relative bg-[#EDF2F7] text-[#090C11] lg:flex lg:h-screen lg:flex-col lg:justify-center lg:overflow-hidden">
      <div className="mx-auto w-full max-w-[1500px] px-6 pb-8 pt-24 lg:px-12 lg:pb-6 lg:pt-20">
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div data-sc-head className="max-w-3xl">
            <div className="mb-5 flex items-center gap-3">
              <span className="h-px w-10 bg-[#090C11]/30" />
              <span className="font-dm-mono text-[10px] uppercase tracking-[0.32em] text-[#090C11]/50">{eyebrow}</span>
            </div>
            <h2 className="font-absans text-[clamp(1.7rem,4.2vw,4.4rem)] font-bold uppercase leading-[0.96] tracking-tighter">
              {titleLead}
              <span className="ml-3 text-[#1B7F8C]">{titleAccent}</span>
            </h2>
          </div>
          <div data-sc-head className="flex items-end gap-8 lg:max-w-md">
            <p className="font-archia text-sm leading-relaxed text-[#090C11]/55 md:text-base">{subtitle}</p>
            <div className="hidden shrink-0 font-dm-mono text-xs tracking-[0.2em] text-[#090C11]/40 lg:block">
              <span ref={counter} className="text-3xl font-bold text-[#090C11]">01</span>
              <span className="mx-1">/</span>
              {String(items.length).padStart(2, '0')}
            </div>
          </div>
        </div>
      </div>

      <div ref={track} className="no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto px-6 pb-10 will-change-transform lg:snap-none lg:gap-7 lg:px-12 lg:pb-0">
        {items.map((p, i) => (
          <Link
            key={p.slug}
            href={`/products/${p.slug}`}
            data-card
            className="group relative block aspect-[3/4.1] w-[78vw] max-w-[380px] shrink-0 snap-center overflow-hidden rounded-[1.75rem] bg-[#090C11] shadow-[0_30px_80px_rgba(9,12,17,0.18)] sm:w-[360px] lg:h-[min(58vh,560px)] lg:w-auto lg:max-w-none lg:aspect-[3/4.1]"
          >
            <div className="flex h-full flex-col">
              <div className="relative min-h-0 flex-1 overflow-hidden">
                <div data-card-img className="absolute inset-y-0 -inset-x-[10%] transition-transform duration-[1200ms] ease-out group-hover:scale-[1.06]">
                  <Image src={p.img} alt={`${p.name} research peptide, wholesale`} fill sizes="(max-width: 1024px) 80vw, 420px" className="object-cover object-[50%_64%]" />
                </div>
                <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#090C11] to-transparent" />
                <div className="absolute left-5 right-5 top-5 flex items-center justify-between">
                  <span className="rounded-full border border-white/25 bg-[#090C11]/45 px-3 py-1 font-dm-mono text-[9px] uppercase tracking-[0.2em] text-white backdrop-blur-md">{p.category}</span>
                  <span className="font-dm-mono text-[10px] tracking-[0.2em] text-white/80">{String(i + 1).padStart(2, '0')}</span>
                </div>
              </div>

              <div className="shrink-0 bg-[#090C11] px-5 pb-5 pt-1 text-white">
                <h3 className="mb-2 font-absans text-2xl font-bold uppercase leading-none tracking-tight lg:text-[1.65rem]">{p.name}</h3>
                <p className="mb-4 line-clamp-2 font-archia text-xs leading-relaxed text-white/55">{p.desc}</p>
                <div className="flex items-end justify-between border-t border-white/15 pt-4">
                  <div>
                    <div className="font-dm-mono text-[8px] uppercase tracking-[0.22em] text-white/40">{labels.technicalGrade}</div>
                    <div className="mt-1 font-archia text-xs font-bold">{p.spec}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-dm-mono text-[8px] uppercase tracking-[0.22em] text-white/40">{labels.verifiedPurity}</div>
                    <div className="mt-1 font-archia text-xs font-bold text-[#4FC3D0]">&ge;99.0%</div>
                  </div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#090C11] transition-all duration-500 group-hover:rotate-45 group-hover:bg-[#4FC3D0]">
                    <ArrowUpRight className="h-4 w-4" />
                  </span>
                </div>
              </div>
            </div>
          </Link>
        ))}

        {/* closing card */}
        <Link
          href="/products"
          data-card
          className="group relative flex aspect-[3/4.1] w-[78vw] max-w-[380px] shrink-0 snap-center flex-col justify-between overflow-hidden rounded-[1.75rem] bg-[#4FC3D0] p-7 text-[#090C11] sm:w-[360px] lg:h-[min(58vh,560px)] lg:w-[420px] lg:max-w-none lg:aspect-auto"
        >
          <span className="font-dm-mono text-[10px] uppercase tracking-[0.3em]">99 Purity Wholesale</span>
          <div>
            <h3 className="mb-8 font-absans text-4xl font-bold uppercase leading-[0.95] tracking-tighter lg:text-5xl">{labels.browseAll}</h3>
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#090C11] text-white transition-transform duration-500 group-hover:translate-x-3">
              <ArrowRight className="h-6 w-6" />
            </span>
          </div>
        </Link>
      </div>

      <div className="mx-auto hidden w-full max-w-[1500px] px-12 pb-8 pt-8 lg:block">
        <div className="flex items-center gap-6">
          <span className="font-dm-mono text-[9px] uppercase tracking-[0.28em] text-[#090C11]/40">{labels.hint}</span>
          <span className="relative h-px flex-1 bg-[#090C11]/15">
            <span ref={bar} className="absolute inset-0 origin-left scale-x-0 bg-[#090C11]" />
          </span>
        </div>
      </div>
    </section>
  );
}
