import Image from 'next/image';
import { Link } from '@/i18n/routing';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';

/** Small mono label with a teal square, used above every section heading. */
export function Eyebrow({ children, light = false, className = '' }: { children: ReactNode; light?: boolean; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 font-dm-mono text-[10px] uppercase tracking-[0.2em] ${light ? 'text-white/55' : 'text-[#0B0F14]/50'} ${className}`}>
      <span className="h-[6px] w-[6px] bg-[#4FC3D0]" />
      {children}
    </div>
  );
}

/** Pill button with a circular arrow, matching the reference (dark / teal / light). */
export function PillButton({
  href,
  children,
  variant = 'dark',
  external = false,
  className = '',
}: {
  href: string;
  children: ReactNode;
  variant?: 'dark' | 'teal' | 'light' | 'outline';
  external?: boolean;
  className?: string;
}) {
  const styles = {
    dark: 'bg-[#0B0F14] text-white hover:bg-[#1b232d]',
    teal: 'bg-[#4FC3D0] text-[#0B0F14] hover:bg-[#6fd2dd]',
    light: 'bg-white text-[#0B0F14] hover:bg-white/90',
    outline: 'border border-[#0B0F14]/15 text-[#0B0F14] hover:bg-[#0B0F14] hover:text-white',
  }[variant];
  const dot = variant === 'dark' ? 'bg-[#4FC3D0] text-[#0B0F14]' : variant === 'outline' ? 'bg-[#4FC3D0] text-[#0B0F14]' : 'bg-[#0B0F14] text-white';
  const cls = `group inline-flex items-center gap-3 rounded-full py-2 pl-5 pr-2 font-dm-sans text-[13px] font-medium tracking-[-0.01em] transition-colors duration-300 ${styles} ${className}`;
  const inner = (
    <>
      <span>{children}</span>
      <span className={`flex h-8 w-8 items-center justify-center rounded-full transition-transform duration-300 group-hover:-rotate-45 ${dot}`}>
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </>
  );
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}

/** Round arrow used on rows and cards. */
export function ArrowDot({ className = '' }: { className?: string }) {
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0B0F14] text-white transition-all duration-300 group-hover:bg-[#4FC3D0] group-hover:text-[#0B0F14] ${className}`}>
      <ArrowUpRight className="h-4 w-4" />
    </span>
  );
}

/**
 * Photo slot. Renders the image when `src` is set, otherwise a neutral placeholder
 * so the layout stays intact until real photography is added (see home-images.ts).
 */
export function Photo({ src, alt, sizes = '100vw', priority = false, className = '', fit = 'cover', position }: { src: string | null | undefined; alt: string; sizes?: string; priority?: boolean; className?: string; fit?: 'cover' | 'contain'; position?: string }) {
  if (!src) {
    return (
      <div role="img" aria-label={alt} className={`absolute inset-0 flex items-end bg-[linear-gradient(135deg,#dfe6ee,#c9d4df)] p-4 ${className}`}>
        <span className="font-dm-mono text-[9px] uppercase tracking-[0.2em] text-[#0B0F14]/40">Image placeholder</span>
      </div>
    );
  }
  return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className={`${fit === 'cover' ? 'object-cover' : 'object-contain'} ${className}`} style={position ? { objectPosition: position } : undefined} />;
}

export const h2 = 'font-dm-sans font-light tracking-[-0.04em] leading-[1.02] text-[#0B0F14] text-[clamp(2rem,4.3vw,3.9rem)]';
export const card = 'rounded-[1.25rem] border border-[#E6EAF1] bg-white';
