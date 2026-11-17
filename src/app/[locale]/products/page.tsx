import React from 'react';
import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';
import { 
  ShieldCheck, 
  Truck, 
  Award, 
  Globe, 
  Zap, 
  Microscope, 
  Star, 
  FlaskConical 
} from 'lucide-react';
import productsData from '@/data/products.json';
import ProductDirectory from '@/components/products/ProductDirectory';
import ProductsCta from '@/components/products/ProductsCta';
import ProductFaq from '@/components/products/ProductFaq';
import { PageShell, PageHero, Section, CardGrid, InfoCard, Eyebrow, SplitHeading, RevealGroup, h2, card, WRAP } from '@/components/home/page-kit';
import { ArrowUpRight } from 'lucide-react';

export async function generateMetadata(props: any) {
  const params = props?.params || {};
  const locale = params?.locale || 'en';
  const t = await getTranslations({ locale, namespace: 'Meta' });
  return {
    title: t('productsTitle'),
    description: t('productsDesc'),
    openGraph: { title: t('productsTitle'), description: t('productsDesc') },
  
    alternates: {
      canonical: `https://99puritywholesale.com${locale === 'en' ? '/products' : `/${locale}/products`}`,
      languages: { 'en-US': '/products', es: '/es/products', 'x-default': '/products' },
    },
  };
}

const getCategoryIcon = (id: string) => {
  switch (id) {
    case 'metabolic-research': return Zap;
    case 'cognitive-function': return Microscope;
    case 'sleep-cycle-investigation': return ShieldCheck;
    case 'growth-factor-research': return Award;
    case 'recovery-research': return Star;
    case 'cellular-health-research': return FlaskConical;
    case 'aminos': return Globe;
    case 'essentials': return Truck;
    default: return FlaskConical;
  }
};

export default async function ProductsPage({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'ProductsIndex' });

  const categoryIds = [
    'metabolic-research',
    'cognitive-function',
    'sleep-cycle-investigation',
    'growth-factor-research',
    'recovery-research',
    'cellular-health-research',
    'aminos',
    'essentials'
  ];

  const categories = categoryIds.map(id => ({
    id,
    name: t(`categories.${id}.name`),
    description: t(`categories.${id}.desc`),
    longDesc: t(`categories.${id}.longDesc`),
    compounds: t(`categories.${id}.compounds`),
    icon: getCategoryIcon(id)
  }));

  // Strip icon components for Client Component boundary
  const categoriesForDirectory = categories.map(({ icon, ...rest }) => rest);

  const faqs = t.raw('faqs') as { q: string; a: string }[];

  // FAQ JSON-LD is emitted by the <FaqSection> below (which renders this same faqs array) — no separate script here.

  return (
    <PageShell>
      <PageHero
        eyebrow="Institutional Sourcing Catalog"
        title={t('title')}
        intro={t('subtitle')}
      />

      {/* MOQ / wholesale info */}
      <section className="pb-4">
        <div className={WRAP}>
          <CardGrid cols={3}>
            <InfoCard icon={<ShieldCheck className="h-4 w-4" />} title={t('moqTitle')}>{t('moqText')}</InfoCard>
            <InfoCard icon={<Truck className="h-4 w-4" />} title="Nationwide Fulfillment">Secure 50-state U.S. priority logistics</InfoCard>
            <InfoCard icon={<Award className="h-4 w-4" />} title="Purity Guaranteed">Batch-matched COA and HPLC verification</InfoCard>
          </CardGrid>
        </div>
      </section>

      {/* Search directory */}
      <section className="pb-16 pt-16 md:pb-24 md:pt-24">
        <div className={WRAP}>
          <div className="mb-10 max-w-3xl md:mb-12">
            <Eyebrow className="mb-5">laboratory procurement terminal</Eyebrow>
            <SplitHeading text="Instant Compound Discovery" className={h2} />
          </div>
        </div>
        <div className="min-h-[400px]">
          <React.Suspense fallback={
            <div className="flex items-center justify-center py-20">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#4FC3D0]/20 border-t-[#4FC3D0]"></div>
            </div>
          }>
            <ProductDirectory products={productsData} categories={categoriesForDirectory} />
          </React.Suspense>
        </div>
      </section>

      {/* Categories library */}
      <Section
        eyebrow="RESEARCH LIBRARY"
        title="Product Categories"
        description="Explore our specialized catalog of domestic-manufactured research compounds verified for purity."
      >
        <RevealGroup className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {categories.map((cat) => (
            <Link key={cat.id} data-reveal href={`/products/${cat.id}`} id={cat.id} className={`${card} group flex min-h-[320px] scroll-mt-32 flex-col justify-between p-7 transition-shadow duration-500 hover:shadow-[0_24px_60px_rgba(11,15,20,0.08)] md:p-8`}>
              <div>
                <div className="mb-6 flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F3F5FA] text-[#0B6F7B]">
                    <cat.icon className="h-5 w-5" />
                  </span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0B0F14] text-white transition-colors duration-300 group-hover:bg-[#4FC3D0] group-hover:text-[#0B0F14]">
                    <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:rotate-45" />
                  </span>
                </div>
                <h3 className="mb-3 text-[1.35rem] font-normal leading-tight tracking-[-0.03em]">{cat.name}</h3>
                <p className="line-clamp-4 text-[13.5px] leading-relaxed text-[#0B0F14]/60">{cat.longDesc}</p>
              </div>
              <div className="mt-6 border-t border-[#E6EAF1] pt-4">
                <span className="mb-1.5 block font-dm-mono text-[9px] uppercase tracking-[0.18em] text-[#0B0F14]/40">Compounds</span>
                <p className="line-clamp-1 text-[12px] text-[#0B0F14]/60">{cat.compounds}</p>
              </div>
            </Link>
          ))}
        </RevealGroup>
      </Section>

      <ProductFaq
        title="Peptide Sourcing FAQ"
        subtitle="Essential information for clinical directors and research procurement teams regarding bulk compound sourcing."
        items={faqs}
        eyebrow="PRODUCTS FAQ"
      />

      <ProductsCta
        eyebrow="Institutional Sourcing"
        title="Bulk Sourcing Redefined"
        description="Access tiered pricing, verified purity, and priority domestic fulfillment for your research institution or clinical practice."
        primary={{ label: 'WhatsApp Sales', href: 'https://wa.me/18433307365', external: true }}
        secondary={{ label: 'Wholesale Application', href: '/wholesale-application' }}
      />
    </PageShell>
  );
}
