'use client';

import { useRef } from 'react';
import { registerGsap, useIsoLayoutEffect, MOTION_OK } from './gsap-setup';

/** Counts from 0 to `value` once scrolled into view. The final value is in the server HTML. */
export default function CountUp({ value, prefix = '', suffix = '', className = '' }: { value: number; prefix?: string; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useIsoLayoutEffect(() => {
    const { gsap } = registerGsap();
    const el = ref.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      const state = { v: 0 };
      el.textContent = `${prefix}0${suffix}`;
      gsap.to(state, {
        v: value,
        duration: 2.2,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 92%', once: true },
        onUpdate: () => {
          el.textContent = `${prefix}${Math.round(state.v)}${suffix}`;
        },
      });
    });
    return () => {
      mm.revert();
      el.textContent = `${prefix}${value}${suffix}`;
    };
  }, [value, prefix, suffix]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {value}
      {suffix}
    </span>
  );
}
