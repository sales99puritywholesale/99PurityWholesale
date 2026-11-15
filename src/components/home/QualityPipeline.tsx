'use client';

import { useRef } from 'react';
import { Link } from '@/i18n/routing';
import { ArrowRight } from 'lucide-react';
import { registerGsap, useIsoLayoutEffect, chromatogramPath, MOTION_OK, DESKTOP } from './gsap-setup';

export interface PipelineProps {
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
  ctaHref: string;
  caption: string;
  illustrative: string;
  specLabel: string;
  specValue: string;
  steps: Array<{ title: string; desc: string }>;
}

// decorative HPLC-style trace (illustrative artwork, not measured data)
const W = 800;
const H = 360;
const PEAKS: Array<[number, number, number]> = [
  [0.14, 0.1, 0.012],
  [0.3, 0.26, 0.015],
  [0.52, 0.72, 0.019],
  [0.68, 0.16, 0.013],
  [0.84, 0.09, 0.011],
];
const TRACE = chromatogramPath(W, H, PEAKS);
const MAIN_X = (0.52 * 100).toFixed(1);
const MAIN_Y = ((0.86 - 0.72) * 100).toFixed(1);

/**
 * Desktop: pinned for ~2 screens; scrolling draws the chromatogram and walks
 * through the four process steps. Mobile / reduced motion: static, draws on enter.
 */
