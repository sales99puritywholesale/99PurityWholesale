import { notFound, permanentRedirect } from 'next/navigation';
import { MapPin, Mail, Zap, ShieldAlert, CheckCircle2, Package, ArrowRight, FlaskConical, ShieldCheck, Truck, Microscope, GraduationCap, Building2, Briefcase } from 'lucide-react';
import { Link } from '@/i18n/routing';
import locationsData from '@/data/locations.json';
import citiesData from '@/data/cities.json';
import productsData from '@/data/products.json';
import { getTranslations } from 'next-intl/server';
import FaqSection from '@/components/shared/FaqSection';
import GlobalCTA from '@/components/layout/GlobalCTA';
import { FadeIn, StaggerContainer, StaggerItem } from '@/components/shared/Motion';
import BreadcrumbSchema from '@/components/seo/BreadcrumbSchema';
import UnitedStatesHubContent from '@/components/locations/UnitedStatesHubContent';
import DelawareContent from '@/components/locations/DelawareContent';
import { getUsFaqs } from '@/data/usFaqs';
import WholesaleOrderingProcess from '@/components/locations/WholesaleOrderingProcess';
import CompoundSpotlight from '@/components/locations/CompoundSpotlight';
import NationwideLogisticsTable from '@/components/locations/NationwideLogisticsTable';
import QualityStandardsSection from '@/components/locations/QualityStandardsSection';
import { linkifyText } from '@/lib/linkifyLocationContent';
import { getLocalizedLocation } from '@/lib/locationTranslations';

// Pinned to the 1 hour this route had before the layout was raised to 2 days.
export const revalidate = 3600;

export async function generateStaticParams() {
  const stateParams = locationsData.map((loc) => {
    const isCountry = loc.city === loc.region;
    const countrySlug = loc.region.toLowerCase().replace(/ /g, '-');
    if (isCountry) {
      return { slug: [countrySlug] };
    }
    return { slug: [countrySlug, loc.slug] };
  });

  const cityParams = citiesData.map((city) => {
    const countrySlug = city.region.toLowerCase().replace(/ /g, '-');
    return { slug: [countrySlug, city.stateSlug, city.slug] };
  });

  return [...stateParams, ...cityParams];
}

