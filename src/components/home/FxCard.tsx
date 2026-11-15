'use client';

import { useRef, type ReactNode, type PointerEvent, type CSSProperties } from 'react';
import { registerGsap, FINE_POINTER } from './gsap-setup';

/**
 * Card with a cursor-follow spotlight and an optional 3D tilt.
 * Pure progressive enhancement: with no JS / a touch screen it is just a div.
 */
export default function FxCard({
  children,
  className = '',
  tilt = 0,
  spot,
}: {
  children: ReactNode;
  className?: string;
  tilt?: number;
  spot?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.pointerType === 'touch') return;
    const r = el.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    el.style.setProperty('--mx', `${px}px`);
    el.style.setProperty('--my', `${py}px`);
    if (tilt && window.matchMedia(FINE_POINTER).matches) {
      const { gsap } = registerGsap();
      gsap.to(el, {
        rotateY: (px / r.width - 0.5) * tilt * 2,
        rotateX: -(py / r.height - 0.5) * tilt * 2,
        transformPerspective: 900,
        duration: 0.5,
        ease: 'power3.out',
        overwrite: 'auto',
      });
    }
  };

  const onLeave = () => {
    if (!tilt || !ref.current) return;
    const { gsap } = registerGsap();
    gsap.to(ref.current, { rotateX: 0, rotateY: 0, duration: 0.8, ease: 'elastic.out(1,0.6)', overwrite: 'auto' });
  };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`fx-spot ${className}`}
      style={spot ? ({ '--spot': spot } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
