'use client';

import { useRef, type ReactNode } from 'react';
import { registerGsap, useIsoLayoutEffect, clearInline, MOTION_OK } from './gsap-setup';

/** Clips its child and drifts it slowly against the scroll. Child should fill the box (absolute inset-0). */
export default function Parallax({ children, className = '', amount = 7 }: { children: ReactNode; className?: string; amount?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  useIsoLayoutEffect(() => {
    const { gsap } = registerGsap();
    if (!box.current || !inner.current) return;
    const target = inner.current;
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      gsap.fromTo(
        target,
        { yPercent: -amount, scale: 1.12 },
        { yPercent: amount, scale: 1.12, ease: 'none', scrollTrigger: { trigger: box.current, start: 'top bottom', end: 'bottom top', scrub: true } }
      );
    });
    return () => {
      mm.revert();
      clearInline(target, 'transform');
    };
  }, [amount]);

  return (
    <div ref={box} className={`relative overflow-hidden ${className}`}>
      <div ref={inner} className="absolute inset-0 will-change-transform">
        {children}
      </div>
    </div>
  );
}
