'use client';

import { useRef } from 'react';
import { registerGsap, useIsoLayoutEffect, clearInline, MOTION_OK } from './gsap-setup';

/** Large statement whose words light up one by one as you scroll through it. */
export default function Manifesto({ text, highlights = [], className = '' }: { text: string; highlights?: string[]; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);

  useIsoLayoutEffect(() => {
    const { gsap } = registerGsap();
    const el = ref.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      const ws = el.querySelectorAll<HTMLElement>('[data-mw]');
      gsap.fromTo(
        ws,
        { opacity: 0.14 },
        {
          opacity: 1,
          ease: 'none',
          stagger: 0.12,
          scrollTrigger: { trigger: el, start: 'top 78%', end: 'bottom 42%', scrub: 0.6 },
        }
      );
    });
    return () => {
      mm.revert();
      clearInline(el.querySelectorAll('[data-mw]'), 'opacity');
    };
  }, [text]);

  const clean = (w: string) => w.replace(/[.,;:]+$/g, '');
  return (
    <p ref={ref} className={className}>
      {text.split(/\s+/).filter(Boolean).map((w, i) => {
        const hit = highlights.some((h) => clean(w).toLowerCase().startsWith(h.toLowerCase()));
        return (
          <span key={i} data-mw className={hit ? 'text-[#4FC3D0]' : ''}>
            {w}{' '}
          </span>
        );
      })}
    </p>
  );
}
