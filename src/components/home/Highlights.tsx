'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, ArrowUpRight, Lock } from 'lucide-react';
import { registerGsap, useIsoLayoutEffect, MOTION_OK } from './gsap-setup';
import { Eyebrow, h2 } from './ui';
import { SplitHeading } from './Reveal';

export interface HighlightSlide {
  key: string;
  name: string;
  host: string;
  desc: string;
  href: string;
  poster: string;
  phone: string;
}

const AUTOPLAY_SECONDS = 7;
const SLIDE_RATIO = 1405 / 838; // 1405 x 802 screenshot + browser bar

/**
 * Highlights carousel: storefront builds shown in a browser frame (desktop screenshot)
 * with a phone preview on top. The centre slide is large, neighbours are dimmed at the sides. Autoplays with
 * a progress bar, pauses on hover / focus / off screen, and supports arrows, swipe, keys and clicks.
 */
export default function Highlights({
  eyebrow,
  title,
  description,
  slides,
  labels,
}: {
  eyebrow: string;
  title: string;
  description: string;
  slides: HighlightSlide[];
  labels: { prev: string; next: string; visit: string; live: string };
}) {
  const n = slides.length;
  const [active, setActive] = useState(0);
  const [reduce, setReduce] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const dragX = useRef<number | null>(null);

  const go = useCallback((i: number) => setActive(((i % n) + n) % n), [n]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // position slides: centre / dimmed neighbours / hidden
  useIsoLayoutEffect(() => {
    const { gsap } = registerGsap();
    const st = stage.current;
    if (!st) return;
    const els = Array.from(st.querySelectorAll<HTMLElement>('[data-slide]'));

    const place = (animate: boolean) => {
      const w = st.clientWidth;
      const sw = Math.min(w * (w < 700 ? 0.84 : 0.66), 980);
      const step = sw * 0.82;
      const left = (w - sw) / 2;
      els.forEach((el, i) => {
        let off = (((i - active) % n) + n) % n;
        if (off > Math.floor(n / 2)) off -= n;
        const near = Math.abs(off) <= 1;
        gsap.to(el, {
          width: sw,
          x: left + off * step,
          scale: off === 0 ? 1 : 0.85,
          autoAlpha: near ? (off === 0 ? 1 : 0.5) : 0,
          zIndex: 10 - Math.abs(off),
          duration: animate ? 0.95 : 0,
          ease: 'power3.inOut',
          overwrite: 'auto',
        });
      });
    };

    place(!first.current);
    first.current = false;
    const ro = new ResizeObserver(() => place(false));
    ro.observe(st);
    return () => ro.disconnect();
  }, [active, n]);

  // autoplay with a progress bar; pauses on hover/focus and when off screen
  useIsoLayoutEffect(() => {
    const { gsap, ScrollTrigger } = registerGsap();
    const el = root.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      const fills = el.querySelectorAll<HTMLElement>('[data-fill]');
      fills.forEach((f, i) => gsap.set(f, i < active ? { scaleX: 1, opacity: 0.3 } : { scaleX: 0, opacity: 1 }));
      const tween = gsap.fromTo(fills[active], { scaleX: 0 }, { scaleX: 1, duration: AUTOPLAY_SECONDS, ease: 'none', paused: true, onComplete: () => go(active + 1) });
      let visible = false;
      let hovered = false;
      const sync = () => (visible && !hovered ? tween.play() : tween.pause());
      const st = ScrollTrigger.create({ trigger: el, start: 'top 85%', end: 'bottom 15%', onToggle: (s) => ((visible = s.isActive), sync()) });
      visible = st.isActive;
      const on = () => ((hovered = true), sync());
      const off = () => ((hovered = false), sync());
      el.addEventListener('pointerenter', on);
      el.addEventListener('pointerleave', off);
      el.addEventListener('focusin', on);
      el.addEventListener('focusout', off);
      sync();
      return () => {
        el.removeEventListener('pointerenter', on);
        el.removeEventListener('pointerleave', off);
        el.removeEventListener('focusin', on);
        el.removeEventListener('focusout', off);
      };
    });
    return () => mm.revert();
  }, [active, go]);

  return (
    <div ref={root} role="region" aria-roledescription="carousel" aria-label={title} className="mx-auto w-full max-w-[1440px] px-5 md:px-10" onKeyDown={(e) => (e.key === 'ArrowRight' ? go(active + 1) : e.key === 'ArrowLeft' ? go(active - 1) : undefined)}>
      <div className="mb-10 flex flex-col justify-between gap-6 md:mb-14 lg:flex-row lg:items-end">
        <div>
          <Eyebrow className="mb-5">{eyebrow}</Eyebrow>
          <SplitHeading text={title} className={`${h2} max-w-3xl`} />
          <p className="mt-6 max-w-xl text-[14px] leading-relaxed text-[#0B0F14]/60">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-dm-mono text-[11px] tracking-[0.18em] text-[#0B0F14]/45">
            <span className="text-[#0B0F14]">{String(active + 1).padStart(2, '0')}</span> / {String(n).padStart(2, '0')}
          </span>
          {[
            { label: labels.prev, onClick: () => go(active - 1), Icon: ArrowLeft },
            { label: labels.next, onClick: () => go(active + 1), Icon: ArrowRight },
          ].map(({ label, onClick, Icon }) => (
            <button key={label} type="button" aria-label={label} onClick={onClick} className="flex h-11 w-11 items-center justify-center rounded-full border border-[#0B0F14]/15 bg-white transition-colors hover:border-[#0B0F14] hover:bg-[#0B0F14] hover:text-white">
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>

      {/* stage */}
      <div
        ref={stage}
        className="relative aspect-[16/10.2] w-full select-none overflow-hidden sm:aspect-[16/8] lg:aspect-[16/7.4]"
        onPointerDown={(e) => (dragX.current = e.clientX)}
        onPointerUp={(e) => {
          if (dragX.current === null) return;
          const dx = e.clientX - dragX.current;
          dragX.current = null;
          if (Math.abs(dx) > 50) go(active + (dx < 0 ? 1 : -1));
        }}
      >
        {slides.map((s, i) => {
          const on = i === active;
          return (
            <div
              key={s.key}
              data-slide
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} / ${n}: ${s.name}`}
              aria-hidden={!on}
              onClick={() => !on && go(i)}
              className={`invisible absolute left-0 top-0 origin-center will-change-transform ${on ? 'visible' : 'cursor-pointer'}`}
              style={{ width: '66%', aspectRatio: String(SLIDE_RATIO) }}
            >
              {/* browser frame */}
              <div className="flex h-full flex-col overflow-hidden rounded-[1.1rem] border border-[#0B0F14]/12 bg-white shadow-[0_30px_80px_rgba(11,15,20,0.18)]">
                <div className="flex h-[4.4%] min-h-[26px] shrink-0 items-center gap-3 border-b border-[#0B0F14]/10 bg-[#F6F7FA] px-3">
                  <span className="flex gap-1.5">
                    {['#FF6159', '#FFBD2E', '#28C940'].map((c) => (
                      <span key={c} className="h-[7px] w-[7px] rounded-full" style={{ background: c }} />
                    ))}
                  </span>
                  <span className="flex h-[18px] items-center gap-1.5 rounded-full bg-white px-3 font-dm-mono text-[9px] tracking-[0.04em] text-[#0B0F14]/55 shadow-[inset_0_0_0_1px_rgba(11,15,20,0.08)]">
                    <Lock className="h-2 w-2" />
                    {s.host}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5 font-dm-mono text-[8.5px] uppercase tracking-[0.2em] text-[#0B6F7B]">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2BB0C0] opacity-70" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#2BB0C0]" />
                    </span>
                    {labels.live}
                  </span>
                </div>
                <div className="relative min-h-0 flex-1 bg-[#EEF1F5]">
                  <Image src={s.poster} alt={`${s.name} — ${s.desc}`} fill sizes="(max-width: 700px) 84vw, 66vw" priority={i === 0} loading={i === 0 ? undefined : 'eager'} draggable={false} className="object-cover object-top" />
                </div>
              </div>

              {/* phone preview */}
              <div className={`absolute -bottom-3 right-[3%] w-[15%] min-w-[64px] max-w-[150px] rotate-[3deg] rounded-[1.1rem] border-[4px] border-[#0B0F14] bg-[#0B0F14] shadow-[0_22px_44px_rgba(11,15,20,0.32)] transition-opacity duration-500 md:-bottom-4 ${on ? 'opacity-100' : 'opacity-0'}`}>
                <span className="absolute left-1/2 top-1 z-10 h-1 w-6 -translate-x-1/2 rounded-full bg-[#0B0F14]" />
                <div className="relative overflow-hidden rounded-[0.7rem] bg-white" style={{ aspectRatio: String(532 / 802) }}>
                  <Image src={s.phone} alt="" fill sizes="150px" draggable={false} className="object-cover object-top" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* caption */}
      <div className="mt-8 grid md:mt-10">
        {slides.map((s, i) => (
          <div key={s.key} aria-hidden={i !== active} data-on={i === active} className="invisible col-start-1 row-start-1 flex flex-col justify-between gap-4 opacity-0 transition-[opacity,visibility] duration-500 data-[on=true]:visible data-[on=true]:opacity-100 md:flex-row md:items-end">
            <div className="flex items-start gap-4">
              <span className="mt-2 font-dm-mono text-[10px] tracking-[0.2em] text-[#0B6F7B]">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3 className="mb-1.5 text-2xl font-light tracking-[-0.035em] md:text-3xl">{s.name}</h3>
                <p className="max-w-xl text-[13px] leading-relaxed text-[#0B0F14]/60">{s.desc}</p>
              </div>
            </div>
            <a href={s.href} target="_blank" rel="noopener noreferrer" tabIndex={i === active ? 0 : -1} className="group inline-flex shrink-0 items-center gap-2 self-start font-dm-mono text-[10px] uppercase tracking-[0.2em] text-[#0B0F14] md:self-auto">
              {labels.visit}
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-45" />
            </a>
          </div>
        ))}
      </div>

      {/* progress */}
      <div className="mt-8 grid gap-2" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
        {slides.map((s, i) => (
          <button key={s.key} type="button" aria-label={`${i + 1} / ${n}: ${s.name}`} onClick={() => go(i)} className="group py-2">
            <span className="block h-[2px] w-full overflow-hidden rounded-full bg-[#0B0F14]/12">
              <span data-fill className={`block h-full origin-left rounded-full bg-[#0B0F14] ${i === active ? 'motion-reduce:scale-x-100' : ''} ${i < active ? 'scale-x-100 opacity-30' : 'scale-x-0'}`} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
