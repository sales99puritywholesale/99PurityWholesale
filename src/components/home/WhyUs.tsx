'use client';

import { useRef, type ReactNode } from 'react';
import { Check, Download, FlaskConical, Clock } from 'lucide-react';
import { registerGsap, useIsoLayoutEffect, clearInline, MOTION_OK } from './gsap-setup';
import { Eyebrow, h2, card } from './ui';
import { SplitHeading } from './Reveal';

type G = ReturnType<typeof registerGsap>['gsap'];
type Q = (selector: string) => HTMLElement[];
type Build = (g: G, q: Q, tl: gsap.core.Timeline, root: HTMLElement) => void;

const W = 320;
const H = 200;
const TEAL = '#2BB0C0';

/**
 * A 320 x 200 scene that scales to its box and loops while on screen:
 * build in -> hold -> fade out -> build in again.
 */
function Scene({ children, build }: { children: ReactNode; build: Build }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  useIsoLayoutEffect(() => {
    const { gsap, ScrollTrigger } = registerGsap();
    const el = box.current;
    const root = inner.current;
    if (!el || !root) return;

    const fit = () => {
      root.style.transform = `scale(${el.clientWidth / W})`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);

    const q = gsap.utils.selector(root) as Q;
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      const tl = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 0.3, defaults: { ease: 'power3.out' } });
      tl.fromTo(root, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, ease: 'none' }, 0);
      build(gsap, q, tl, root);
      tl.to(root, { autoAlpha: 0, duration: 0.5, ease: 'power2.in' }, '+=2.4');
      const st = ScrollTrigger.create({ trigger: el, start: 'top 92%', end: 'bottom 4%', onToggle: (s) => (s.isActive ? tl.play() : tl.pause()) });
      if (st.isActive) tl.play();
    });

    return () => {
      ro.disconnect();
      mm.revert();
      clearInline(root.querySelectorAll('*'), 'transform,opacity,visibility,strokeDashoffset,backgroundColor');
      clearInline(root, 'opacity,visibility');
    };
    // build functions are static per scene
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={box} className="relative w-full overflow-hidden rounded-[0.9rem] bg-gradient-to-br from-[#EEF2F8] to-[#F8FAFC]" style={{ aspectRatio: `${W} / ${H}` }}>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(11,15,20,0.09)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_at_center,#000_30%,transparent_85%)]" />
      <div ref={inner} aria-hidden className="absolute left-0 top-0 origin-top-left font-sans text-[#0B0F14]" style={{ width: W, height: H }}>
        {children}
      </div>
    </div>
  );
}

const Pill = ({ children, className = '', ...p }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLSpanElement>) => (
  <span {...p} className={`absolute rounded-full border border-[#0B0F14]/10 bg-white px-2.5 py-1 text-[8.5px] font-medium shadow-[0_6px_16px_rgba(11,15,20,0.08)] ${className}`}>
    {children}
  </span>
);

export interface WhyUsLabels {
  usMade: string;
  tested: string;
  purity: string;
  coa: string;
  lot: string;
  verified: string;
  tiers: Array<{ name: string; kits: string }>;
  ask: string;
  reply: string;
  online: string;
}

