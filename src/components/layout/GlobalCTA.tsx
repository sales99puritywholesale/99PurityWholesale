'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ArrowUpRight, Mail } from 'lucide-react';
import { FadeIn, StaggerContainer, StaggerItem, ScaleIn } from '@/components/shared/Motion';

export interface GlobalCTAProps {
  badge?: string;
  title?: string;
  subtitle?: string;
  primaryCtaText?: string;
  primaryCtaHref?: string;
  secondaryCtaText?: string;
  secondaryCtaHref?: string;
  hideSocialBar?: boolean;
}

export default function GlobalCTA({
  badge,
  title,
  subtitle,
  primaryCtaText,
  primaryCtaHref = '/contact',
  secondaryCtaText,
  secondaryCtaHref,
  hideSocialBar = false
}: GlobalCTAProps) {
  const t = useTranslations('Layout');

  return (
    <section className="relative z-10 px-4 md:px-6 py-20 bg-white overflow-hidden">
      <div className="reveal-card-3d max-w-[1400px] mx-auto relative overflow-hidden bg-[#0F0F0F] rounded-[2.5rem] md:rounded-[4rem] px-6 py-24 md:py-32 flex flex-col items-center text-center">
        {/* Subtle Grainy Texture Overlay */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('/images/noise.svg')]" />
        
        {/* Badge */}
        {badge && (
          <FadeIn delay={0.2} direction="down" className="relative z-10 mb-8">
            <div className="px-4 py-1.5 bg-[#13a7b7] text-black text-[10px] md:text-[11px] font-bold rounded-full uppercase tracking-widest flex items-center gap-2">
              <span>{badge}</span>
            </div>
          </FadeIn>
        )}

        {/* Headline */}
        <FadeIn delay={0.3}>
          <h2 className="relative z-10 text-4xl md:text-6xl lg:text-7xl font-bold text-white max-w-4xl leading-[1.1] mb-8 tracking-tight">
            {title}
          </h2>
        </FadeIn>

        {/* Subtitle */}
        {subtitle && (
          <FadeIn delay={0.4}>
            <p className="relative z-10 text-lg md:text-xl text-white/50 max-w-2xl mb-12 font-medium">
              {subtitle}
            </p>
          </FadeIn>
        )}

        {/* CTA Buttons */}
        <StaggerContainer delay={0.5} className="relative z-10 flex flex-col sm:flex-row items-center gap-4">
          <StaggerItem>
            <Link 
              href={primaryCtaHref}
              className="flex items-center gap-3 px-10 py-5 bg-white text-black rounded-full font-bold text-sm md:text-base uppercase tracking-widest hover:bg-gray-100 transition-all shadow-2xl active:scale-95 group"
            >
              {primaryCtaText || t('letsTalk')}
              <ArrowUpRight className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </Link>
          </StaggerItem>

          {secondaryCtaText && secondaryCtaHref && (
            <StaggerItem>
              <Link 
                href={secondaryCtaHref}
                className="flex items-center gap-3 px-10 py-5 bg-white/5 border border-white/10 text-white rounded-full font-bold text-sm md:text-base uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95 group"
              >
                {secondaryCtaText}
                <ArrowUpRight className="w-5 h-5" />
              </Link>
            </StaggerItem>
          )}
        </StaggerContainer>

        {/* Bottom Social Bar */}
        {!hideSocialBar && (
          <FadeIn delay={0.8} direction="up" className="absolute bottom-6 md:bottom-8 left-6 md:left-8 right-6 md:right-8 bg-white rounded-3xl md:rounded-[2.5rem] p-4 md:p-6 flex flex-wrap justify-around items-center gap-4 md:gap-8 shadow-sm transition-transform hover:scale-[1.01]">
            {[
              { label: t('social.linkedin'), href: 'https://linkedin.com' },
              { label: t('social.threads'), href: 'https://threads.net' },
              { label: t('social.tiktok'), href: 'https://tiktok.com' },
              { label: t('social.email'), href: 'mailto:sales@99puritywholesale.com' }
            ].map((social) => (
              <a 
                key={social.label}
                href={social.href}
                className="flex items-center gap-2 text-[11px] md:text-[13px] font-bold text-black/40 hover:text-black transition-colors uppercase tracking-widest"
                target="_blank"
                rel="noopener noreferrer"
              >
                {social.label}
              </a>
            ))}
          </FadeIn>
        )}
        
        {/* Spacing for the bottom bar if visible */}
        {!hideSocialBar && <div className="h-24 md:h-32" />}
      </div>
    </section>
  );
}
