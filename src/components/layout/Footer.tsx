'use client';

import NextLink from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { ArrowRight, ArrowUp, Globe } from 'lucide-react';
import { footerStates } from '@/data/footerStates';

export default function Footer() {
  const t = useTranslations('Layout');
  const locale = useLocale();
  const pathname = usePathname();
  const currentYear = new Date().getFullYear();

  const footerLinks = [
    {
      title: t('footer.labTitle'),
      links: [
        { label: t('nav.products'), href: '/products' },
        { label: t('footer.categories'), href: '/products#categories' },
        { label: t('nav.coa'), href: '/certificates-of-analysis' },
        { label: t('nav.blog'), href: '/blog' },
      ],
    },
    {
      title: t('footer.supportTitle'),
      links: [
        { label: t('nav.services'), href: '/services' },
        { label: t('nav.about'), href: '/about' },
        { label: t('nav.contact'), href: '/contact' },
        { label: t('nav.calculator'), href: '/peptide-calculator' },
        { label: t('footer.glossary'), href: '/glossary' },
      ],
    },
    {
      title: t('footer.servicesTitle'),
      links: [
        { label: t('footer.dropshipping'), href: '/services#dropshipping' },
        { label: t('footer.launchSupport'), href: '/services#launch-support' },
        { label: t('footer.webDev'), href: '/services#website-development' },
        { label: t('footer.salesDist'), href: '/services#sales-distribution' },
        { label: t('footer.privateLabel'), href: '/services#private-label' },
        { label: t('footer.fulfillmentConsulting'), href: '/services#fulfillment-consulting' },
      ],
    },
    {
      title: t('footer.instTitle'),
      links: [
        { label: t('footer.wholesaleApp'), href: '/wholesale-application' },
        { label: t('footer.locations'), href: '/locations' },
        ...footerStates.map(([slug, name]) => ({
          label: name,
          href: `/locations/united-states/${slug}`,
        })),
      ],
    },
    {
      title: t('footer.legalTitle'),
      links: [
        { label: t('footer.privacy'), href: '/privacy' },
        { label: t('footer.terms'), href: '/terms' },
        { label: t('footer.refundPolicy'), href: '/refund-policy' },
        { label: t('footer.complianceTitle'), href: '/compliance' },
      ],
    },
  ];

  const pill = 'inline-flex items-center rounded-full px-5 py-[0.9rem] font-dm-sans text-[13px] font-medium transition-colors';

  return (
    <footer className="relative z-20 overflow-hidden bg-[#F3F5FA] px-3 pb-3 pt-3 font-dm-sans print:hidden md:px-4 md:pb-4">
      <div className="relative mx-auto max-w-[1760px] overflow-hidden rounded-[1.75rem] bg-[#0B0D10] text-white">
        <div className="mx-auto w-full max-w-[1440px] px-6 pt-14 md:px-10 md:pt-20">
          {/* top: wordmark + description, actions */}
          <div className="mb-14 flex flex-col justify-between gap-10 md:mb-20 lg:flex-row lg:items-start">
            <div className="max-w-xl">
              <Link href="/" className="mb-6 inline-block text-2xl font-medium tracking-[-0.045em] md:text-3xl">
                99Purity <span className="font-light text-white/50">Wholesale</span>
              </Link>
              <p className="text-[14px] leading-relaxed text-white/60">{t('footer.desc')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/wholesale-application" className={`group gap-3 bg-[#4FC3D0] py-2 pl-5 pr-2 text-[#0B0F14] hover:bg-[#7ad8e2] ${pill} !px-0 !py-2 !pl-5 !pr-2`}>
                {t('footer.startNow')}
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0B0F14] text-white transition-transform duration-300 group-hover:-rotate-45">
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className={`gap-2 border border-white/25 hover:bg-white hover:text-[#0B0F14] ${pill}`}
              >
                {t('footer.backToTop')}
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* link columns */}
          <div className="mb-14 grid grid-cols-2 gap-x-6 gap-y-12 border-t border-white/10 pt-12 md:grid-cols-3 lg:grid-cols-5">
            {footerLinks.map((column) => (
              <div key={column.title}>
                <h4 className="mb-6 flex items-center gap-2.5 font-dm-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
                  <span className="h-[6px] w-[6px] bg-[#4FC3D0]" />
                  {column.title}
                </h4>
                <ul className="space-y-3">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link href={link.href} className="text-[13px] text-white/70 transition-colors hover:text-[#4FC3D0]">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* disclaimer */}
          <div className="border-t border-white/10 py-8">
            <p className="mb-2 font-dm-mono text-[10px] uppercase tracking-[0.2em] text-white/55">{t('footer.disclaimer')}</p>
            <p className="max-w-5xl text-[11px] leading-relaxed text-white/40">{t('footer.disclaimerContent')}</p>
          </div>

          {/* copyright + language */}
          <div className="flex flex-col items-center justify-between gap-6 border-t border-white/10 py-8 md:flex-row">
            <span className="text-center font-dm-mono text-[10px] uppercase tracking-[0.18em] text-white/40 md:text-left">{t('footer.copyright', { year: currentYear })}</span>

            <div className="flex items-center gap-1 rounded-full border border-white/15 p-1">
              <Globe className="mx-2 h-4 w-4 text-white/50" />
              {/* Plain next/link so the href is the bare path. next-intl's Link would
                  either force an /en prefix (with a `locale` prop) or inherit the current
                  locale's prefix (without one) — both wrong for the default locale. The
                  cookie write replaces the sync next-intl does off the `locale` prop, and
                  is what stops middleware bouncing an /es visitor back to /es. */}
              <NextLink
                href={pathname}
                hrefLang="en"
                onClick={() => {
                  document.cookie = 'NEXT_LOCALE=en;sameSite=lax;path=/;';
                }}
                className={`rounded-full px-4 py-2 text-[11px] font-medium tracking-widest transition-colors ${locale === 'en' ? 'bg-white text-[#0B0F14]' : 'text-white/50 hover:text-white'}`}
              >
                EN
              </NextLink>
              <Link
                locale="es"
                href={pathname}
                className={`rounded-full px-4 py-2 text-[11px] font-medium tracking-widest transition-colors ${locale === 'es' ? 'bg-white text-[#0B0F14]' : 'text-white/50 hover:text-white'}`}
              >
                ES
              </Link>
            </div>
          </div>
        </div>

        {/* oversized wordmark, cropped at the bottom edge like the reference */}
        <div aria-hidden className="pointer-events-none mx-auto mt-4 h-[16vw] overflow-hidden select-none md:h-[14.2vw] lg:h-[14.2vw]">
          <div className="whitespace-nowrap text-center font-light leading-[0.82] tracking-[-0.06em] text-white/90 text-[22vw] md:text-[19vw]">99Purity</div>
        </div>
      </div>

      {/* credit */}
      <div className="mx-auto mt-5 flex max-w-[1760px] flex-col items-center justify-between gap-2 px-4 font-dm-mono text-[10px] uppercase tracking-[0.18em] text-[#0B0F14]/50 md:flex-row md:px-8">
        <div className="flex flex-col items-center gap-1 md:flex-row md:gap-6">
          <span>{t('footer.creditLab')}</span>
          <span className="hidden opacity-30 md:inline">|</span>
          <span className="text-[#0B0F14]/35">{t('footer.creditUSA')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="opacity-60">{t('footer.creditBy')}</span>
          <a href="https://belkdigital.com/en/" target="_blank" rel="noopener noreferrer" className="border-b border-black/15 pb-0.5 text-[#0B0F14]/80 transition-colors hover:border-[#4FC3D0] hover:text-[#0B6F7B]">
            Belk Digital
          </a>
        </div>
      </div>
    </footer>
  );
}