/* 1 — U.S. laboratory: vial fills while the purity readout counts up */
const lab = (l: WhyUsLabels): [ReactNode, Build] => [
  <>
    <div className="absolute left-[46px] top-[26px] h-[16px] w-[52px] rounded-md bg-[#0B0F14]" />
    <div className="absolute left-[38px] top-[42px] h-[132px] w-[68px] overflow-hidden rounded-[16px] border-2 border-[#0B0F14]/70 bg-white/60">
      <div data-liq="" className="absolute inset-x-0 bottom-0 h-[78%] bg-gradient-to-t from-[#2BB0C0]/70 to-[#2BB0C0]/30" />
      {[14, 34, 50].map((x, i) => (
        <span key={x} data-bub="" className="absolute bottom-3 h-1.5 w-1.5 rounded-full bg-white/80" style={{ left: x, animationDelay: `${i}s` }} />
      ))}
    </div>
    <div className="absolute left-[128px] top-[48px]">
      <div className="mb-1 font-mono text-[8px] uppercase tracking-[0.16em] text-[#0B0F14]/45">{l.purity}</div>
      <div data-count="" className="text-[40px] font-light leading-none tracking-[-0.05em]">
        ≥99.0%
      </div>
      <div className="mt-2 h-1 w-[150px] rounded-full bg-[#0B0F14]/10">
        <div data-t="" className="h-1 rounded-full bg-[#2BB0C0]" style={{ width: '99%' }} />
      </div>
    </div>
    <Pill data-p="" className="left-[128px] top-[132px]">
      <span className="flex items-center gap-1">
        <FlaskConical className="h-2.5 w-2.5 text-[#0B6F7B]" />
        {l.usMade}
      </span>
    </Pill>
    <Pill data-p="" className="left-[206px] top-[132px]">
      {l.tested}
    </Pill>
  </>,
  (g, q, tl) => {
    const c = { v: 0 };
    const out = q('[data-count]')[0];
    tl.fromTo(q('[data-liq]'), { scaleY: 0, transformOrigin: '50% 100%' }, { scaleY: 1, duration: 1.5, ease: 'power2.inOut' }, 0.1)
      .fromTo(c, { v: 0 }, { v: 99, duration: 1.5, ease: 'power2.inOut', onUpdate: () => (out.textContent = `≥${c.v.toFixed(1)}%`) }, 0.1)
      .fromTo(q('[data-t]'), { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 1.5, ease: 'power2.inOut' }, 0.1)
      .fromTo(q('[data-p]'), { scale: 0, transformOrigin: '50% 50%' }, { scale: 1, duration: 0.6, stagger: 0.12, ease: 'back.out(2)' }, 1.3)
      .add(() => {
        out.textContent = '≥99.0%';
      }, 1.7);
    q('[data-bub]').forEach((b, i) => g.fromTo(b, { y: 0, opacity: 0.9 }, { y: -82, opacity: 0, duration: 2.2, repeat: -1, ease: 'none', delay: i * 0.7 }));
  },
];

