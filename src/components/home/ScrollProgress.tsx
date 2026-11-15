'use client';

import { useRef } from 'react';
import { registerGsap, useIsoLayoutEffect, MOTION_OK } from './gsap-setup';

/** Thin teal reading-progress bar pinned to the top of the viewport. */
export default function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);

  useIsoLayoutEffect(() => {
    const { gsap, ScrollTrigger } = registerGsap();
    const bar = ref.current;
    if (!bar) return;
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      gsap.set(bar, { scaleX: 0, transformOrigin: '0 50%' });
      ScrollTrigger.create({
        id: 'keep-home-progress',
        trigger: document.documentElement,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          gsap.set(bar, { scaleX: self.progress });
        },
      });
    });
    return () => mm.revert();
  }, []);

  return <div ref={ref} aria-hidden className="pointer-events-none fixed left-0 top-0 z-[80] h-[2px] w-full origin-left scale-x-0 bg-[#4FC3D0]" />;
}
