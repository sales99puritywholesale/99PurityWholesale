import React from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { Plus, ArrowUpRight, Download } from 'lucide-react';
import productsData from '@/data/products.json';
import FaqSchema from '@/components/seo/FaqSchema';
import HomeHero from '@/components/home/HomeHero';
import Parallax from '@/components/home/Parallax';
import ServicesAtlas from '@/components/home/ServicesAtlas';
import WhyUs from '@/components/home/WhyUs';
import Highlights from '@/components/home/Highlights';
import { HIGHLIGHT_MEDIA } from '@/components/home/highlights-media';
import { RevealGroup, SplitHeading } from '@/components/home/Reveal';
import { Eyebrow, PillButton, ArrowDot, Photo, h2, card } from '@/components/home/ui';
import { HOME_IMAGES } from '@/components/home/home-images';

type BestSellerItem = { name: string; spec: string; desc: string };
type TierItem = { name: string; label: string; kits: string; description: string };
type TestimonialItem = { quote: string; role: string; location: string };
type BlogItem = { slug: string; title: string; desc: string; tag: string };
type FaqItem = { q: string; a: string };
type TierKey = 'starter' | 'tier1' | 'tier2' | 'tier3';

const WHATSAPP = 'https://wa.me/18433307365';
const wrap = 'mx-auto w-full max-w-[1440px] px-5 md:px-10';
const section = 'py-20 md:py-28';

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
const CATEGORY_IDS = ['metabolic-research', 'cognitive-function', 'sleep-cycle-investigation', 'growth-factor-research', 'recovery-research', 'cellular-health-research', 'aminos', 'essentials'];
const TIER_KEYS: TierKey[] = ['starter', 'tier1', 'tier2', 'tier3'];
const ATLAS_GROUPS = [
  { key: 'grow', items: ['metaAds', 'seo', 'email', 'brand'] },
  { key: 'operate', items: ['fulfillment', 'dropshipping', 'support', 'payments'] },
  { key: 'build', items: ['web', 'redesign', 'privateLabel', 'compliance'] },
];
const QUALITY_DOWNLOADS = [
  { key: 'bpc', name: 'BPC-157' },
  { key: 'sema', name: 'Semaglutide' },
  { key: 'tirz', name: 'Tirzepatide' },
] as const;

function renderAnswer(text: string) {
  return text.split(/(\[[^\]]+\]\([^)]+\))/g).map((seg, i) => {
    const m = seg.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (!m) return <React.Fragment key={i}>{seg}</React.Fragment>;
    const external = m[2].startsWith('http');
    return (
      <a key={i} href={m[2]} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="underline underline-offset-2">
        {m[1]}
      </a>
    );
  });
}

export async function generateMetadata(props: any) {
  const params = props?.params || {};
  const locale = params?.locale || 'en';
  const t = await getTranslations({ locale, namespace: 'Meta' });
  return {
    title: t('homeTitle'),
    description: t('homeDesc'),
    alternates: { canonical: `https://99puritywholesale.com${locale === 'en' ? '/' : `/${locale}`}` },
  };
}

