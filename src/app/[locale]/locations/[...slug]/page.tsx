import { notFound, permanentRedirect } from 'next/navigation';
import { MapPin, Mail, Zap, ShieldAlert, CheckCircle2, Package, ArrowRight, FlaskConical, ShieldCheck, Truck, Microscope, GraduationCap, Building2, Briefcase } from 'lucide-react';
import { Link } from '@/i18n/routing';
import locationsData from '@/data/locations.json';
import citiesData from '@/data/cities.json';
import productsData from '@/data/products.json';
import { getTranslations } from 'next-intl/server';
import FaqSection from '@/components/shared/FaqSection';
import { PageShell, PageHero, Section, CardGrid, PillButton, WRAP, SECTION, card } from '@/components/home/page-kit';
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

  const H2 = 'text-[clamp(1.6rem,2.8vw,2.3rem)] font-light leading-tight tracking-[-0.03em] text-[#0B0F14]';
  const H3 = 'text-[1.3rem] font-light leading-tight tracking-[-0.03em] text-[#0B0F14]';
  const crumb = 'transition-colors hover:text-[#0B6F7B]';

  return (
    <PageShell>
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

      {/* Breadcrumb */}
      <div className={`${WRAP} pt-4 md:pt-6`}>
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/45">
          <Link href="/" className={crumb}>{t('home')}</Link>
          <span>/</span>
          <Link href="/locations" className={crumb}>{t('locations')}</Link>
          <span>/</span>
          {location.city !== location.region ? (
            <>
              <Link href={`/locations/${location.region.toLowerCase().replace(/ /g, '-')}`} className={crumb}>
                {translatedRegion}
              </Link>
              <span>/</span>
              {isCity && (
                <>
                  <Link href={`/locations/${location.region.toLowerCase().replace(/ /g, '-')}/${location.stateSlug}`} className={crumb}>
                    {location.state}
                  </Link>
                  <span>/</span>
                </>
              )}
              <span className="text-[#0B6F7B]">{location.city}</span>
            </>
          ) : (
            <span className="text-[#0B6F7B]">{translatedRegion}</span>
          )}
        </nav>
      </div>

      <PageHero
        eyebrow={`${location.city !== location.region ? `${location.city} · ` : ''}${translatedRegion}`}
        title={locData.h1}
        intro={locData.intro}
        actions={
          <>
            <a href="#wholesale-inquiry" className="group inline-flex items-center gap-3 rounded-full bg-[#0B0F14] py-2 pl-5 pr-2 text-[13px] font-medium text-white transition-colors hover:bg-[#1b232d]">
              <span>{t('requestPricing')}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4FC3D0] text-[#0B0F14] transition-transform duration-300 group-hover:-rotate-45"><ArrowRight className="h-3.5 w-3.5" /></span>
            </a>
            <PillButton href="/products" variant="outline">{t('exploreCatalog')}</PillButton>
          </>
        }
      />

      {/* Trust badges */}
      <div className={WRAP}>
        <ul className="flex flex-wrap gap-2">
          {trustBadges.map((badge) => (
            <li key={badge} className="rounded-full border border-[#E6EAF1] bg-white px-4 py-2 font-dm-mono text-[10px] uppercase tracking-[0.14em] text-[#0B0F14]/60">
              {badge}
            </li>
          ))}
        </ul>
      </div>

      {/* Main content grid */}
      <section className={`${SECTION} relative z-10`}>
        <div className={WRAP}>
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">

            {/* Left: rich content */}
            <div className="space-y-14 lg:col-span-8 md:space-y-16">
              {location.slug === 'united-states' ? (
                <UnitedStatesHubContent />
              ) : location.slug === 'delaware' ? (
                <DelawareContent locale={params.locale} />
              ) : (
                <>
              {/* Body content */}
              <div className="space-y-6">
                <h2 className={H2}>
                  {t('contactTitle', { city: location.city })}
                </h2>
                <div className="space-y-4 text-[15px] leading-[1.75] text-[#0B0F14]/65">
                  <p className="text-[#0B0F14]/85">{linkifyText(locData.bodyP1, { excludeTerms: selfExcludeTerms, usedHrefs: usedLinkHrefs })}</p>
                  <p>{linkifyText(locData.bodyP2, { excludeTerms: selfExcludeTerms, usedHrefs: usedLinkHrefs })}</p>
                  <p>{linkifyText(locData.bodyP3, { excludeTerms: selfExcludeTerms, usedHrefs: usedLinkHrefs })}</p>
                  {locData.bodyP4 && <p>{linkifyText(locData.bodyP4, { excludeTerms: selfExcludeTerms, usedHrefs: usedLinkHrefs })}</p>}
                  {locData.bodyP5 && <p>{linkifyText(locData.bodyP5, { excludeTerms: selfExcludeTerms, usedHrefs: usedLinkHrefs })}</p>}
                </div>
              </div>

              {/* Popular products */}
              <div id="popular-compounds" className="scroll-mt-28">
                <div className={`${card} p-6 md:p-9`}>
                  <h2 className={`${H2} mb-3`}>
                    {t('topTitle', { city: location.city })}
                  </h2>
                  <p className="mb-8 text-[14px] text-[#0B0F14]/60">
                    {t('topDesc', { city: location.city })}
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                          className="group flex items-center justify-between gap-3 rounded-[1rem] border border-[#E6EAF1] bg-[#F3F5FA] p-5 transition-colors duration-300 hover:border-[#4FC3D0] hover:bg-white"
                        >
                          <div>
                            <span className="text-[1.15rem] font-light tracking-[-0.02em] text-[#0B0F14]">{product}</span>
                            <div className="mt-1.5 font-dm-mono text-[10px] uppercase tracking-[0.14em] text-[#0B6F7B]">{t('researchGrade')} · {t('puritySuffix')}</div>
                          </div>
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0B0F14] text-white transition-colors group-hover:bg-[#4FC3D0] group-hover:text-[#0B0F14]">
                            <ArrowRight className="h-3.5 w-3.5" />
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                  <div className="mt-8 border-t border-[#E6EAF1] pt-6">
                    <Link href="/products" className="inline-flex items-center gap-2 text-[13px] font-medium text-[#0B6F7B] transition-colors hover:text-[#0B0F14]">
                      {t('viewCatalog')} <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </div>

              {/* Why choose us for this location */}
              {locData.whyUs && locData.whyUs.length > 0 && (
                <div className="rounded-[1.25rem] border border-[#4FC3D0]/30 bg-[#4FC3D0]/10 p-6 md:p-9">
                  <h2 className={`${H3} mb-6`}>
                    {t('whyTitle', { city: location.city })}
                  </h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {locData.whyUs.map((point: string, i: number) => (
                      <div key={i} className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#0B6F7B]" />
                        <span className="text-[14px] leading-relaxed text-[#0B0F14]/75">{point}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Compound spotlight (state only) */}
              {!isCity && (
                <CompoundSpotlight
                  heading={isEs ? `Compuestos de Investigación Destacados — Suministro para ${location.city}` : `Featured Research Compounds — Supply for ${location.city}`}
                  intro={isEs
                    ? `Las organizaciones de investigación en ${location.city} requieren péptidos verificados por lotes para evaluación in vitro. A continuación se presentan algunos de los compuestos disponibles en nuestro catálogo mayorista.`
                    : `Research organizations in ${location.city} require batch-verified peptides for in-vitro evaluation. Below are key compounds available through our wholesale catalog.`}
                />
              )}

              {/* Institutions served (GEO content) */}
              {(locData.researchInstitutions || locData.universities || locData.biotechOverview || locData.industriesWeSupply) ? (
                <div className="space-y-6">
                  <h2 className={`${H2} border-b border-[#E6EAF1] pb-4`}>
                    {isEs ? `A Quién Servimos en ${location.city}` : `Who We Serve in ${location.city}`}
                  </h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {[
                      { icon: Microscope, title: isEs ? 'Instituciones de Investigación' : 'Research Institutions', body: locData.researchInstitutions },
                      { icon: GraduationCap, title: isEs ? 'Universidades' : 'Universities', body: locData.universities },
                      { icon: Building2, title: isEs ? 'Panorama de la Industria Biotecnológica' : 'Biotech Industry Overview', body: locData.biotechOverview },
                      { icon: Briefcase, title: isEs ? 'Industrias a las que Suministramos' : 'Industries We Supply', body: locData.industriesWeSupply },
                    ].filter((cat) => cat.body).map((cat, i) => (
                      <div key={i} className={`${card} p-6`}>
                        <div className="mb-3 flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F3F5FA] text-[#0B6F7B]">
                            <cat.icon className="h-4 w-4" />
                          </div>
                          <h3 className="text-[15px] font-medium tracking-[-0.01em]">{cat.title}</h3>
                        </div>
                        <p className="text-[13.5px] leading-relaxed text-[#0B0F14]/65">
                          {linkifyText(cat.body!, { excludeTerms: selfExcludeTerms, maxLinks: 3, usedHrefs: usedLinkHrefs })}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : locData.institutionsServed && (
                <div className="space-y-4">
                  <h3 className={`${H3} border-b border-[#E6EAF1] pb-4`}>
                    {isEs ? `Instituciones a las que Servimos en ${location.city}` : `Institutions Served in ${location.city}`}
                  </h3>
                  <p className="text-[15px] leading-[1.75] text-[#0B0F14]/70">
                    {linkifyText(locData.institutionsServed, { excludeTerms: selfExcludeTerms, usedHrefs: usedLinkHrefs })}
                  </p>
                </div>
              )}

              {/* Wholesale ordering process */}
              <WholesaleOrderingProcess locationName={location.city} />

              {/* Cities we serve (state pages only) */}
              {!isCity && citiesData.some(c => c.stateSlug === location.slug) && (
                <div className={`${card} p-6 md:p-9`}>
                  <h3 className={`${H3} mb-6`}>
                    {isEs ? `Ciudades a las que Servimos en ${location.city}` : `Cities We Serve in ${location.city}`}
                  </h3>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {citiesData.filter(c => c.stateSlug === location.slug).map((city) => (
                      <Link
                        key={city.slug}
                        href={`/locations/${city.region.toLowerCase().replace(/ /g, '-')}/${city.stateSlug}/${city.slug}`}
                        className="flex items-center gap-2 text-[14px] text-[#0B0F14]/65 transition-colors hover:text-[#0B6F7B]"
                      >
                        <MapPin className="h-3.5 w-3.5 text-[#4FC3D0]" />
                        {city.city}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Nationwide logistics framework (state only) */}
              {!isCity && (
                <NationwideLogisticsTable
                  heading={isEs ? `Marco de Distribución Nacional para ${location.city}` : `Nationwide Distribution Framework Serving ${location.city}`}
                  intro={isEs
                    ? `Los pedidos destinados a ${location.city} se envían a través de transportistas nacionales prioritarios desde nuestras instalaciones en EE. UU., evitando el procesamiento aduanero internacional.`
                    : `Orders bound for ${location.city} are shipped via priority domestic carriers from our U.S. facility, bypassing international customs processing.`}
                />
              )}

              {/* Local logistics (GEO content) */}
              {locData.logisticsDetails && (
                <div className="space-y-4">
                  <h3 className={`${H3} border-b border-[#E6EAF1] pb-4`}>
                    {isEs ? `Logística Mayorista Prioritaria para ${location.city}` : `Priority Wholesale Logistics to ${location.city}`}
                  </h3>
                  <p className="text-[15px] leading-[1.75] text-[#0B0F14]/70">
                    {linkifyText(locData.logisticsDetails, { excludeTerms: selfExcludeTerms, maxLinks: 3, usedHrefs: usedLinkHrefs })}
                  </p>
                </div>
              )}

              {/* Shipping info */}
              <div className={`${card} p-6 md:p-9`}>
                <div className="mb-8 flex items-start gap-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F3F5FA] text-[#0B6F7B]">
                    <Truck className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className={`${H3} mb-2`}>
                      {t('fastShippingTitle', { state: location.city })}
                    </h3>
                    <p className="text-[14px] leading-relaxed text-[#0B0F14]/60">
                      {t('fastShippingDesc', { city: location.city })}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {[
                    { icon: Package, label: t('shippingPoints.priority'), sub: t('shippingPoints.prioritySub', { city: location.city }) },
                    { icon: ShieldCheck, label: t('shippingPoints.discreet'), sub: t('shippingPoints.discreetSub') },
                    { icon: CheckCircle2, label: t('shippingPoints.noCustoms'), sub: t('shippingPoints.noCustomsSub') },
                  ].map((item, i) => (
                    <div key={i} className="flex flex-col justify-between rounded-[1rem] border border-[#E6EAF1] bg-[#F3F5FA] p-5">
                      <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#0B6F7B]">
                        <item.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-[14px] font-medium tracking-[-0.01em]">{item.label}</div>
                        <div className="mt-1 text-[12px] leading-relaxed text-[#0B0F14]/55">{item.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quality, compliance and testing standards (state only) */}
              {!isCity && <QualityStandardsSection locationSlug={location.slug} />}

              {/* SEO content: what we supply (state only) */}
              {!isCity && (
                <div className="space-y-6">
                  <h2 className={H2}>
                    {t('catTitle', { city: location.city })}
                  </h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {[
                      { cat: isEs ? 'Péptidos GLP-1 y Metabólicos' : 'GLP-1 & Metabolic Peptides', products: 'Semaglutide, Tirzepatide, Retatrutide, Cagrilintide' },
                      { cat: isEs ? 'Péptidos de Hormona de Crecimiento' : 'Growth Hormone Peptides', products: 'Ipamorelin, CJC-1295, Sermorelin, Tesamorelin, GHRP-2' },
                      { cat: isEs ? 'Curación y Recuperación' : 'Healing & Recovery', products: 'BPC-157, TB-500, KPV, LL37, B7-33' },
                      { cat: isEs ? 'Cognitivos y Nootrópicos' : 'Cognitive & Nootropic', products: 'Semax, Selank, Dihexa, DSIP, Adamax' },
                      { cat: isEs ? 'Antienvejecimiento y Longevidad' : 'Anti-Aging & Longevity', products: 'Epithalon, MOTS-c, NAD+, Thymalin, SS-31' },
                      { cat: isEs ? 'Cosméticos y Estéticos' : 'Cosmetic & Aesthetic', products: 'GHK-Cu, Snap-8, AOD9604, 5-AMINO-1MQ' },
                    ].map((item, i) => (
                      <div key={i} className={`${card} p-6`}>
                        <div className="flex items-start gap-4">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F3F5FA] text-[#0B6F7B]">
                            <FlaskConical className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="mb-1.5 text-[15px] font-medium tracking-[-0.01em]">{item.cat}</div>
                            <div className="flex flex-wrap gap-x-1 gap-y-0.5 text-[12.5px] leading-relaxed text-[#0B0F14]/55">
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
                                      <span className="font-medium">{prodName}</span>
                                    ) : (
                                      <Link href={href} className="font-medium transition-colors hover:text-[#0B6F7B] hover:underline">
                                        {prodName}
                                      </Link>
                                    )}
                                    {pIdx < arr.length - 1 && <span className="ml-0.5 text-[#0B0F14]/30">,</span>}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Compliance note */}
              <div className="flex gap-4 rounded-[1.25rem] border border-amber-500/20 bg-amber-500/5 p-6">
                <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
                <div>
                  <h4 className="mb-1.5 text-[15px] font-medium text-amber-800">{t('complianceTitle')}</h4>
                  <p className="text-[13px] leading-relaxed text-amber-950/65">
                    {t('complianceDesc', { city: location.city, state: location.state })}
                  </p>
                </div>
              </div>
                </>
              )}
            </div>

            {/* Right: sticky sidebar CTAs */}
            <div className="relative lg:col-span-4">
              <div className="space-y-4 lg:sticky lg:top-28">

                {/* Primary CTA card */}
                <div id="wholesale-inquiry" className="scroll-mt-28 rounded-[1.25rem] bg-[#0B0D10] p-6 text-white md:p-8">
                  <h3 className="mb-2 text-[1.4rem] font-light leading-tight tracking-[-0.03em]">
                    {t('contactTitle', { city: location.city })}
                  </h3>
                  <p className="mb-8 text-[13px] leading-relaxed text-white/55">
                    {t('contactDesc', { state: location.city })}
                  </p>

                  <div className="space-y-3">
                    <a
                      href={`https://wa.me/18433307365?text=${encodeURIComponent(t('whatsappMsg', { city: location.city, state: location.state }))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-center gap-2.5 rounded-full bg-[#4FC3D0] py-3.5 text-[13px] font-medium text-[#0B0F14] transition-colors hover:bg-[#6fd2dd]"
                    >
                      <Zap className="h-4 w-4" /> {t('whatsappCta')}
                    </a>

                    <div className="relative flex items-center py-1">
                      <div className="flex-grow border-t border-white/10"></div>
                      <span className="mx-4 flex-shrink-0 font-dm-mono text-[10px] uppercase tracking-[0.16em] text-white/35">{t('or')}</span>
                      <div className="flex-grow border-t border-white/10"></div>
                    </div>

                    <a
                      href={`mailto:sales@99puritywholesale.com?subject=${encodeURIComponent(t('emailSubject', { city: location.city, state: location.state }))}`}
                      className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/25 py-3.5 text-[13px] font-medium transition-colors hover:bg-white hover:text-[#0B0F14]"
                    >
                      <Mail className="h-4 w-4" /> {t('emailCta')}
                    </a>
                  </div>

                  <div className="mt-8 border-t border-white/10 pt-6 text-center">
                    <Link href="/products" className="inline-flex items-center gap-2 font-dm-mono text-[10px] uppercase tracking-[0.16em] text-white/80 transition-colors hover:text-white">
                      {t('viewCatalog')} <ArrowRight className="h-3.5 w-3.5 text-[#4FC3D0]" />
                    </Link>
                  </div>
                </div>

                {/* Quick info card */}
                {location.slug !== 'delaware' && (
                  <div className={`${card} p-6 md:p-8`}>
                    <h4 className="mb-5 font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/55">{t('accountDetails')}</h4>
                    <div>
                      {[
                        { label: t('details.moq'), value: t('details.moqVal') },
                        { label: t('details.purity'), value: t('details.purityVal') },
                        { label: t('details.fulfillment'), value: t('details.fulfillmentVal') },
                        { label: t('details.payment'), value: t('details.paymentVal') },
                        { label: t('details.shipping'), value: t('details.shippingVal') },
                        { label: t('details.buyers'), value: t('details.buyersVal') },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center justify-between gap-4 border-b border-[#E6EAF1] py-3 last:border-0">
                          <span className="font-dm-mono text-[10px] uppercase tracking-[0.14em] text-[#0B0F14]/45">{item.label}</span>
                          <span className="text-right text-[13px] font-medium leading-tight text-[#0B0F14]/85">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Apply CTA */}
                <div className="rounded-[1.25rem] border border-[#4FC3D0]/30 bg-[#4FC3D0]/10 p-6 text-center">
                  <p className="mb-5 text-[13px] leading-relaxed text-[#0B0F14]/65">{t('applyMsg')}</p>
                  <PillButton href="/wholesale-application" variant="outline" className="mx-auto">
                    {t('applyCta')}
                  </PillButton>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Related locations */}
      {location.slug !== 'united-states' && (
      <Section
        eyebrow={t('locations')}
        title={isCity ? (isEs ? `Ciudades Cercanas en ${location.state}` : `Nearby Cities in ${location.state}`) : t('otherRegions')}
        className="border-t border-[#E6EAF1] bg-white"
      >
        <CardGrid cols={4}>
          {isCity ? (
            citiesData
              .filter((c) => c.stateSlug === location.stateSlug && c.slug !== location.slug)
              .map((nearbyCity, idx: number) => (
                <Link key={idx} data-reveal href={`/locations/${location.region.toLowerCase().replace(/ /g, '-')}/${location.stateSlug}/${nearbyCity.slug}`} className="group rounded-[1.25rem] border border-[#E6EAF1] bg-[#F3F5FA] p-6 transition-colors duration-300 hover:border-[#4FC3D0] hover:bg-white">
                  <div className="mb-3 flex items-center gap-2 font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B6F7B]">
                    <MapPin className="h-3.5 w-3.5" />
                    {isEs ? 'Ciudad Cercana' : 'Nearby City'}
                  </div>
                  <div className="mb-4 text-[1.4rem] font-light tracking-[-0.03em]">{nearbyCity.city}</div>
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-[#0B0F14]/60 group-hover:text-[#0B0F14]">
                    {t('viewHub')} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                  </div>
                </Link>
              ))
          ) : (
            locationsData
              .filter((loc) => loc.slug !== targetSlug && loc.city !== loc.region)
              .slice(0, 4)
              .map((loc) => {
                const isRelatedCountry = loc.city === loc.region;
                const relatedCountrySlug = loc.region.toLowerCase().replace(/ /g, '-');
                const relatedPath = isRelatedCountry ? relatedCountrySlug : `${relatedCountrySlug}/${loc.slug}`;

                return (
                  <Link key={loc.slug} data-reveal href={`/locations/${relatedPath}`} className="group rounded-[1.25rem] border border-[#E6EAF1] bg-[#F3F5FA] p-6 transition-colors duration-300 hover:border-[#4FC3D0] hover:bg-white">
                    <div className="mb-3 flex items-center gap-2 font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B6F7B]">
                      <MapPin className="h-3.5 w-3.5" />
                      {isRelatedCountry ? t('nationalHub') : t('stateHub')}
                    </div>
                    <div className="mb-4 text-[1.4rem] font-light tracking-[-0.03em]">{loc.city}</div>
                    <div className="flex items-center gap-1.5 text-[13px] font-medium text-[#0B0F14]/60 group-hover:text-[#0B0F14]">
                      {t('viewHub')} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                    </div>
                  </Link>
                );
              })
          )}
        </CardGrid>
      </Section>
      )}

      {/* FAQ segment */}
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
    </PageShell>
  );
}
