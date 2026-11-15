import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { ArrowRight, ArrowUpRight, Download, Zap, Microscope, ShieldCheck, Award, Star, FlaskConical, Globe, Truck, Quote, type LucideIcon } from 'lucide-react';
import productsData from '@/data/products.json';
import GlobalCTA from '@/components/layout/GlobalCTA';
import FaqSection from '@/components/shared/FaqSection';
import HomeHero from '@/components/home/HomeHero';
import Marquee from '@/components/home/Marquee';
import Manifesto from '@/components/home/Manifesto';
import CountUp from '@/components/home/CountUp';
import ProductShowcase from '@/components/home/ProductShowcase';
import QualityPipeline from '@/components/home/QualityPipeline';
import FxCard from '@/components/home/FxCard';
import ScrollProgress from '@/components/home/ScrollProgress';
import { RevealGroup, SplitHeading } from '@/components/home/Reveal';

type BestSellerItem = { name: string; spec: string; desc: string };
type TierItem = { name: string; label: string; kits: string; description: string };
type TestimonialItem = { quote: string; role: string; location: string };
type ServiceItem = { title: string; desc: string };
type BlogItem = { slug: string; title: string; desc: string; tag: string };
type FaqItem = { q: string; a: string };
type StepItem = { title: string; desc: string };
type TierKey = 'starter' | 'tier1' | 'tier2' | 'tier3';
type ServiceKey = 'dropshipping' | 'privateLabel' | 'launch' | 'web';

const WHATSAPP = 'https://wa.me/18433307365';

const eyebrowDark = 'font-dm-mono text-[10px] uppercase tracking-[0.32em] text-[#4FC3D0]';
const eyebrowLight = 'font-dm-mono text-[10px] uppercase tracking-[0.32em] text-[#090C11]/50';
const h2Base = 'font-absans font-bold uppercase leading-[0.96] tracking-tighter text-[clamp(2rem,4.4vw,4.6rem)]';

const BEST_SELLER_SLUGS = ['semaglutide', 'tirzepatide', 'retatrutide', 'bpc-157', 'tb-500', 'ipamorelin', 'cjc-1295-ipam', 'nad', 'epithalon'];
const BEST_SELLER_CATS = ['metabolic-research', 'metabolic-research', 'metabolic-research', 'recovery-research', 'recovery-research', 'growth-factor-research', 'growth-factor-research', 'cellular-health-research', 'metabolic-research'];
const BEST_SELLER_IMAGES: Record<string, string> = {
  semaglutide: '/product-images/SEMAGLUTIDE 5mg-2.webp',
  tirzepatide: '/product-images/TIRZEPATIDE 10mg-3.webp',
  retatrutide: '/product-images/RETATRUTIDE 10mg-6.webp',
  'bpc-157': '/product-images/BPC-157 5mg-5.webp',
  'tb-500': '/product-images/TB-500  5mg-2.webp',
  ipamorelin: '/product-images/IPAMORELIN 5mg-2.webp',
  'cjc-1295-ipam': '/product-images/CJC 1295 IPAMORELIN 5mg 5mg-2.webp',
  nad: '/product-images/nad-plus-500mg-1.webp',
  epithalon: '/product-images/EPITHALON 10mg.webp',
};

const CATEGORIES: Array<{ id: string; icon: LucideIcon }> = [
  { id: 'metabolic-research', icon: Zap },
  { id: 'cognitive-function', icon: Microscope },
  { id: 'sleep-cycle-investigation', icon: ShieldCheck },
  { id: 'growth-factor-research', icon: Award },
  { id: 'recovery-research', icon: Star },
  { id: 'cellular-health-research', icon: FlaskConical },
  { id: 'aminos', icon: Globe },
  { id: 'essentials', icon: Truck },
];

const TIER_KEYS: TierKey[] = ['starter', 'tier1', 'tier2', 'tier3'];
const TIER_FILL = [25, 50, 75, 100];
const SERVICE_KEYS: ServiceKey[] = ['dropshipping', 'privateLabel', 'launch', 'web'];
const QUALITY_DOWNLOADS = [
  { key: 'bpc', name: 'BPC-157' },
  { key: 'sema', name: 'Semaglutide' },
  { key: 'tirz', name: 'Tirzepatide' },
] as const;

