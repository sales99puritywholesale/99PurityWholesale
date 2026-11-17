'use client';

import React, { useState, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { MapPin, ShieldCheck, Truck, FlaskConical, Search, X, ArrowRight, ArrowUpRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import productsData from '@/data/products.json';
import FaqSection from '@/components/shared/FaqSection';
import { PageShell, PageHero, Section, CtaBand, PillButton, RevealGroup, SplitHeading, WRAP, h2, card } from '@/components/home/page-kit';
import { motion, AnimatePresence } from 'framer-motion';
import citiesData from '@/data/cities.json';
import CityDropdown from '@/components/locations/CityDropdown';

interface LocationHub {
  slug: string;
  city: string;
  state: string;
  region: string;
  intro: string;
  introEs?: string;
  bodyP1?: string;
  popularProducts: string[];
}

interface LocationsClientProps {
  locations: LocationHub[];
}

export default function LocationsClient({ locations }: LocationsClientProps) {
  const t = useTranslations('LocationsIndex');
  const homeT = useTranslations('Index');
  const locale = useLocale();
  const isEs = locale === 'es';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('All');

  const regions = ['All', 'United States'];

  const filteredLocations = useMemo(() => {
    return locations.filter((loc) => {
      const matchesRegion = selectedRegion === 'All' || loc.region.toLowerCase() === selectedRegion.toLowerCase();
      const matchesQuery = !searchQuery || 
        loc.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        loc.state.toLowerCase().includes(searchQuery.toLowerCase()) ||
        loc.region.toLowerCase().includes(searchQuery.toLowerCase()) ||
        loc.popularProducts.some(p => p.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesRegion && matchesQuery;
    });
  }, [locations, selectedRegion, searchQuery]);

  const faqItems = useMemo(() => {
    try {
      return homeT.raw('FAQ.items') as { q: string; a: string }[];
    } catch {
      return [];
    }
  }, [homeT]);

  return (
    <PageShell>
      <PageHero
        eyebrow={t('badge')}
        title={`${t('title')} ${t('subtitle')}`}
        intro={t('desc')}
        actions={
          <>
            <a href="#pricing-inquiry" className="group inline-flex items-center gap-3 rounded-full bg-[#0B0F14] py-2 pl-5 pr-2 text-[13px] font-medium text-white transition-colors hover:bg-[#1b232d]">
              <span>{t('requestPricing')}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4FC3D0] text-[#0B0F14] transition-transform duration-300 group-hover:-rotate-45"><ArrowRight className="h-3.5 w-3.5" /></span>
            </a>
            <PillButton href="/products" variant="outline">{t('exploreCatalog')}</PillButton>
          </>
        }
      />

      <div className={WRAP}>
        <ul className="flex flex-wrap items-center gap-x-8 gap-y-3 border-y border-[#E6EAF1] py-5 font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/60">
          <li className="flex items-center gap-2.5"><ShieldCheck className="h-4 w-4 text-[#0B6F7B]" /> {t('purityGuaranteed')}</li>
          <li className="flex items-center gap-2.5"><Truck className="h-4 w-4 text-[#0B6F7B]" /> {t('domesticDelivery')}</li>
          <li className="flex items-center gap-2.5"><FlaskConical className="h-4 w-4 text-[#0B6F7B]" /> {t('coaOnEveryOrder')}</li>
        </ul>
      </div>

      {/* Filter and grid */}
      <Section eyebrow={t('badge')} title={t('marketHubsTitle')} description={t('marketHubsDesc')}>
        {/* Search bar */}
        <div className="relative z-20 mb-6 max-w-xl">
          <div className="relative">
            <Search className="absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0B0F14]/40" />
            <input
              type="text"
              aria-label={isEs ? 'Buscar por ciudad, estado o compuesto' : 'Search by city, state, or compound'}
              placeholder={isEs ? "Buscar por ciudad, estado o compuesto..." : "Search by city, state, or compound..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-full border border-[#E6EAF1] bg-white py-3.5 pl-12 pr-12 text-[14px] text-[#0B0F14] outline-none transition-colors placeholder:text-[#0B0F14]/40 focus:border-[#4FC3D0]"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label={isEs ? 'Borrar búsqueda' : 'Clear search'}
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 transition-colors hover:bg-[#F3F5FA]"
              >
                <X className="h-3.5 w-3.5 text-[#0B0F14]/50" />
              </button>
            )}
          </div>
        </div>

        {/* Region tabs */}
        <div className="relative z-20 mb-10 flex flex-wrap gap-2">
          {regions.map((reg) => {
            const displayReg = isEs
              ? (reg === 'All' ? 'Todos' : (reg === 'United States' ? 'Estados Unidos' : reg))
              : reg;
            return (
              <button
                type="button"
                key={reg}
                onClick={() => setSelectedRegion(reg)}
                aria-pressed={selectedRegion === reg}
                className={`rounded-full px-5 py-2.5 font-dm-mono text-[10px] uppercase tracking-[0.16em] transition-colors ${
                  selectedRegion === reg
                    ? 'bg-[#0B0F14] text-white'
                    : 'border border-[#E6EAF1] bg-white text-[#0B0F14]/60 hover:text-[#0B0F14]'
                }`}
              >
                {displayReg}
              </button>
            );
          })}
        </div>

        {/* Dynamic grid */}
        <motion.div layout className="grid min-h-[300px] grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filteredLocations.map((loc) => {
              const isCountryCard = loc.city === loc.region; // Country hub has city and region the same
              const countrySlug = loc.region.toLowerCase().replace(/ /g, '-');
              const linkPath = isCountryCard ? countrySlug : `${countrySlug}/${loc.slug}`;

              return (
                <motion.div
                  layout
                  key={loc.slug}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full"
                >
                  <div
                    className={`group relative flex h-full flex-col justify-between overflow-hidden rounded-[1.25rem] border p-7 transition-colors duration-300 md:p-8 ${
                      isCountryCard
                        ? 'border-[#0B0D10] bg-[#0B0D10] text-white hover:border-[#4FC3D0]'
                        : 'border-[#E6EAF1] bg-white text-[#0B0F14] hover:border-[#4FC3D0]'
                    }`}
                  >
                    <div className="relative z-10 flex-grow">
                      <Link href={`/locations/${linkPath}`} className="block">
                        {/* Top metadata row */}
                        <div className="mb-8 flex items-center justify-between gap-3">
                          <div className={`flex items-center gap-1.5 font-dm-mono text-[10px] uppercase tracking-[0.16em] ${isCountryCard ? 'text-[#4FC3D0]' : 'text-[#0B6F7B]'}`}>
                            <MapPin className="h-3 w-3" />
                            {isEs && loc.region === 'United States' ? 'Estados Unidos' : loc.region}
                          </div>
                          <span className={`font-dm-mono text-[10px] uppercase tracking-[0.16em] ${isCountryCard ? 'text-white/45' : 'text-[#0B0F14]/40'}`}>
                            {isCountryCard ? t('nationalHub') : t('stateHub')}
                          </span>
                        </div>

                        <h3 className="mb-4 text-[2rem] font-light leading-none tracking-[-0.04em]">
                          {isEs && isCountryCard ? 'Estados Unidos' : loc.city}
                        </h3>

                        <p className={`mb-8 line-clamp-3 text-[13.5px] leading-relaxed ${isCountryCard ? 'text-white/60' : 'text-[#0B0F14]/60'}`}>
                          {isEs && loc.introEs ? loc.introEs : (loc.bodyP1 || loc.intro)}
                        </p>
                      </Link>

                      {/* Top compounds */}
                      <div className="mb-8">
                        <div className={`mb-3.5 flex items-center gap-2 font-dm-mono text-[10px] uppercase tracking-[0.16em] ${isCountryCard ? 'text-white/45' : 'text-[#0B0F14]/45'}`}>
                          <span className="h-[6px] w-[6px] bg-[#4FC3D0]" />
                          {t('topLocalCompounds')}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {loc.popularProducts.slice(0, 3).map((p) => {
                            const matchedProduct = productsData.find(
                              (prod: { name: string }) => prod.name.toLowerCase() === p.toLowerCase()
                            );
                            const href = matchedProduct
                              ? `/products/${matchedProduct.slug}`
                              : '/products';

                            return (
                              <Link
                                key={p}
                                href={href}
                                onClick={(e) => e.stopPropagation()}
                                className={`relative z-20 rounded-full px-3 py-1.5 text-[12px] transition-colors duration-300 ${
                                  isCountryCard
                                    ? 'border border-white/15 text-white/75 hover:bg-white hover:text-[#0B0F14]'
                                    : 'border border-[#E6EAF1] bg-[#F3F5FA] text-[#0B0F14]/70 hover:bg-[#0B0F14] hover:text-white'
                                }`}
                              >
                                {p}
                              </Link>
                            );
                          })}
                          {loc.popularProducts.length > 3 && (
                            <span className={`self-center px-2 font-dm-mono text-[10px] ${isCountryCard ? 'text-[#4FC3D0]' : 'text-[#0B6F7B]'}`}>
                              +{loc.popularProducts.length - 3} {isEs ? "más" : "more"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Card footer */}
                    <div className={`relative z-10 mt-auto flex items-center justify-between border-t pt-6 ${isCountryCard ? 'border-white/10' : 'border-[#E6EAF1]'}`}>
                      <CityDropdown
                        cities={citiesData.filter(c => c.stateSlug === loc.slug)}
                        stateLink={linkPath}
                        isCountryCard={isCountryCard}
                        viewRegionalHubText={t('discoverState', { state: isEs && isCountryCard ? 'Estados Unidos' : loc.city })}
                      />
                      <span
                        aria-hidden="true"
                        className={`flex h-9 w-9 items-center justify-center rounded-full transition-all duration-300 group-hover:bg-[#4FC3D0] group-hover:text-[#0B0F14] ${
                          isCountryCard ? 'bg-white/10 text-white' : 'bg-[#0B0F14] text-white'
                        }`}
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>

        {/* No results */}
        {filteredLocations.length === 0 && (
          <div className={`${card} py-16 text-center`}>
            <MapPin className="mx-auto mb-4 h-10 w-10 text-[#0B0F14]/20" />
            <h3 className="mb-2 text-[1.2rem] font-medium tracking-[-0.02em]">
              {isEs ? "No se encontraron centros regionales" : "No Regional Hubs Found"}
            </h3>
            <p className="mx-auto max-w-md px-6 text-[14px] text-[#0B0F14]/60">
              {isEs
                ? "No pudimos encontrar ningún centro regional que coincida con su búsqueda. Realizamos envíos de péptidos a todos los 50 estados."
                : "We couldn't find any regional hubs matching your search query. We ship peptide compounds to all 50 states."}
            </p>
          </div>
        )}
      </Section>

      {/* Not seeing your state */}
      <section id="pricing-inquiry" className="scroll-mt-28 px-3 py-6 md:px-4">
        <div className="mx-auto max-w-[1760px] rounded-[1.75rem] bg-[#0B0D10] px-6 py-16 text-center text-white md:py-24">
          <h2 className={`${h2} mx-auto mb-6 max-w-4xl !text-white`}>{t('notSeeStateTitle')}</h2>
          <p className="mx-auto mb-9 max-w-2xl text-[14px] leading-relaxed text-white/55">{t('notSeeStateDesc')}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <PillButton
              href={`https://wa.me/18433307365?text=${encodeURIComponent(t('requestPricingForState'))}`}
              external
              variant="teal"
            >
              {t('requestPricingForState')}
            </PillButton>
            <Link
              href="/wholesale-application"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-[0.9rem] text-[13px] font-medium transition-colors hover:bg-white hover:text-[#0B0F14]"
            >
              {t('applyForAccount')} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* SEO content */}
      <Section>
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <SplitHeading text={t('whyProfessionalsTitle')} className={`${h2} mb-8`} />
            <div className="space-y-5 text-[15px] leading-relaxed text-[#0B0F14]/65">
              <p>{t('whyProfessionalsDesc1')}</p>
              <p>{t('whyProfessionalsDesc2')}</p>
              <p>{t('whyProfessionalsDesc3')}</p>
            </div>
          </div>

          <div>
            <h3 className="mb-6 text-[1.4rem] font-light tracking-[-0.03em]">{t('whatOrderIncludesTitle')}</h3>
            <RevealGroup className="space-y-3">
              {(t.raw('orderIncludes') as { title: string; desc: string }[]).map((item, i) => (
                <div key={i} data-reveal className={`${card} flex items-start gap-4 p-5`}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F3F5FA] text-[#0B6F7B]">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <div>
                    <h4 className="text-[15px] font-medium tracking-[-0.01em]">{item.title}</h4>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-[#0B0F14]/60">{item.desc}</p>
                  </div>
                </div>
              ))}
            </RevealGroup>
          </div>
        </div>
      </Section>

      {/* FAQ */}
      {faqItems && faqItems.length > 0 && (
        <FaqSection
          title={homeT('FAQ.title')}
          subtitle={homeT('FAQ.subtitle')}
          items={faqItems}
          eyebrow="(FAQ)"
          theme="light"
        />
      )}

      <CtaBand
        eyebrow={homeT('FinalCta.badge')}
        title={homeT('FinalCta.title')}
        description={homeT('FinalCta.subtitle')}
        primary={{ label: homeT('FinalCta.whatsapp'), href: `https://wa.me/18433307365?text=${encodeURIComponent(homeT('FinalCta.msg'))}`, external: true }}
        secondary={{ label: homeT('FinalCta.email'), href: 'mailto:sales@99puritywholesale.com' }}
      />
    </PageShell>
  );
}
