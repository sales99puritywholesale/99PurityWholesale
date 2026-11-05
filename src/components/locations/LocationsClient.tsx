'use client';

import React, { useState, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { MapPin, ShieldCheck, Truck, FlaskConical, Search, X, ArrowRight, MessageCircle, ArrowUpRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import productsData from '@/data/products.json';
import { FadeIn } from '@/components/shared/Motion';
import FaqSection from '@/components/shared/FaqSection';
import GlobalCTA from '@/components/layout/GlobalCTA';
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
    <main className="min-h-screen bg-[#F8F8F6] text-black -mt-24 md:-mt-32">
      {/* Grain overlay */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[url('/images/noise.svg')]" />

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-52 pb-24 md:pt-64 md:pb-32 border-b border-black/5 bg-[#F8F8F6]">
        <div className="container mx-auto px-6 max-w-5xl relative z-10 text-center">
          <FadeIn>
            <div className="inline-block bg-black/5 border border-black/5 px-5 py-2 rounded-full text-[10px] font-bold font-dm-sans uppercase tracking-widest text-black/60 mb-6">
              {t('badge')}
            </div>
            <h1 className="text-5xl md:text-7xl font-bold font-absans text-black uppercase tracking-tight leading-none mb-6">
              {t('title')}<br />
              <span className="text-[#13a7b7]">{t('subtitle')}</span>
            </h1>
            <p className="text-base md:text-lg font-archia font-semibold text-black/65 mb-8 max-w-3xl mx-auto leading-relaxed">
              {t('desc')}
            </p>

            {/* Hero CTAs */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3.5 sm:gap-4 mb-10 max-w-md sm:max-w-none mx-auto">
              <a
                href="#pricing-inquiry"
                className="inline-flex items-center justify-center gap-3 bg-[#0D0E10] hover:bg-[#13a7b7] text-white px-8 py-4 rounded-2xl font-absans text-xs uppercase tracking-widest font-bold shadow-[0_10px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_10px_30px_rgba(19,167,183,0.3)] transition-all duration-300 group"
              >
                <span>{t('requestPricing')}</span>
                <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
              </a>

              <Link
                href="/products"
                className="inline-flex items-center justify-center gap-3 bg-white hover:bg-black/5 text-black/80 hover:text-black border border-black/10 px-8 py-4 rounded-2xl font-absans text-xs uppercase tracking-widest font-bold shadow-sm hover:border-[#13a7b7]/30 transition-all duration-300 group"
              >
                <FlaskConical className="w-4 h-4 text-[#13a7b7] transition-transform duration-300 group-hover:scale-110" />
                <span>{t('exploreCatalog')}</span>
              </Link>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 text-black/40 font-dm-mono text-[10px] uppercase tracking-widest">
              <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#13a7b7]" /> {t('purityGuaranteed')}</span>
              <span className="flex items-center gap-2"><Truck className="w-4 h-4 text-[#13a7b7]" /> {t('domesticDelivery')}</span>
              <span className="flex items-center gap-2"><FlaskConical className="w-4 h-4 text-[#13a7b7]" /> {t('coaOnEveryOrder')}</span>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Filter and Grid Section */}
      <section className="py-24 bg-white border-b border-black/5">
        <div className="container mx-auto px-6 max-w-7xl">
          
          {/* Header */}
          <div className="text-center mb-12">
            <FadeIn>
              <h2 className="text-3xl md:text-4xl font-absans font-bold text-black uppercase tracking-tight mb-4">
                {t('marketHubsTitle')}
              </h2>
              <p className="text-black/50 font-archia font-semibold text-sm max-w-2xl mx-auto">
                {t('marketHubsDesc')}
              </p>
            </FadeIn>
          </div>

          {/* Search bar */}
          <FadeIn delay={0.1} className="relative max-w-xl mx-auto mb-10 z-20">
            <div className="relative">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-black/35" />
              <input 
                type="text" 
                placeholder={isEs ? "Buscar por ciudad, estado o compuesto..." : "Search by city, state, or compound..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-14 pr-12 py-4 bg-[#F8F8F6] border border-black/5 rounded-full font-archia text-sm text-black placeholder:text-black/35 focus:border-[#13a7b7]/30 focus:ring-1 focus:ring-[#13a7b7]/30 outline-none transition-all shadow-sm font-semibold"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')} 
                  className="absolute right-6 top-1/2 -translate-y-1/2 p-1 hover:bg-black/5 rounded-full transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-black/40" />
                </button>
              )}
            </div>
          </FadeIn>

          {/* Region Tabs */}
          <FadeIn delay={0.15} className="flex flex-wrap justify-center gap-2 mb-16 z-20 relative">
            {regions.map((reg) => {
              const displayReg = isEs 
                ? (reg === 'All' ? 'Todos' : (reg === 'United States' ? 'Estados Unidos' : reg))
                : reg;
              return (
                <button
                  key={reg}
                  onClick={() => setSelectedRegion(reg)}
                  className={`px-5 py-2.5 rounded-full font-dm-mono text-[10px] uppercase tracking-widest transition-all ${
                    selectedRegion === reg
                      ? 'bg-black text-white shadow-md'
                      : 'bg-[#F8F8F6] border border-black/5 text-black/60 hover:bg-black/5 hover:text-black'
                  }`}
                >
                  {displayReg}
                </button>
              );
            })}
          </FadeIn>

          {/* Dynamic Grid */}
          <motion.div 
            layout 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 min-h-[300px]"
          >
            <AnimatePresence mode="popLayout">
              {filteredLocations.map((loc) => {
                const isCountryCard = loc.city === loc.region; // Country hub has city and region the same
                const countrySlug = loc.region.toLowerCase().replace(/ /g, '-');
                const linkPath = isCountryCard ? countrySlug : `${countrySlug}/${loc.slug}`;
                
                return (
                <motion.div
                  layout
                  key={loc.slug}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full"
                >
                  <div className="group block h-full">
                    <div className={`relative overflow-hidden border rounded-[2.5rem] p-8 md:p-10 transition-all duration-500 hover:-translate-y-1.5 flex flex-col justify-between h-full group ${
                      isCountryCard
                        ? 'bg-[#05080C] border-white/10 text-white hover:border-[#13a7b7]/40 hover:shadow-[0_40px_100px_rgba(19,167,183,0.15)]'
                        : 'bg-[#F8F8F6] border-black/[0.05] text-black hover:bg-white hover:border-[#13a7b7]/25 hover:shadow-[0_40px_100px_rgba(0,0,0,0.06)]'
                    }`}>

                      {/* Subtle Map Pin Background decoration */}
                      <div className="absolute -top-10 -right-10 opacity-[0.01] group-hover:opacity-[0.03] group-hover:scale-110 transition-all duration-700 pointer-events-none">
                        <MapPin className={`w-48 h-48 ${isCountryCard ? 'text-white' : 'text-black'}`} strokeWidth={1} />
                      </div>

                      <div className="relative z-10 flex-grow">
                        <Link href={`/locations/${linkPath}`} className="block">
                        {/* Top Metadata Row */}
                        <div className="flex items-center justify-between mb-8">
                          <div className={`flex items-center gap-1.5 px-3 py-1 border rounded-full ${
                            isCountryCard 
                              ? 'bg-[#13a7b7]/20 border-[#13a7b7]/30 text-[#1ed4e8]' 
                              : 'bg-[#13a7b7]/10 border-[#13a7b7]/15 text-[#0b7f8c]'
                          }`}>
                            <MapPin className="w-3 h-3" />
                            <span className="font-dm-mono text-[9px] font-bold uppercase tracking-widest">
                              {isEs && loc.region === 'United States' ? 'Estados Unidos' : loc.region}
                            </span>
                          </div>
                          <span className={`${isCountryCard ? 'text-white/40' : 'text-black/35'} font-dm-mono text-[9px] font-bold uppercase tracking-widest`}>{isCountryCard ? t('nationalHub') : t('stateHub')}</span>
                        </div>

                        {/* Title and Animated Accent Line */}
                        <div className="mb-4">
                          <h3 className={`text-3xl font-absans font-bold uppercase tracking-tighter leading-none transition-colors duration-300 ${
                            isCountryCard ? 'text-white group-hover:text-[#13a7b7]' : 'text-black group-hover:text-[#13a7b7]'
                          }`}>
                            {isEs && isCountryCard ? 'Estados Unidos' : loc.city}
                          </h3>
                          <div className="w-8 h-[2px] bg-[#13a7b7] mt-3 group-hover:w-16 transition-all duration-500" />
                        </div>

                        {/* Intro description */}
                        <p className={`font-archia font-medium mb-8 text-xs leading-relaxed line-clamp-3 transition-colors duration-300 ${
                          isCountryCard ? 'text-white/60 group-hover:text-white/80' : 'text-black/55 group-hover:text-black/75'
                        }`}>
                          {isEs && loc.introEs ? loc.introEs : (loc.bodyP1 || loc.intro)}
                        </p>
                        </Link>

                        {/* Top Compounds Section */}
                        <div className="mb-8">
                          <div className={`font-dm-mono text-[9px] font-bold uppercase tracking-widest mb-3.5 flex items-center gap-2 ${
                            isCountryCard ? 'text-white/40' : 'text-black/35'
                          }`}>
                            <span className="w-1 h-1 rounded-full bg-[#13a7b7]" />
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
                                  className={`px-3 py-1.5 rounded-full text-[10px] font-dm-mono font-bold tracking-tight transition-all duration-300 relative z-20 ${
                                    isCountryCard
                                      ? 'bg-white/5 border border-white/10 text-white/70 hover:bg-white hover:text-black hover:border-white'
                                      : 'bg-white border border-black/5 text-black/70 hover:bg-black hover:text-white hover:border-black'
                                  }`}
                                >
                                  {p}
                                </Link>
                              );
                            })}
                            {loc.popularProducts.length > 3 && (
                              <span className={`px-2.5 py-1 rounded-full text-[9px] font-dm-mono font-bold self-center ${
                                isCountryCard ? 'text-[#1ed4e8] bg-[#13a7b7]/20' : 'text-[#13a7b7] bg-[#13a7b7]/10'
                              }`}>
                                +{loc.popularProducts.length - 3} {isEs ? "más" : "more"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Card Footer */}
                      <div className={`mt-auto pt-6 border-t flex items-center justify-between relative z-10 ${
                        isCountryCard ? 'border-white/10' : 'border-black/5'
                      }`}>
                        <CityDropdown 
                          cities={citiesData.filter(c => c.stateSlug === loc.slug)}
                          stateLink={linkPath}
                          isCountryCard={isCountryCard}
                          viewRegionalHubText={t('discoverState', { state: isEs && isCountryCard ? 'Estados Unidos' : loc.city })}
                        />
                        <div className={`w-9 h-9 rounded-full transition-all duration-300 flex items-center justify-center ${
                          isCountryCard 
                            ? 'bg-white/10 text-white group-hover:bg-white group-hover:text-black' 
                            : 'bg-black/5 text-black group-hover:bg-black group-hover:text-white'
                        }`}>
                          <ArrowUpRight className="w-4 h-4" />
                        </div>
                      </div>

                    </div>
                  </div>
                </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>

          {/* No results placeholder */}
          {filteredLocations.length === 0 && (
            <FadeIn className="text-center py-20 bg-[#F8F8F6] rounded-[2rem] border border-black/5">
              <MapPin className="w-12 h-12 text-black/20 mx-auto mb-4" />
              <h3 className="text-lg font-absans font-bold text-black uppercase tracking-tight mb-2">
                {isEs ? "No se encontraron centros regionales" : "No Regional Hubs Found"}
              </h3>
              <p className="text-black/50 font-archia text-sm max-w-md mx-auto px-6">
                {isEs 
                  ? "No pudimos encontrar ningún centro regional que coincida con su búsqueda. Realizamos envíos de péptidos a todos los 50 estados."
                  : "We couldn't find any regional hubs matching your search query. We ship peptide compounds to all 50 states."}
              </p>
            </FadeIn>
          )}

        </div>
      </section>

      {/* All 50 States Banner */}
      <section id="pricing-inquiry" className="scroll-mt-36 py-24 bg-[#05080C] text-white border-b border-white/5 relative overflow-hidden">
        {/* Dark Grain Texture */}
        <div className="absolute inset-0 opacity-[0.015] pointer-events-none bg-[url('/images/noise.svg')]" />
        
        <div className="container mx-auto px-6 max-w-5xl relative z-10 text-center">
          <FadeIn>
            <h2 className="text-3xl md:text-5xl font-absans font-bold text-white uppercase tracking-tight mb-6">
              {t('notSeeStateTitle')}
            </h2>
            <p className="text-white/60 font-archia font-medium text-sm md:text-base leading-relaxed max-w-3xl mx-auto mb-12">
              {t('notSeeStateDesc')}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href={`https://wa.me/18433307365?text=${encodeURIComponent(t('requestPricingForState'))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-[#25D366] hover:bg-[#20ba5a] text-white font-bold py-4 px-8 rounded-full transition-all font-absans text-xs uppercase tracking-widest shadow-[0_10px_30px_rgba(37,211,102,0.15)]"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{t('requestPricingForState')}</span>
              </a>
              <Link
                href="/wholesale-application"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-white/5 hover:bg-white/10 text-white font-bold py-4 px-8 rounded-full transition-all border border-white/10 font-absans text-xs uppercase tracking-widest"
              >
                {t('applyForAccount')} <ArrowRight className="w-4 h-4 text-white/55" />
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* SEO Content Block */}
      <section className="py-24 bg-[#F8F8F6] border-b border-black/5">
        <div className="container mx-auto px-6 max-w-5xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            
            <FadeIn className="space-y-6">
              <h2 className="text-3xl md:text-4xl font-absans font-bold text-black uppercase tracking-tight">
                {t('whyProfessionalsTitle')}
              </h2>
              <div className="space-y-5 text-black/60 font-archia font-medium text-sm md:text-base leading-relaxed">
                <p>{t('whyProfessionalsDesc1')}</p>
                <p>{t('whyProfessionalsDesc2')}</p>
                <p>{t('whyProfessionalsDesc3')}</p>
              </div>
            </FadeIn>

            <FadeIn delay={0.2} className="space-y-6">
              <h3 className="text-xl font-absans font-bold text-black uppercase tracking-tight">
                {t('whatOrderIncludesTitle')}
              </h3>
              <div className="space-y-4">
                {(t.raw('orderIncludes') as {title: string, desc: string}[]).map((item, i) => (
                  <div 
                    key={i} 
                    className="flex items-start gap-4 p-5 bg-white rounded-2xl border border-black/5 hover:border-[#13a7b7]/20 transition-all shadow-sm"
                  >
                    <ShieldCheck className="w-5 h-5 text-[#13a7b7] flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-black font-absans font-bold text-xs uppercase tracking-wider">
                        {item.title}
                      </h4>
                      <p className="text-black/50 font-archia font-medium text-xs leading-relaxed mt-1.5">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>

          </div>
        </div>
      </section>

      {/* FAQ Component */}
      {faqItems && faqItems.length > 0 && (
        <FaqSection 
          title={homeT('FAQ.title')}
          subtitle={homeT('FAQ.subtitle')}
          items={faqItems}
          eyebrow="(FAQ)"
          theme="light"
        />
      )}

      {/* Global CTA */}
      <GlobalCTA 
        badge={homeT('FinalCta.badge')}
        title={homeT('FinalCta.title')}
        subtitle={homeT('FinalCta.subtitle')}
        primaryCtaText={homeT('FinalCta.whatsapp')}
        primaryCtaHref={`https://wa.me/18433307365?text=${encodeURIComponent(homeT('FinalCta.msg'))}`}
        secondaryCtaText={homeT('FinalCta.email')}
        secondaryCtaHref="mailto:sales@99puritywholesale.com"
      />

    </main>
  );
}
