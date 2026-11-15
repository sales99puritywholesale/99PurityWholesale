'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { Link } from '@/i18n/routing';
import { ArrowRight, ShieldCheck, BarChart3, Building2, Globe, type LucideIcon } from 'lucide-react';
import { registerGsap, useIsoLayoutEffect, clearInline, chromatogramPath, words, MOTION_OK, FINE_POINTER } from './gsap-setup';
import Magnetic from './Magnetic';

export interface HeroProps {
  badge: string;
  title: string;
  subtitle: string;
  primaryCta: string;
  primaryHref: string;
  secondaryCta: string;
  secondaryHref: string;
  imageAlt: string;
  ringText: string;
  chips: Array<{ value: string; label: string }>;
  stats: Array<{ value: string; label: string; icon: 'purity' | 'tested' | 'b2b' | 'origin' }>;
  scrollLabel: string;
  disclaimer: string;
}

const ICONS: Record<HeroProps['stats'][number]['icon'], LucideIcon> = {
  purity: ShieldCheck,
  tested: BarChart3,
  b2b: Building2,
  origin: Globe,
};

// decorative HPLC-style trace (illustrative artwork, not measured data)
const TRACE = chromatogramPath(1600, 220, [
  [0.1, 0.1, 0.012],
  [0.22, 0.28, 0.014],
  [0.38, 0.12, 0.01],
  [0.55, 0.62, 0.016],
  [0.7, 0.2, 0.012],
  [0.84, 0.36, 0.014],
  [0.95, 0.1, 0.01],
]);

