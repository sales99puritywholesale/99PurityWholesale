import { getAllPosts } from '@/utils/mdx';
import Image from 'next/image';
import { Link } from '@/i18n/routing';
import { Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import FaqSchema from '@/components/seo/FaqSchema';
import { PageShell, PageHero, Section, CardGrid, CtaBand, Eyebrow, SplitHeading, h2, card, WRAP } from '@/components/home/page-kit';
import { ArrowDot } from '@/components/home/ui';

export async function generateMetadata(props: any) {
  const params = props?.params || {};
  const locale = params?.locale || 'en';
  const t = await getTranslations({ locale, namespace: 'Meta' });
  return {
    title: { absolute: t('blogTitle') },
    description: t('blogDesc'),
  
    alternates: {
      canonical: `https://99puritywholesale.com${locale === 'en' ? '/blog' : `/${locale}/blog`}`,
      languages: { 'en-US': '/blog', es: '/es/blog', 'x-default': '/blog' },
    },
  };
}

// Curate high-quality, topic-relevant image paths dynamically for blog index cards
function getPostCardImage(slug: string, index: number, meta?: any): string {
  if (meta?.coverImage) {
    return meta.coverImage;
  }
  const normSlug = slug.toLowerCase();
  if (normSlug.includes('retatrutide')) {
    return '/images/retatrutide-vs-tirzepatide-vs-semaglutide-cover.jpg';
  }
  if (normSlug.includes('bioregulator') || normSlug.includes('epithalon')) {
    return '/product-images/bioregulator-core-panel.webp';
  }
  if (normSlug.includes('glp') || normSlug.includes('semaglutide') || normSlug.includes('tirzepatide') || normSlug.includes('weight')) {
    return '/product-images/SEMAGLUTIDE 5mg-2.webp';
  }
  if (normSlug.includes('bpc') || normSlug.includes('recovery')) {
    return '/product-images/BPC-157 5mg-5.webp';
  }
  if (normSlug.includes('nad') || normSlug.includes('longevity') || normSlug.includes('aging')) {
    return '/product-images/nad-plus-500mg-1.webp';
  }
  if (normSlug.includes('reconstitution') || normSlug.includes('storage')) {
    return '/product-images/BAC WATER 3ML.webp';
  }
  if (normSlug.includes('verify') || normSlug.includes('supplier') || normSlug.includes('evaluation') || normSlug.includes('sourcing') || normSlug.includes('fda') || normSlug.includes('compliance') || normSlug.includes('procurement') || normSlug.includes('california') || normSlug.includes('texas') || normSlug.includes('florida') || normSlug.includes('new-york')) {
    return '/images/peptide-supplier-verification-coa-audit.jpg';
  }
  if (normSlug.includes('coa') || normSlug.includes('quality') || normSlug.includes('read-coa')) {
    return '/images/hplc_reference_graph.png';
  }
  if (normSlug.includes('pharmacy') || normSlug.includes('spas') || normSlug.includes('med-spa')) {
    return '/product-images/glow-hair-skin-nail-blend.jpg';
  }
  if (normSlug.includes('private-label') || normSlug.includes('product-line') || normSlug.includes('dropship') || normSlug.includes('business') || normSlug.includes('start')) {
    return '/product-images/klow-custom-peptide-kit.jpg';
  }
  if (normSlug.includes('fluorescence') || normSlug.includes('luminescence')) {
    return '/images/fluorescence-spectrofluorometer-lab.jpg';
  }
  if (normSlug.includes('spps') || normSlug.includes('lpps') || normSlug.includes('synthesis')) {
    return '/images/spps-automated-synthesizer-lab.jpg';
  }
  if (normSlug.includes('us-manufactured') || normSlug.includes('imported')) {
    return '/images/peptide-supplier-batch-traceability-qc.jpg';
  }
  
  const defaults = [
    '/product-images/SEMAGLUTIDE 5mg-2.webp',
    '/product-images/BPC-157 5mg-5.webp',
    '/product-images/TIRZEPATIDE 10mg-3.webp',
    '/product-images/RETATRUTIDE 10mg-6.webp',
    '/product-images/cjc-1295-ipamorelin-10-10mg.jpg',
    '/product-images/bpc-157-tb-500-10-10mg.jpg'
  ];
  return defaults[index % defaults.length];
}

interface FaqItem {
  q: string;
  a: string;
  link?: string;
  linkText?: string;
}

// Renders [label](href) markdown links inside FAQ answers
function renderAnswer(text: string) {
  return text.split(/(\[[^\]]+\]\([^)]+\))/g).map((segment, i) => {
    const m = segment.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (!m) return <span key={i}>{segment}</span>;
    const external = m[2].startsWith('http');
    return (
      <a key={i} href={m[2]} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="text-[#0B6F7B] underline underline-offset-2">
        {m[1]}
      </a>
    );
  });
}

