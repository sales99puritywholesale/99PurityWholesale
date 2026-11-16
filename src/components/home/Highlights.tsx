'use client';

import { useCallback, useRef, useState } from 'react';
import Image from 'next/image';
import { Link } from '@/i18n/routing';
import { ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react';
import { registerGsap, useIsoLayoutEffect, MOTION_OK } from './gsap-setup';
import { Eyebrow, h2 } from './ui';
import { SplitHeading } from './Reveal';

export interface HighlightSlide {
  key: string;
  tag: string;
  title: string;
  desc: string;
  href: string;
  image: string;
  video: string | null;
  detail: string;
}

const AUTOPLAY_SECONDS = 6.5;

/**
 * Highlights carousel: a wide scene in the centre with its neighbours dimmed at the sides and a small
 * portrait detail card overlapping. Autoplays with a progress bar, pauses on hover / off screen,
 * and supports arrows, swipe, clicking a side slide and the keyboard.
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
  labels: { prev: string; next: string; learn: string };
}) {
  const n = slides.length;
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const timer = useRef<gsap.core.Tween | null>(null);
  const dragX = useRef<number | null>(null);

  const go = useCallback((i: number) => setActive(((i % n) + n) % n), [n]);

  // position slides (centre / dimmed neighbours / hidden) and run the Ken Burns drift on the active one
  useIsoLayoutEffect(() => {
    const { gsap } = registerGsap();
    const st = stage.current;
    if (!st) return;
    const els = Array.from(st.querySelectorAll<HTMLElement>('[data-slide]'));

    const place = (animate: boolean) => {
      const w = st.clientWidth;
      const sw = Math.min(w * (w < 700 ? 0.82 : 0.64), 940);
      const step = sw * 0.8;
      const left = (w - sw) / 2;
      els.forEach((el, i) => {
        let off = (((i - active) % n) + n) % n;
        if (off > Math.floor(n / 2)) off -= n;
        const near = Math.abs(off) <= 1;
        gsap.to(el, {
          width: sw,
          x: left + off * step,
          scale: off === 0 ? 1 : 0.86,
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

    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      els.forEach((el, i) => {
        const inner = el.querySelector('[data-kb]');
        if (!inner) return;
        if (i === active) gsap.fromTo(inner, { scale: 1.02 }, { scale: 1.1, duration: 9, ease: 'sine.inOut', yoyo: true, repeat: -1 });
        else gsap.set(inner, { scale: 1 });
      });
    });

    return () => {
      ro.disconnect();
      mm.revert();
    };
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
      timer.current = tween;
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
        timer.current = null;
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
        </div>
        <div className="flex items-end justify-between gap-8 lg:justify-end">
          <p className="max-w-sm text-[13px] leading-relaxed text-[#0B0F14]/60">{description}</p>
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
      </div>

      {/* stage */}
      <div
        ref={stage}
        className="relative aspect-[4/3.1] w-full select-none overflow-hidden sm:aspect-[16/9.4] lg:aspect-[16/7.4]"
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
              aria-label={`${i + 1} / ${n}: ${s.title}`}
              aria-hidden={!on}
              onClick={() => !on && go(i)}
              className={`invisible absolute left-0 top-0 h-full origin-center will-change-transform ${on ? 'visible' : 'cursor-pointer'}`}
              style={{ width: '64%' }}
            >
              <div className="relative h-full overflow-hidden rounded-[1.5rem] border border-[#0B0F14]/10 bg-[#0B0D10] shadow-[0_30px_80px_rgba(11,15,20,0.16)]">
                <div data-kb className="absolute inset-0">
                  <Image src={s.image} alt={s.title} fill sizes="(max-width: 700px) 85vw, 64vw" priority={i === 0} loading={i === 0 ? undefined : 'eager'} draggable={false} className="object-cover" />
                  {s.video && on && <video className="absolute inset-0 h-full w-full object-cover" src={s.video} poster={s.image} muted loop playsInline autoPlay preload="none" aria-hidden />}
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B0D10]/55 via-transparent to-[#0B0D10]/10" />
                <span className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 font-dm-mono text-[9px] uppercase tracking-[0.18em] text-white backdrop-blur-md md:left-5 md:top-5">
                  <span className="h-1.5 w-1.5 bg-[#4FC3D0]" />
                  {s.tag}
                </span>
              </div>

              {/* portrait detail card, like a phone screen */}
              <div className={`absolute -bottom-3 right-3 w-[17%] transition-opacity duration-500 ${on ? 'opacity-100' : 'opacity-0'} min-w-[78px] max-w-[150px] rotate-[3deg] overflow-hidden rounded-[1.1rem] border-[3px] border-white bg-white shadow-[0_18px_40px_rgba(11,15,20,0.28)] md:-bottom-4 md:right-8`}>
                <div className="relative aspect-[9/16]">
                  <Image src={s.detail} alt="" fill sizes="150px" draggable={false} className="object-cover object-[50%_58%]" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* caption */}
      <div className="mt-10 grid md:mt-12">
        {slides.map((s, i) => (
          <div key={s.key} aria-hidden={i !== active} data-on={i === active} className="invisible col-start-1 row-start-1 flex flex-col justify-between gap-4 opacity-0 transition-[opacity,visibility] duration-500 data-[on=true]:visible data-[on=true]:opacity-100 md:flex-row md:items-end">
            <div className="flex items-start gap-4">
              <span className="mt-2 font-dm-mono text-[10px] tracking-[0.2em] text-[#0B6F7B]">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3 className="mb-1.5 text-2xl font-light tracking-[-0.035em] md:text-3xl">{s.title}</h3>
                <p className="max-w-xl text-[13px] leading-relaxed text-[#0B0F14]/60">{s.desc}</p>
              </div>
            </div>
            <Link href={s.href} tabIndex={i === active ? 0 : -1} className="group inline-flex shrink-0 items-center gap-2 self-start font-dm-mono text-[10px] uppercase tracking-[0.2em] text-[#0B0F14] md:self-auto">
              {labels.learn}
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-45" />
            </Link>
          </div>
        ))}
      </div>

      {/* progress */}
      <div className="mt-8 grid gap-2" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
        {slides.map((s, i) => (
          <button key={s.key} type="button" aria-label={`${i + 1} / ${n}: ${s.title}`} onClick={() => go(i)} className="group py-2">
            <span className="block h-[2px] w-full overflow-hidden rounded-full bg-[#0B0F14]/12">
              <span data-fill className={`block h-full origin-left rounded-full bg-[#0B0F14] ${i === active ? 'motion-reduce:scale-x-100' : ''} ${i < active ? 'scale-x-100 opacity-30' : 'scale-x-0'}`} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
