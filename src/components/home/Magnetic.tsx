'use client';

import { useRef, type ReactNode } from 'react';
import { registerGsap, useIsoLayoutEffect, FINE_POINTER } from './gsap-setup';

/** Wrapper whose child is gently pulled toward the cursor (fine pointers only). */
export default function Magnetic({ children, strength = 0.35, className = '' }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useIsoLayoutEffect(() => {
    const { gsap } = registerGsap();
    const el = ref.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add(`${FINE_POINTER} and (prefers-reduced-motion: no-preference)`, () => {
      const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3.out' });
      const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3.out' });
      const move = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * strength);
        yTo((e.clientY - (r.top + r.height / 2)) * strength);
      };
      const leave = () => {
        xTo(0);
        yTo(0);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerleave', leave);
      return () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerleave', leave);
      };
    });
    return () => mm.revert();
  }, [strength]);

  return (
    <div ref={ref} className={`inline-block ${className}`}>
      {children}
    </div>
  );
}