export default function QualityPipeline(p: PipelineProps) {
  const pin = useRef<HTMLDivElement>(null);

  useIsoLayoutEffect(() => {
    const { gsap } = registerGsap();
    const el = pin.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    const mm = gsap.matchMedia();

    mm.add(`${DESKTOP} and ${MOTION_OK}`, () => {
      const steps = q('[data-step]');
      const marks = q('[data-mark]');
      let active = -1;
      const setActive = (i: number) => {
        if (i === active) return;
        active = i;
        steps.forEach((s, idx) => {
          s.setAttribute('data-active', String(idx === i));
          gsap.to(s, { opacity: idx === i ? 1 : idx < i ? 0.55 : 0.28, x: idx === i ? 12 : 0, duration: 0.5, ease: 'power3.out', overwrite: 'auto' });
          const bar = s.querySelector('[data-step-bar]');
          if (bar) gsap.to(bar, { scaleY: idx <= i ? 1 : 0, duration: 0.5, ease: 'power3.out', overwrite: 'auto' });
        });
      };
      el.classList.add('q-pinned');
      gsap.set(steps, { opacity: 0.28 });
      gsap.set(marks, { autoAlpha: 0, scale: 0.4 });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: el,
          start: 'top top',
          end: '+=220%',
          pin: true,
          scrub: 0.6,
          anticipatePin: 1,
          onUpdate: (self) => setActive(Math.min(p.steps.length - 1, Math.floor(self.progress * p.steps.length))),
        },
      });
      tl.fromTo(q('[data-trace]'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: 'none', duration: 1 }, 0)
        .to(marks, { autoAlpha: 1, scale: 1, ease: 'back.out(2)', stagger: 0.18, duration: 0.12 }, 0.25)
        .fromTo(q('[data-glow]'), { opacity: 0.1 }, { opacity: 1, ease: 'none', duration: 1 }, 0);
      setActive(0);
      return () => el.classList.remove('q-pinned');
    });

    mm.add(`(max-width: 1023px) and ${MOTION_OK}`, () => {
      gsap.fromTo(
        q('[data-trace]'),
        { strokeDashoffset: 1 },
        { strokeDashoffset: 0, duration: 2.6, ease: 'power2.inOut', scrollTrigger: { trigger: q('[data-chart]')[0], start: 'top 80%', once: true } }
      );
    });

    return () => mm.revert();
  }, [p.steps.length]);

  return (
    <div ref={pin} className="relative overflow-hidden bg-[#070A0F] text-[#EDF2F7] lg:flex lg:min-h-screen lg:items-center">
      <div aria-hidden className="home-grid-bg pointer-events-none absolute inset-0 opacity-70" />
      <div data-glow aria-hidden className="pointer-events-none absolute right-[-10%] top-1/4 h-[40rem] w-[40rem] rounded-full bg-[#4FC3D0]/[0.12] blur-[130px]" />

      <div className="relative z-10 mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-14 px-6 py-24 lg:grid-cols-12 lg:gap-10 lg:px-12 lg:py-16">
        {/* copy + steps */}
        <div className="lg:col-span-6">
          <div className="mb-6 flex items-center gap-3">
            <span className="h-px w-10 bg-[#4FC3D0]/60" />
            <span className="font-dm-mono text-[10px] uppercase tracking-[0.32em] text-[#4FC3D0]">{p.eyebrow}</span>
          </div>
          <h2 className="mb-6 font-absans text-[clamp(2rem,4.2vw,4.2rem)] font-bold uppercase leading-[0.96] tracking-tighter">{p.title}</h2>
          <p className="mb-10 max-w-xl font-archia text-base leading-relaxed text-[#EDF2F7]/50 lg:mb-12">{p.description}</p>

          <ol className="mb-10 space-y-6 lg:mb-12">
            {p.steps.map((s, i) => (
              <li key={s.title} data-step className="relative pl-8 transition-none">
                <span data-step-bar className="absolute bottom-0 left-0 top-0 w-[2px] origin-top bg-[#4FC3D0]" />
                <div className="flex items-baseline gap-4">
                  <span className="font-dm-mono text-xs tracking-[0.2em] text-[#4FC3D0]">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="font-absans text-xl font-bold uppercase tracking-tight lg:text-2xl">{s.title}</h3>
                </div>
                <div data-step-desc>
                  <p className="mt-2 max-w-md font-archia text-sm leading-relaxed text-[#EDF2F7]/50">{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>

          <Link
            href={p.ctaHref}
            className="group inline-flex items-center gap-4 rounded-full border border-white/15 bg-white/[0.04] px-8 py-4 text-[10px] font-bold uppercase tracking-[0.28em] transition-all hover:border-[#4FC3D0] hover:bg-[#4FC3D0] hover:text-[#090C11]"
          >
            {p.cta}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {/* chromatogram */}
        <div className="lg:col-span-6 lg:flex lg:items-center">
          <div data-chart className="relative w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b1118] p-5 shadow-[0_40px_120px_rgba(0,0,0,0.55)] sm:p-7">
            <div className="mb-5 flex items-center justify-between font-dm-mono text-[9px] uppercase tracking-[0.24em] text-[#EDF2F7]/40">
              <span>{p.caption}</span>
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#4FC3D0]" />
                {p.illustrative}
              </span>
            </div>

            <div className="relative aspect-[800/360] w-full">
              <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" role="img" aria-label={p.illustrative}>
                {[0.2, 0.4, 0.6, 0.8].map((g) => (
                  <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="rgba(237,242,247,0.06)" />
                ))}
                {[0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875].map((g) => (
                  <line key={g} y1="0" y2={H} x1={W * g} x2={W * g} stroke="rgba(237,242,247,0.035)" />
                ))}
                <line x1="0" x2={W} y1={H * 0.86} y2={H * 0.86} stroke="rgba(237,242,247,0.18)" />
                <path d={`${TRACE} L${W} ${H} L0 ${H} Z`} fill="url(#trace-fill)" opacity="0.55" />
                <defs>
                  <linearGradient id="trace-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4FC3D0" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#4FC3D0" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path data-trace d={TRACE} fill="none" stroke="#4FC3D0" strokeWidth="2.2" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={0} />
              </svg>

              {/* peak markers */}
              {PEAKS.map(([c, h], i) => (
                <span
                  key={i}
                  data-mark
                  className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#EDF2F7] ring-4 ring-[#4FC3D0]/30"
                  style={{ left: `${c * 100}%`, top: `${(0.86 - h) * 100}%` }}
                />
              ))}
              <div data-mark className="absolute -translate-x-1/2 -translate-y-full" style={{ left: `${MAIN_X}%`, top: `calc(${MAIN_Y}% - 14px)` }}>
                <div className="whitespace-nowrap rounded-lg border border-[#4FC3D0]/40 bg-[#090C11]/90 px-3 py-1.5 font-dm-mono text-[10px] tracking-[0.12em] text-[#4FC3D0]">{p.specValue}</div>
              </div>
            </div>

            <div className="mt-5 flex items-end justify-between border-t border-white/10 pt-5">
              <div>
                <div className="font-dm-mono text-[9px] uppercase tracking-[0.24em] text-[#EDF2F7]/40">{p.specLabel}</div>
                <div className="mt-1.5 font-absans text-3xl font-bold leading-none tracking-tight sm:text-4xl">{p.specValue}</div>
              </div>
              <div className="font-dm-mono text-[9px] uppercase tracking-[0.24em] text-[#EDF2F7]/40">HPLC &middot; LC-MS</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