export default async function HomePage({ params }: { params: { locale: string } }) {
  const t = await getTranslations({ locale: params.locale, namespace: 'Index' });
  const pt = await getTranslations({ locale: params.locale, namespace: 'ProductsIndex' });

  const bestSellers = (t.raw('BestSellers.items') as BestSellerItem[]).slice(0, 8);
  const tiers = t.raw('Tiers.items') as Record<TierKey, TierItem>;
  const testimonials = t.raw('Testimonials.items') as TestimonialItem[];
  const blogItems = t.raw('Blog.items') as BlogItem[];
  const faqItems = t.raw('FAQ.items') as FaqItem[];
  const scaleLines = t('Services.scaleTitle').split(/<br\s*\/?>/i).map((s) => s.trim());

  return (
    <div data-gsap-owned className="relative overflow-x-clip bg-[#F3F5FA] font-dm-sans text-[#0B0F14] selection:bg-[#4FC3D0]/30">
      <noscript>
        <style>{'.hero-in,.hero-word{opacity:1!important}.hero-img-wrap{clip-path:none!important}'}</style>
      </noscript>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebSite', name: '99 Purity Wholesale', url: 'https://99puritywholesale.com' }) }}
      />
      <FaqSchema items={faqItems} />

      {/* 01 — HERO */}
      <HomeHero
        image={HOME_IMAGES.hero}
        badge={t('Hero.authorized')}
        title={t('Hero.title')}
        subtitle={t('Hero.subtitle')}
        primaryCta={t('Hero.primaryCta')}
        primaryHref="/wholesale-application"
        secondaryCta={t('Hero.secondaryCta')}
        secondaryHref="/products"
        imageAlt={t('Hero.badge')}
        facts={[
          { value: '99%+', label: t('Hero.badges.purity') },
          { value: 'HPLC / MS', label: t('Hero.badges.tested') },
        ]}
      />

      {/* 02 — PARTNER SERVICES (animated atlas) */}
      <section className="py-20 md:py-28">
        <div className={wrap}>
          <div className="mb-10 flex flex-col justify-between gap-6 md:mb-14 lg:flex-row lg:items-end">
            <div>
              <Eyebrow className="mb-5">{t('Services.badge')}</Eyebrow>
              <SplitHeading text={t('Services.title')} className={`${h2} max-w-3xl`} />
            </div>
            <div className="max-w-sm">
              <p className="mb-6 text-[13px] leading-relaxed text-[#0B0F14]/60">{t('Services.description')}</p>
              <PillButton href="/services">{t('Services.cta')}</PillButton>
            </div>
          </div>

          <ServicesAtlas
            href="/services"
            labels={{ hint: t('ServicesAtlas.hint'), learn: t('ServicesAtlas.learn'), of: t('ServicesAtlas.of') }}
            groups={ATLAS_GROUPS.map((g) => ({
              key: g.key,
              label: t(`ServicesAtlas.groups.${g.key}`),
              items: g.items.map((key) => ({
                key,
                name: t(`ServicesAtlas.items.${key}.name`),
                short: t(`ServicesAtlas.items.${key}.short`),
                desc: t(`ServicesAtlas.items.${key}.desc`),
                points: t.raw(`ServicesAtlas.items.${key}.points`) as string[],
              })),
            }))}
          />

          <RevealGroup className="mt-16 md:mt-24">
            <div data-reveal className={`${card} grid items-center gap-8 p-7 md:p-10 lg:grid-cols-2`}>
              <div>
                <h3 className={`${h2} mb-4 !text-[clamp(1.8rem,3.2vw,2.8rem)]`}>
                  {scaleLines.map((line, i) => (
                    <span key={i} className="block">
                      {line}
                    </span>
                  ))}
                </h3>
                <p className="max-w-md text-[13px] leading-relaxed text-[#0B0F14]/60">{t('Services.scaleSubtitle')}</p>
              </div>
              <div className="flex flex-wrap gap-3 lg:justify-end">
                <PillButton href="/services">{t('Services.guide')}</PillButton>
                <PillButton href="/wholesale-application" variant="outline">{t('Services.wholesaleApp')}</PillButton>
              </div>
            </div>
          </RevealGroup>
        </div>
      </section>

      {/* 03 — INTRO + NUMBERED POINTS */}
      <section className={section}>
        <div className={wrap}>
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow className="mb-6 justify-center">{t('Differentiators.institutionalStandard')}</Eyebrow>
            <SplitHeading text={t('Differentiators.lab.title')} className={`${h2} mb-6`} />
            <p className="mx-auto mb-8 max-w-xl text-[15px] leading-relaxed text-[#0B0F14]/60">{t('Differentiators.lab.description')}</p>
            <PillButton href="/products">{t('Hero.secondaryCta')}</PillButton>
          </div>

          <RevealGroup className="mx-auto mt-16 grid max-w-4xl grid-cols-1 gap-10 sm:grid-cols-3 md:mt-24">
            {(['purity', 'clients', 'coverage'] as const).map((k, i) => (
              <div key={k} data-reveal>
                <div className="mb-4 font-dm-mono text-[10px] uppercase tracking-[0.2em] text-[#0B0F14]/45">{t(`StatsBar.${k}.label`)}</div>
                <div className="mb-3 font-light leading-none tracking-[-0.05em] text-[clamp(2.4rem,4vw,3.4rem)]">
                  0{i + 1}
                  <span className="ml-0.5 align-top text-sm text-[#4FC3D0]">&bull;</span>
                </div>
                <p className="max-w-[16rem] text-[13px] leading-relaxed text-[#0B0F14]/55">{t(`StatsBar.${k}.sub`)}</p>
              </div>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* 04 — WHY BRANDS CHOOSE US (looping scenes) */}
      <section className="pb-20 md:pb-28">
        <WhyUs
          eyebrow={t('WhyUs.eyebrow')}
          title={t('WhyUs.title')}
          items={(['lab', 'coa', 'pricing', 'support'] as const).map((k) => ({ key: k, title: t(`Differentiators.${k}.title`), desc: t(`Differentiators.${k}.description`) }))}
          labels={{
            usMade: t('Hero.badges.usMade'),
            tested: t('Hero.badges.tested'),
            purity: t('StatsBar.purity.label'),
            coa: t('Quality.batchReport'),
            lot: t('WhyUs.lot'),
            verified: t('WhyUs.verified'),
            tiers: TIER_KEYS.map((k) => ({ name: tiers[k].name, kits: tiers[k].kits })),
            ask: t('Hero.primaryCta'),
            reply: t('WhyUs.reply'),
            online: t('WhyUs.online'),
          }}
        />
      </section>

      {/* 05 — HIGHLIGHTS (carousel) */}
      <section className="pb-20 md:pb-28">
        <Highlights
          eyebrow={t('Highlights.eyebrow')}
          title={t('Highlights.title')}
          description={t('Highlights.description')}
          labels={{ prev: t('Highlights.prev'), next: t('Highlights.next'), learn: t('ServicesAtlas.learn') }}
          slides={HIGHLIGHT_MEDIA.map((m) => {
            const text = {
              lab: { tag: t('Hero.badges.usMade'), title: t('Differentiators.lab.title'), desc: t('Differentiators.lab.description'), href: '/about' },
              coa: { tag: t('Quality.batchReport'), title: t('Differentiators.coa.title'), desc: t('Differentiators.coa.description'), href: '/certificates-of-analysis' },
              shipping: { tag: t('Hero.badges.shipping'), title: t('StatsBar.coverage.label'), desc: t('Differentiators.shippingDesc'), href: '/locations' },
              private: { tag: t('Services.badge'), title: t('ServicesAtlas.items.privateLabel.name'), desc: t('ServicesAtlas.items.privateLabel.desc'), href: '/services' },
            }[m.key];
            return { key: m.key, image: m.image, video: m.video, detail: m.detail, ...text };
          })}
        />
      </section>

      {/* 06 — CATALOG (best sellers) */}
      <section className="pb-20 md:pb-28">
        <div className={wrap}>
          <div className="mb-10 flex flex-col justify-between gap-6 md:mb-14 lg:flex-row lg:items-end">
            <div>
              <Eyebrow className="mb-5">{t('BestSellers.badge')}</Eyebrow>
              <SplitHeading text={t('BestSellers.title')} className={`${h2} max-w-3xl`} />
            </div>
            <div className="max-w-sm">
              <p className="mb-6 text-[13px] leading-relaxed text-[#0B0F14]/60">{t('BestSellers.subtitle')}</p>
              <PillButton href="/products">{t('BestSellers.browseAll', { count: productsData.length })}</PillButton>
            </div>
          </div>

          <RevealGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {bestSellers.map((p, i) => {
              const slug = BEST_SELLER_SLUGS[i];
              return (
                <Link key={slug} data-reveal href={`/products/${slug}`} className={`${card} group overflow-hidden p-2 transition-shadow duration-500 hover:shadow-[0_24px_60px_rgba(11,15,20,0.08)]`}>
                  <div className="relative aspect-[4/4.6] overflow-hidden rounded-[0.9rem] bg-[#e6eaf0]">
                    <div className="absolute inset-0 transition-transform duration-[900ms] ease-out group-hover:scale-[1.04]">
                      <Photo src={BEST_SELLER_IMAGES[slug]} alt={`${p.name} research peptide, wholesale`} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" position="50% 60%" />
                    </div>
                    <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 font-dm-mono text-[9px] uppercase tracking-[0.14em] backdrop-blur">{pt(`categories.${BEST_SELLER_CATS[i]}.name`)}</span>
                  </div>
                  <div className="p-4 pb-3">
                    <h3 className="mb-2 text-lg font-normal tracking-[-0.03em]">{p.name}</h3>
                    <p className="mb-5 line-clamp-2 text-[13px] leading-relaxed text-[#0B0F14]/55">{p.desc}</p>
                    <div className="flex items-center justify-between border-t border-[#E6EAF1] pt-3 font-dm-mono text-[10px] uppercase tracking-[0.14em] text-[#0B0F14]/50">
                      <span>{p.spec}</span>
                      <span className="flex items-center gap-1.5 text-[#0B0F14]">
                        {t('BestSellers.viewSpecs')}
                        <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-45" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </RevealGroup>
        </div>
      </section>

      {/* 07 — TIERS (dark panel) */}
      <section id="wholesale-tiers" className="px-3 md:px-4">
        <div className="mx-auto max-w-[1760px] rounded-[1.75rem] bg-[#0B0D10] py-16 text-white md:py-24">
          <div className={`${wrap} grid gap-12 lg:grid-cols-12`}>
            <div className="lg:col-span-4">
              <Eyebrow light className="mb-5">{t('Tiers.badge')}</Eyebrow>
              <SplitHeading text={t('Tiers.title')} className={`${h2} mb-6 !text-white`} />
              <p className="mb-6 max-w-sm text-[13px] leading-relaxed text-white/55">{t('Tiers.description')}</p>
              <p className="font-dm-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-white/35">{t('Tiers.onRequests')}</p>
            </div>
            <RevealGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:col-span-8">
              {TIER_KEYS.map((k, i) => {
                const tier = tiers[k];
                return (
                  <div key={k} data-reveal className="flex min-h-[290px] flex-col rounded-[1.1rem] bg-white p-6 text-[#0B0F14]">
                    <div className="mb-8 flex items-start justify-between">
                      <span className="font-dm-mono text-[10px] uppercase tracking-[0.18em] text-[#0B0F14]/45">{tier.label}</span>
                      {i === 3 ? <span className="rounded-full bg-[#4FC3D0]/20 px-2.5 py-1 font-dm-mono text-[9px] uppercase tracking-[0.14em] text-[#0B6F7B]">{t('Tiers.bestValue')}</span> : <span className="h-2 w-2 bg-[#4FC3D0]" />}
                    </div>
                    <div className="mb-1 text-3xl font-light tracking-[-0.04em]">{tier.name}</div>
                    <div className="mb-4 font-dm-mono text-[11px] uppercase tracking-[0.14em] text-[#0B6F7B]">{tier.kits}</div>
                    <p className="mb-6 flex-grow text-[13px] leading-relaxed text-[#0B0F14]/55">{tier.description}</p>
                    <a
                      href={`${WHATSAPP}?text=${encodeURIComponent(`Hi, I'd like to learn about wholesale tier ${tier.name} pricing.`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center justify-between border-t border-[#E6EAF1] pt-4 text-[13px] font-medium"
                    >
                      {t('Tiers.getPricng')}
                      <ArrowDot />
                    </a>
                  </div>
                );
              })}
            </RevealGroup>
          </div>
        </div>
      </section>

      {/* 08 — DOCUMENTATION PANEL */}
      <section className="px-3 pt-3 md:px-4">
        <div className="relative mx-auto max-w-[1760px]">
          <Parallax className="h-[680px] rounded-[1.75rem] bg-[#12171d] md:h-[720px]" amount={6}>
            <Photo src={HOME_IMAGES.documentation} alt={t('Quality.title')} sizes="100vw" />
          </Parallax>
          <RevealGroup className="absolute inset-x-4 bottom-4 md:inset-x-auto md:bottom-10 md:left-10">
            <div data-reveal className="w-full max-w-[520px] rounded-[1.25rem] bg-white/95 p-7 shadow-[0_30px_80px_rgba(11,15,20,0.2)] backdrop-blur md:p-9">
              <Eyebrow className="mb-5">{t('Quality.batchReport')}</Eyebrow>
              <h2 className={`${h2} mb-5 !text-[clamp(1.9rem,3.2vw,2.9rem)]`}>{t('Quality.verification')}</h2>
              <p className="mb-6 text-[13px] leading-relaxed text-[#0B0F14]/60">{t('Quality.description')}</p>
              <ul className="mb-7 divide-y divide-[#E6EAF1] border-y border-[#E6EAF1]">
                {QUALITY_DOWNLOADS.map((d) => (
                  <li key={d.key}>
                    <a
                      href={`${WHATSAPP}?text=${encodeURIComponent(`Hi, I'd like to request the batch COA report for ${d.name}.`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center justify-between gap-4 py-3 text-[13px]"
                    >
                      <span>{t(`Quality.downloads.${d.key}`)}</span>
                      <Download className="h-4 w-4 text-[#0B0F14]/50 transition-colors group-hover:text-[#0B6F7B]" />
                    </a>
                  </li>
                ))}
              </ul>
              <PillButton href="/certificates-of-analysis">{t('Quality.cta')}</PillButton>
            </div>
          </RevealGroup>
        </div>
      </section>

      {/* 09 — CATEGORY ROWS */}
      <section className={section}>
        <div className={wrap}>
          <div className="mb-10 flex flex-col justify-between gap-6 md:mb-14 lg:flex-row lg:items-end">
            <div>
              <Eyebrow className="mb-5">{t('Categories.badge')}</Eyebrow>
              <SplitHeading text={t('Categories.title')} className={`${h2} max-w-3xl`} />
            </div>
            <div className="max-w-sm">
              <p className="mb-6 text-[13px] leading-relaxed text-[#0B0F14]/60">{t('Categories.subtitle')}</p>
              <PillButton href="/products">{t('Categories.cta')}</PillButton>
            </div>
          </div>
          <RevealGroup className={`${card} divide-y divide-[#E6EAF1] px-2 md:px-4`}>
            {CATEGORY_IDS.map((id, i) => (
              <Link key={id} data-reveal href={`/products#${id}`} className="group grid grid-cols-[auto_1fr_auto] items-center gap-x-5 gap-y-1 px-2 py-5 transition-colors hover:bg-[#F3F5FA] md:grid-cols-[3rem_minmax(0,1fr)_minmax(0,1.4fr)_auto] md:gap-x-8 md:px-3">
                <span className="font-dm-mono text-[10px] tracking-[0.2em] text-[#0B0F14]/40">0{i + 1}</span>
                <span className="text-lg font-normal tracking-[-0.03em] md:text-xl">{pt(`categories.${id}.name`)}</span>
                <span className="col-span-2 col-start-2 line-clamp-2 text-[13px] leading-relaxed text-[#0B0F14]/55 md:col-span-1 md:col-start-auto">{pt(`categories.${id}.desc`)}</span>
                <ArrowDot className="row-span-2 md:row-span-1" />
              </Link>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* 10 — TESTIMONIALS */}
      <section id="testimonials" className="pb-20 md:pb-28">
        <div className={wrap}>
          <div className="mx-auto mb-12 max-w-3xl text-center md:mb-16">
            <Eyebrow className="mb-5 justify-center">{t('Testimonials.badge')}</Eyebrow>
            <SplitHeading text={t('Testimonials.title')} className={h2} />
          </div>
          <RevealGroup className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {testimonials.map((test, i) => (
              <figure key={i} data-reveal className={`${card} flex min-h-[340px] flex-col justify-between p-7`}>
                <div className="mb-8 flex items-center justify-between">
                  <span className="font-dm-mono text-[10px] tracking-[0.2em] text-[#0B0F14]/40">0{i + 1}</span>
                  <span className="font-dm-mono text-[9px] uppercase tracking-[0.14em] text-[#0B6F7B]">{t('Testimonials.verifiedClient')}</span>
                </div>
                <blockquote className="mb-8 flex-grow text-[17px] font-light leading-relaxed tracking-[-0.02em]">&ldquo;{test.quote}&rdquo;</blockquote>
                <figcaption className="border-t border-[#E6EAF1] pt-4">
                  <div className="text-[13px] font-medium">{test.role}</div>
                  <div className="mt-1 font-dm-mono text-[10px] uppercase tracking-[0.14em] text-[#0B0F14]/45">{test.location}</div>
                </figcaption>
              </figure>
            ))}
          </RevealGroup>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
            {(t.raw('Testimonials.institutionalTrust') as string[]).map((b) => (
              <span key={b} className="flex items-center gap-2.5 font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/50">
                <span className="h-[6px] w-[6px] bg-[#4FC3D0]" />
                {b}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 11 — INSIGHTS */}
      <section className="pb-20 md:pb-28">
        <div className={wrap}>
          <div className="mb-10 flex flex-col justify-between gap-6 md:mb-14 lg:flex-row lg:items-end">
            <div>
              <Eyebrow className="mb-5">{t('Blog.badge')}</Eyebrow>
              <SplitHeading text={t('Blog.title')} className={`${h2} max-w-3xl`} />
            </div>
            <PillButton href="/blog">{t('Blog.cta')}</PillButton>
          </div>
          <RevealGroup className={`${card} divide-y divide-[#E6EAF1] px-2 md:px-4`}>
            {blogItems.map((post, i) => (
              <Link key={post.slug} data-reveal href={`/blog/${post.slug}`} className="group grid grid-cols-[auto_1fr_auto] items-center gap-x-5 gap-y-2 px-2 py-6 transition-colors hover:bg-[#F3F5FA] md:grid-cols-[3rem_minmax(0,1fr)_auto_auto] md:gap-x-8 md:px-3">
                <span className="font-dm-mono text-[10px] tracking-[0.2em] text-[#0B0F14]/40">0{i + 1}</span>
                <div>
                  <h3 className="mb-1 text-lg font-normal leading-snug tracking-[-0.03em] md:text-xl">{post.title}</h3>
                  <p className="line-clamp-2 max-w-2xl text-[13px] leading-relaxed text-[#0B0F14]/55">{post.desc}</p>
                </div>
                <span className="hidden rounded-full border border-[#E6EAF1] px-3 py-1 font-dm-mono text-[9px] uppercase tracking-[0.14em] text-[#0B0F14]/55 md:block">{post.tag}</span>
                <ArrowDot />
              </Link>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* 12 — FAQ */}
      <section className="pb-20 md:pb-28">
        <div className={`${wrap} grid gap-10 lg:grid-cols-12`}>
          <div className="lg:col-span-4">
            <Eyebrow className="mb-5">{t('FAQ.badge')}</Eyebrow>
            <SplitHeading text={t('FAQ.title')} className={`${h2} mb-5`} />
            <p className="max-w-xs text-[13px] leading-relaxed text-[#0B0F14]/60">{t('FAQ.subtitle')}</p>
          </div>
          <div className="lg:col-span-8">
            <div className="space-y-2">
              {faqItems.map((f, i) => (
                <details key={i} className={`${card} group px-6 py-5 open:shadow-[0_18px_50px_rgba(11,15,20,0.06)]`}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[15px] font-normal tracking-[-0.02em] [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <Plus className="h-4 w-4 shrink-0 transition-transform duration-300 group-open:rotate-45" />
                  </summary>
                  <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-[#0B0F14]/60">{renderAnswer(f.a)}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 13 — FINAL CTA */}
      <section className="px-3 pb-3 md:px-4 md:pb-4">
        <div className="relative mx-auto max-w-[1760px] overflow-hidden rounded-[1.75rem] bg-[#0B0D10] px-6 py-20 text-center text-white md:py-28">
          <Eyebrow light className="mb-6 justify-center">{t('FinalCta.badge')}</Eyebrow>
          <h2 className={`${h2} mx-auto mb-6 max-w-4xl !text-white`}>{t('FinalCta.title')}</h2>
          <p className="mx-auto mb-9 max-w-xl text-[14px] leading-relaxed text-white/55">{t('FinalCta.subtitle')}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <PillButton href={`${WHATSAPP}?text=${encodeURIComponent(t('FinalCta.msg'))}`} external variant="teal">{t('FinalCta.whatsapp')}</PillButton>
            <a href="mailto:sales@99puritywholesale.com" className="inline-flex items-center rounded-full border border-white/25 px-5 py-[0.9rem] text-[13px] font-medium transition-colors hover:bg-white hover:text-[#0B0F14]">
              {t('FinalCta.email')}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
