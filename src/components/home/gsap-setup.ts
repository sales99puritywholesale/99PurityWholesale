'use client';

import { useEffect, useLayoutEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

let registered = false;

/** Registers GSAP plugins exactly once (safe to call from any client component). */
export function registerGsap() {
  if (!registered && typeof window !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
    registered = true;
  }
  return { gsap, ScrollTrigger };
}

/** useLayoutEffect on the client, useEffect during SSR (avoids the React warning). */
export const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export const MOTION_OK = '(prefers-reduced-motion: no-preference)';
export const DESKTOP = '(min-width: 1024px)';
export const FINE_POINTER = '(hover: hover) and (pointer: fine)';

/** Split a string into words (keeps the original order, drops empties). */
export function words(text: string) {
  return text.split(/\s+/).filter(Boolean);
}

/**
 * Builds an SVG path for an illustrative HPLC trace: a flat baseline with
 * gaussian peaks. Deterministic, so server and client markup always match.
 * This is decorative artwork, not measured data.
 */
export function chromatogramPath(width: number, height: number, peaks: Array<[number, number, number]>) {
  const base = height * 0.86;
  const steps = 220;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    const t = i / steps;
    let y = base;
    for (const [c, h, w] of peaks) {
      y -= h * height * Math.exp(-Math.pow((t - c) / w, 2));
    }
    // tiny deterministic baseline noise
    y += Math.sin(i * 1.7) * 0.35;
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  return d.trim();
}

/** Strips leftover inline GSAP styles after a revert (React StrictMode re-runs effects in dev). */
export function clearInline(targets: gsap.TweenTarget, props = 'transform,opacity,visibility') {
  gsap.set(targets, { clearProps: props });
}