export default function HomeHero(p: HeroProps) {
  const root = useRef<HTMLElement>(null);
  const titleWords = words(p.title);
  const accentFrom = Math.max(0, titleWords.length - 2);

  useIsoLayoutEffect(() => {
    const { gsap, ScrollTrigger } = registerGsap();
    const el = root.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    const mm = gsap.matchMedia();

    mm.add(MOTION_OK, () => {
      // ---- intro timeline ---------------------------------------------------
      const tl = gsap.timeline({ defaults: { ease: 'power4.out' }, delay: 0.15 });
      tl.fromTo(q('[data-hero-badge]'), { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.9 }, 0)
        .fromTo(q('.hero-word'), { yPercent: 112, y: 0, autoAlpha: 0 }, { yPercent: 0, y: 0, autoAlpha: 1, duration: 1.25, stagger: 0.07 }, 0.1)
        .fromTo(q('[data-hero-sub]'), { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 1 }, 0.65)
        .fromTo(q('[data-hero-cta]'), { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.1 }, 0.8)
        .fromTo(q('.hero-img-wrap'), { clipPath: 'inset(100% 0% 0% 0% round 2rem)' }, { clipPath: 'inset(0% 0% 0% 0% round 2rem)', duration: 1.5, ease: 'power4.inOut' }, 0.2)
        .fromTo(q('[data-hero-img]'), { scale: 1.4 }, { scale: 1.02, duration: 2.4 }, 0.2)
        .fromTo(q('[data-hero-chip]'), { autoAlpha: 0, scale: 0.7, y: 20 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.9, stagger: 0.14, ease: 'back.out(1.6)' }, 1.15)
        .fromTo(q('[data-hero-ring]'), { autoAlpha: 0, scale: 0.4, rotate: -90 }, { autoAlpha: 1, scale: 1, rotate: 0, duration: 1.2 }, 1.3)
        .fromTo(q('[data-hero-stat]'), { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.08 }, 1.2)
        .fromTo(q('[data-hero-trace]'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 3.2, ease: 'power2.inOut' }, 0.5)
        .fromTo(q('[data-hero-meta]'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 1 }, 1.6);

      // ---- idle float for chips --------------------------------------------
      q('[data-hero-chip]').forEach((chip, i) => {
        gsap.to(chip, { yPercent: i % 2 ? 14 : -14, duration: 2.6 + i * 0.5, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 2 + i * 0.3 });
      });

      // ---- scroll-out parallax ---------------------------------------------
      gsap.to(q('[data-hero-content]'), {
        yPercent: -10,
        autoAlpha: 0.2,
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top top', end: 'bottom top', scrub: true },
      });
      gsap.to(q('.hero-img-wrap'), {
        yPercent: 8,
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top top', end: 'bottom top', scrub: true },
      });

      // ---- pointer parallax + spotlight (fine pointers only) ---------------
      const fine = window.matchMedia(FINE_POINTER).matches;
      let move: ((e: PointerEvent) => void) | undefined;
      if (fine) {
        const layers = q('[data-depth]').map((node) => ({
          x: gsap.quickTo(node, 'x', { duration: 1.1, ease: 'power3.out' }),
          y: gsap.quickTo(node, 'y', { duration: 1.1, ease: 'power3.out' }),
          d: parseFloat((node as HTMLElement).dataset.depth || '0'),
        }));
        const glow = q('[data-hero-glow]')[0];
        const gx = gsap.quickTo(glow, 'x', { duration: 0.9, ease: 'power3.out' });
        const gy = gsap.quickTo(glow, 'y', { duration: 0.9, ease: 'power3.out' });
        move = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          const nx = (e.clientX - r.left) / r.width - 0.5;
          const ny = (e.clientY - r.top) / r.height - 0.5;
          layers.forEach((l) => {
            l.x(nx * l.d);
            l.y(ny * l.d);
          });
          gx(e.clientX - r.left);
          gy(e.clientY - r.top);
        };
        el.addEventListener('pointermove', move);
      }

      return () => {
        if (move) el.removeEventListener('pointermove', move);
      };
    });

    return () => {
      mm.revert();
      clearInline(q('.hero-word,[data-hero-img],[data-hero-chip],[data-hero-ring],[data-hero-content],.hero-img-wrap,[data-depth]'), 'transform');
    };
  }, []);

  return (
    <section ref={root} className="relative flex min-h-[100svh] flex-col overflow-hidden bg-[#090C11] text-[#EDF2F7]">
      {/* backdrop */}
      <div aria-hidden className="home-grid-bg pointer-events-none absolute inset-0" />
      <div aria-hidden className="pointer-events-none absolute -left-40 top-1/3 h-[34rem] w-[34rem] rounded-full bg-[#4FC3D0]/10 blur-[140px]" />
      <div
        data-hero-glow
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 hidden h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(79,195,208,0.16),transparent_62%)] lg:block"
      />

      {/* chromatogram trace along the bottom */}
      <svg aria-hidden viewBox="0 0 1600 220" preserveAspectRatio="none" className="pointer-events-none absolute bottom-24 left-0 h-48 w-full opacity-60 lg:bottom-28">
        <path data-hero-trace d={TRACE} fill="none" stroke="#4FC3D0" strokeWidth="1.5" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={0} />
      </svg>

      <div className="relative z-10 mx-auto grid w-full max-w-[1500px] flex-1 grid-cols-1 items-center gap-10 px-6 pb-10 pt-32 lg:grid-cols-12 lg:gap-6 lg:px-12 lg:pt-36">
        {/* ---- copy ---- */}
        <div data-hero-content className="lg:col-span-7">
          <div data-hero-badge className="hero-in mb-8 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 backdrop-blur-xl lg:mb-10">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4FC3D0] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4FC3D0]" />
            </span>
            <span className="font-dm-mono text-[10px] font-medium uppercase tracking-[0.32em] text-[#EDF2F7]/70">{p.badge}</span>
          </div>

          <h1 className="mb-8 font-absans text-[clamp(2.15rem,4.9vw,5.4rem)] font-bold uppercase leading-[0.98] tracking-tighter lg:mb-10">
            {titleWords.map((w, i) => (
              <span key={i} className="inline-block overflow-hidden pb-[0.12em] align-bottom -mb-[0.12em]">
                <span className={`hero-word inline-block will-change-transform ${i >= accentFrom ? 'text-[#4FC3D0]' : ''}`}>
                  {w}
                  {i < titleWords.length - 1 ? ' ' : ''}
                </span>
              </span>
            ))}
          </h1>

          <p data-hero-sub className="hero-in mb-10 max-w-xl font-archia text-base font-medium leading-relaxed text-[#EDF2F7]/55 md:text-lg lg:mb-12">
            {p.subtitle}
          </p>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div data-hero-cta className="hero-in">
              <Magnetic strength={0.25} className="w-full sm:w-auto">
                <Link
                  href={p.primaryHref}
                  className="group relative flex w-full items-center justify-center gap-4 overflow-hidden rounded-full bg-[#4FC3D0] px-9 py-5 font-bold uppercase tracking-[0.18em] text-[#090C11] transition-shadow duration-500 hover:shadow-[0_0_60px_rgba(79,195,208,0.45)] sm:w-auto"
                >
                  <span className="absolute inset-0 -translate-x-full bg-white transition-transform duration-500 ease-out group-hover:translate-x-0" />
                  <span className="relative flex items-center gap-4 text-[11px] lg:text-xs">
                    {p.primaryCta}
                    <ArrowRight className="h-4 w-4 transition-transform duration-500 group-hover:translate-x-1" />
                  </span>
                </Link>
              </Magnetic>
            </div>
            <div data-hero-cta className="hero-in">
              <Magnetic strength={0.25} className="w-full sm:w-auto">
                <Link
                  href={p.secondaryHref}
                  className="flex w-full items-center justify-center rounded-full border border-white/15 bg-white/[0.04] px-9 py-5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#EDF2F7] backdrop-blur-xl transition-colors duration-300 hover:border-[#4FC3D0]/60 hover:text-[#4FC3D0] sm:w-auto lg:text-xs"
                >
                  {p.secondaryCta}
                </Link>
              </Magnetic>
            </div>
          </div>
        </div>

        {/* ---- visual ---- */}
        <div className="relative mx-auto w-full max-w-[460px] lg:col-span-5 lg:max-w-none lg:pl-8">
          <div data-depth="18" className="relative">
            <div className="hero-img-wrap relative aspect-[4/5] w-full overflow-hidden rounded-[2rem] lg:aspect-auto lg:h-[min(58vh,600px)] border border-white/10 bg-[#0e131b] shadow-[0_40px_120px_rgba(0,0,0,0.6)]">
              <Image
                data-hero-img
                src="/hero-dark.png"
                alt={p.imageAlt}
                fill
                priority
                sizes="(max-width: 1024px) 90vw, 40vw"
                quality={75}
                className="object-cover object-[50%_60%]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#090C11]/70 via-transparent to-[#090C11]/10" />
            </div>

            {/* floating spec chips */}
            {p.chips.map((c, i) => (
              <div
                key={c.label}
                data-hero-chip
                data-depth={i % 2 ? '-34' : '40'}
                className={`hero-in absolute z-10 rounded-2xl border border-white/15 bg-[#0e131b]/70 px-4 py-3 shadow-2xl backdrop-blur-xl ${
                  i === 0 ? '-left-3 top-[14%] lg:-left-10' : i === 1 ? '-right-2 top-[46%] lg:-right-8' : '-left-2 bottom-[10%] lg:-left-12'
                }`}
              >
                <div className="font-absans text-xl font-bold leading-none tracking-tight text-[#EDF2F7] lg:text-2xl">{c.value}</div>
                <div className="mt-1.5 font-dm-mono text-[9px] uppercase tracking-[0.24em] text-[#4FC3D0]">{c.label}</div>
              </div>
            ))}

            {/* rotating seal */}
            <div data-hero-ring className="hero-in absolute -top-10 right-3 z-10 hidden h-32 w-32 items-center justify-center sm:flex lg:-right-6">
              <svg viewBox="0 0 120 120" className="home-spin absolute inset-0 h-full w-full">
                <defs>
                  <path id="seal-circle" d="M60,60 m-46,0 a46,46 0 1,1 92,0 a46,46 0 1,1 -92,0" />
                </defs>
                <text fill="#EDF2F7" fontSize="8.5" fontFamily="var(--font-dm-mono)" className="uppercase">
                  <textPath href="#seal-circle" textLength="286" lengthAdjust="spacing">{p.ringText}</textPath>
                </text>
              </svg>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#4FC3D0] font-goku text-xl font-bold text-[#090C11]">99</div>
            </div>
          </div>
        </div>
      </div>

      {/* ---- bottom bar ---- */}
      <div className="relative z-10 border-t border-white/[0.07] bg-[#090C11]/70 backdrop-blur-2xl">
        <div className="mx-auto grid max-w-[1500px] grid-cols-2 gap-x-6 gap-y-6 px-6 py-6 lg:grid-cols-4 lg:px-12 lg:py-7">
          {p.stats.map((s) => {
            const Icon = ICONS[s.icon];
            return (
              <div key={s.label} data-hero-stat className="hero-in flex items-center gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-[#4FC3D0]">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <div>
                  <div className="font-absans text-lg font-bold leading-none tracking-tight">{s.value}</div>
                  <div className="mt-1.5 font-dm-mono text-[9px] uppercase tracking-[0.24em] text-[#EDF2F7]/40">{s.label}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div data-hero-meta className="hero-in flex items-center justify-between gap-6 border-t border-white/[0.05] px-6 py-3 font-dm-mono text-[9px] uppercase tracking-[0.22em] text-[#EDF2F7]/35 lg:px-12">
          <span className="max-w-[70%] leading-relaxed">{p.disclaimer}</span>
          <span className="hidden items-center gap-3 sm:flex">
            {p.scrollLabel}
            <span className="relative block h-8 w-px overflow-hidden bg-white/15">
              <span className="animate-scroll-dot absolute left-0 top-0 h-2 w-px bg-[#4FC3D0]" />
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