/* 2 — batch-matched COA: the certificate writes itself and gets stamped */
const coa = (l: WhyUsLabels): [ReactNode, Build] => [
  <>
    <div className="absolute left-[34px] top-[16px] h-[168px] w-[156px] rounded-lg border border-[#0B0F14]/12 bg-white p-3 shadow-[0_12px_28px_rgba(11,15,20,0.1)]">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-semibold">{l.coa}</span>
        <span className="rounded bg-[#0B0F14]/6 px-1 py-[1px] font-mono text-[7px]">{l.lot}</span>
      </div>
      <svg viewBox="0 0 130 44" className="mt-2 h-[44px] w-full" aria-hidden>
        <path d="M0 40H130" stroke="#0B0F14" strokeOpacity="0.15" />
        <path data-d="" pathLength={1} strokeDasharray={1} d="M0 40 L30 40 C36 40 38 38 42 30 C46 20 50 6 56 4 C62 6 66 24 70 34 C74 40 80 40 90 40 L130 40" fill="none" stroke={TEAL} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="mt-2 space-y-1.5">
        {[100, 82, 90, 60].map((w, i) => (
          <div key={i} data-t="" className="h-[5px] rounded bg-[#0B0F14]/12" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div data-stamp="" className="absolute bottom-3 right-3 flex h-[46px] w-[46px] items-center justify-center rounded-full border-2 border-[#2BB0C0] text-[#0B6F7B]">
        <Check className="h-5 w-5" strokeWidth={3} />
      </div>
    </div>
    <div data-sr="" className="absolute left-[208px] top-[44px] flex items-center gap-2 rounded-lg border border-[#0B0F14]/10 bg-white px-2.5 py-2 shadow-[0_8px_20px_rgba(11,15,20,0.1)]">
      <span className="flex h-6 w-6 items-center justify-center rounded bg-[#0B0F14] text-white">
        <Download className="h-3 w-3" />
      </span>
      <div className="leading-tight">
        <div className="text-[8.5px] font-semibold">COA.pdf</div>
        <div className="text-[7px] text-[#0B0F14]/45">{l.lot}</div>
      </div>
    </div>
    <Pill data-p="" className="left-[208px] top-[104px] !text-[#0B6F7B]">
      <span className="flex items-center gap-1">
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
        {l.verified}
      </span>
    </Pill>
  </>,
  (g, q, tl) => {
    tl.fromTo(q('[data-t]'), { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 0.6, stagger: 0.12 }, 0.2)
      .fromTo(q('[data-d]'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut' }, 0.3)
      .fromTo(q('[data-stamp]'), { scale: 2.4, rotate: -24, autoAlpha: 0 }, { scale: 1, rotate: -10, autoAlpha: 1, duration: 0.55, ease: 'back.out(2.2)' }, 1.5)
      .fromTo(q('[data-sr]'), { x: 40, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.7 }, 1.0)
      .fromTo(q('[data-p]'), { scale: 0, transformOrigin: '50% 50%' }, { scale: 1, duration: 0.6, ease: 'back.out(2)' }, 1.9);
  },
];

/* 3 — tiered pricing: volume steps rise and a pointer climbs them */
const tiers = (l: WhyUsLabels): [ReactNode, Build] => [
  <>
    {l.tiers.map((t, i) => {
      const x = 28 + i * 66;
      const h = 36 + i * 24;
      return (
        <div key={t.name} className="absolute" style={{ left: x, top: 0, width: 54, height: H }}>
          <div className="absolute inset-x-0 text-center" style={{ top: 178 - h - 22 }}>
            <span className="whitespace-nowrap font-mono text-[7.5px] leading-none text-[#0B0F14]/55">{t.kits}</span>
          </div>
          <div data-bar="" data-r="" className="absolute bottom-[22px] inset-x-0 rounded-t-lg bg-[#2BB0C0]/25" style={{ height: h }} />
          <div className="absolute inset-x-0 bottom-[6px] text-center text-[8.5px] font-medium">{t.name}</div>
        </div>
      );
    })}
    <div data-ptr="" className="absolute left-[43px] top-[92px] flex h-6 w-6 items-center justify-center rounded-full bg-[#0B0F14] text-white shadow-lg">
      <span className="h-2 w-2 rounded-full bg-[#2BB0C0]" />
    </div>
  </>,
  (g, q, tl) => {
    const bars = q('[data-bar]');
    tl.fromTo(q('[data-r]'), { scaleY: 0, transformOrigin: '50% 100%' }, { scaleY: 1, duration: 0.7, stagger: 0.14 }, 0.1)
      .fromTo(q('[data-ptr]'), { x: 0, y: 0, autoAlpha: 0 }, { x: 0, y: 0, autoAlpha: 1, duration: 0.3 }, 0.9);
    bars.forEach((b, i) => {
      tl.to(b, { backgroundColor: TEAL, duration: 0.35 }, 1.1 + i * 0.4);
      if (i) tl.to(q('[data-ptr]'), { x: i * 66, y: -i * 24, duration: 0.4, ease: 'power2.inOut' }, 1.1 + i * 0.4);
    });
  },
];

/* 4 — B2B support: a short message thread with typing dots */
const support = (l: WhyUsLabels): [ReactNode, Build] => [
  <>
    <div className="absolute left-[24px] top-[14px] flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#2BB0C0] text-[9px] font-semibold text-white">B2B</span>
      <div className="leading-tight">
        <div className="text-[9px] font-semibold">WhatsApp</div>
        <div className="flex items-center gap-1 text-[7px] text-[#0B0F14]/50">
          <span className="h-1.5 w-1.5 rounded-full bg-[#31A24C]" />
          {l.online}
        </div>
      </div>
    </div>
    <div data-s="" className="absolute left-[24px] top-[56px] max-w-[190px] rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-[9px] leading-snug shadow-[0_6px_16px_rgba(11,15,20,0.08)]">
      {l.ask}
    </div>
    <div data-dots="" className="absolute right-[24px] top-[104px] flex gap-1 rounded-2xl rounded-br-sm bg-[#2BB0C0]/25 px-3 py-2.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full bg-[#0B6F7B]" />
      ))}
    </div>
    <div data-sr="" className="absolute right-[24px] top-[104px] max-w-[170px] rounded-2xl rounded-br-sm bg-[#2BB0C0] px-3 py-2 text-[9px] leading-snug text-white shadow-[0_6px_16px_rgba(43,176,192,0.35)]">
      {l.reply}
      <span data-tick="" className="mt-0.5 flex justify-end">
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
        <Check className="-ml-1 h-2.5 w-2.5" strokeWidth={3} />
      </span>
    </div>
    <Pill data-p="" className="bottom-[14px] left-[24px]">
      <span className="flex items-center gap-1">
        <Clock className="h-2.5 w-2.5 text-[#0B6F7B]" />
        {l.online}
      </span>
    </Pill>
  </>,
  (g, q, tl) => {
    const dots = q('[data-dots] span');
    tl.fromTo(q('[data-s]'), { x: -30, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.6 }, 0.2)
      .fromTo(q('[data-dots]'), { autoAlpha: 0, scale: 0.6, transformOrigin: '100% 50%' }, { autoAlpha: 1, scale: 1, duration: 0.3 }, 1.0)
      .to(dots, { y: -3, duration: 0.25, stagger: { each: 0.1, repeat: 3, yoyo: true }, ease: 'sine.inOut' }, 1.05)
      .to(q('[data-dots]'), { autoAlpha: 0, duration: 0.2 }, 2.0)
      .fromTo(q('[data-sr]'), { x: 30, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.6 }, 2.0)
      .fromTo(q('[data-tick]'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 2.5)
      .fromTo(q('[data-p]'), { scale: 0, transformOrigin: '0% 50%' }, { scale: 1, duration: 0.5, ease: 'back.out(2)' }, 2.7);
  },
];

export interface WhyUsItem {
  key: 'lab' | 'coa' | 'pricing' | 'support';
  title: string;
  desc: string;
}

export default function WhyUs({ eyebrow, title, items, labels }: { eyebrow: string; title: string; items: WhyUsItem[]; labels: WhyUsLabels }) {
  const scenes: Record<WhyUsItem['key'], [ReactNode, Build]> = { lab: lab(labels), coa: coa(labels), pricing: tiers(labels), support: support(labels) };

  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 md:px-10">
      <div className="mb-10 md:mb-14">
        <Eyebrow className="mb-5">{eyebrow}</Eyebrow>
        <SplitHeading text={title} className={`${h2} max-w-3xl`} />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.map((it, i) => {
          const [node, build] = scenes[it.key];
          return (
            <div key={it.key} className={`${card} group p-2 transition-shadow duration-500 hover:shadow-[0_24px_60px_rgba(11,15,20,0.08)]`}>
              <Scene build={build}>{node}</Scene>
              <div className="flex items-start gap-4 p-5 pb-4">
                <span className="mt-1 font-dm-mono text-[10px] tracking-[0.2em] text-[#0B0F14]/40">0{i + 1}</span>
                <div>
                  <h3 className="mb-2 text-xl font-normal leading-tight tracking-[-0.03em]">{it.title}</h3>
                  <p className="max-w-md text-[13px] leading-relaxed text-[#0B0F14]/55">{it.desc}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