function splitLast(text: string) {
  const parts = text.trim().split(/\s+/);
  const accent = parts.length > 1 ? parts[parts.length - 1] : '';
  return { lead: parts.slice(0, parts.length > 1 ? -1 : undefined).join(' '), accent };
}

export async function generateMetadata(props: any) {
  const params = props?.params || {};
  const locale = params?.locale || 'en';
  const t = await getTranslations({ locale, namespace: 'Meta' });
  return {
    title: t('homeTitle'),
    description: t('homeDesc'),
    alternates: {
      canonical: `https://99puritywholesale.com${locale === 'en' ? '/' : `/${locale}`}`,
    },
  };
}

export default async function HomePage({ params }: { params: { locale: string } }) {
  const t = await getTranslations({ locale: params.locale, namespace: 'Index' });
  const pt = await getTranslations({ locale: params.locale, namespace: 'ProductsIndex' });

  const bestSellers = t.raw('BestSellers.items') as BestSellerItem[];
  const showcaseItems = bestSellers.slice(0, 9).map((p, i) => ({
    slug: BEST_SELLER_SLUGS[i],
    name: p.name,
    spec: p.spec,
    desc: p.desc,
    img: BEST_SELLER_IMAGES[BEST_SELLER_SLUGS[i]],
    category: pt(`categories.${BEST_SELLER_CATS[i]}.name`),
  }));
  const showcaseTitle = splitLast(t('BestSellers.title'));

  const marqueeItems = [
    ...bestSellers.map((p) => p.name),
    t('Hero.badges.purity'),
    t('Hero.badges.tested'),
    t('Hero.badges.usMade'),
    t('Hero.badges.b2b'),
  ];

  const heroRing = [t('Hero.badges.b2b'), t('Hero.badges.usMade'), t('Hero.badges.purity')].join(' • ').toUpperCase() + ' • ';

  const tiers = t.raw('Tiers.items') as Record<TierKey, TierItem>;
  const services = t.raw('Services.items') as Record<ServiceKey, ServiceItem>;
  const testimonials = t.raw('Testimonials.items') as TestimonialItem[];
  const blogItems = t.raw('Blog.items') as BlogItem[];
  const steps = t.raw('Experience.steps') as StepItem[];
  const scaleLines = t('Services.scaleTitle').split(/<br\s*\/?>/i).map((s) => s.trim());

  const stats: Array<{ id: 'compounds' | 'purity' | 'clients' | 'coverage'; node: React.ReactNode }> = [
    { id: 'compounds', node: <CountUp value={50} suffix="+" /> },
    { id: 'purity', node: <CountUp value={99} suffix="%+" /> },
    { id: 'clients', node: <span>COA</span> },
    { id: 'coverage', node: <CountUp value={50} /> },
  ];

  return (
    <div data-gsap-owned className="relative overflow-x-clip bg-[#090C11] text-[#EDF2F7] selection:bg-[#4FC3D0]/30">
      <noscript>
        <style>{'.hero-in{opacity:1!important}.hero-word{opacity:1!important}.hero-img-wrap{clip-path:none!important}'}</style>
      </noscript>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: '99 Purity Wholesale',
            url: 'https://99puritywholesale.com',
          }),
        }}
      />
      <ScrollProgress />

      {/* 01 — HERO */}
      <HomeHero
        badge={t('Hero.authorized')}
        title={t('Hero.title')}
        subtitle={t('Hero.subtitle')}
        primaryCta={t('Hero.primaryCta')}
        primaryHref="/wholesale-application"
        secondaryCta={t('Hero.secondaryCta')}
        secondaryHref="/products"
        imageAlt={t('Hero.badge')}
        ringText={heroRing}
        chips={[
          { value: '≥99%', label: t('StatsBar.purity.label') },
          { value: 'HPLC · MS', label: t('Hero.badges.tested') },
          { value: 'COA', label: t('StatsBar.clients.sub') },
        ]}
        stats={[
          { value: '99%+', label: t('Hero.badges.purity'), icon: 'purity' },
          { value: 'HPLC / MS', label: t('Hero.badges.tested'), icon: 'tested' },
          { value: t('Hero.badges.usMade'), label: t('Hero.badges.b2b'), icon: 'b2b' },
          { value: t('Hero.badges.states'), label: t('StatsBar.coverage.sub'), icon: 'origin' },
        ]}
        scrollLabel={t('Experience.scroll')}
        disclaimer={t('Experience.disclaimer')}
      />

      {/* 02 — MARQUEE */}
      <div className="relative z-10 border-y border-[#090C11]/10 bg-[#4FC3D0] py-5 text-[#090C11] md:py-6">
        <Marquee items={marqueeItems} itemClassName="font-absans text-xl font-bold uppercase tracking-tight md:text-3xl" />
      </div>

      {/* 03 — MANIFESTO + SPEC SHEET */}
      <section className="relative bg-[#090C11] px-6 pb-24 pt-28 md:pb-32 md:pt-44 lg:px-12">
        <div aria-hidden className="home-grid-bg pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative mx-auto max-w-[1500px]">
          <div className="mb-10 flex items-center gap-3 md:mb-14">
            <span className="h-px w-10 bg-[#4FC3D0]/60" />
            <span className={eyebrowDark}>{t('Differentiators.institutionalStandard')}</span>
          </div>
          <Manifesto
            text={t('Experience.manifesto')}
            highlights={t.raw('Experience.manifestoHighlights') as string[]}
            className="max-w-[1250px] font-absans text-[clamp(1.75rem,3.9vw,4rem)] font-bold leading-[1.08] tracking-tight"
          />

          <RevealGroup className="mt-20 grid grid-cols-2 border-t border-white/10 lg:mt-28 lg:grid-cols-4">
            {stats.map((s, i) => (
              <div key={s.id} data-reveal className={`border-b border-white/10 py-9 pr-4 lg:py-12 ${i % 2 === 1 ? 'pl-6 border-l' : ''} ${i >= 2 ? 'lg:border-l lg:pl-8' : ''} ${i === 1 ? 'lg:border-l lg:pl-8' : ''}`}>
                <div className="font-dm-mono text-[10px] uppercase tracking-[0.28em] text-[#EDF2F7]/40">{t(`StatsBar.${s.id}.label`)}</div>
                <div className="mt-4 font-absans text-[clamp(2.6rem,5.4vw,5.6rem)] font-bold leading-none tracking-tight">{s.node}</div>
                <div className="mt-4 font-dm-mono text-[9px] uppercase tracking-[0.22em] text-[#4FC3D0]">{t(`StatsBar.${s.id}.sub`)}</div>
              </div>
            ))}
          </RevealGroup>

          <RevealGroup className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3 lg:mt-20">
            {(['lab', 'coa', 'support'] as const).map((k, i) => (
              <div key={k} data-reveal>
                <FxCard tilt={5} className="group h-full rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-8 transition-colors duration-500 hover:border-[#4FC3D0]/40 lg:p-10">
                  <div className="relative z-10">
                    <div className="mb-14 flex items-center justify-between">
                      <span className="font-dm-mono text-[10px] tracking-[0.3em] text-[#EDF2F7]/35">{String(i + 1).padStart(2, '0')}</span>
                      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-[#EDF2F7]/50 transition-all duration-500 group-hover:rotate-45 group-hover:border-[#4FC3D0] group-hover:bg-[#4FC3D0] group-hover:text-[#090C11]">
                        <ArrowUpRight className="h-4 w-4" />
                      </span>
                    </div>
                    <h3 className="mb-3 font-absans text-2xl font-bold uppercase tracking-tight lg:text-3xl">{t(`Differentiators.${k}.title`)}</h3>
                    <p className="font-archia text-sm leading-relaxed text-[#EDF2F7]/50">{t(`Differentiators.${k}.description`)}</p>
                  </div>
                </FxCard>
              </div>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* 04 — PINNED HORIZONTAL PRODUCT SHOWCASE */}
      <ProductShowcase
        eyebrow={t('BestSellers.badge')}
        titleLead={showcaseTitle.lead}
        titleAccent={showcaseTitle.accent}
        subtitle={t('BestSellers.subtitle')}
        items={showcaseItems}
        labels={{
          viewSpecs: t('BestSellers.viewSpecs'),
          technicalGrade: t('BestSellers.technicalGrade'),
          verifiedPurity: t('BestSellers.verifiedPurity'),
          browseAll: t('BestSellers.browseAll', { count: productsData.length }),
          hint: t('Experience.drag'),
        }}
      />

      {/* 05 — CATEGORY BENTO */}
      <section className="relative bg-[#090C11] px-6 py-24 md:py-40 lg:px-12">
        <div className="mx-auto max-w-[1500px]">
          <div className="mb-14 flex flex-col justify-between gap-8 lg:mb-20 lg:flex-row lg:items-end">
            <div className="max-w-4xl">
              <div className="mb-6 flex items-center gap-3">
                <span className="h-px w-10 bg-[#4FC3D0]/60" />
                <span className={eyebrowDark}>{t('Categories.badge')}</span>
              </div>
              <SplitHeading text={t('Categories.title')} className={h2Base} accentWords={['Compounds', 'Compuestos']} accentClassName="text-[#4FC3D0]" />
            </div>
            <div className="max-w-md">
              <p className="mb-8 font-archia text-base leading-relaxed text-[#EDF2F7]/50">{t('Categories.subtitle')}</p>
              <Link href="/products" className="group inline-flex items-center gap-4 rounded-full border border-white/15 px-8 py-4 text-[10px] font-bold uppercase tracking-[0.28em] transition-all hover:border-[#4FC3D0] hover:bg-[#4FC3D0] hover:text-[#090C11]">
                {t('Categories.cta')}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </div>

          <RevealGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            {CATEGORIES.map((cat, i) => {
              const Icon = cat.icon;
              const featured = i === 0;
              return (
                <div key={cat.id} data-reveal className={featured ? 'sm:col-span-2' : ''}>
                  <FxCard className={`group h-full rounded-[1.75rem] border border-white/10 bg-white/[0.025] transition-colors duration-500 hover:border-[#4FC3D0]/45 ${featured ? 'min-h-[340px]' : 'min-h-[300px]'}`}>
                    <Link href={`/products#${cat.id}`} className="relative z-10 flex h-full min-h-[inherit] flex-col justify-between p-8 lg:p-9">
                      <div className="flex items-start justify-between">
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-[#4FC3D0] transition-all duration-500 group-hover:scale-110 group-hover:bg-[#4FC3D0] group-hover:text-[#090C11]">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="font-dm-mono text-[10px] tracking-[0.3em] text-[#EDF2F7]/30">{String(i + 1).padStart(2, '0')}</span>
                      </div>
                      <div>
                        <h4 className={`mb-3 font-absans font-bold leading-[1.02] tracking-tight ${featured ? 'text-3xl lg:text-4xl' : 'text-2xl'}`}>{pt(`categories.${cat.id}.name`)}</h4>
                        <p className={`mb-6 font-archia text-sm leading-relaxed text-[#EDF2F7]/45 transition-colors group-hover:text-[#EDF2F7]/70 ${featured ? 'max-w-md' : 'line-clamp-3'}`}>{pt(`categories.${cat.id}.desc`)}</p>
                        <span className="flex items-center gap-3 font-dm-mono text-[9px] uppercase tracking-[0.24em] text-[#EDF2F7]/40 transition-colors group-hover:text-[#4FC3D0]">
                          <span className="h-px w-6 bg-current transition-all duration-500 group-hover:w-12" />
                          {t('Categories.exploreSeries')}
                        </span>
                      </div>
                    </Link>
                  </FxCard>
                </div>
              );
            })}

            <div data-reveal className="sm:col-span-2 lg:col-span-3">
              <Link href="/products" className="group relative flex h-full min-h-[300px] flex-col justify-between overflow-hidden rounded-[1.75rem] bg-[#4FC3D0] p-8 text-[#090C11] lg:p-9">
                <span aria-hidden className="pointer-events-none absolute -right-10 -top-16 font-goku text-[16rem] font-bold leading-none text-[#090C11]/[0.07] transition-transform duration-700 group-hover:scale-110">99</span>
                <FlaskConical className="relative h-9 w-9" />
                <div className="relative">
                  <h4 className="mb-3 font-absans text-3xl font-bold uppercase leading-none tracking-tighter lg:text-5xl">{t('Categories.fullCatalog')}</h4>
                  <p className="mb-8 max-w-md font-archia text-sm leading-relaxed text-[#090C11]/70">{t('Categories.fullCatalogDesc')}</p>
                  <span className="inline-flex items-center gap-4 rounded-full bg-[#090C11] px-7 py-4 text-[10px] font-bold uppercase tracking-[0.26em] text-white transition-all duration-500 group-hover:gap-7">
                    {t('Categories.accessCatalog')}
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            </div>
          </RevealGroup>
        </div>
      </section>

      {/* 06 — QUALITY: PINNED, SCROLL-DRAWN CHROMATOGRAM */}
      <section className="relative">
        <QualityPipeline
          eyebrow={t('Experience.pipelineEyebrow')}
          title={t('Quality.title')}
          description={t('Quality.description')}
          cta={t('Quality.cta')}
          ctaHref="/certificates-of-analysis"
          caption={t('Experience.pipelineTitle')}
          illustrative={t('Experience.illustrative')}
          specLabel={t('Experience.spec')}
          specValue={t('Experience.specValue')}
          steps={steps}
        />
        <div className="relative bg-[#070A0F] px-6 pb-24 lg:px-12 lg:pb-32">
          <RevealGroup className="mx-auto grid max-w-[1500px] grid-cols-1 gap-4 md:grid-cols-3 lg:gap-5">
            {QUALITY_DOWNLOADS.map((d) => (
              <a
                key={d.key}
                data-reveal
                href={`${WHATSAPP}?text=${encodeURIComponent(`Hi, I'd like to request the batch COA report for ${d.name}.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative flex items-center justify-between gap-4 overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-6 transition-colors duration-500 hover:border-[#4FC3D0]/50 lg:p-8"
              >
                <span className="absolute inset-0 -translate-x-full bg-[#4FC3D0]/[0.07] transition-transform duration-700 ease-out group-hover:translate-x-0" />
                <span className="relative">
                  <span className="mb-2 block font-dm-mono text-[9px] uppercase tracking-[0.28em] text-[#4FC3D0]">{t('Quality.batchReport')}</span>
                  <span className="block font-absans text-lg font-bold uppercase leading-tight tracking-tight sm:text-xl">{t(`Quality.downloads.${d.key}`)}</span>
                </span>
                <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/15 transition-all duration-500 group-hover:border-[#4FC3D0] group-hover:bg-[#4FC3D0] group-hover:text-[#090C11]">
                  <Download className="h-5 w-5" />
                </span>
              </a>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* 07 — WHOLESALE TIERS */}
      <section id="wholesale-tiers" className="relative bg-[#EDF2F7] px-6 py-24 text-[#090C11] md:py-40 lg:px-12">
        <div className="mx-auto max-w-[1500px]">
          <div className="mx-auto mb-16 max-w-4xl text-center lg:mb-24">
            <div className="mb-6 flex items-center justify-center gap-3">
              <span className="h-px w-10 bg-[#090C11]/25" />
              <span className={eyebrowLight}>{t('Tiers.badge')}</span>
              <span className="h-px w-10 bg-[#090C11]/25" />
            </div>
            <SplitHeading text={t('Tiers.title')} className={h2Base} />
            <p className="mx-auto mt-8 max-w-2xl font-archia text-base leading-relaxed text-[#090C11]/55">{t('Tiers.description')}</p>
          </div>

          <RevealGroup className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
            {TIER_KEYS.map((key, i) => {
              const tier = tiers[key];
              const premium = i >= 2;
              return (
                <div key={key} data-reveal className="h-full [perspective:1000px]">
                  <FxCard
                    tilt={6}
                    spot={premium ? 'rgba(79,195,208,0.22)' : 'rgba(27,127,140,0.14)'}
                    className={`group flex h-full flex-col rounded-[2rem] border p-8 transition-shadow duration-500 lg:p-9 ${
                      premium ? 'border-white/10 bg-[#090C11] text-white hover:shadow-[0_40px_90px_rgba(9,12,17,0.4)]' : 'border-[#090C11]/10 bg-white hover:shadow-[0_40px_90px_rgba(9,12,17,0.1)]'
                    }`}
                  >
                    <div className="relative z-10 flex h-full flex-col">
                      <div className="mb-10 flex items-start justify-between">
                        <span className={`font-dm-mono text-[10px] uppercase tracking-[0.28em] ${premium ? 'text-white/40' : 'text-[#090C11]/45'}`}>{tier.label}</span>
                        {i === 3 && <span className="rounded-full border border-[#4FC3D0]/50 bg-[#4FC3D0]/10 px-3 py-1 font-dm-mono text-[9px] uppercase tracking-[0.2em] text-[#4FC3D0]">{t('Tiers.bestValue')}</span>}
                      </div>
                      <div className="mb-2 font-absans text-5xl font-bold uppercase leading-none tracking-tighter">{tier.name}</div>
                      <div className={`mb-6 font-dm-mono text-xs uppercase tracking-[0.2em] ${premium ? 'text-[#4FC3D0]' : 'text-[#1B7F8C]'}`}>{tier.kits}</div>
                      <div className={`mb-8 h-1 w-full overflow-hidden rounded-full ${premium ? 'bg-white/10' : 'bg-[#090C11]/10'}`}>
                        <div className={`h-full rounded-full ${premium ? 'bg-[#4FC3D0]' : 'bg-[#1B7F8C]'}`} style={{ width: `${TIER_FILL[i]}%` }} />
                      </div>
                      <p className={`flex-grow font-archia text-sm leading-relaxed ${premium ? 'text-white/50' : 'text-[#090C11]/55'}`}>{tier.description}</p>
                      <a
                        href={`${WHATSAPP}?text=${encodeURIComponent(`Hi, I'd like to learn about wholesale tier ${tier.name} pricing.`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`group/btn mt-10 flex items-center justify-between rounded-full px-6 py-4 text-[10px] font-bold uppercase tracking-[0.24em] transition-all duration-300 ${
                          premium ? 'bg-[#4FC3D0] text-[#090C11] hover:bg-white' : 'bg-[#090C11] text-white hover:bg-[#1B7F8C]'
                        }`}
                      >
                        {t('Tiers.getPricng')}
                        <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover/btn:rotate-45" />
                      </a>
                    </div>
                  </FxCard>
                </div>
              );
            })}
          </RevealGroup>
          <p className="mx-auto mt-12 max-w-3xl text-center font-dm-mono text-[10px] uppercase leading-relaxed tracking-[0.2em] text-[#090C11]/40">{t('Tiers.onRequests')}</p>
        </div>
      </section>

      {/* 08 — TESTIMONIALS */}
      <section id="testimonials" className="relative bg-[#090C11] px-6 py-24 md:py-40 lg:px-12">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-[28rem] w-[60rem] -translate-x-1/2 rounded-full bg-[#4FC3D0]/[0.07] blur-[140px]" />
        <div className="relative mx-auto max-w-[1500px]">
          <div className="mb-14 max-w-4xl lg:mb-20">
            <div className="mb-6 flex items-center gap-3">
              <span className="h-px w-10 bg-[#4FC3D0]/60" />
              <span className={eyebrowDark}>{t('Testimonials.badge')}</span>
            </div>
            <SplitHeading text={t('Testimonials.title')} className={h2Base} />
          </div>

          <RevealGroup className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {testimonials.map((test, i) => (
              <div key={i} data-reveal className="h-full">
                <FxCard tilt={4} className="group flex h-full min-h-[420px] flex-col rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 transition-colors duration-500 hover:border-[#4FC3D0]/40 lg:p-11">
                  <div className="relative z-10 flex h-full flex-col">
                    <Quote className="mb-8 h-10 w-10 text-[#4FC3D0]/70 transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110" />
                    <p className="flex-grow font-archia text-lg leading-relaxed text-[#EDF2F7]/85 md:text-xl">&ldquo;{test.quote}&rdquo;</p>
                    <div className="mt-10 border-t border-white/10 pt-6">
                      <h4 className="mb-2 font-absans text-lg font-bold uppercase tracking-tight">{test.role}</h4>
                      <div className="flex items-center gap-3 font-dm-mono text-[10px] uppercase tracking-[0.2em]">
                        <span className="text-[#4FC3D0]">{test.location}</span>
                        <span className="h-1 w-1 rounded-full bg-white/25" />
                        <span className="text-[#EDF2F7]/40">{t('Testimonials.verifiedClient')}</span>
                      </div>
                    </div>
                  </div>
                </FxCard>
              </div>
            ))}
          </RevealGroup>

          <div className="mt-16 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 border-t border-white/10 pt-10 lg:justify-between">
            {(t.raw('Testimonials.institutionalTrust') as string[]).map((badge) => (
              <span key={badge} className="flex items-center gap-3 font-dm-mono text-[10px] uppercase tracking-[0.26em] text-[#EDF2F7]/45">
                <span className="h-1.5 w-1.5 rotate-45 bg-[#4FC3D0]" />
                {badge}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 09 — PARTNER SERVICES */}
      <section className="relative bg-[#EDF2F7] px-6 py-24 text-[#090C11] md:py-40 lg:px-12">
        <div className="mx-auto max-w-[1500px]">
          <div className="mb-14 flex flex-col justify-between gap-8 lg:mb-20 lg:flex-row lg:items-end">
            <div className="max-w-4xl">
              <div className="mb-6 flex items-center gap-3">
                <span className="h-px w-10 bg-[#090C11]/25" />
                <span className={eyebrowLight}>{t('Services.badge')}</span>
              </div>
              <SplitHeading text={t('Services.title')} className={h2Base} />
            </div>
            <p className="max-w-md border-l-2 border-[#4FC3D0] pl-6 font-archia text-base leading-relaxed text-[#090C11]/60">{t('Services.description')}</p>
          </div>

          <RevealGroup className="border-t border-[#090C11]/15">
            {SERVICE_KEYS.map((key, i) => {
              const s = services[key];
              const benefits = t.raw(`Services.benefits.${key}`) as string[];
              return (
                <Link
                  key={key}
                  data-reveal
                  href="/services"
                  className="group relative grid grid-cols-12 items-center gap-x-4 gap-y-5 overflow-hidden border-b border-[#090C11]/15 px-1 py-9 transition-all duration-500 hover:px-6 lg:py-12"
                >
                  <span className="absolute inset-0 origin-bottom scale-y-0 bg-[#090C11] transition-transform duration-500 ease-out group-hover:scale-y-100" />
                  <span className="relative col-span-2 font-dm-mono text-xs tracking-[0.3em] text-[#090C11]/40 transition-colors duration-500 group-hover:text-[#4FC3D0] lg:col-span-1">{String(i + 1).padStart(2, '0')}</span>
                  <h4 className="relative col-span-10 font-absans text-[clamp(1.6rem,3.2vw,3.2rem)] font-bold uppercase leading-none tracking-tighter transition-colors duration-500 group-hover:text-white lg:col-span-5">{s.title}</h4>
                  <div className="relative col-span-12 transition-colors duration-500 lg:col-span-5">
                    <p className="mb-4 max-w-md font-archia text-sm leading-relaxed text-[#090C11]/55 transition-colors duration-500 group-hover:text-white/60">{s.desc}</p>
                    <ul className="flex flex-wrap gap-2">
                      {benefits.map((b) => (
                        <li key={b} className="rounded-full border border-[#090C11]/15 px-3 py-1 font-dm-mono text-[9px] uppercase tracking-[0.16em] text-[#090C11]/50 transition-colors duration-500 group-hover:border-white/20 group-hover:text-white/60">
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <span className="relative col-span-12 hidden h-12 w-12 items-center justify-center justify-self-end rounded-full border border-[#090C11]/20 transition-all duration-500 group-hover:rotate-45 group-hover:border-[#4FC3D0] group-hover:bg-[#4FC3D0] group-hover:text-[#090C11] lg:col-span-1 lg:flex">
                    <ArrowUpRight className="h-5 w-5" />
                  </span>
                </Link>
              );
            })}
          </RevealGroup>

          <RevealGroup className="mt-16 lg:mt-24">
            <div data-reveal className="relative overflow-hidden rounded-[2.5rem] bg-[#090C11] p-8 text-white md:p-16 lg:p-20">
              <svg aria-hidden viewBox="0 0 400 400" fill="none" className="home-spin pointer-events-none absolute -right-24 top-1/2 h-[34rem] w-[34rem] -translate-y-1/2 opacity-[0.12]">
                <circle cx="200" cy="200" r="180" stroke="#4FC3D0" strokeWidth="1" strokeDasharray="10 10" />
                <circle cx="200" cy="200" r="140" stroke="white" strokeWidth="0.5" />
                <circle cx="200" cy="200" r="100" stroke="#4FC3D0" strokeWidth="2" strokeDasharray="5 5" />
              </svg>
              <div className="relative grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
                <div>
                  <h3 className="mb-6 font-absans text-[clamp(2.2rem,4.8vw,5rem)] font-bold uppercase leading-[0.95] tracking-tighter">
                    {scaleLines.map((line, i) => (
                      <span key={i} className={`block ${i > 0 ? 'text-[#4FC3D0]' : ''}`}>
                        {line}
                      </span>
                    ))}
                  </h3>
                  <p className="max-w-md font-archia text-base leading-relaxed text-white/50">{t('Services.scaleSubtitle')}</p>
                </div>
                <div className="flex flex-col gap-4 sm:flex-row lg:justify-end">
                  <Link href="/services" className="group flex items-center justify-center gap-4 rounded-full bg-[#4FC3D0] px-9 py-5 text-[11px] font-bold uppercase tracking-[0.2em] text-[#090C11] transition-all hover:bg-white">
                    {t('Services.guide')}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                  <Link href="/wholesale-application" className="group flex items-center justify-center gap-4 rounded-full border border-white/20 px-9 py-5 text-[11px] font-bold uppercase tracking-[0.2em] transition-all hover:border-white hover:bg-white hover:text-[#090C11]">
                    {t('Services.wholesaleApp')}
                    <ArrowUpRight className="h-4 w-4 transition-transform group-hover:rotate-45" />
                  </Link>
                </div>
              </div>
            </div>
          </RevealGroup>
        </div>
      </section>

      {/* 10 — INSIGHTS */}
      <section className="relative bg-[#090C11] px-6 py-24 md:py-40 lg:px-12">
        <div className="mx-auto max-w-[1500px]">
          <div className="mb-14 flex flex-col justify-between gap-8 lg:mb-20 lg:flex-row lg:items-end">
            <div className="max-w-4xl">
              <div className="mb-6 flex items-center gap-3">
                <span className="h-px w-10 bg-[#4FC3D0]/60" />
                <span className={eyebrowDark}>{t('Blog.badge')}</span>
              </div>
              <SplitHeading text={t('Blog.title')} className={h2Base} />
            </div>
            <Link href="/blog" className="group inline-flex items-center gap-4 self-start rounded-full border border-white/15 px-8 py-4 text-[10px] font-bold uppercase tracking-[0.28em] transition-all hover:border-[#4FC3D0] hover:bg-[#4FC3D0] hover:text-[#090C11] lg:self-auto">
              {t('Blog.cta')}
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:rotate-45" />
            </Link>
          </div>

          <RevealGroup className="border-t border-white/10">
            {blogItems.map((post, i) => (
              <Link key={post.slug} data-reveal href={`/blog/${post.slug}`} className="group relative grid grid-cols-12 items-center gap-x-4 gap-y-4 border-b border-white/10 py-8 transition-all duration-500 hover:pl-4 lg:py-11">
                <span className="col-span-2 font-absans text-4xl font-bold text-white/15 transition-colors duration-500 group-hover:text-[#4FC3D0] lg:col-span-1 lg:text-5xl">{String(i + 1).padStart(2, '0')}</span>
                <div className="col-span-10 lg:col-span-7">
                  <h3 className="mb-2 font-absans text-xl font-bold leading-tight tracking-tight lg:text-3xl">{post.title}</h3>
                  <p className="line-clamp-2 max-w-2xl font-archia text-sm leading-relaxed text-[#EDF2F7]/45">{post.desc}</p>
                </div>
                <div className="col-span-9 col-start-3 flex items-center gap-3 font-dm-mono text-[10px] uppercase tracking-[0.22em] text-[#EDF2F7]/45 lg:col-span-4 lg:col-start-auto lg:justify-end">
                  <span className="rounded-full border border-white/15 px-3 py-1">{post.tag}</span>
                  <span className="hidden transition-colors duration-500 group-hover:text-[#4FC3D0] sm:inline">{t('Blog.readMore')}</span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 transition-all duration-500 group-hover:rotate-45 group-hover:border-[#4FC3D0] group-hover:bg-[#4FC3D0] group-hover:text-[#090C11]">
                    <ArrowUpRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            ))}
          </RevealGroup>
        </div>
      </section>

      <FaqSection title={t('FAQ.title')} subtitle={t('FAQ.subtitle')} items={t.raw('FAQ.items') as FaqItem[]} eyebrow="(FAQ)" theme="light" />

      <GlobalCTA
        badge={t('FinalCta.badge')}
        title={t('FinalCta.title')}
        subtitle={t('FinalCta.subtitle')}
        primaryCtaText={t('FinalCta.whatsapp')}
        primaryCtaHref={`${WHATSAPP}?text=${encodeURIComponent(t('FinalCta.msg'))}`}
        secondaryCtaText={t('FinalCta.email')}
        secondaryCtaHref="mailto:sales@99puritywholesale.com"
      />
    </div>
  );
}