export async function generateMetadata(props: any) {
  const params = props?.params || {};
  const locale = params?.locale || 'en';
  const isCity = params.slug.length === 3;
  const targetSlug = params.slug[params.slug.length - 1];
  const location: any = isCity 
    ? citiesData.find((loc) => loc.slug === targetSlug)
    : locationsData.find((loc) => loc.slug === targetSlug);
    
  if (!location) return {};

  const locData = getLocalizedLocation(location, params.locale, isCity);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://99puritywholesale.com';
  const path = `/locations/${params.slug.join('/')}`;
  const url = params.locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${params.locale}${path}`;
  const ogUrlImage = `${baseUrl}/api/og?title=${encodeURIComponent(locData.metaTitle)}&desc=${encodeURIComponent(locData.metaDesc)}&category=Wholesale%20Supplier`;

  const metaTitle = locData.metaTitle;
  const title = /99 Purity/i.test(metaTitle)
    ? { absolute: metaTitle }
    : metaTitle;

  return {
    metadataBase: new URL(baseUrl),
    title,
    description: locData.metaDesc,
    alternates: {
      canonical: url,
      languages: {
        'en-US': `${baseUrl}${path}`,
        es: `${baseUrl}/es${path}`,
        'x-default': `${baseUrl}${path}`,
      },
    },
    openGraph: {
      title: locData.ogTitle || locData.metaTitle,
      description: locData.ogDesc || locData.metaDesc,
      url: url,
      siteName: '99 Purity Wholesale',
      images: [
        {
          url: ogUrlImage,
          width: 1200,
          height: 630,
          alt: `${locData.metaTitle} — 99 Purity Wholesale`,
        },
      ],
      locale: params.locale,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: locData.ogTitle || locData.metaTitle,
      description: locData.ogDesc || locData.metaDesc,
      images: [ogUrlImage],
    },
  };
}

export default async function LocationTemplatePage({ params }: { params: { locale: string; slug: string[] } }) {
  const t = await getTranslations({ locale: params.locale, namespace: 'LocationDetail' });
  const homeT = await getTranslations({ locale: params.locale, namespace: 'Index' });
  const isEs = params.locale === 'es';
  
  const isCity = params.slug.length === 3;
  const targetSlug = params.slug[params.slug.length - 1];
  const location: any = isCity 
    ? citiesData.find((loc) => loc.slug === targetSlug)
    : locationsData.find((loc) => loc.slug === targetSlug);
    
  if (!location) {
    if (isCity) {
      const stateSlug = params.slug[1];
      const stateHubExists = locationsData.some((loc) => loc.slug === stateSlug);
      if (stateHubExists) {
        const redirectPath = params.locale === 'en'
          ? `/locations/united-states/${stateSlug}`
          : `/es/locations/united-states/${stateSlug}`;
        permanentRedirect(redirectPath);
      }
    }
    notFound();
  }

  const locData = getLocalizedLocation(location, params.locale, isCity);

  // Never auto-link a page's own name back to itself
  const selfExcludeTerms = isCity ? [location.city, location.state] : [location.city];

  // Pre-seed with hrefs that already have their own visible link elsewhere on this page
  const usedLinkHrefs = new Set<string>();

  // Product grid href deduplication
  const usedProductGridHrefs = new Set<string>();
  (location.popularProducts || []).forEach((p: string) => {
    const matched = productsData.find((pd: any) => pd.name.toLowerCase() === p.toLowerCase());
    usedProductGridHrefs.add(matched ? `/products/${matched.slug}` : '/products');
  });
  if (!isCity && location.slug !== 'united-states') {
    ['semaglutide', 'tirzepatide', 'bpc-157', 'retatrutide'].forEach((slug) => usedProductGridHrefs.add(`/products/${slug}`));
  }

  const regionalTranslations: Record<string, string> = {
    'Southeast': 'Sudeste',
    'Southwest': 'Sudoeste',
    'West Coast': 'Costa Oeste',
    'Mountain': 'Montaña',
    'Northeast': 'Noreste',
    'Midwest': 'Medio Oeste',
    'United States': 'Estados Unidos'
  };
  const translatedRegion = isEs ? (regionalTranslations[location.region] || location.region) : location.region;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://99puritywholesale.com';
  const localePrefix = params.locale === 'en' ? '' : `${params.locale}/`;
  const isNationalHub = location.city === location.region;

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: '99 Purity Wholesale',
    url: `${baseUrl}/${localePrefix}locations/${params.slug.join('/')}`,
    description: isNationalHub
      ? 'Wholesale research-grade peptide supplier serving licensed professionals nationwide across the United States.'
      : `Wholesale research-grade peptide supplier serving licensed professionals in ${location.city}, United States.`,
    areaServed: isNationalHub
      ? { '@type': 'Country', name: 'United States' }
      : {
          '@type': 'State',
          name: location.city,
          containedInPlace: { '@type': 'Country', name: 'United States' },
        },
    knowsAbout: location.localKeywords,
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: `Wholesale Peptides ${location.city}`,
      itemListElement: (location.popularProducts || []).map((p: any) => {
        const matchedProduct = productsData.find((pd) => pd.name.toLowerCase() === p.toLowerCase());
        return {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: `${p} — Wholesale Bulk Supply`,
            ...(matchedProduct ? { url: `${baseUrl}/products/${matchedProduct.slug}` } : {}),
          },
        };
      }),
    },
  };

  const trustBadges = location.slug === 'delaware'
    ? (isEs
        ? ['🇺🇸 Envíos en EE. UU.', 'COA de Lote', 'Cuentas B2B', 'Solo Investigación']
        : ['🇺🇸 U.S. Domestic Fulfillment', 'Lot-Specific COA', 'Verified B2B Accounts', 'Research Use Only'])
    : (isEs
        ? ['🇺🇸 Fabricado en EE. UU.', 'Pureza ≥99%', 'COA de Lote Verificado', 'Solo B2B', 'Entrega en 2–4 Días']
        : ['🇺🇸 U.S. Manufactured', '≥99% Purity', 'Batch COA Verified', 'B2B Only', '2–4 Day Delivery']);

  return (
    <main className="min-h-screen bg-[#F8F8F6] text-black -mt-24 md:-mt-32">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />

      <BreadcrumbSchema items={[
        { name: t('home'), item: params.locale === 'en' ? baseUrl : `${baseUrl}/${params.locale}` },
        { name: t('locations'), item: `${baseUrl}/${localePrefix}locations` },
        ...(location.city !== location.region ? [
          { name: translatedRegion, item: `${baseUrl}/${localePrefix}locations/${location.region.toLowerCase().replace(/ /g, '-')}` }
        ] : []),
        ...(isCity ? [
          { name: location.state, item: `${baseUrl}/${localePrefix}locations/${location.region.toLowerCase().replace(/ /g, '-')}/${location.stateSlug}` }
        ] : []),
        { name: location.city, item: `${baseUrl}/${localePrefix}locations/${params.slug.join('/')}` }
      ]} />
      
      {/* Grain overlay */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[url('/images/noise.svg')]" />

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-44 pb-20 md:pt-56 md:pb-32 border-b border-black/5 bg-[#F8F8F6]">
        <div className="container mx-auto px-6 max-w-7xl relative z-10">
          <FadeIn>
            {/* Breadcrumb */}
            <div className="flex flex-wrap items-center gap-2 mb-8 text-black/35 font-dm-mono text-[10px] uppercase tracking-[0.2em] font-bold">
              <Link href="/" className="hover:text-[#13a7b7] transition-colors">{t('home')}</Link>
              <span>/</span>
              <Link href="/locations" className="hover:text-[#13a7b7] transition-colors">{t('locations')}</Link>
              <span>/</span>
              {location.city !== location.region ? (
                <>
                  <Link href={`/locations/${location.region.toLowerCase().replace(/ /g, '-')}`} className="hover:text-[#13a7b7] transition-colors">
                    {translatedRegion}
                  </Link>
                  <span>/</span>
                  {isCity && (
                    <>
                      <Link href={`/locations/${location.region.toLowerCase().replace(/ /g, '-')}/${location.stateSlug}`} className="hover:text-[#13a7b7] transition-colors">
                        {location.state}
                      </Link>
                      <span>/</span>
                    </>
                  )}
                  <span className="text-[#13a7b7]">{location.city}</span>
                </>
              ) : (
                <span className="text-[#13a7b7]">{translatedRegion}</span>
              )}
            </div>

            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-4 h-4 text-[#13a7b7]" />
              <span className="text-[#13a7b7] font-dm-mono text-[10px] font-bold uppercase tracking-widest">
                {location.city !== location.region ? `${location.city} · ` : ''}{translatedRegion}
              </span>
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold font-absans text-black uppercase tracking-tight max-w-5xl leading-tight mb-8">
              {locData.h1}
            </h1>
            <p className="text-base md:text-lg text-black/60 font-archia leading-relaxed max-w-3xl font-medium mb-10">
              {locData.intro}
            </p>

            {/* Hero CTAs */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 sm:gap-4 mb-10">
              <a
                href="#wholesale-inquiry"
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

            {/* Quick Trust Badges */}
            <div className="flex flex-wrap gap-2">
              {trustBadges.map((badge) => (
                <span key={badge} className="bg-white border border-black/5 text-black/60 px-4 py-2 rounded-full font-dm-mono text-[9px] uppercase tracking-wider font-semibold shadow-sm">
                  {badge}
                </span>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Main Content Grid */}
      <section className="py-20 relative z-10">
        <div className="container mx-auto px-6 max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">

            {/* Left: Rich Content */}
            <div className="lg:col-span-8 space-y-16">
              {location.slug === 'united-states' ? (
                <UnitedStatesHubContent />
              ) : location.slug === 'delaware' ? (
                <DelawareContent locale={params.locale} />
              ) : (
                <>
              {/* Body Content */}
              <FadeIn className="space-y-6">
                <h2 className="text-3xl font-absans font-bold text-black uppercase tracking-tight">
                  {t('contactTitle', { city: location.city })}
                </h2>
                <div className="space-y-4 text-black/60 font-archia font-medium leading-relaxed text-sm md:text-base">
                  <p className="text-black/85 font-semibold leading-relaxed">{linkifyText(locData.bodyP1, { excludeTerms: selfExcludeTerms, usedHrefs: usedLinkHrefs })}</p>
                  <p>{linkifyText(locData.bodyP2, { excludeTerms: selfExcludeTerms, usedHrefs: usedLinkHrefs })}</p>
                  <p>{linkifyText(locData.bodyP3, { excludeTerms: selfExcludeTerms, usedHrefs: usedLinkHrefs })}</p>
                  {locData.bodyP4 && <p>{linkifyText(locData.bodyP4, { excludeTerms: selfExcludeTerms, usedHrefs: usedLinkHrefs })}</p>}
                  {locData.bodyP5 && <p>{linkifyText(locData.bodyP5, { excludeTerms: selfExcludeTerms, usedHrefs: usedLinkHrefs })}</p>}
                </div>
              </FadeIn>

              {/* Popular Products */}
              <div id="popular-compounds" className="scroll-mt-36">
                <FadeIn className="bg-white border border-black/5 rounded-[2.5rem] p-8 md:p-10 shadow-sm">
                <h2 className="text-2xl md:text-3xl font-absans font-bold text-black uppercase tracking-tight mb-4">
                  {t('topTitle', { city: location.city })}
                </h2>
                <p className="text-black/50 font-archia font-semibold text-sm mb-8">
                  {t('topDesc', { city: location.city })}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(location.popularProducts || []).map((product: any, idx: number) => {
                    const matchedProduct = productsData.find(
                      (p: any) => p.name.toLowerCase() === product.toLowerCase()
                    );
                    const href = matchedProduct 
                      ? `/products/${matchedProduct.slug}`
                      : '/products';

                    return (
                      <Link 
                        key={idx} 
                        href={href}
                        className="bg-[#F8F8F6] border border-black/5 p-6 rounded-2xl flex items-center justify-between group hover:border-[#13a7b7]/30 hover:bg-white hover:shadow-md transition-all duration-300"
                      >
                        <div>
                          <span className="font-absans font-bold text-black text-lg uppercase tracking-tight group-hover:text-[#13a7b7] transition-colors">{product}</span>
                          <div className="text-[#13a7b7] font-dm-mono text-[9px] font-bold uppercase tracking-widest mt-1.5">{t('researchGrade')} · {t('puritySuffix')}</div>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-white border border-black/5 flex items-center justify-center group-hover:border-[#13a7b7]/30 transition-colors shadow-sm">
                          <CheckCircle2 className="w-4 h-4 text-black/30 group-hover:text-[#13a7b7] transition-colors" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
                <div className="mt-8 pt-6 border-t border-black/5">
                  <Link href="/products" className="inline-flex items-center gap-2 text-[#13a7b7] font-dm-mono text-xs uppercase tracking-widest hover:text-black transition-colors font-bold">
                    {t('viewCatalog')} <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </FadeIn>
              </div>

              {/* Why Choose Us for This Location */}
              {locData.whyUs && locData.whyUs.length > 0 && (
                <FadeIn className="bg-[#13a7b7]/5 border border-[#13a7b7]/10 rounded-[2.5rem] p-8 md:p-10">
                  <h2 className="text-2xl font-absans font-bold text-black uppercase tracking-tight mb-6">
                    {t('whyTitle', { city: location.city })}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {locData.whyUs.map((point: string, i: number) => (
                      <div key={i} className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-[#13a7b7] mt-0.5 flex-shrink-0" />
                        <span className="text-black/75 font-archia text-sm font-semibold leading-relaxed">{point}</span>
                      </div>
                    ))}
                  </div>
                </FadeIn>
              )}

              {/* Compound Spotlight (State only) */}
              {!isCity && (
                <CompoundSpotlight
                  heading={isEs ? `Compuestos de Investigación Destacados — Suministro para ${location.city}` : `Featured Research Compounds — Supply for ${location.city}`}
                  intro={isEs
                    ? `Las organizaciones de investigación en ${location.city} requieren péptidos verificados por lotes para evaluación in vitro. A continuación se presentan algunos de los compuestos disponibles en nuestro catálogo mayorista.`
                    : `Research organizations in ${location.city} require batch-verified peptides for in-vitro evaluation. Below are key compounds available through our wholesale catalog.`}
                />
              )}

              {/* Institutions Served (GEO Content) */}
              {(locData.researchInstitutions || locData.universities || locData.biotechOverview || locData.industriesWeSupply) ? (
                <FadeIn className="space-y-6">
                  <h2 className="text-2xl md:text-3xl font-absans font-bold text-black uppercase tracking-tight border-b border-black/10 pb-4">
                    {isEs ? `A Quién Servimos en ${location.city}` : `Who We Serve in ${location.city}`}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { icon: Microscope, title: isEs ? 'Instituciones de Investigación' : 'Research Institutions', body: locData.researchInstitutions },
                      { icon: GraduationCap, title: isEs ? 'Universidades' : 'Universities', body: locData.universities },
                      { icon: Building2, title: isEs ? 'Panorama de la Industria Biotecnológica' : 'Biotech Industry Overview', body: locData.biotechOverview },
                      { icon: Briefcase, title: isEs ? 'Industrias a las que Suministramos' : 'Industries We Supply', body: locData.industriesWeSupply },
                    ].filter((cat) => cat.body).map((cat, i) => (
                      <div key={i} className="bg-white border border-black/5 rounded-2xl p-6 shadow-sm">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-9 h-9 rounded-xl bg-[#F8F8F6] border border-black/5 flex items-center justify-center flex-shrink-0">
                            <cat.icon className="w-4 h-4 text-[#13a7b7]" />
                          </div>
                          <h3 className="font-absans font-bold text-black text-sm uppercase tracking-wide">{cat.title}</h3>
                        </div>
                        <p className="text-black/65 font-archia font-medium leading-relaxed text-xs md:text-sm">
                          {linkifyText(cat.body!, { excludeTerms: selfExcludeTerms, maxLinks: 3, usedHrefs: usedLinkHrefs })}
                        </p>
                      </div>
                    ))}
                  </div>
                </FadeIn>
              ) : locData.institutionsServed && (
                <FadeIn className="space-y-4">
                  <h3 className="text-xl md:text-2xl font-absans font-bold text-black uppercase tracking-tight border-b border-black/10 pb-4">
                    {isEs ? `Instituciones a las que Servimos en ${location.city}` : `Institutions Served in ${location.city}`}
                  </h3>
                  <p className="text-black/75 font-archia font-medium leading-relaxed text-sm md:text-base">
                    {linkifyText(locData.institutionsServed, { excludeTerms: selfExcludeTerms, usedHrefs: usedLinkHrefs })}
                  </p>
                </FadeIn>
              )}

              {/* Wholesale Ordering Process */}
              <WholesaleOrderingProcess locationName={location.city} />

              {/* Cities We Serve (Rendered only on State pages) */}
              {!isCity && citiesData.some(c => c.stateSlug === location.slug) && (
                <FadeIn className="bg-white border border-black/5 rounded-[2.5rem] p-8 md:p-10 shadow-sm">
                  <h3 className="text-2xl font-absans font-bold text-black uppercase tracking-tight mb-6">
                    {isEs ? `Ciudades a las que Servimos en ${location.city}` : `Cities We Serve in ${location.city}`}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {citiesData.filter(c => c.stateSlug === location.slug).map((city) => (
                      <Link 
                        key={city.slug} 
                        href={`/locations/${city.region.toLowerCase().replace(/ /g, '-')}/${city.stateSlug}/${city.slug}`}
                        className="text-black/60 hover:text-[#13a7b7] font-archia font-semibold transition-colors flex items-center gap-2"
                      >
                        <MapPin className="w-3.5 h-3.5 text-[#13a7b7]/50" />
                        {city.city}
                      </Link>
                    ))}
                  </div>
                </FadeIn>
              )}

              {/* Nationwide Logistics & Distribution Framework (State only) */}
              {!isCity && (
                <NationwideLogisticsTable
                  heading={isEs ? `Marco de Distribución Nacional para ${location.city}` : `Nationwide Distribution Framework Serving ${location.city}`}
                  intro={isEs
                    ? `Los pedidos destinados a ${location.city} se envían a través de transportistas nacionales prioritarios desde nuestras instalaciones en EE. UU., evitando el procesamiento aduanero internacional.`
                    : `Orders bound for ${location.city} are shipped via priority domestic carriers from our U.S. facility, bypassing international customs processing.`}
                />
              )}

              {/* Local Logistics (GEO Content) */}
              {locData.logisticsDetails && (
                <FadeIn className="space-y-4">
                  <h3 className="text-xl md:text-2xl font-absans font-bold text-black uppercase tracking-tight border-b border-black/10 pb-4">
                    {isEs ? `Logística Mayorista Prioritaria para ${location.city}` : `Priority Wholesale Logistics to ${location.city}`}
                  </h3>
                  <p className="text-black/75 font-archia font-medium leading-relaxed text-sm md:text-base">
                    {linkifyText(locData.logisticsDetails, { excludeTerms: selfExcludeTerms, maxLinks: 3, usedHrefs: usedLinkHrefs })}
                  </p>
                </FadeIn>
              )}

              {/* Shipping Info */}
              <FadeIn className="bg-white border border-black/5 rounded-[2.5rem] p-8 md:p-10 shadow-sm">
                <div className="flex items-start gap-5 mb-8">
                  <div className="w-12 h-12 rounded-2xl bg-[#F8F8F6] border border-black/5 flex items-center justify-center flex-shrink-0">
                    <Truck className="w-6 h-6 text-black/55" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-absans font-bold text-black uppercase tracking-tight mb-2">
                      {t('fastShippingTitle', { state: location.city })}
                    </h3>
                    <p className="text-black/50 font-archia font-semibold text-sm leading-relaxed">
                      {t('fastShippingDesc', { city: location.city })}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { icon: Package, label: t('shippingPoints.priority'), sub: t('shippingPoints.prioritySub', { city: location.city }) },
                    { icon: ShieldCheck, label: t('shippingPoints.discreet'), sub: t('shippingPoints.discreetSub') },
                    { icon: CheckCircle2, label: t('shippingPoints.noCustoms'), sub: t('shippingPoints.noCustomsSub') },
                  ].map((item, i) => (
                    <div key={i} className="flex flex-col justify-between bg-[#F8F8F6] border border-black/5 rounded-2xl p-5 hover:border-[#13a7b7]/20 transition-all">
                      <div className="w-9 h-9 rounded-xl bg-white border border-black/5 flex items-center justify-center mb-4">
                        <item.icon className="w-4 h-4 text-black/55" />
                      </div>
                      <div>
                        <div className="text-black font-absans font-bold text-sm uppercase tracking-wide">{item.label}</div>
                        <div className="text-black/40 font-archia font-semibold text-[10px] leading-relaxed mt-1">{item.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </FadeIn>

              {/* Quality, Compliance & Testing Standards (State only) */}
              {!isCity && <QualityStandardsSection locationSlug={location.slug} />}

              {/* SEO Content: What We Supply (State only) */}
              {!isCity && (
                <FadeIn className="space-y-6">
                  <h2 className="text-2xl md:text-3xl font-absans font-bold text-black uppercase tracking-tight">
                    {t('catTitle', { city: location.city })}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { cat: isEs ? 'Péptidos GLP-1 y Metabólicos' : 'GLP-1 & Metabolic Peptides', products: 'Semaglutide, Tirzepatide, Retatrutide, Cagrilintide' },
                      { cat: isEs ? 'Péptidos de Hormona de Crecimiento' : 'Growth Hormone Peptides', products: 'Ipamorelin, CJC-1295, Sermorelin, Tesamorelin, GHRP-2' },
                      { cat: isEs ? 'Curación y Recuperación' : 'Healing & Recovery', products: 'BPC-157, TB-500, KPV, LL37, B7-33' },
                      { cat: isEs ? 'Cognitivos y Nootrópicos' : 'Cognitive & Nootropic', products: 'Semax, Selank, Dihexa, DSIP, Adamax' },
                      { cat: isEs ? 'Antienvejecimiento y Longevidad' : 'Anti-Aging & Longevity', products: 'Epithalon, MOTS-c, NAD+, Thymalin, SS-31' },
                      { cat: isEs ? 'Cosméticos y Estéticos' : 'Cosmetic & Aesthetic', products: 'GHK-Cu, Snap-8, AOD9604, 5-AMINO-1MQ' },
                    ].map((item, i) => (
                      <div key={i} className="bg-white border border-black/5 rounded-2xl p-6 hover:border-[#13a7b7]/25 transition-all shadow-sm">
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-xl bg-[#F8F8F6] border border-black/5 flex items-center justify-center flex-shrink-0">
                            <FlaskConical className="w-5 h-5 text-black/55" />
                          </div>
                          <div>
                            <div className="text-black font-absans font-bold text-sm uppercase tracking-wide mb-1.5">{item.cat}</div>
                            <div className="text-black/45 font-archia font-medium text-[11px] leading-relaxed flex flex-wrap gap-x-1 gap-y-0.5">
                              {item.products.split(', ').map((prodName: string, pIdx: number, arr: string[]) => {
                                const matched = productsData.find(
                                  (p: any) => p.name.toLowerCase() === prodName.toLowerCase()
                                );
                                const href = matched
                                  ? `/products/${matched.slug}`
                                  : '/products';
                                const alreadyLinkedElsewhere = usedProductGridHrefs.has(href);
                                if (!alreadyLinkedElsewhere) usedProductGridHrefs.add(href);
                                return (
                                  <span key={prodName} className="inline-flex items-center">
                                    {alreadyLinkedElsewhere ? (
                                      <span className="font-semibold">{prodName}</span>
                                    ) : (
                                      <Link href={href} className="hover:text-[#13a7b7] hover:underline transition-colors font-semibold">
                                        {prodName}
                                      </Link>
                                    )}
                                    {pIdx < arr.length - 1 && <span className="text-black/30 ml-0.5">,</span>}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </FadeIn>
              )}

              {/* Compliance Note */}
              <FadeIn className="bg-amber-500/5 border border-amber-500/10 rounded-[2rem] p-6 flex gap-4">
                <ShieldAlert className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-absans font-bold text-amber-700 text-sm uppercase tracking-wider mb-1.5">{t('complianceTitle')}</h4>
                  <p className="text-xs text-amber-950/60 font-archia font-semibold leading-relaxed">
                    {t('complianceDesc', { city: location.city, state: location.state })}
                  </p>
                </div>
              </FadeIn>
                </>
              )}
            </div>

            {/* Right: Sticky Sidebar CTAs */}
            <div className="lg:col-span-4 relative">
              <div className="sticky top-28 md:top-36 space-y-6">

                {/* Primary CTA Card */}
                <div id="wholesale-inquiry" className="scroll-mt-36 bg-[#0D0E10] text-white border border-white/5 rounded-[2.5rem] p-6 md:p-8 shadow-2xl relative overflow-hidden group">
                  <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[url('/images/noise.svg')]" />
                  
                  <h3 className="text-xl md:text-2xl font-absans font-bold text-white uppercase tracking-tight mb-2">
                    {t('contactTitle', { city: location.city })}
                  </h3>
                  <p className="text-white/40 font-archia font-medium text-xs leading-relaxed mb-8">
                    {t('contactDesc', { state: location.city })}
                  </p>

                  <div className="space-y-4">
                    <a
                      href={`https://wa.me/18433307365?text=${encodeURIComponent(t('whatsappMsg', { city: location.city, state: location.state }))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-white hover:bg-white/90 text-black font-bold py-4 rounded-xl transition-all font-absans text-[11px] uppercase tracking-widest flex items-center justify-center gap-2.5 shadow-lg"
                    >
                      <Zap className="w-4 h-4 fill-current animate-pulse" /> {t('whatsappCta')}
                    </a>

                    <div className="relative flex items-center py-2">
                      <div className="flex-grow border-t border-white/10"></div>
                      <span className="flex-shrink-0 mx-4 text-white/30 font-dm-mono text-[9px] uppercase tracking-widest font-bold">{t('or')}</span>
                      <div className="flex-grow border-t border-white/10"></div>
                    </div>

                    <a
                      href={`mailto:sales@99puritywholesale.com?subject=${encodeURIComponent(t('emailSubject', { city: location.city, state: location.state }))}`}
                      className="w-full bg-white/5 border border-white/10 hover:border-white hover:bg-white/10 text-white font-bold py-4 rounded-xl transition-all font-absans text-[11px] uppercase tracking-widest flex items-center justify-center gap-2.5"
                    >
                      <Mail className="w-4 h-4" /> {t('emailCta')}
                    </a>
                  </div>

                  <div className="mt-8 pt-6 border-t border-white/5 text-center">
                    <Link href="/products" className="text-white hover:text-white/70 font-dm-mono text-[10px] uppercase tracking-widest transition-colors inline-flex items-center gap-2 font-bold">
                      {t('viewCatalog')} <ArrowRight className="w-3.5 h-3.5 text-white/50 group-hover:text-white transition-colors" />
                    </Link>
                  </div>
                </div>

                {/* Quick Info Card */}
                {location.slug !== 'delaware' && (
                  <div className="bg-white border border-black/5 rounded-[2.5rem] p-6 md:p-8 shadow-sm">
                    <h4 className="text-base font-absans font-bold text-black uppercase tracking-wider mb-6">{t('accountDetails')}</h4>
                    <div className="space-y-4">
                      {[
                        { label: t('details.moq'), value: t('details.moqVal') },
                        { label: t('details.purity'), value: t('details.purityVal') },
                        { label: t('details.fulfillment'), value: t('details.fulfillmentVal') },
                        { label: t('details.payment'), value: t('details.paymentVal') },
                        { label: t('details.shipping'), value: t('details.shippingVal') },
                        { label: t('details.buyers'), value: t('details.buyersVal') },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center justify-between py-2 border-b border-black/5 last:border-0">
                          <span className="text-black/40 font-dm-mono text-[9px] uppercase tracking-widest font-bold">{item.label}</span>
                          <span className="text-black/85 font-archia font-bold text-xs text-right leading-tight">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Apply CTA */}
                <div className="bg-[#13a7b7]/5 border border-[#13a7b7]/10 rounded-[2.5rem] p-6 text-center">
                  <p className="text-black/50 font-archia font-semibold text-xs leading-relaxed mb-5">{t('applyMsg')}</p>
                  <Link
                    href="/wholesale-application"
                    className="w-full inline-flex items-center justify-center gap-2 bg-[#13a7b7]/10 border border-[#13a7b7]/30 text-[#13a7b7] hover:bg-[#13a7b7]/25 font-bold py-3.5 px-6 rounded-xl transition-all font-absans uppercase tracking-widest text-[10px]"
                  >
                    {t('applyCta')} <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Related Locations */}
      {location.slug !== 'united-states' && (
      <section className="py-24 bg-white border-t border-black/5">
        <div className="container mx-auto px-6 max-w-7xl">
          <FadeIn>
            <h2 className="text-3xl font-absans font-bold text-black uppercase tracking-tight mb-8">
              {isCity ? (isEs ? `Ciudades Cercanas en ${location.state}` : `Nearby Cities in ${location.state}`) : t('otherRegions')}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
              {isCity ? (
                citiesData
                  .filter((c) => c.stateSlug === location.stateSlug && c.slug !== location.slug)
                  .map((nearbyCity, idx: number) => {
                  return (
                    <Link key={idx} href={`/locations/${location.region.toLowerCase().replace(/ /g, '-')}/${location.stateSlug}/${nearbyCity.slug}`} className="group block">
                      <div className="bg-[#F8F8F6] border border-black/5 rounded-2xl p-6 hover:border-[#13a7b7]/30 hover:bg-white hover:shadow-md transition-all duration-300">
                        <div className="flex items-center gap-2 mb-3">
                          <MapPin className="w-3.5 h-3.5 text-[#13a7b7]" />
                          <span className="text-[#13a7b7] font-dm-mono text-[9px] font-bold uppercase tracking-wider">
                            {isEs ? 'Ciudad Cercana' : 'Nearby City'}
                          </span>
                        </div>
                        <div className="text-black font-absans font-bold text-xl group-hover:text-[#13a7b7] transition-colors uppercase tracking-tight mb-4">{nearbyCity.city}</div>
                        <div className="text-black/40 font-archia font-semibold text-[10px] uppercase tracking-wider flex items-center gap-1">
                          {t('viewHub')} <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </div>
                    </Link>
                  );
                })
              ) : (
                locationsData
                  .filter((loc) => loc.slug !== targetSlug && loc.city !== loc.region)
                  .slice(0, 4)
                  .map((loc) => {
                  const isRelatedCountry = loc.city === loc.region;
                  const relatedCountrySlug = loc.region.toLowerCase().replace(/ /g, '-');
                  const relatedPath = isRelatedCountry ? relatedCountrySlug : `${relatedCountrySlug}/${loc.slug}`;
                  
                  return (
                  <Link key={loc.slug} href={`/locations/${relatedPath}`} className="group block">
                    <div className="bg-[#F8F8F6] border border-black/5 rounded-2xl p-6 hover:border-[#13a7b7]/30 hover:bg-white hover:shadow-md transition-all duration-300">
                      <div className="flex items-center gap-2 mb-3">
                        <MapPin className="w-3.5 h-3.5 text-[#13a7b7]" />
                        <span className="text-[#13a7b7] font-dm-mono text-[9px] font-bold uppercase tracking-wider">{isRelatedCountry ? t('nationalHub') : t('stateHub')}</span>
                      </div>
                      <div className="text-black font-absans font-bold text-xl group-hover:text-[#13a7b7] transition-colors uppercase tracking-tight mb-4">{loc.city}</div>
                      <div className="text-black/40 font-archia font-semibold text-[10px] uppercase tracking-wider flex items-center gap-1">
                        {t('viewHub')} <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </Link>
                  );
                })
              )}
            </div>
          </FadeIn>
        </div>
      </section>
      )}

      {/* FAQ Segment */}
      {location.slug === 'united-states' ? (
        <FaqSection 
          title={isEs ? 'Preguntas Frecuentes (Venta Mayorista en EE. UU.)' : 'Frequently Asked Questions (US Wholesale)'}
          subtitle={isEs
            ? 'Para ayudar a nuestros socios institucionales, hemos recopilado respuestas detalladas a las preguntas logísticas, legales y operativas más críticas sobre la adquisición de péptidos a granel en los Estados Unidos.'
            : 'To assist our institutional partners, we have compiled detailed answers to the most critical logistical, legal, and operational questions regarding bulk peptide procurement in the United States.'}
          items={getUsFaqs(params.locale)}
          eyebrow={isEs ? 'Preguntas Frecuentes Nacionales' : 'National FAQ'}
        />
      ) : locData.localFaqs && locData.localFaqs.length > 0 ? (
        <FaqSection 
          title={isEs ? `Preguntas Frecuentes en ${location.city}` : `Frequently Asked Questions in ${location.city}`}
          subtitle={isEs
            ? `Información de adquisición de péptidos al por mayor para empresas en ${location.city}.`
            : `Wholesale peptide procurement information for ${location.city} businesses.`}
          items={
            locData.localFaqs.length >= 8
              ? locData.localFaqs
              : [
                  ...locData.localFaqs,
                  ...getUsFaqs(params.locale).filter(faq => !locData.localFaqs?.some((lFaq: any) => lFaq.q === faq.q)).slice(0, 5)
                ]
          }
          eyebrow={isEs ? 'Preguntas Frecuentes Locales' : 'Local FAQ'}
        />
      ) : (
        <FaqSection 
          title={isEs ? `Preguntas Frecuentes en ${location.city}` : `Frequently Asked Questions in ${location.city}`}
          subtitle={isEs
            ? `Información de adquisición de péptidos al por mayor para empresas en ${location.city}.`
            : `Wholesale peptide procurement information for ${location.city} businesses.`}
          items={getUsFaqs(params.locale).slice(0, 8)}
          eyebrow={isEs ? 'Preguntas Frecuentes Locales' : 'Local FAQ'}
        />
      )}
    </main>
  );
}
