'use client';

import { useRef, type ReactNode, type ElementType } from 'react';
import { registerGsap, useIsoLayoutEffect, clearInline, MOTION_OK } from './gsap-setup';

/**
 * Staggered scroll reveal. Every descendant marked `data-reveal` rises and fades
 * in as it enters the viewport (batched, so a whole grid row cascades together).
 */
export function RevealGroup({
  children,
  className,
  as: Tag = 'div',
  y = 48,
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  y?: number;
}) {
  const ref = useRef<HTMLElement>(null);

  useIsoLayoutEffect(() => {
    const { gsap, ScrollTrigger } = registerGsap();
    const root = ref.current;
    if (!root) return;
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      const items = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
      if (!items.length) return;
      clearInline(items);
      gsap.set(items, { y, autoAlpha: 0 });
      ScrollTrigger.batch(items, {
        start: 'top 90%',
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, {
            y: 0,
            autoAlpha: 1,
            duration: 1,
            ease: 'power3.out',
            stagger: 0.09,
            clearProps: 'transform,opacity,visibility',
          }),
      });
    });
    return () => {
      mm.revert();
      clearInline(root.querySelectorAll('[data-reveal]'));
    };
  }, [y]);

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}

/**
 * Headline whose words slide up out of a mask when scrolled into view.
 * The words are real text in the HTML, so SEO and screen readers are unaffected.
 */
export function SplitHeading({
  text,
  as: Tag = 'h2',
  className,
  accentWords = [],
  accentClassName = '',
}: {
  text: string;
  as?: ElementType;
  className?: string;
  accentWords?: string[];
  accentClassName?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useIsoLayoutEffect(() => {
    const { gsap } = registerGsap();
    const root = ref.current;
    if (!root) return;
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      const inner = root.querySelectorAll<HTMLElement>('[data-w]');
      clearInline(inner);
      gsap.set(inner, { yPercent: 112, y: 0 });
      gsap.to(inner, {
        yPercent: 0,
        y: 0,
        duration: 1.1,
        ease: 'power4.out',
        stagger: 0.055,
        scrollTrigger: { trigger: root, start: 'top 88%', once: true },
      });
    });
    return () => {
      mm.revert();
      clearInline(root.querySelectorAll('[data-w]'));
    };
  }, [text]);

  const parts = text.split(/\s+/).filter(Boolean);
  return (
    <Tag ref={ref} className={className}>
      {parts.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden align-bottom pb-[0.14em] -mb-[0.14em]">
          <span data-w className={`inline-block will-change-transform ${accentWords.includes(w) ? accentClassName : ''}`}>
            {w}
            {i < parts.length - 1 ? ' ' : ''}
          </span>
        </span>
      ))}
    </Tag>
  );
}
