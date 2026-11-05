import { getAllPosts } from '@/utils/mdx';
import Image from 'next/image';
import { Link } from '@/i18n/routing';
import { ArrowRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import GlobalCTA from '@/components/layout/GlobalCTA';
import FaqSection from '@/components/shared/FaqSection';

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

export default async function BlogIndex({ params }: { params: { locale: string } }) {
  const t = await getTranslations({ locale: params.locale, namespace: 'Blog' });
  const posts = await getAllPosts(params.locale);

  const tags = [
    t('tags.pricing'),
    t('tags.quality'),
    t('tags.launch'),
    t('tags.compliance'),
    t('tags.glp1'),
    t('tags.dropshipping')
  ];

  return (
    <main className="min-h-screen bg-[#F8F8F6] text-black -mt-24 md:-mt-32">
      
      {/* Hero Section - Elegant Light Off-White Linen */}
      <section className="relative overflow-hidden pt-52 pb-24 md:pt-64 md:pb-32 border-b border-black/5 bg-[#F8F8F6]">
        {/* Light Noise Texture */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[url('/images/noise.svg')]" />
        
        <div className="container mx-auto px-6 max-w-5xl relative z-10 text-center">
          <div>
            <div className="inline-block bg-black/5 border border-black/5 px-5 py-2 rounded-full text-[10px] font-bold font-dm-sans uppercase tracking-widest text-black/60 mb-6">
              {t('badge')}
            </div>
            
            <h1 className="reveal-text text-4xl sm:text-6xl md:text-7xl font-bold font-absans text-black uppercase tracking-tight leading-none mb-6 break-words w-full">
              {t('title')}
            </h1>
            
            <p className="reveal-text text-lg md:text-xl font-archia font-semibold text-black/75 max-w-3xl mx-auto leading-relaxed mb-10">
              {t('subtitle')}
            </p>
            
            {/* Elegant Tag Filters Tray */}
            <div className="reveal-grid flex flex-wrap items-center justify-center gap-3 max-w-2xl mx-auto">
              {tags.map((tag) => (
                <span 
                  key={tag} 
                  className="reveal-card bg-white border border-black/5 text-black/60 px-4 py-1.5 rounded-full font-dm-mono text-[10px] font-bold uppercase tracking-wider shadow-sm hover:border-black/15 transition-all"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Standalone Widescreen Clinical Laboratory Breakout Card */}
      <section className="bg-[#F8F8F6] py-8 relative overflow-hidden">
        <div className="container mx-auto px-6 max-w-7xl">
          <div className="reveal-card-3d relative overflow-hidden rounded-[2.5rem] h-[320px] md:h-[480px] border border-black/5 shadow-sm group">
            <Image 
              src="/lab_quality_bg_1778896760027.png"
              alt="99 Purity Wholesale Analytical Research Compendium"
              fill
              sizes="(max-width: 1200px) 100vw, 1200px"
              className="object-cover transition-transform duration-[1.5s] ease-out group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent pointer-events-none" />
          </div>
        </div>
      </section>

      {/* Blog Cards Grid - Stealth Luxury Dark Section */}
      <section className="py-24 md:py-32 bg-[#05080C] text-white border-t border-white/5 relative overflow-hidden">
        {/* Dark Noise Texture */}
        <div className="absolute inset-0 opacity-[0.015] pointer-events-none bg-[url('/images/noise.svg')]" />
        
        <div className="container mx-auto px-6 max-w-7xl relative z-20">
          <div className="reveal-grid grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
            {posts.map((post, idx) => (
              <div key={post.slug} className="reveal-card h-full">
                <Link href={`/blog/${post.slug}`} className="group block h-full">
                  <div className="bg-[#090C12] border border-white/5 rounded-[2.5rem] overflow-hidden hover:border-brand-accent/30 hover:bg-[#0E131C] transition-all duration-500 shadow-2xl flex flex-col h-full group">
                    
                    {/* Top Portion: Rich Visual Image Header */}
                    <div className="h-56 relative overflow-hidden bg-black/10">
                      <Image 
                        src={getPostCardImage(post.slug, idx, post.meta)} 
                        alt={post.meta.title} 
                        fill
                        sizes="(max-width: 768px) 100vw, 50vw"
                        className="object-cover transition-transform duration-[1.5s] ease-out group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#090C12] via-transparent to-transparent pointer-events-none" />
                      
                      {/* Floating Lot Tag */}
                      <div className="absolute top-6 left-6 z-10">
                        <span className="bg-black/40 backdrop-blur-md text-brand-accent border border-brand-accent/20 px-3 py-1 rounded-full text-[9px] font-bold font-dm-mono uppercase tracking-wider">
                          Article Lot
                        </span>
                      </div>
                    </div>

                    {/* Bottom Portion: Editorial Text Context */}
                    <div className="p-8 flex-1 flex flex-col justify-between">
                      <div>
                        {/* Post Date */}
                        <time className="text-white/40 font-dm-mono text-[9px] font-bold uppercase tracking-widest mb-3 block">
                          {new Date(post.meta.date).toLocaleDateString(params.locale === 'es' ? 'es-ES' : 'en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </time>
                        
                        {/* Title */}
                        <h2 className="text-2xl font-bold font-absans text-white uppercase tracking-tight mb-3 group-hover:text-brand-accent transition-colors leading-tight line-clamp-2">
                          {post.meta.title}
                        </h2>
                        
                        {/* Description */}
                        <p className="text-white/55 font-archia font-medium text-xs leading-relaxed mb-6 line-clamp-3">
                          {post.meta.description}
                        </p>
                      </div>

                      {/* Read More Trigger */}
                      <div className="inline-flex items-center gap-2 text-brand-accent font-bold font-dm-sans text-[9px] uppercase tracking-[0.2em] transition-all group-hover:text-white mt-auto">
                        {t('readMore')} <ArrowRight className="w-3.5 h-3.5 ml-1.5 group-hover:translate-x-1.5 transition-transform" />
                      </div>
                    </div>

                  </div>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <FaqSection
        id="blog-faq"
        eyebrow="(FAQ)"
        title={t('FAQ.title')}
        subtitle={t('FAQ.subtitle')}
        items={t.raw('FAQ.items') as any[]}
        theme="light"
      />

      {/* Global B2B Call-To-Action Segment */}
      <GlobalCTA
        badge={t('ctaBadge')}
        title={t('ctaTitle')}
        subtitle={t('ctaSubtitle')}
        primaryCtaText="WhatsApp Sales"
        primaryCtaHref="https://wa.me/18433307365?text=Hi,%20I'm%20interested%20in%20learning%20more%20about%20your%20verified%20batch%20quality%20and%20receiving%20the%20wholesale%20price%20list."
        secondaryCtaText="Email Laboratory"
        secondaryCtaHref="mailto:sales@99puritywholesale.com"
      />

    </main>
  );
}