export default async function BlogIndex({ params }: { params: { locale: string } }) {
  const t = await getTranslations({ locale: params.locale, namespace: 'Blog' });
  const posts = await getAllPosts(params.locale);
  const faqItems = (t.raw('FAQ.items') as FaqItem[]) || [];

  const tags = [
    t('tags.pricing'),
    t('tags.quality'),
    t('tags.launch'),
    t('tags.compliance'),
    t('tags.glp1'),
    t('tags.dropshipping')
  ];

  return (
    <PageShell>
      <PageHero
        eyebrow={t('badge')}
        title={t('title')}
        intro={t('subtitle')}
        actions={
          <ul className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <li key={tag} className="rounded-full border border-[#E6EAF1] bg-white px-3.5 py-1.5 font-dm-mono text-[10px] uppercase tracking-[0.14em] text-[#0B0F14]/60">
                {tag}
              </li>
            ))}
          </ul>
        }
        aside={
          <div className={`${card} relative aspect-[4/3] overflow-hidden`}>
            <Image
              src="/lab_quality_bg_1778896760027.png"
              alt="99 Purity Wholesale Analytical Research Compendium"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 560px"
              className="object-cover"
            />
          </div>
        }
      />

      <Section className="!pt-4 md:!pt-6">
        <CardGrid cols={3}>
          {posts.map((post, idx) => (
            <Link key={post.slug} data-reveal href={`/blog/${post.slug}`} className={`${card} group flex flex-col overflow-hidden transition-shadow duration-300 hover:shadow-[0_18px_50px_rgba(11,15,20,0.08)]`}>
              <div className="relative aspect-[16/10] overflow-hidden bg-[#E6EAF1]">
                <Image
                  src={getPostCardImage(post.slug, idx, post.meta)}
                  alt={post.meta.title}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                  className="object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-105"
                />
                <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 font-dm-mono text-[9px] uppercase tracking-[0.16em] text-[#0B0F14]/70 backdrop-blur">
                  Article Lot
                </span>
              </div>
              <div className="flex flex-1 flex-col p-6">
                <time dateTime={post.meta.date} className="mb-3 block font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/45">
                  {new Date(post.meta.date).toLocaleDateString(params.locale === 'es' ? 'es-ES' : 'en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </time>
                <h2 className="mb-3 line-clamp-3 text-[1.2rem] font-normal leading-snug tracking-[-0.03em]">{post.meta.title}</h2>
                <p className="mb-6 line-clamp-3 text-[13px] leading-relaxed text-[#0B0F14]/60">{post.meta.description}</p>
                <div className="mt-auto flex items-center justify-between gap-3 text-[13px] font-medium">
                  <span>{t('readMore')}</span>
                  <ArrowDot />
                </div>
              </div>
            </Link>
          ))}
        </CardGrid>
      </Section>

      {faqItems.length > 0 && (
        <section id="blog-faq" className="pb-16 md:pb-24">
          <FaqSchema items={faqItems} />
          <div className={`${WRAP} grid gap-10 lg:grid-cols-12`}>
            <div className="lg:col-span-4">
              <Eyebrow className="mb-5">(FAQ)</Eyebrow>
              <SplitHeading text={t('FAQ.title')} className={`${h2} mb-5`} />
              <p className="max-w-xs text-[13px] leading-relaxed text-[#0B0F14]/60">{t('FAQ.subtitle')}</p>
            </div>
            <div className="space-y-2 lg:col-span-8">
              {faqItems.map((f, i) => (
                <details key={i} className={`${card} group px-6 py-5 open:shadow-[0_18px_50px_rgba(11,15,20,0.06)]`}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[15px] font-normal tracking-[-0.02em] [&::-webkit-details-marker]:hidden">
                    <h3 className="font-normal">{f.q}</h3>
                    <Plus className="h-4 w-4 shrink-0 transition-transform duration-300 group-open:rotate-45" aria-hidden="true" />
                  </summary>
                  <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-[#0B0F14]/60">{renderAnswer(f.a)}</p>
                  {f.link && (
                    <a
                      href={f.link}
                      {...(f.link.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      className="mt-4 inline-block font-dm-mono text-[10px] uppercase tracking-[0.14em] text-[#0B6F7B]"
                    >
                      {f.linkText ?? 'Learn more'} →
                    </a>
                  )}
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      <CtaBand
        eyebrow={t('ctaBadge')}
        title={t('ctaTitle')}
        description={t('ctaSubtitle')}
        primary={{
          label: 'WhatsApp Sales',
          href: "https://wa.me/18433307365?text=Hi,%20I'm%20interested%20in%20learning%20more%20about%20your%20verified%20batch%20quality%20and%20receiving%20the%20wholesale%20price%20list.",
          external: true,
        }}
        secondary={{ label: 'Email Laboratory', href: 'mailto:sales@99puritywholesale.com' }}
      />
    </PageShell>
  );
}
