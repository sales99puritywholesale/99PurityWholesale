'use client';

import { useRef } from 'react';
import { registerGsap, useIsoLayoutEffect, MOTION_OK } from './gsap-setup';

/**
 * Infinite ticker whose speed reacts to scroll velocity and flips direction
 * when scrolling back up. Two identical halves give a seamless loop.
 */
export default function Marquee({ items, className = '', itemClassName = '' }: { items: string[]; className?: string; itemClassName?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useIsoLayoutEffect(() => {
    const { gsap, ScrollTrigger } = registerGsap();
    if (!root.current || !track.current) return;
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      const tween = gsap.to(track.current, { xPercent: -50, ease: 'none', duration: 38, repeat: -1 });
      ScrollTrigger.create({
        trigger: root.current,
        start: 'top bottom',
        end: 'bottom top',
        onUpdate: (self) => {
          const dir = self.direction;
          const boost = 1 + Math.min(Math.abs(self.getVelocity()) / 350, 5);
          gsap.timeline({ overwrite: true }).to(tween, { timeScale: dir * boost, duration: 0.2 }).to(tween, { timeScale: dir, duration: 1 });
        },
      });
    });
    return () => mm.revert();
  }, []);

  const half = (k: string) => (
    <div key={k} className="flex shrink-0 items-center" aria-hidden={k === 'b' ? true : undefined}>
      {[...items, ...items].map((it, i) => (
        <span key={`${k}${i}`} className={`flex items-center ${itemClassName}`}>
          {it}
          <span className="mx-8 inline-block h-1.5 w-1.5 rotate-45 bg-current opacity-60 md:mx-12" />
        </span>
      ))}
    </div>
  );

  return (
    <div ref={root} className={`overflow-hidden whitespace-nowrap ${className}`}>
      <div ref={track} className="flex w-max will-change-transform">
        {half('a')}
        {half('b')}
      </div>
    </div>
  );
}
