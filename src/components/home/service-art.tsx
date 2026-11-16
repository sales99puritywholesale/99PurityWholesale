import type { ReactNode } from 'react';

/**
 * Decorative illustrations for the services stage. Every shape carries one animation hook that
 * ServicesAtlas reads:
 *   data-d  stroke draws itself        data-p  pops in (scale)
 *   data-r  rises from its baseline    data-s / data-sr  slides in from left / right
 *   data-t  wipes in like a text line  data-pulse / data-float  idle loops
 */
const T = '#2BB0C0';
const W = 'rgba(11,15,20,0.62)';
const D = 'rgba(11,15,20,0.16)';
const F = 'rgba(11,15,20,0.035)';
const INK = '#0B0D10';

const line = (c = W, w = 1.6) => ({ fill: 'none', stroke: c, strokeWidth: w, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });
const draw = { 'data-d': '', pathLength: 1, strokeDasharray: 1 } as const;
const mono = { fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.12em' } as const;

const metaAds = (
  <>
    <path d="M40 232H360" {...line(D)} />
    {[
      [60, 40],
      [105, 65],
      [150, 95],
      [195, 130],
    ].map(([x, h]) => (
      <rect key={x} data-r="" x={x} y={232 - h} width="30" height={h} rx="4" fill="rgba(79,195,208,0.22)" stroke={T} strokeWidth="1.4" />
    ))}
    <path {...draw} d="M70 172L120 138L165 112L210 66" {...line(W, 2)} />
    <path {...draw} d="M196 64L211 65L208 80" {...line(W, 2)} />
    <circle {...draw} cx="305" cy="150" r="58" {...line(D, 1.4)} />
    <circle {...draw} cx="305" cy="150" r="38" {...line(W, 1.4)} />
    <circle {...draw} cx="305" cy="150" r="18" {...line(T, 1.6)} />
    <circle data-p="" cx="305" cy="150" r="6" fill={T} />
    <circle data-pulse="" cx="305" cy="150" r="58" fill="none" stroke={T} strokeWidth="1" opacity="0.5" />
    <path {...draw} d="M305 150L352 103M340 103H352V115" {...line(T, 2)} />
  </>
);

const seo = (
  <>
    <circle {...draw} cx="150" cy="125" r="62" {...line(T, 2.2)} />
    <path {...draw} d="M195 170L248 224" {...line(T, 5)} />
    <path {...draw} d="M112 152L138 124L158 138L188 98" {...line(W, 2)} />
    {['SEO', 'GEO', 'AEO'].map((s, i) => (
      <g key={s} data-sr="">
        <rect x="272" y={62 + i * 50} width="88" height="34" rx="17" fill={i === 0 ? 'rgba(79,195,208,0.2)' : F} stroke={i === 0 ? T : W} strokeWidth="1.3" />
        <text x="316" y={84 + i * 50} textAnchor="middle" fontSize="12" fill={i === 0 ? T : W} style={mono}>
          {s}
        </text>
      </g>
    ))}
    <circle data-pulse="" cx="188" cy="98" r="6" fill={T} />
  </>
);

const email = (
  <>
    <rect {...draw} x="70" y="95" width="250" height="150" rx="16" {...line(W, 1.8)} fill={F} />
    <path {...draw} d="M72 108L195 188L318 108" {...line(T, 2.2)} />
    <rect data-t="" x="105" y="205" width="90" height="6" rx="3" fill={D} />
    <rect data-t="" x="105" y="220" width="60" height="6" rx="3" fill={D} />
    <g data-sr="">
      <rect x="258" y="34" width="100" height="44" rx="14" fill="rgba(79,195,208,0.2)" stroke={T} strokeWidth="1.4" />
      <path d="M280 78L272 92L296 78Z" fill="rgba(79,195,208,0.2)" stroke={T} strokeWidth="1.4" strokeLinejoin="round" />
      <circle data-pulse="" cx="284" cy="56" r="3.5" fill={T} />
      <circle data-pulse="" cx="300" cy="56" r="3.5" fill={T} />
      <circle data-pulse="" cx="316" cy="56" r="3.5" fill={T} />
    </g>
    <circle data-p="" cx="320" cy="108" r="14" fill={T} />
    <text data-p="" x="320" y="113" textAnchor="middle" fontSize="13" fill={INK} fontWeight="700">
      1
    </text>
  </>
);

const brand = (
  <>
    <path {...draw} d="M200 62L296 104L200 146L104 104Z" {...line(T, 2)} fill="rgba(79,195,208,0.18)" />
    <path {...draw} d="M104 104L200 146V240L104 198Z" {...line(W, 1.8)} fill={F} />
    <path {...draw} d="M296 104L200 146V240L296 198Z" {...line(W, 1.8)} fill={F} />
    <circle data-p="" cx="200" cy="104" r="14" fill={T} />
    <path data-p="" d="M194 104H206M200 98V110" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    {[T, '#0B0F14', '#1B7F8C'].map((c, i) => (
      <circle key={c} data-p="" cx="52" cy={70 + i * 42} r="15" fill={c} stroke={W} strokeWidth="1" />
    ))}
    <text data-sr="" x="318" y="84" fontSize="40" fill={W} fontWeight="300">
      Aa
    </text>
    <path data-sr="" d="M320 100H368" {...line(T, 2)} />
  </>
);

const fulfillment = (
  <>
    <path {...draw} d="M30 222H370" {...line(W, 2)} />
    {[60, 110, 160, 210, 260, 310].map((x) => (
      <path key={x} d={`M${x} 228V238`} {...line(D)} />
    ))}
    <g data-s="">
      <rect x="64" y="150" width="78" height="72" rx="6" fill={F} stroke={T} strokeWidth="1.6" />
      <path d="M103 150V222" {...line(T, 1.4)} />
    </g>
    <g data-s="">
      <rect x="170" y="176" width="58" height="46" rx="6" fill={F} stroke={W} strokeWidth="1.6" />
      <path d="M199 176V222" {...line(W, 1.2)} />
    </g>
    <g data-s="">
      <rect x="258" y="130" width="92" height="92" rx="8" fill="rgba(79,195,208,0.14)" stroke={T} strokeWidth="1.8" />
      <rect x="272" y="148" width="40" height="8" rx="2" fill={W} />
      <rect x="272" y="162" width="26" height="6" rx="2" fill={D} />
    </g>
    <rect data-pulse="" x="250" y="100" width="2" height="124" fill={T} opacity="0.7" />
    <path {...draw} d="M60 90H130M118 78L130 90L118 102" {...line(T, 2)} />
  </>
);

const dropshipping = (
  <>
    <path {...draw} d="M46 152L92 118L138 152V216H46Z" {...line(W, 1.8)} fill={F} />
    <rect data-p="" x="80" y="180" width="24" height="36" rx="3" fill="rgba(11,15,20,0.18)" />
    <path {...draw} d="M262 152L308 118L354 152V216H262Z" {...line(T, 2)} fill="rgba(79,195,208,0.1)" />
    <rect data-p="" x="296" y="180" width="24" height="36" rx="3" fill={T} />
    <path {...draw} d="M150 176C185 104 215 104 250 176" {...line(T, 2)} />
    {[
      [168, 134],
      [200, 118],
      [232, 134],
    ].map(([x, y]) => (
      <circle key={x} data-p="" cx={x} cy={y} r="4.5" fill={T} />
    ))}
    <g data-float="">
      <rect data-p="" x="190" y="74" width="22" height="22" rx="4" fill="rgba(79,195,208,0.25)" stroke={T} strokeWidth="1.5" />
      <path d="M201 74V96" {...line(T, 1.2)} />
    </g>
  </>
);

const support = (
  <>
    <g data-s="">
      <rect x="46" y="48" width="180" height="62" rx="18" fill={F} stroke={W} strokeWidth="1.6" />
      <path d="M72 110L62 130L96 110Z" fill={F} stroke={W} strokeWidth="1.6" strokeLinejoin="round" />
      <rect x="68" y="68" width="110" height="7" rx="3.5" fill={D} />
      <rect x="68" y="84" width="72" height="7" rx="3.5" fill={D} />
    </g>
    <g data-sr="">
      <rect x="176" y="136" width="180" height="70" rx="18" fill="rgba(79,195,208,0.18)" stroke={T} strokeWidth="1.6" />
      <path d="M326 206L340 226L300 206Z" fill="rgba(79,195,208,0.18)" stroke={T} strokeWidth="1.6" strokeLinejoin="round" />
      <rect x="198" y="158" width="120" height="7" rx="3.5" fill={T} opacity="0.7" />
      <rect x="198" y="176" width="84" height="7" rx="3.5" fill={T} opacity="0.45" />
    </g>
    <g data-p="">
      <rect x="46" y="150" width="76" height="38" rx="19" fill={F} stroke={W} strokeWidth="1.4" />
      {[68, 84, 100].map((x) => (
        <circle key={x} data-pulse="" cx={x} cy="169" r="4" fill={T} />
      ))}
    </g>
    <path {...draw} d="M290 74a30 30 0 0 1 60 0M290 74v14M350 74v14" {...line(T, 2.2)} />
  </>
);

const payments = (
  <>
    <rect {...draw} x="60" y="62" width="240" height="148" rx="20" {...line(W, 1.8)} fill={F} />
    <rect data-t="" x="60" y="98" width="240" height="26" fill="rgba(79,195,208,0.75)" />
    <rect data-p="" x="84" y="146" width="40" height="30" rx="6" fill="rgba(79,195,208,0.2)" stroke={T} strokeWidth="1.5" />
    <rect data-t="" x="146" y="152" width="110" height="7" rx="3.5" fill={W} opacity="0.6" />
    <rect data-t="" x="146" y="168" width="64" height="7" rx="3.5" fill={W} opacity="0.35" />
    <circle data-p="" cx="312" cy="196" r="42" fill={T} />
    <path {...draw} d="M293 196L307 210L332 182" {...line(INK, 4.2)} />
    <circle data-pulse="" cx="312" cy="196" r="42" fill="none" stroke={T} strokeWidth="1.2" opacity="0.6" />
    <circle data-p="" cx="340" cy="66" r="14" fill="none" stroke={T} strokeWidth="1.6" />
    <path data-p="" d="M340 59V73M335 63H343a3 3 0 0 1 0 6H335" {...line(T, 1.4)} />
  </>
);

const web = (
  <>
    <rect {...draw} x="46" y="40" width="308" height="200" rx="16" {...line(W, 1.8)} fill={F} />
    <path {...draw} d="M46 76H354" {...line(D, 1.4)} />
    {[66, 82, 98].map((x, i) => (
      <circle key={x} data-p="" cx={x} cy="58" r="4.5" fill={i === 0 ? T : D} />
    ))}
    <rect data-t="" x="72" y="102" width="110" height="7" rx="3.5" fill={T} />
    <rect data-t="" x="92" y="120" width="150" height="7" rx="3.5" fill={W} opacity="0.6" />
    <rect data-t="" x="92" y="138" width="96" height="7" rx="3.5" fill={W} opacity="0.4" />
    <rect data-t="" x="72" y="156" width="130" height="7" rx="3.5" fill={T} opacity="0.7" />
    <rect data-t="" x="92" y="174" width="170" height="7" rx="3.5" fill={W} opacity="0.5" />
    <rect data-t="" x="92" y="192" width="70" height="7" rx="3.5" fill={W} opacity="0.35" />
    <rect data-pulse="" x="270" y="170" width="3" height="16" fill={T} />
    <text data-sr="" x="292" y="150" fontSize="28" fill={T} style={mono}>
      {'</>'}
    </text>
  </>
);

const redesign = (
  <>
    <g data-s="">
      <rect x="36" y="56" width="152" height="172" rx="12" fill={F} stroke={D} strokeWidth="1.4" strokeDasharray="5 5" />
      <rect x="52" y="74" width="120" height="44" rx="6" fill="rgba(11,15,20,0.08)" />
      <rect x="52" y="130" width="90" height="7" rx="3.5" fill="rgba(11,15,20,0.14)" />
      <rect x="52" y="146" width="120" height="7" rx="3.5" fill="rgba(11,15,20,0.1)" />
      <rect x="52" y="190" width="56" height="20" rx="4" fill="rgba(11,15,20,0.1)" />
    </g>
    <g data-sr="">
      <rect x="212" y="56" width="152" height="172" rx="12" fill="rgba(79,195,208,0.08)" stroke={T} strokeWidth="1.8" />
      <rect x="228" y="74" width="120" height="44" rx="6" fill="rgba(79,195,208,0.4)" />
      <rect x="228" y="130" width="90" height="7" rx="3.5" fill={W} />
      <rect x="228" y="146" width="120" height="7" rx="3.5" fill={W} opacity="0.5" />
      <rect x="228" y="190" width="64" height="22" rx="11" fill={T} />
    </g>
    <circle data-p="" cx="200" cy="142" r="16" fill={T} />
    <path data-p="" d="M193 142H207M202 136L208 142L202 148" {...line(INK, 2)} />
  </>
);

const privateLabel = (
  <>
    <rect {...draw} x="168" y="44" width="64" height="24" rx="6" {...line(W, 1.8)} fill={F} />
    <path {...draw} d="M178 68V82H222V68" {...line(W, 1.8)} />
    <rect {...draw} x="148" y="82" width="104" height="158" rx="16" {...line(T, 2.2)} fill={F} />
    <rect data-r="" x="150" y="170" width="100" height="68" rx="12" fill="rgba(79,195,208,0.22)" />
    <rect data-p="" x="156" y="106" width="88" height="76" rx="6" fill="#fff" stroke={W} strokeWidth="1.2" />
    <rect data-t="" x="168" y="120" width="64" height="7" rx="3" fill={INK} opacity="0.85" />
    <rect data-t="" x="168" y="134" width="42" height="5" rx="2.5" fill={INK} opacity="0.4" />
    <rect data-p="" x="156" y="160" width="88" height="16" fill={T} />
    <g data-s="">
      <rect x="28" y="96" width="104" height="32" rx="16" fill={F} stroke={W} strokeWidth="1.3" />
      <text x="80" y="116" textAnchor="middle" fontSize="10.5" fill={W} style={mono}>
        YOUR BRAND
      </text>
    </g>
    <g data-sr="">
      <rect x="276" y="150" width="84" height="32" rx="16" fill="rgba(79,195,208,0.18)" stroke={T} strokeWidth="1.3" />
      <text x="318" y="170" textAnchor="middle" fontSize="10.5" fill={T} style={mono}>
        MOQ
      </text>
    </g>
  </>
);

const compliance = (
  <>
    <path {...draw} d="M200 36L300 74V146C300 196 256 232 200 254C144 232 100 196 100 146V74Z" {...line(T, 2.2)} fill="rgba(79,195,208,0.07)" />
    <path {...draw} d="M158 146L190 178L246 114" {...line(T, 5)} />
    <circle data-pulse="" cx="200" cy="146" r="64" fill="none" stroke={T} strokeWidth="1" opacity="0.35" />
    <g data-s="">
      <rect x="26" y="96" width="52" height="72" rx="6" fill={F} stroke={W} strokeWidth="1.3" />
      <rect x="36" y="110" width="32" height="5" rx="2.5" fill={W} opacity="0.6" />
      <rect x="36" y="124" width="24" height="5" rx="2.5" fill={W} opacity="0.4" />
      <rect x="36" y="138" width="30" height="5" rx="2.5" fill={W} opacity="0.4" />
    </g>
    <g data-sr="">
      <rect x="322" y="96" width="52" height="72" rx="6" fill={F} stroke={W} strokeWidth="1.3" />
      <path d="M334 128L342 136L358 114" {...line(T, 2.4)} />
    </g>
  </>
);

export const SERVICE_ART: Record<string, ReactNode> = {
  metaAds,
  seo,
  email,
  brand,
  fulfillment,
  dropshipping,
  support,
  payments,
  web,
  redesign,
  privateLabel,
  compliance,
};
