import type { HTMLAttributes, ReactNode } from 'react';
import { Lock, Check, Search, Package, Truck, Home, ShoppingBag, ShieldCheck, Mail } from 'lucide-react';

/**
 * Product-UI mockups for the services stage. Each is authored on a fixed 400 x 280 canvas
 * (the stage scales it to fit) and carries the same animation hooks as the SVG artwork, plus
 * data-u (rise + fade). All figures are sample data for illustration only.
 */
const TEAL = '#2BB0C0';

const Win = ({ className = '', children, ...p }: { className?: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) => (
  <div {...p} className={`absolute overflow-hidden rounded-xl border border-[#0B0F14]/10 bg-white font-sans text-[#0B0F14] shadow-[0_12px_32px_rgba(11,15,20,0.12)] ${className}`}>
    {children}
  </div>
);
const Chrome = ({ url }: { url?: string }) => (
  <div className="flex h-6 items-center gap-1.5 border-b border-[#0B0F14]/10 bg-[#F6F7FA] px-2.5">
    {['#FF6159', '#FFBD2E', '#28C940'].map((c) => (
      <span key={c} className="h-[6px] w-[6px] rounded-full" style={{ background: c }} />
    ))}
    {url && (
      <span className="ml-2 flex h-3.5 items-center gap-1 rounded-full bg-white px-2 text-[7px] text-[#0B0F14]/55">
        <Lock className="h-[6px] w-[6px]" />
        {url}
      </span>
    )}
  </div>
);
const Sample = ({ className = '' }: { className?: string }) => <span className={`absolute font-mono text-[6.5px] uppercase tracking-[0.18em] text-[#0B0F14]/30 ${className}`}>Sample data</span>;
const line = (pts: number[], w: number, h: number, max = 100) => pts.map((v, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * w).toFixed(1)} ${(h - (v / max) * h).toFixed(1)}`).join(' ');
const draw = { 'data-d': '', pathLength: 1, strokeDasharray: 1 } as const;

/* ---------- brand marks (simplified, drawn here) ---------- */
const VisaMark = ({ size = 13 }: { size?: number }) => (
  <span className="font-extrabold italic tracking-[-0.06em]" style={{ color: '#1A1F71', fontSize: size, lineHeight: 1 }}>
    VISA
  </span>
);
const McMark = ({ size = 16 }: { size?: number }) => (
  <span className="relative inline-block" style={{ width: size * 1.55, height: size }}>
    <span className="absolute left-0 top-0 rounded-full bg-[#EB001B]" style={{ width: size, height: size }} />
    <span className="absolute right-0 top-0 rounded-full bg-[#F79E1B]/95" style={{ width: size, height: size }} />
    <span className="absolute top-0 rounded-full bg-[#FF5F00]" style={{ left: size * 0.275, width: size * 0.5, height: size, borderRadius: '50%' }} />
  </span>
);
const AppleGlyph = ({ size = 12, color = '#fff' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
    <path d="M17.05 12.54c-.03-2.84 2.32-4.2 2.43-4.27-1.32-1.94-3.38-2.2-4.1-2.23-1.75-.18-3.4 1.02-4.29 1.02-.89 0-2.25-1-3.7-.97-1.9.03-3.65 1.11-4.63 2.81-1.98 3.43-.51 8.5 1.42 11.28.94 1.36 2.06 2.89 3.53 2.83 1.42-.06 1.95-.92 3.66-.92 1.71 0 2.19.92 3.69.89 1.52-.03 2.49-1.38 3.42-2.75 1.08-1.58 1.52-3.11 1.55-3.19-.03-.01-2.96-1.14-2.98-4.5zM14.24 4.2c.78-.95 1.31-2.26 1.16-3.57-1.12.05-2.49.75-3.29 1.69-.72.83-1.35 2.17-1.18 3.45 1.26.1 2.53-.64 3.31-1.57z" />
  </svg>
);
const GoogleG = ({ size = 13 }: { size?: number }) => (
  <span className="relative inline-block rounded-full" style={{ width: size, height: size, background: 'conic-gradient(from -40deg, #4285F4 0 25%, #34A853 0 50%, #FBBC05 0 75%, #EA4335 0)' }}>
    <span className="absolute rounded-full bg-white" style={{ inset: size * 0.24 }} />
    <span className="absolute bg-[#4285F4]" style={{ left: '50%', top: '40%', width: '50%', height: size * 0.2 }} />
  </span>
);
const MetaMark = ({ size = 18 }: { size?: number }) => (
  <svg width={size * 1.6} height={size} viewBox="0 0 32 20" fill="none" aria-hidden>
    <path d="M5 10c0-4 2-7 4.4-7C13 3 16 17 22.600 17 25.600 17 27 14 27 10s-1.400-7-4.400-7C16 3 13 17 9.400 17 7 17 5 14 5 10z" stroke="#0866FF" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);

/* ------------------------------------------------------------------ Meta Ads */
const metaAds = (
  <>
    <Win className="inset-x-5 inset-y-3">
      <div className="flex h-8 items-center gap-2 border-b border-[#0B0F14]/10 px-3">
        <MetaMark size={12} />
        <span className="text-[10px] font-semibold tracking-tight">Ads Manager</span>
        <span className="ml-auto flex items-center gap-1 rounded-full bg-[#F0F2F5] px-2 py-[3px] text-[7px] text-[#0B0F14]/60">
          <span className="h-1.5 w-1.5 rounded-full bg-[#31A24C]" />
          Sample account
        </span>
      </div>
      <div className="flex h-6 items-end gap-4 border-b border-[#0B0F14]/10 px-3 text-[8.5px] text-[#0B0F14]/55">
        <span className="border-b-2 border-[#0866FF] pb-1.5 font-medium text-[#0866FF]">Campaigns</span>
        <span className="pb-1.5">Ad sets</span>
        <span className="pb-1.5">Ads</span>
      </div>
      <div className="px-3 pt-2.5">
        <div className="grid grid-cols-3 gap-2">
          {[
            ['Results', '1,284', '+18%', true],
            ['Cost / result', '$2.41', '-9%', true],
            ['Reach', '48.2K', '+12%', true],
          ].map(([l, v, d]) => (
            <div key={l as string} data-u="" className="rounded-lg border border-[#0B0F14]/10 px-2 py-1.5">
              <div className="text-[7px] text-[#0B0F14]/50">{l}</div>
              <div className="text-[13px] font-semibold leading-tight">{v}</div>
              <div className="text-[7px] font-medium text-[#31A24C]">{d}</div>
            </div>
          ))}
        </div>
        <div className="relative mt-2 h-[62px]">
          <div className="absolute inset-x-0 bottom-0 flex h-full items-end gap-[5px]">
            {[34, 46, 40, 58, 52, 66, 60, 74, 70, 84, 78, 92].map((h, i) => (
              <span key={i} data-r="" className="flex-1 rounded-t-[3px] bg-[#0866FF]/20" style={{ height: `${h}%` }} />
            ))}
          </div>
          <svg viewBox="0 0 330 62" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
            <path {...draw} d={line([34, 46, 40, 58, 52, 66, 60, 74, 70, 84, 78, 92], 330, 56, 100)} fill="none" stroke="#0866FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="mt-2 divide-y divide-[#0B0F14]/10 rounded-lg border border-[#0B0F14]/10 text-[8px]">
          {[
            ['Spring catalog — traffic', '$120 / day'],
            ['Retargeting — returning clients', '$65 / day'],
          ].map(([n, b]) => (
            <div key={n} data-s="" className="flex items-center gap-2 px-2 py-[5px]">
              <span className="relative h-2.5 w-5 rounded-full bg-[#0866FF]">
                <span className="absolute right-[2px] top-[2px] h-[6px] w-[6px] rounded-full bg-white" />
              </span>
              <span className="flex-1 truncate font-medium">{n}</span>
              <span className="flex items-center gap-1 text-[#31A24C]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#31A24C]" />
                Active
              </span>
              <span className="w-[46px] text-right text-[#0B0F14]/55">{b}</span>
            </div>
          ))}
        </div>
      </div>
      <Sample className="bottom-1 right-2" />
    </Win>
  </>
);

/* --------------------------------------------------------------- SEO / GEO / AEO */
const seo = (
  <>
    {/* Search Console */}
    <Win className="left-3 top-6 h-[218px] w-[238px]" data-s="">
      <div className="flex h-7 items-center gap-1.5 border-b border-[#0B0F14]/10 px-2.5">
        <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-[#1A73E8] text-white">
          <Search className="h-2 w-2" strokeWidth={3} />
        </span>
        <span className="text-[9px] font-medium">Search Console</span>
        <span className="ml-auto text-[7px] text-[#0B0F14]/45">18 Oct to 14 Nov</span>
      </div>
      <div className="px-2.5 pt-2">
        <div className="mb-1.5 text-[8px] font-medium text-[#0B0F14]/70">Performance</div>
        <div className="grid grid-cols-4 gap-1">
          {[
            ['Clicks', '3.21K', '#1A73E8', true],
            ['Impr.', '149K', '#5E35B1', true],
            ['CTR', '2.2%', '', false],
            ['Pos.', '11.1', '', false],
          ].map(([l, v, c, on]) => (
            <div key={l as string} data-u="" className="rounded-md px-1.5 py-1" style={{ background: on ? (c as string) : '#F1F3F4', color: on ? '#fff' : '#0B0F14' }}>
              <div className="text-[6.5px] opacity-80">{l}</div>
              <div className="text-[10px] font-semibold leading-tight">{v}</div>
            </div>
          ))}
        </div>
        <svg viewBox="0 0 220 70" className="mt-2 h-[64px] w-full" aria-hidden>
          {[14, 34, 54].map((y) => (
            <path key={y} d={`M0 ${y}H220`} stroke="#0B0F14" strokeOpacity="0.07" />
          ))}
          <path {...draw} d={line([30, 36, 34, 44, 52, 48, 60, 66, 62, 74, 80], 220, 62, 100)} fill="none" stroke="#5E35B1" strokeWidth="1.6" strokeLinecap="round" />
          <path {...draw} d={line([18, 22, 26, 24, 34, 38, 36, 46, 50, 56, 62], 220, 62, 100)} fill="none" stroke="#1A73E8" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
    </Win>
    {/* Google Analytics */}
    <Win className="left-[150px] top-[78px] h-[190px] w-[242px] z-10" data-sr="">
      <div className="flex h-7 items-center gap-1.5 border-b border-[#0B0F14]/10 px-2.5">
        <span className="flex items-end gap-[1.5px]">
          <span className="h-2 w-[3px] rounded-sm bg-[#E37400]" />
          <span className="h-3 w-[3px] rounded-sm bg-[#F9AB00]" />
          <span className="h-[7px] w-[3px] rounded-sm bg-[#E37400]" />
        </span>
        <span className="text-[9px] font-medium">Analytics</span>
        <span className="ml-auto rounded-full bg-[#F1F3F4] px-1.5 py-[2px] text-[6.5px] text-[#0B0F14]/55">Reports snapshot</span>
      </div>
      <div className="px-2.5 pt-2">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[7px] text-[#0B0F14]/50">Active users</div>
            <div className="text-[17px] font-medium leading-none">7.0K</div>
          </div>
        </div>
        <svg viewBox="0 0 220 56" className="mt-1.5 h-[52px] w-full" aria-hidden>
          <defs>
            <linearGradient id="ga-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#F9AB00" stopOpacity="0.3" />
              <stop offset="1" stopColor="#F9AB00" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line([28, 34, 30, 42, 46, 44, 56, 60, 58, 70, 76], 220, 50, 100)} L220 56 L0 56 Z`} fill="url(#ga-fill)" />
          <path {...draw} d={line([28, 34, 30, 42, 46, 44, 56, 60, 58, 70, 76], 220, 50, 100)} fill="none" stroke="#E37400" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <div className="mt-1.5 grid grid-cols-3 gap-1 text-[7px]">
          {[
            ['Sessions', '9.7K'],
            ['Views', '21K'],
            ['New users', '6.7K'],
          ].map(([l, v]) => (
            <div key={l} data-u="" className="rounded border border-[#0B0F14]/10 px-1.5 py-1">
              <div className="text-[#0B0F14]/50">{l}</div>
              <div className="text-[10px] font-medium">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </Win>
    <div className="absolute right-3 top-1.5 flex gap-1">
      {['SEO', 'GEO', 'AEO'].map((s, i) => (
        <span key={s} data-p="" className={`rounded-full border px-2 py-[2px] font-mono text-[7px] tracking-[0.14em] ${i === 0 ? 'border-[#2BB0C0] bg-[#2BB0C0]/10 text-[#0B6F7B]' : 'border-[#0B0F14]/15 text-[#0B0F14]/55'}`}>
          {s}
        </span>
      ))}
    </div>
      </>
);

/* ------------------------------------------------------------------ Payments */
const payments = (
  <>
    <Win className="left-3 top-3 h-[254px] w-[262px]" data-s="">
      <div className="flex h-7 items-center justify-between border-b border-[#0B0F14]/10 px-3">
        <span className="text-[10px] font-semibold">Checkout</span>
        <span className="flex items-center gap-1 text-[7px] text-[#0B0F14]/50">
          <Lock className="h-2 w-2" />
          Secure
        </span>
      </div>
      <div className="px-3 pt-2.5">
        <div className="grid grid-cols-2 gap-2">
          <span data-p="" className="flex h-8 items-center justify-center gap-1 rounded-md bg-black text-[11px] font-medium text-white">
            <AppleGlyph size={12} />
            Pay
          </span>
          <span data-p="" className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-[#0B0F14]/20 bg-white text-[11px] font-medium text-[#3C4043]">
            <GoogleG size={12} />
            Pay
          </span>
        </div>
        <div className="my-2 flex items-center gap-2 text-[7px] text-[#0B0F14]/40">
          <span className="h-px flex-1 bg-[#0B0F14]/10" />
          or pay with card
          <span className="h-px flex-1 bg-[#0B0F14]/10" />
        </div>
        <div className="space-y-1.5">
          <div data-u="" className="flex h-8 items-center justify-between rounded-md border border-[#0B0F14]/15 px-2">
            <span className="font-mono text-[9px] tracking-wide">•••• •••• •••• 4242</span>
            <span className="flex items-center gap-1.5">
              <VisaMark size={10} />
              <McMark size={9} />
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div data-u="" className="flex h-8 items-center rounded-md border border-[#0B0F14]/15 px-2 font-mono text-[9px] text-[#0B0F14]/60">
              12 / 28
            </div>
            <div data-u="" className="flex h-8 items-center rounded-md border border-[#0B0F14]/15 px-2 font-mono text-[9px] text-[#0B0F14]/60">
              CVC
            </div>
          </div>
        </div>
        <div data-p="" className="mt-2.5 flex h-9 items-center justify-center gap-1.5 rounded-md bg-[#0B0F14] text-[10px] font-medium text-white">
          <Lock className="h-2.5 w-2.5" />
          Pay now
        </div>
      </div>
    </Win>
    {/* accepted brands */}
    <div data-sr="" className="absolute left-[286px] top-[18px] flex h-[58px] w-[102px] items-center justify-center rounded-xl border border-[#0B0F14]/10 bg-white shadow-[0_10px_26px_rgba(11,15,20,0.1)]">
      <VisaMark size={22} />
    </div>
    <div data-sr="" className="absolute left-[286px] top-[88px] flex h-[58px] w-[102px] items-center justify-center rounded-xl border border-[#0B0F14]/10 bg-white shadow-[0_10px_26px_rgba(11,15,20,0.1)]">
      <McMark size={26} />
    </div>
    <div data-sr="" className="absolute left-[286px] top-[158px] flex h-[40px] w-[102px] items-center justify-center gap-1 rounded-xl bg-black text-[13px] font-medium text-white shadow-[0_10px_26px_rgba(11,15,20,0.18)]">
      <AppleGlyph size={14} />
      Pay
    </div>
    <div data-p="" className="absolute left-[222px] top-[212px] flex w-[166px] items-center gap-2 rounded-xl border border-[#31A24C]/30 bg-white px-2.5 py-2 shadow-[0_12px_30px_rgba(11,15,20,0.16)]">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#31A24C] text-white">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
      <div>
        <div className="text-[9px] font-semibold leading-tight">Payment received</div>
        <div className="text-[7px] text-[#0B0F14]/50">Receipt sent to your client</div>
      </div>
    </div>
  </>
);

/* ------------------------------------------------------------------ Email & SMS */
const email = (
  <>
    <Win className="left-3 top-4 h-[240px] w-[252px]" data-s="">
      <div className="flex h-8 items-center gap-2 border-b border-[#0B0F14]/10 px-3">
        <Mail className="h-3 w-3 text-[#0B6F7B]" />
        <span className="text-[10px] font-semibold">Inbox</span>
        <span className="ml-auto flex h-4 w-[84px] items-center gap-1 rounded-full bg-[#F1F3F4] px-1.5 text-[7px] text-[#0B0F14]/40">
          <Search className="h-2 w-2" /> Search
        </span>
      </div>
      <div className="divide-y divide-[#0B0F14]/5">
        {[
          ['Time to reorder?', 'Your usual batch is back in stock…', '9:41', true],
          ['COA ready to download', 'Batch-matched report for lot 2417…', '9:12', false],
          ['Your order has shipped', 'Tracking details inside…', 'Mon', false],
          ['Welcome to the program', 'Here is everything you need…', 'Sun', false],
        ].map(([s, p, t, hot], i) => (
          <div key={s as string} data-s="" className={`flex items-center gap-2 px-3 py-1.5 ${hot ? 'bg-[#2BB0C0]/10' : ''}`}>
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[7px] font-semibold ${hot ? 'bg-[#2BB0C0] text-white' : 'bg-[#0B0F14]/10 text-[#0B0F14]/55'}`}>{['Y', 'Y', 'Y', 'Y'][i]}</span>
            <div className="min-w-0 flex-1">
              <div className={`truncate text-[8.5px] ${hot ? 'font-semibold' : 'font-medium'}`}>{s}</div>
              <div className="truncate text-[7px] text-[#0B0F14]/45">{p}</div>
            </div>
            <span className="text-[7px] text-[#0B0F14]/40">{t}</span>
            {hot && <span className="h-1.5 w-1.5 rounded-full bg-[#2BB0C0]" />}
          </div>
        ))}
      </div>
      <div data-u="" className="mx-3 mt-2 rounded-lg border border-[#0B0F14]/10 p-2">
        <div className="mb-1 text-[7px] font-medium text-[#0B0F14]/50">Automation · Reorder reminder</div>
        <div className="flex items-center gap-1 text-[7.5px] text-[#0B0F14]/70">
          <span className="rounded bg-[#0B0F14]/5 px-1 py-[1px]">Day 21</span>→<span className="rounded bg-[#0B0F14]/5 px-1 py-[1px]">Email</span>→<span className="rounded bg-[#2BB0C0]/15 px-1 py-[1px] text-[#0B6F7B]">SMS</span>
        </div>
      </div>
    </Win>
    {/* phone */}
    <div data-sr="" className="absolute left-[274px] top-[18px] h-[232px] w-[116px] rounded-[20px] border-[3px] border-[#0B0F14] bg-white shadow-[0_16px_36px_rgba(11,15,20,0.2)]">
      <div className="mx-auto mt-1.5 h-1.5 w-10 rounded-full bg-[#0B0F14]" />
      <div className="px-2 pt-3 text-center text-[7px] text-[#0B0F14]/45">Text message</div>
      <div className="mt-1.5 space-y-1.5 px-2">
        <div data-p="" className="rounded-xl rounded-bl-sm bg-[#EDEFF2] px-2 py-1.5 text-[7.5px] leading-snug">Your order #4821 has shipped. Track it: link</div>
        <div data-p="" className="ml-auto w-[78%] rounded-xl rounded-br-sm bg-[#2BB0C0] px-2 py-1.5 text-[7.5px] leading-snug text-white">Thanks!</div>
        <div data-p="" className="rounded-xl rounded-bl-sm bg-[#EDEFF2] px-2 py-1.5 text-[7.5px] leading-snug">Reorder reminder: your usual batch is available.</div>
        <div className="px-1 text-center text-[6px] text-[#0B0F14]/35">Reply STOP to opt out</div>
      </div>
    </div>
  </>
);

/* ------------------------------------------------------------------ Brand */
const brand = (
  <Win className="inset-x-4 inset-y-5" data-p="">
    <div className="grid h-full grid-cols-[1fr_1fr] grid-rows-[1.15fr_1fr] gap-2 bg-[#F6F7FA] p-2">
      <div data-u="" className="flex flex-col items-center justify-center gap-1.5 rounded-lg bg-white">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2BB0C0] text-[15px] font-bold text-white">99</span>
        <span className="text-[9px] font-semibold tracking-tight">Your Brand</span>
      </div>
      <div data-u="" className="rounded-lg bg-white p-2">
        <div className="mb-1.5 text-[6.5px] uppercase tracking-[0.16em] text-[#0B0F14]/40">Palette</div>
        <div className="grid grid-cols-2 gap-1">
          {[
            ['#2BB0C0', 'Teal'],
            ['#0B0F14', 'Ink'],
            ['#F3F5FA', 'Paper'],
            ['#1B7F8C', 'Deep'],
          ].map(([c, n]) => (
            <div key={c} className="flex items-center gap-1">
              <span className="h-4 w-4 rounded border border-black/10" style={{ background: c }} />
              <span className="font-mono text-[6px] text-[#0B0F14]/55">{c}</span>
            </div>
          ))}
        </div>
      </div>
      <div data-u="" className="flex items-center gap-2 rounded-lg bg-white px-3">
        <span className="text-[30px] font-light leading-none tracking-tighter">Aa</span>
        <div className="text-[6.5px] leading-tight text-[#0B0F14]/50">
          DM Sans
          <br />
          Light · Regular
        </div>
      </div>
      <div data-u="" className="flex items-center justify-center rounded-lg bg-white">
        <div className="flex h-[58px] w-[34px] flex-col items-center rounded-[5px] border border-[#0B0F14]/20 bg-white pt-1.5 shadow-sm">
          <span className="h-1.5 w-4 rounded-sm bg-[#0B0F14]/70" />
          <span className="mt-1 h-1 w-5 rounded-sm bg-[#0B0F14]/25" />
          <span className="mt-auto h-3 w-full bg-[#2BB0C0]" />
        </div>
        <div className="ml-2 text-[6.5px] leading-tight text-[#0B0F14]/50">
          Label
          <br />& box system
        </div>
      </div>
    </div>
  </Win>
);

/* ------------------------------------------------------------------ Fulfillment */
const fulfillment = (
  <Win className="inset-x-4 inset-y-4" data-p="">
    <div className="flex h-8 items-center justify-between border-b border-[#0B0F14]/10 px-3">
      <span className="text-[10px] font-semibold">Order #4821</span>
      <span className="flex items-center gap-1 rounded-full bg-[#2BB0C0]/15 px-2 py-[2px] text-[7.5px] font-medium text-[#0B6F7B]">
        <Truck className="h-2.5 w-2.5" />
        In transit
      </span>
    </div>
    <div className="px-4 pt-4">
      <div className="relative flex items-start justify-between">
        <span className="absolute left-[9px] right-[9px] top-[9px] h-[2px] rounded bg-[#0B0F14]/10" />
        <span data-t="" className="absolute left-[9px] top-[9px] h-[2px] w-[calc(50%-9px)] rounded bg-[#2BB0C0]" />
        {[
          ['Packed', true, Package],
          ['Shipped', true, Truck],
          ['Delivered', false, Home],
        ].map(([l, done, Icon]) => {
          const I = Icon as typeof Package;
          return (
            <div key={l as string} data-p="" className="relative flex flex-col items-center gap-1">
              <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 ${done ? 'border-[#2BB0C0] bg-[#2BB0C0] text-white' : 'border-[#0B0F14]/15 bg-white text-[#0B0F14]/35'}`}>
                {done ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : <I className="h-2.5 w-2.5" />}
              </span>
              <span className={`text-[7.5px] ${done ? 'font-medium' : 'text-[#0B0F14]/45'}`}>{l as string}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 divide-y divide-[#0B0F14]/5 rounded-lg border border-[#0B0F14]/10 text-[8px]">
        {[
          ['Research peptide kit', 'Lot 2417', '× 10'],
          ['Bacteriostatic water', 'Lot 1096', '× 10'],
          ['Branded packaging', 'Your brand', '× 1'],
        ].map(([n, l, q]) => (
          <div key={n} data-s="" className="flex items-center gap-2 px-2.5 py-1.5">
            <span className="h-5 w-5 rounded bg-[#0B0F14]/5" />
            <span className="flex-1 font-medium">{n}</span>
            <span className="text-[#0B0F14]/45">{l}</span>
            <span className="w-6 text-right">{q}</span>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[7.5px] text-[#0B0F14]/55">
        <span className="font-mono">Tracking 9400 1118 9922</span>
        <span className="flex items-center gap-1 text-[#0B6F7B]">
          <ShieldCheck className="h-2.5 w-2.5" />
          COA attached
        </span>
      </div>
    </div>
  </Win>
);

/* ------------------------------------------------------------------ Dropshipping */
const dropshipping = (
  <>
    {[
      ['Your store', 'New order received', ShoppingBag, 12],
      ['We fulfill', 'Packed under your brand', Package, 146],
      ['Customer', 'Delivered to the door', Home, 280],
    ].map(([t, s, Icon, x], i) => {
      const I = Icon as typeof Package;
      return (
        <Win key={t as string} data-p="" className="top-6 h-[104px] w-[108px]" style={{ left: x as number }}>
          <div className="p-2.5">
            <span className={`mb-2 flex h-6 w-6 items-center justify-center rounded-lg ${i === 1 ? 'bg-[#2BB0C0] text-white' : 'bg-[#0B0F14]/5 text-[#0B0F14]/65'}`}>
              <I className="h-3 w-3" />
            </span>
            <div className="text-[9.5px] font-semibold">{t as string}</div>
            <div className="mt-0.5 text-[7.5px] leading-snug text-[#0B0F14]/55">{s as string}</div>
          </div>
        </Win>
      );
    })}
    <svg viewBox="0 0 400 280" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      <path {...draw} d="M122 78H144M258 78H278" fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round" />
      <path {...draw} d="M138 72L145 78L138 84M272 72L279 78L272 84" fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <Win className="left-3 top-[146px] h-[118px] w-[376px]" data-s="">
      <div className="flex h-6 items-center border-b border-[#0B0F14]/10 px-3 text-[7px] uppercase tracking-[0.14em] text-[#0B0F14]/40">
        <span className="w-16">Order</span>
        <span className="flex-1">Item</span>
        <span className="w-20 text-right">Status</span>
      </div>
      {[
        ['#1042', 'Research kit × 4', 'Shipped', '#31A24C'],
        ['#1041', 'Starter pack × 2', 'Packed', '#2BB0C0'],
        ['#1040', 'Reorder × 10', 'Delivered', '#0B0F14'],
      ].map(([id, it, st, c]) => (
        <div key={id} data-s="" className="flex items-center border-b border-[#0B0F14]/5 px-3 py-[7px] text-[8.5px] last:border-0">
          <span className="w-16 font-mono text-[#0B0F14]/55">{id}</span>
          <span className="flex-1 font-medium">{it}</span>
          <span className="flex w-20 items-center justify-end gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
            {st}
          </span>
        </div>
      ))}
    </Win>
  </>
);

/* ------------------------------------------------------------------ Customer support */
const support = (
  <>
    <Win className="left-3 top-4 h-[244px] w-[246px]" data-s="">
      <div className="flex h-9 items-center gap-2 border-b border-[#0B0F14]/10 px-3">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2BB0C0] text-[8px] font-semibold text-white">S</span>
        <div className="leading-tight">
          <div className="text-[9.5px] font-semibold">Support</div>
          <div className="flex items-center gap-1 text-[7px] text-[#0B0F14]/50">
            <span className="h-1.5 w-1.5 rounded-full bg-[#31A24C]" />
            Online · replies in minutes
          </div>
        </div>
      </div>
      <div className="space-y-2 px-3 pt-3 text-[8.5px] leading-snug">
        <div data-s="" className="w-[78%] rounded-2xl rounded-bl-sm bg-[#EDEFF2] px-2.5 py-1.5">Hi, can I get the COA for lot 2417?</div>
        <div data-sr="" className="ml-auto w-[82%] rounded-2xl rounded-br-sm bg-[#2BB0C0] px-2.5 py-1.5 text-white">Of course. Sending the batch-matched report now.</div>
        <div data-s="" className="w-[60%] rounded-2xl rounded-bl-sm bg-[#EDEFF2] px-2.5 py-1.5">Perfect, thank you.</div>
        <div data-p="" className="ml-auto flex w-12 items-center justify-center gap-1 rounded-2xl rounded-br-sm bg-[#2BB0C0]/20 py-2">
          {[0, 1, 2].map((i) => (
            <span key={i} data-pulse="" className="h-1 w-1 rounded-full bg-[#0B6F7B]" />
          ))}
        </div>
      </div>
      <div className="absolute inset-x-3 bottom-2.5 flex h-7 items-center rounded-full border border-[#0B0F14]/10 px-3 text-[8px] text-[#0B0F14]/35">
        Write a reply…
        <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-[#0B0F14] text-white">
          <Check className="h-2 w-2" />
        </span>
      </div>
    </Win>
    <Win className="left-[250px] top-[50px] w-[142px]" data-sr="">
      <div className="p-2.5 text-[8px]">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-mono text-[#0B0F14]/50">#1042</span>
          <span className="rounded bg-[#FFF3D6] px-1 py-[1px] text-[7px] font-medium text-[#9A6700]">Open</span>
        </div>
        <div className="mb-2 text-[9px] font-semibold leading-tight">COA request · lot 2417</div>
        <div className="mb-1 flex justify-between text-[7px] text-[#0B0F14]/50">
          <span>Response SLA</span>
          <span>12 min</span>
        </div>
        <div className="h-1 rounded-full bg-[#0B0F14]/10">
          <span data-t="" className="block h-1 w-[72%] rounded-full bg-[#2BB0C0]" />
        </div>
        <div className="mt-2.5 flex items-center gap-1.5 border-t border-[#0B0F14]/10 pt-2">
          <span className="h-4 w-4 rounded-full bg-[#0B0F14]/10" />
          <span className="text-[7.5px] text-[#0B0F14]/60">Assigned to Sam</span>
        </div>
      </div>
    </Win>
  </>
);

/* ------------------------------------------------------------------ Website development */
const siteBlock = (
  <div className="p-3">
    <div className="mb-3 flex items-center gap-3">
      <span className="h-3 w-3 rounded bg-[#2BB0C0]" />
      <span className="text-[8px] font-semibold tracking-tight">YourBrand</span>
      {['Catalog', 'COAs', 'About'].map((n) => (
        <span key={n} className="text-[7px] text-[#0B0F14]/50">
          {n}
        </span>
      ))}
      <span className="ml-auto rounded-full bg-[#0B0F14] px-2 py-[3px] text-[6.5px] text-white">Request access</span>
    </div>
    <div className="grid grid-cols-[1.3fr_1fr] gap-3">
      <div>
        <div data-t="" className="h-2.5 w-[88%] rounded bg-[#0B0F14]" />
        <div data-t="" className="mt-1.5 h-2.5 w-[62%] rounded bg-[#0B0F14]" />
        <div data-t="" className="mt-2.5 h-1.5 w-[92%] rounded bg-[#0B0F14]/20" />
        <div data-t="" className="mt-1 h-1.5 w-[70%] rounded bg-[#0B0F14]/20" />
        <div className="mt-3 flex gap-1.5">
          <span className="rounded-full bg-[#2BB0C0] px-2.5 py-[4px] text-[6.5px] font-medium">Get pricing</span>
          <span className="rounded-full border border-[#0B0F14]/20 px-2.5 py-[4px] text-[6.5px]">View catalog</span>
        </div>
      </div>
      <div data-p="" className="rounded-lg bg-gradient-to-br from-[#2BB0C0]/40 to-[#0B0F14]/10" />
    </div>
    <div className="mt-3 grid grid-cols-3 gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} data-u="" className="rounded-lg border border-[#0B0F14]/10 p-1.5">
          <div className="mb-1.5 h-[34px] rounded bg-[#0B0F14]/5" />
          <div className="h-1.5 w-[70%] rounded bg-[#0B0F14]/70" />
          <div className="mt-1 h-1 w-[45%] rounded bg-[#0B0F14]/20" />
        </div>
      ))}
    </div>
  </div>
);
const web = (
  <>
    <Win className="inset-x-4 inset-y-4" data-p="">
      <Chrome url="yourstore.com" />
      {siteBlock}
    </Win>
    <div data-sr="" className="absolute bottom-3 right-6 flex items-center gap-1.5 rounded-full border border-[#0B0F14]/10 bg-white px-2.5 py-1.5 text-[7.5px] font-medium shadow-[0_8px_24px_rgba(11,15,20,0.14)]">
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#31A24C] text-white">
        <Check className="h-2 w-2" strokeWidth={3} />
      </span>
      Mobile-ready · fast
    </div>
  </>
);

/* ------------------------------------------------------------------ Website redesign */
const MiniOld = () => (
  <div className="p-2">
    <div className="mb-1.5 flex items-center gap-1">
      <span className="h-2 w-8 rounded-sm bg-[#8a8f98]" />
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="h-1 w-3 rounded-sm bg-[#b4b8bf]" />
      ))}
    </div>
    <div className="mb-1.5 h-9 rounded-sm bg-[#cfd2d8]" />
    {[88, 100, 72, 94].map((w, i) => (
      <div key={i} className="mb-1 h-1 rounded-sm bg-[#c3c7ce]" style={{ width: `${w}%` }} />
    ))}
    <div className="mt-1.5 grid grid-cols-3 gap-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-7 rounded-sm bg-[#d6d9de]" />
      ))}
    </div>
  </div>
);
const MiniNew = () => (
  <div className="p-2">
    <div className="mb-2 flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-sm bg-[#2BB0C0]" />
      <span className="h-1 w-6 rounded bg-[#0B0F14]/70" />
      <span className="ml-auto h-2.5 w-9 rounded-full bg-[#0B0F14]" />
    </div>
    <div className="mb-1.5 h-1.5 w-[80%] rounded bg-[#0B0F14]" />
    <div className="mb-2 h-1.5 w-[55%] rounded bg-[#0B0F14]" />
    <div className="mb-2 flex gap-1">
      <span className="h-2.5 w-9 rounded-full bg-[#2BB0C0]" />
      <span className="h-2.5 w-9 rounded-full border border-[#0B0F14]/25" />
    </div>
    <div className="grid grid-cols-3 gap-1.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-9 rounded-md bg-gradient-to-br from-[#2BB0C0]/35 to-[#0B0F14]/10" />
      ))}
    </div>
  </div>
);
const redesign = (
  <>
    <Win className="left-3 top-7 h-[212px] w-[178px]" data-s="">
      <Chrome />
      <MiniOld />
    </Win>
    <Win className="left-[210px] top-7 h-[212px] w-[178px] border-[#2BB0C0]/50" data-sr="">
      <Chrome />
      <MiniNew />
    </Win>
    <span data-p="" className="absolute left-3 top-1.5 rounded-full bg-[#0B0F14]/10 px-2 py-[2px] font-mono text-[7px] uppercase tracking-[0.16em] text-[#0B0F14]/55">Before</span>
    <span data-p="" className="absolute right-3 top-1.5 rounded-full bg-[#2BB0C0]/15 px-2 py-[2px] font-mono text-[7px] uppercase tracking-[0.16em] text-[#0B6F7B]">After</span>
    <div data-p="" className="absolute left-[179px] top-[118px] flex h-[42px] w-[42px] items-center justify-center rounded-full border-4 border-white bg-[#0B0F14] text-white shadow-lg">
      <span className="text-[11px] tracking-tighter">⇄</span>
    </div>
    <div data-u="" className="absolute bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[#0B0F14]/10 bg-white px-2.5 py-1 text-[7.5px] font-medium shadow-md">
      <span className="h-1.5 w-1.5 rounded-full bg-[#31A24C]" />
      301 redirects mapped · rankings protected
    </div>
  </>
);

