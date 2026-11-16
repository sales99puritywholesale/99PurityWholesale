'use client';

import { useRef, useState } from 'react';
import { registerGsap, useIsoLayoutEffect, MOTION_OK } from './gsap-setup';
import { Eyebrow, h2 } from './ui';
import { SplitHeading } from './Reveal';
import { PROOF_VIEWS, type ProofSeries } from './proof-data';

const W = 900;
const H = 300;
const PAD = { l: 44, r: 52, t: 14, b: 28 };

/** Smooth path through normalized points (Catmull-Rom to cubic Bezier). */
function curve(values: number[]) {
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const pts = values.map((v, i) => [PAD.l + (i / (values.length - 1)) * iw, PAD.t + (1 - v) * ih] as const);
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return { d, last: pts[pts.length - 1] };
}

function Chart({ series, xTicks, count }: { series: ProofSeries[]; xTicks: Array<{ i: number; label: string }>; count: number }) {
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const primary = series[0];
  const secondary = series[1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={series.map((s) => s.label).join(' / ')}>
      <defs>
        <linearGradient id="proof-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={primary.color} stopOpacity="0.22" />
          <stop offset="1" stopColor={primary.color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {primary.ticks.map((t, i) => {
        const y = PAD.t + (1 - i / (primary.ticks.length - 1)) * ih;
        return (
          <g key={t + i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="#0B0F14" strokeOpacity="0.07" />
            <text x={PAD.l - 8} y={y + 3} textAnchor="end" fontSize="10" fill="#0B0F14" fillOpacity="0.45" fontFamily="var(--font-dm-mono), monospace">
              {t}
            </text>
            {secondary && (
              <text x={W - PAD.r + 8} y={y + 3} fontSize="10" fill="#0B0F14" fillOpacity="0.45" fontFamily="var(--font-dm-mono), monospace">
                {secondary.ticks[i]}
              </text>
            )}
          </g>
        );
      })}
      {xTicks.map((x, k) => (
        <text key={x.label} x={PAD.l + (x.i / (count - 1)) * iw} y={H - 6} textAnchor={k === 0 ? 'start' : k === xTicks.length - 1 ? 'end' : 'middle'} fontSize="10" fill="#0B0F14" fillOpacity="0.45" fontFamily="var(--font-dm-mono), monospace">
          {x.label}
        </text>
      ))}
      {[...series].reverse().map((s, k) => {
        const { d, last } = curve(s.values);
        const main = s === primary;
        return (
          <g key={s.label}>
            {main && <path data-fade d={`${d} L${last[0]} ${H - PAD.b} L${PAD.l} ${H - PAD.b} Z`} fill="url(#proof-fill)" />}
            <path data-line d={d} fill="none" stroke={s.color} strokeWidth={main ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={0} opacity={main ? 1 : 0.85} />
            <circle data-dot cx={last[0]} cy={last[1]} r="4.5" fill="#fff" stroke={s.color} strokeWidth="2.4" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
            {k < 0 && null}
          </g>
        );
      })}
    </svg>
  );
}

export interface ProofLabels {
  eyebrow: string;
  title: string;
  description: string;
  gscTab90: string;
  gscTab28: string;
  gaTab: string;
  gscName: string;
  gaName: string;
  badge: string;
  source: string;
  note: string;
  lang: 'en' | 'es';
}

export default function Proof({ labels }: { labels: ProofLabels }) {
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const view = PROOF_VIEWS[active];
  const tabs = [labels.gscTab90, labels.gscTab28, labels.gaTab];

  useIsoLayoutEffect(() => {
    const { gsap, ScrollTrigger } = registerGsap();
    const el = root.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      gsap.fromTo(q('[data-tile]'), { y: 16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, stagger: 0.07, ease: 'power3.out', clearProps: 'transform,opacity,visibility' });
      const tl = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 0.4, defaults: { ease: 'power2.inOut' } });
      tl.fromTo(q('[data-line]'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 2.2, stagger: 0.25 }, 0)
        .fromTo(q('[data-fade]'), { opacity: 0 }, { opacity: 1, duration: 1.6 }, 0.6)
        .fromTo(q('[data-dot]'), { scale: 0 }, { scale: 1, duration: 0.5, ease: 'back.out(2.5)', stagger: 0.1 }, 2.1)
        .to(q('[data-chart]'), { opacity: 0, duration: 0.5, ease: 'power2.in' }, '+=3.2')
        .set(q('[data-chart]'), { opacity: 1 });
      const st = ScrollTrigger.create({ trigger: el, start: 'top 85%', end: 'bottom 10%', onToggle: (s) => (s.isActive ? tl.play() : tl.pause()) });
      if (st.isActive) tl.play();
    });
    return () => mm.revert();
  }, [active]);

  const range = view.range[labels.lang];

  return (
    <div ref={root} className="mx-auto w-full max-w-[1440px] px-5 md:px-10">
      <div className="mb-10 flex flex-col justify-between gap-6 md:mb-14 lg:flex-row lg:items-end">
        <div>
          <Eyebrow className="mb-5">{labels.eyebrow}</Eyebrow>
          <SplitHeading text={labels.title} className={`${h2} max-w-3xl`} />
        </div>
        <p className="max-w-sm text-[13px] leading-relaxed text-[#0B0F14]/60">{labels.description}</p>
      </div>

      <div className="overflow-hidden rounded-[1.5rem] border border-[#E6EAF1] bg-white shadow-[0_24px_60px_rgba(11,15,20,0.07)]">
        {/* header */}
        <div className="flex flex-col gap-4 border-b border-[#E6EAF1] p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#0B0F14] px-3 py-1.5 font-dm-mono text-[9px] font-medium uppercase tracking-[0.18em] text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-[#4FC3D0]" />
              {labels.badge}
            </span>
            <span className="font-dm-mono text-[11px] tracking-[0.04em] text-[#0B0F14]/55">
              {view.source === 'gsc' ? labels.gscName : labels.gaName} · {range}
            </span>
          </div>
          <div role="tablist" className="no-scrollbar flex w-full gap-1 overflow-x-auto rounded-full bg-[#F3F5FA] p-1 md:w-auto">
            {tabs.map((t, i) => (
              <button key={t} role="tab" aria-selected={i === active} type="button" onClick={() => setActive(i)} className={`shrink-0 flex-1 whitespace-nowrap rounded-full px-4 py-2 text-[12px] font-medium transition-colors md:flex-none ${i === active ? 'bg-[#0B0F14] text-white' : 'text-[#0B0F14]/60 hover:text-[#0B0F14]'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div key={view.key} className="p-5 md:p-6">
          {/* stat tiles */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {view.stats.map((s, i) => {
              const hot = view.source === 'gsc' && i < 2;
              const color = i === 0 ? view.series[0].color : view.series[1]?.color || '#1A73E8';
              return (
                <div key={s.label} data-tile className="rounded-2xl border border-[#0B0F14]/8 p-4 md:p-5" style={hot ? { background: color, borderColor: color, color: '#fff' } : undefined}>
                  <div className={`font-dm-mono text-[10px] uppercase tracking-[0.16em] ${hot ? 'text-white/75' : 'text-[#0B0F14]/50'}`}>{s.label}</div>
                  <div className="mt-2 flex items-end gap-2">
                    <span className="text-[clamp(1.9rem,3.6vw,3rem)] font-light leading-none tracking-[-0.045em]">{s.value}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* chart */}
          <div className="mt-6 rounded-2xl border border-[#0B0F14]/8 p-3 md:p-5">
            <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 font-dm-mono text-[10px] uppercase tracking-[0.14em] text-[#0B0F14]/55">
              {view.series.map((s) => (
                <span key={s.label} className="flex items-center gap-2">
                  <span className="h-[3px] w-5 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
            <div data-chart>
              <Chart series={view.series} xTicks={view.xTicks} count={view.series[0].values.length} />
            </div>
          </div>

          <p className="mt-4 text-[11.5px] leading-relaxed text-[#0B0F14]/45">
            {labels.source} {labels.note}
          </p>
        </div>
      </div>
    </div>
  );
}
