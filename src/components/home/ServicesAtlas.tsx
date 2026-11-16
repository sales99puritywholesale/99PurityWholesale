'use client';

import { useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { registerGsap, useIsoLayoutEffect, clearInline, MOTION_OK, FINE_POINTER } from './gsap-setup';
import { SERVICE_ART } from './service-art';
import { PillButton } from './ui';

export interface AtlasItem {
  key: string;
  name: string;
  short: string;
  desc: string;
  points: string[];
}
export interface AtlasGroup {
  key: string;
  label: string;
  items: AtlasItem[];
}

/**
 * Service atlas: a numbered list on the left, a sticky illustrated stage on the right.
 * Hover / focus / tap (and scrolling, on touch screens) selects a service and replays
 * its illustration. Everything is real text in the HTML; GSAP only adds motion.
 */
export default function ServicesAtlas({ groups, labels, href }: { groups: AtlasGroup[]; labels: { hint: string; learn: string; of: string }; href: string }) {
  const flat = groups.flatMap((g) => g.items.map((it) => ({ ...it, group: g.label })));
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const firstRun = useRef(true);

  // touch / small screens: the row crossing the middle of the viewport becomes active
  useIsoLayoutEffect(() => {
    const { gsap, ScrollTrigger } = registerGsap();
    const el = root.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add('(max-width: 1023px), (hover: none)', () => {
      // measured live (rows grow when expanded, so fixed per-row triggers would go stale)
      const rows = Array.from(el.querySelectorAll<HTMLElement>('[data-row] > button'));
      ScrollTrigger.create({
        trigger: el,
        start: 'top bottom',
        end: 'bottom top',
        onUpdate: () => {
          const line = window.innerHeight * 0.72;
          let best = 0;
          let bestD = Infinity;
          rows.forEach((r, i) => {
            const b = r.getBoundingClientRect();
            const d = Math.abs(b.top + b.height / 2 - line);
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          });
          setActive(best);
        },
      });
    });
    return () => mm.revert();
  }, []);

  // pointer parallax on the artwork (fine pointers only)
  useIsoLayoutEffect(() => {
    const { gsap } = registerGsap();
    const el = root.current;
    const stage = el?.querySelector<HTMLElement>('[data-stage]');
    if (!el || !stage) return;
    const mm = gsap.matchMedia();
    mm.add(`${FINE_POINTER} and (prefers-reduced-motion: no-preference)`, () => {
      const arts = Array.from(el.querySelectorAll<HTMLElement>('[data-art-wrap]'));
      const movers = arts.map((a) => ({ x: gsap.quickTo(a, 'x', { duration: 0.9, ease: 'power3.out' }), y: gsap.quickTo(a, 'y', { duration: 0.9, ease: 'power3.out' }) }));
      const move = (e: PointerEvent) => {
        const r = stage.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        movers.forEach((m) => {
          m.x(nx * 18);
          m.y(ny * 14);
        });
      };
      const leave = () => movers.forEach((m) => (m.x(0), m.y(0)));
      stage.addEventListener('pointermove', move);
      stage.addEventListener('pointerleave', leave);
      return () => {
        stage.removeEventListener('pointermove', move);
        stage.removeEventListener('pointerleave', leave);
      };
    });
    return () => mm.revert();
  }, []);

  // (re)build the active illustration whenever the selection changes
  useIsoLayoutEffect(() => {
    const { gsap, ScrollTrigger } = registerGsap();
    const el = root.current;
    const panel = el?.querySelector<HTMLElement>(`[data-panel="${active}"]`);
    if (!el || !panel) return;
    const q = gsap.utils.selector(panel);
    const mm = gsap.matchMedia();

    mm.add(MOTION_OK, () => {
      const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
      tl.fromTo(q('[data-d]'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1, stagger: 0.07, ease: 'power2.inOut' }, 0)
        .fromTo(q('[data-r]'), { scaleY: 0, transformOrigin: '50% 100%' }, { scaleY: 1, duration: 0.8, stagger: 0.08 }, 0.1)
        .fromTo(q('[data-p]'), { scale: 0, transformOrigin: '50% 50%' }, { scale: 1, duration: 0.7, stagger: 0.06, ease: 'back.out(2)' }, 0.15)
        .fromTo(q('[data-s]'), { x: -40, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.8, stagger: 0.1 }, 0.1)
        .fromTo(q('[data-sr]'), { x: 40, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.8, stagger: 0.1 }, 0.2)
        .fromTo(q('[data-t]'), { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 0.7, stagger: 0.06 }, 0.25)
        .fromTo(q('[data-txt]'), { y: 18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.7, stagger: 0.07 }, 0.1);

      // idle loops, started once the build-in has landed
      tl.add(() => {
        q('[data-pulse]').forEach((n, i) => {
          gsap.to(n, { scale: 1.2, opacity: 0.35, transformOrigin: '50% 50%', duration: 1.2, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: i * 0.18 });
        });
        q('[data-float]').forEach((n) => {
          gsap.to(n, { y: -8, duration: 1.8, repeat: -1, yoyo: true, ease: 'sine.inOut' });
        });
      }, 0.9);

      if (firstRun.current) {
        firstRun.current = false;
        ScrollTrigger.create({ trigger: el, start: 'top 75%', once: true, onEnter: () => tl.play() });
      } else {
        tl.play();
      }
    });

    return () => {
      mm.revert();
      clearInline(panel.querySelectorAll('[data-d],[data-r],[data-p],[data-s],[data-sr],[data-t],[data-pulse],[data-float],[data-txt]'), 'transform,opacity,visibility,strokeDashoffset');
    };
  }, [active]);

  const total = String(flat.length).padStart(2, '0');
  let offset = 0;

  return (
    <div ref={root} className="svc-art lg:grid lg:grid-cols-12 lg:gap-14">
      {/* ---------- stage ---------- */}
      <div className="sticky top-[84px] z-20 -mx-1 mb-6 px-1 lg:static lg:top-auto lg:z-auto lg:col-span-6 lg:col-start-7 lg:row-start-1 lg:mx-0 lg:mb-0 lg:px-0">
        <div data-stage className="overflow-hidden rounded-[1.5rem] bg-[#0B0D10] text-white shadow-[0_30px_80px_rgba(11,15,20,0.18)] lg:sticky lg:top-28 lg:rounded-[1.75rem]">
          <div className="relative">
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(237,242,247,0.08)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,#000_40%,transparent_90%)]" />
            <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#4FC3D0]/15 blur-[90px]" />

            <div className="relative flex items-center justify-between px-5 pt-4 font-dm-mono text-[10px] uppercase tracking-[0.2em] text-white/50 md:px-7 md:pt-6">
              <span>
                <span className="text-[#4FC3D0]">{String(active + 1).padStart(2, '0')}</span> / {total}
              </span>
              <span className="rounded-full border border-white/15 px-3 py-1">{flat[active].group}</span>
            </div>

            <div className="relative grid px-3 pb-2 pt-1 md:px-6">
              {flat.map((it, i) => (
                <div
                  key={it.key}
                  data-panel={i}
                  data-on={i === active}
                  aria-hidden={i !== active}
                  className="invisible col-start-1 row-start-1 opacity-0 transition-[opacity,visibility] duration-500 data-[on=true]:visible data-[on=true]:opacity-100"
                >
                  <div data-art-wrap className="mx-auto w-full max-w-[420px] will-change-transform">
                    <svg viewBox="0 0 400 280" className="h-auto w-full" aria-hidden role="presentation">
                      {SERVICE_ART[it.key]}
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* copy: desktop only (on mobile the selected row expands in the list) */}
          <div className="relative grid border-t border-white/10 px-7 pb-8 pt-6 max-lg:hidden">
            {flat.map((it, i) => (
              <div key={it.key} data-panel={i} data-on={i === active} aria-hidden={i !== active} className="invisible col-start-1 row-start-1 opacity-0 transition-[opacity,visibility] duration-500 data-[on=true]:visible data-[on=true]:opacity-100">
                <h3 data-txt className="mb-3 font-dm-sans text-[1.7rem] font-light leading-tight tracking-[-0.035em]">
                  {it.name}
                </h3>
                <p data-txt className="mb-5 max-w-lg text-[13.5px] leading-relaxed text-white/60">
                  {it.desc}
                </p>
                <ul className="mb-6 space-y-2">
                  {it.points.map((p) => (
                    <li key={p} data-txt className="flex items-center gap-3 text-[13px] text-white/80">
                      <span className="h-[6px] w-[6px] shrink-0 bg-[#4FC3D0]" />
                      {p}
                    </li>
                  ))}
                </ul>
                <div data-txt>
                  <PillButton href={href} variant="teal">
                    {labels.learn}
                  </PillButton>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-4 hidden font-dm-mono text-[10px] uppercase tracking-[0.2em] text-[#0B0F14]/40 lg:block">{labels.hint}</p>
      </div>

      {/* ---------- list ---------- */}
      <div className="max-lg:pb-[300px] lg:col-span-6 lg:col-start-1 lg:row-start-1">
        {groups.map((g) => {
          const start = offset;
          offset += g.items.length;
          return (
            <div key={g.key} className="mb-8 last:mb-0">
              <div className="mb-3 flex items-center gap-2.5 font-dm-mono text-[10px] uppercase tracking-[0.2em] text-[#0B0F14]/45">
                <span className="h-[6px] w-[6px] bg-[#4FC3D0]" />
                {g.label}
              </div>
              <ul className="border-t border-[#0B0F14]/12">
                {g.items.map((it, j) => {
                  const i = start + j;
                  const on = i === active;
                  return (
                    <li key={it.key} data-row className="relative border-b border-[#0B0F14]/12">
                      <button
                        type="button"
                        onMouseEnter={() => setActive(i)}
                        onFocus={() => setActive(i)}
                        onClick={() => setActive(i)}
                        aria-pressed={on}
                        className="group flex w-full items-center gap-4 py-4 text-left md:py-5"
                      >
                        <span className={`w-6 shrink-0 font-dm-mono text-[10px] tracking-[0.2em] transition-colors duration-300 ${on ? 'text-[#0B6F7B]' : 'text-[#0B0F14]/35'}`}>{String(i + 1).padStart(2, '0')}</span>
                        <span className={`font-dm-sans text-[clamp(1.3rem,2.3vw,1.9rem)] font-light leading-tight tracking-[-0.035em] transition-all duration-500 ${on ? 'translate-x-2 text-[#0B0F14]' : 'text-[#0B0F14]/35 group-hover:text-[#0B0F14]/70'}`}>{it.name}</span>
                        <span className={`ml-auto hidden text-[12px] transition-opacity duration-300 sm:block ${on ? 'text-[#0B0F14]/55 opacity-100' : 'opacity-0'}`}>{it.short}</span>
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-500 ${on ? 'rotate-0 bg-[#4FC3D0] text-[#0B0F14]' : '-rotate-45 bg-[#0B0F14]/[0.06] text-[#0B0F14]/40'}`}>
                          <ArrowUpRight className="h-4 w-4" />
                        </span>
                      </button>

                      {/* mobile: details expand under the active row */}
                      <div className={`grid transition-[grid-template-rows] duration-500 ease-out lg:hidden ${on ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                        <div className="overflow-hidden">
                          <div className="pb-5 pl-10 pr-2">
                            <p className="mb-3 text-[13px] leading-relaxed text-[#0B0F14]/60">{it.desc}</p>
                            <ul className="space-y-1.5">
                              {it.points.map((p) => (
                                <li key={p} className="flex items-center gap-2.5 text-[12.5px] text-[#0B0F14]/75">
                                  <span className="h-[5px] w-[5px] shrink-0 bg-[#4FC3D0]" />
                                  {p}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>

                      <span className={`pointer-events-none absolute -bottom-px left-0 h-px bg-[#4FC3D0] transition-[width] duration-700 ease-out ${on ? 'w-full' : 'w-0'}`} />
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