/* ------------------------------------------------------------------ Compliance */
const compliance = (
  <>
    <Win className="left-3 top-4 h-[244px] w-[252px]" data-s="">
      <div className="flex h-8 items-center justify-between border-b border-[#0B0F14]/10 px-3">
        <span className="text-[10px] font-semibold">Content review</span>
        <span className="flex items-center gap-1 rounded-full bg-[#E6F4EA] px-2 py-[2px] text-[7.5px] font-medium text-[#188038]">
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
          Passed
        </span>
      </div>
      <div className="px-3 pt-2.5">
        <div className="space-y-1.5">
          {['Research-use disclaimer present', 'No outcome or medical claims', 'Ad and listing policy check', 'Packaging wording reviewed'].map((l) => (
            <div key={l} data-s="" className="flex items-center gap-2 rounded-md border border-[#0B0F14]/10 px-2 py-1.5">
              <span data-p="" className="flex h-3.5 w-3.5 items-center justify-center rounded bg-[#2BB0C0] text-white">
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              </span>
              <span className="text-[8.5px]">{l}</span>
            </div>
          ))}
        </div>
        <div data-u="" className="mt-2.5 rounded-md bg-[#F6F7FA] p-2 text-[7.5px] leading-relaxed text-[#0B0F14]/60">
          …supplied to licensed professionals.{' '}
          <mark className="rounded bg-[#2BB0C0]/25 px-0.5 text-[#0B0F14]">For laboratory research use only.</mark>
        </div>
      </div>
    </Win>
    <div data-sr="" className="absolute left-[282px] top-[62px] flex h-[120px] w-[106px] flex-col items-center justify-center rounded-2xl border border-[#0B0F14]/10 bg-white shadow-[0_12px_30px_rgba(11,15,20,0.12)]">
      <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[#2BB0C0]/15 text-[#0B6F7B]">
        <span data-pulse="" className="absolute inset-0 rounded-full border border-[#2BB0C0]" />
        <ShieldCheck className="h-6 w-6" />
      </span>
      <div className="mt-2 text-[9px] font-semibold">Policy check</div>
      <div className="text-[7px] text-[#0B0F14]/50">4 of 4 clear</div>
    </div>
  </>
);

export const SERVICE_UI: Record<string, ReactNode> = { metaAds, seo, email, brand, fulfillment, dropshipping, support, payments, web, redesign, compliance };
