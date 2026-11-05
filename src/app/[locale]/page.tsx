import {getTranslations} from 'next-intl/server';
import Image from 'next/image';
import { Link } from '@/i18n/routing';
import { ShieldCheck, Truck, FlaskConical, Building2, Download, Star, BarChart3, Zap, Mail, ArrowRight, Microscope, Globe, Award, ArrowUpRight } from 'lucide-react';
import productsData from '@/data/products.json';
import GlobalCTA from '@/components/layout/GlobalCTA';
import StatsBar from '@/components/home/StatsBar';
import { FadeIn, StaggerContainer, StaggerItem, ScaleIn } from '@/components/shared/Motion';
import FaqSection from '@/components/shared/FaqSection';

const cardBase = 'group relative overflow-hidden rounded-lg border border-[#16202f]/10 bg-white/[0.82] p-7 shadow-[0_22px_70px_rgba(19,32,52,0.09)] backdrop-blur-xl transition-all duration-500 hover:-translate-y-1 hover:border-[#13a7b7]/35 hover:shadow-[0_30px_90px_rgba(19,32,52,0.14)]';
const eyebrow = 'font-absans text-[10px] font-bold uppercase tracking-[0.4em] opacity-40';
const sectionPad = 'py-32 md:py-48';
const heading = 'font-absans text-3xl sm:text-4xl font-bold leading-[1.1] sm:leading-none tracking-tighter uppercase md:text-6xl lg:text-7xl';

type BestSellerItem = { name: string; spec: string; desc: string };
type TierItem = { name: string; label: string; kits: string; description: string };
type TestimonialItem = { quote: string; role: string; location: string };
type ServiceItem = { title: string; desc: string };
type BlogItem = { slug: string; title: string; desc: string; tag: string };
type FaqItem = { q: string; a: string };
type TierKey = 'starter' | 'tier1' | 'tier2' | 'tier3';
type ServiceKey = 'dropshipping' | 'privateLabel' | 'launch' | 'web';

export async function generateMetadata(props: any) {
  const params = props?.params || {};
  const locale = params?.locale || 'en';
  const t = await getTranslations({ locale, namespace: 'Meta' });
  return {
    title: t('homeTitle'),
    description: t('homeDesc'),
    alternates: {
      canonical: `https://99puritywholesale.com${locale === 'en' ? '/' : `/${locale}`}`
    }
  };
}

export default async function HomePage({ params }: { params: { locale: string } }) {
  const t = await getTranslations({ locale: params.locale, namespace: 'Index' });
  const pt = await getTranslations({ locale: params.locale, namespace: 'ProductsIndex' });

  const bestSellerSlugs = ['semaglutide', 'tirzepatide', 'retatrutide', 'bpc-157', 'tb-500', 'ipamorelin', 'cjc-1295-ipam', 'nad', 'epithalon'];
  const bestSellerCats = ['metabolic-research', 'metabolic-research', 'metabolic-research', 'recovery-research', 'recovery-research', 'growth-factor-research', 'growth-factor-research', 'cellular-health-research', 'metabolic-research'];
  const heroBadges = ['purity', 'tested', 'b2b', 'states', 'shipping', 'usMade'] as const;
  const qualityDownloads = ['bpc', 'sema', 'tirz'] as const;
  const tierKeys: TierKey[] = ['starter', 'tier1', 'tier2', 'tier3'];
  const serviceItems: { icon: typeof BarChart3; key: ServiceKey }[] = [
    { icon: BarChart3, key: 'dropshipping' },
    { icon: Globe, key: 'privateLabel' },
    { icon: Award, key: 'launch' },
    { icon: ShieldCheck, key: 'web' },
  ];

  return (
    <div className="home-light relative overflow-hidden bg-white text-[#101827] selection:bg-[#13a7b7]/20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: '99 Purity Wholesale',
            url: 'https://99puritywholesale.com',
          })
        }}
      />
      {/* --- HERO SECTION: RESEARCH PORTAL --- */}
      <section className="relative min-h-screen flex flex-col justify-between items-center overflow-hidden bg-black text-white px-6 pt-32 lg:pt-40 pb-0">
        {/* Cinematic Dark Background */}
        <div className="absolute inset-0">
          <Image
            src="/hero-dark.png"
            alt="Premium Peptide Research"
            fill
            sizes="100vw"
            className="object-cover opacity-60 grayscale-[0.3] brightness-[0.7]"
            priority
            quality={70}
          />
          {/* Moody Overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
          <div className="absolute inset-0 bg-radial-vignette opacity-60" />
        </div>

        <div className="relative z-20 max-w-6xl w-full text-center flex flex-col items-center my-auto py-8 lg:py-12">
          {/* Premium Status Badge */}
          <FadeIn delay={0.2}>
            <div className="inline-flex items-center gap-3 px-5 py-2.5 bg-white/5 border border-white/10 rounded-full backdrop-blur-xl mb-8 lg:mb-12">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-white/60">
                {t('Hero.authorized')}
              </span>
            </div>
          </FadeIn>

          <h1 className="font-absans text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold leading-[1.15] tracking-tighter uppercase mb-8 lg:mb-10 text-white drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
            {t('Hero.title')}
          </h1>

          <FadeIn delay={0.4}>
            <p className="font-archia text-base md:text-xl text-white/40 leading-relaxed mb-10 lg:mb-16 max-w-2xl font-medium">
              {t('Hero.subtitle')}
            </p>
          </FadeIn>

          <StaggerContainer delay={0.6} className="flex flex-col sm:flex-row items-center gap-4 lg:gap-6 w-full justify-center">
            <StaggerItem className="w-full sm:w-auto">
              <Link 
                href="/wholesale-application"
                className="group relative flex w-full sm:w-auto items-center justify-center gap-4 px-10 lg:px-12 py-5 lg:py-6 bg-white text-black rounded-xl overflow-hidden font-bold uppercase tracking-[0.2em] text-[10px] lg:text-xs transition-all shadow-2xl active:scale-95 whitespace-nowrap"
              >
                <span className="relative z-10 flex items-center gap-4 justify-center">
                  {t('Hero.primaryCta')}
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </StaggerItem>

            <StaggerItem className="w-full sm:w-auto">
              <Link 
                href="/products"
                className="group relative flex w-full sm:w-auto items-center justify-center px-10 lg:px-12 py-5 lg:py-6 bg-white/5 border border-white/10 backdrop-blur-xl text-white rounded-xl font-bold uppercase tracking-[0.2em] text-[10px] lg:text-xs transition-all hover:bg-white hover:text-black hover:border-white active:scale-95 whitespace-nowrap"
              >
                {t('Hero.secondaryCta')}
              </Link>
            </StaggerItem>
          </StaggerContainer>
        </div>

        {/* Minimal Institutional Bar (4 Points) */}
        <FadeIn direction="none" delay={0.8} className="relative w-full bg-black/60 backdrop-blur-3xl border-t border-white/5 mt-12 lg:mt-16">
          <div className="max-w-[1800px] mx-auto px-6 lg:px-10 py-8 lg:py-10">
            <div className="reveal-grid grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-20">
               {[
                 { label: 'Verified Purity', val: '99%+', icon: ShieldCheck },
                 { label: 'Batch Tested', val: 'HPLC/MS', icon: BarChart3 },
                 { label: 'Retail & B2B', val: 'US-Made', icon: Building2 },
                 { label: 'Domestic Source', val: 'USA Origin', icon: Globe }
               ].map((stat) => (
                 <div key={stat.label} className="reveal-card group flex items-center gap-4 lg:gap-5">
                    <div className="w-10 h-10 lg:w-11 lg:h-11 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/40 group-hover:bg-white group-hover:text-black transition-all duration-500">
                       <stat.icon className="w-4 h-4 lg:w-5 lg:h-5" />
                    </div>
                    <div>
                       <div className="text-lg lg:text-xl font-absans font-bold text-white tracking-tighter mb-0.5">{stat.val}</div>
                       <div className="text-[7px] lg:text-[8px] font-bold uppercase tracking-[0.3em] text-white/20 group-hover:text-white/40 transition-colors">{stat.label}</div>
                    </div>
                 </div>
               ))}
            </div>
          </div>
        </FadeIn>
      </section>

      {/* Visual divider line drawing */}
      <div className="w-full bg-white relative z-20 py-2">
        <div className="container mx-auto px-6 lg:px-12">
          <svg viewBox="0 0 1200 4" className="w-full h-1 reveal-line" data-scrub="true">
            <path d="M0 2 H1200" stroke="rgba(0, 0, 0, 0.06)" strokeWidth="1.5" fill="none" />
          </svg>
        </div>
      </div>

      {/* --- SECTION 2: INSTITUTIONAL GRADE --- */}
      <section className="relative py-32 md:py-48 px-6 bg-white overflow-hidden">
        {/* Visual Anchor Image */}
        <div className="reveal-parallax absolute inset-0 z-0">
          <Image
            src="/section2-bg.png"
            alt="Laboratory Precision"
            fill
            className="object-cover opacity-[0.08] grayscale"
            quality={60}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/80 to-transparent" />
        </div>

        <div className="max-w-[1800px] mx-auto relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 md:gap-24 items-start">
            <FadeIn className="lg:col-span-7">
               <div className="inline-flex items-center gap-3 mb-12">
                  <div className="w-12 h-px bg-black" />
                  <span className="text-[11px] font-bold uppercase tracking-[0.4em] text-black/40">
                    {t('Differentiators.institutionalStandard')}
                  </span>
               </div>
               <h2 className="reveal-text font-absans text-3xl sm:text-4xl md:text-7xl lg:text-8xl font-bold leading-[1.1] sm:leading-[0.85] tracking-tighter uppercase mb-12">
                 {t('Differentiators.lab.title').split('Laboratory')[0]}
                 <span className="text-black/10 italic block">{t('Differentiators.laboratory')}</span>
               </h2>
               <p className="font-archia text-2xl md:text-3xl text-black/70 max-w-2xl leading-relaxed font-medium">
                 {t('Differentiators.lab.description')}
               </p>
            </FadeIn>

            <div className="lg:col-span-5 reveal-grid">
               <div className="grid grid-cols-1 gap-12">
                 {[
                   { title: t('Differentiators.coa.title'), desc: t('Differentiators.coa.description'), num: '01' },
                   { title: t('Differentiators.support.title'), desc: t('Differentiators.support.description'), num: '02' }
                 ].map((item, i) => (
                   <div key={i} className="reveal-card group p-10 bg-white rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.02)] border border-black/5 transition-all hover:shadow-[0_40px_80px_rgba(0,0,0,0.05)] hover:-translate-y-1">
                     <div className="flex justify-between items-start mb-8">
                        <span className="text-[10px] font-bold text-black/20 font-dm-mono">{item.num}</span>
                        <div className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center text-black/20 group-hover:text-black group-hover:border-black transition-colors">
                           <ArrowRight className="w-4 h-4" />
                        </div>
                     </div>
                     <h3 className="font-absans text-3xl font-bold uppercase tracking-tight mb-4">{item.title}</h3>
                     <p className="font-archia text-black/50 leading-relaxed">{item.desc}</p>
                   </div>
                 ))}
               </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 bg-[#090C11] py-32 md:py-48 overflow-hidden">
        <div className="absolute top-0 left-0 w-full px-6 lg:px-12 pt-2 z-20">
          <div className="container mx-auto">
            <svg viewBox="0 0 1200 4" className="w-full h-1 reveal-line" data-scrub="true">
              <path d="M0 2 H1200" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1.5" fill="none" />
            </svg>
          </div>
        </div>

        {/* Subtle Dark Grain Texture */}
        <div className="absolute inset-0 opacity-30 pointer-events-none bg-[url('/images/noise.svg')]" />
        
        <div className="container mx-auto px-6 lg:px-12 relative z-10">
          <FadeIn className="max-w-3xl mb-24">
            <div className="inline-flex items-center gap-3 mb-6">
              <div className="w-10 h-px bg-white/20" />
              <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-white/40">{t('BestSellers.badge')}</span>
            </div>
            <h2 className="reveal-text font-absans text-3xl sm:text-4xl md:text-6xl font-bold text-white leading-[1.1] sm:leading-[0.9] tracking-tighter uppercase">
              {t('BestSellers.title').split('Compounds')[0]}
              <span className="text-white/20 italic font-medium lowercase block md:inline md:ml-4">Compounds</span>
            </h2>
            <p className="mt-8 max-w-xl font-archia text-lg text-white/40 leading-relaxed">
              {t('BestSellers.subtitle')}
            </p>
          </FadeIn>

          <div className="reveal-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
            {(t.raw('BestSellers.items') as BestSellerItem[]).slice(0, 8).map((p, i) => {
              const slug = bestSellerSlugs[i];
              const cat = bestSellerCats[i];

              const bestSellerImages: Record<string, string> = {
                'semaglutide': '/product-images/SEMAGLUTIDE 5mg-2.webp',
                'tirzepatide': '/product-images/TIRZEPATIDE 10mg-3.webp',
                'retatrutide': '/product-images/RETATRUTIDE 10mg-6.webp',
                'bpc-157': '/product-images/BPC-157 5mg-5.webp',
                'tb-500': '/product-images/TB-500  5mg-2.webp',
                'ipamorelin': '/product-images/IPAMORELIN 5mg-2.webp',
                'cjc-1295-ipam': '/product-images/CJC 1295 IPAMORELIN 5mg 5mg-2.webp',
                'nad': '/product-images/nad-plus-500mg-1.webp',
                'epithalon': '/product-images/EPITHALON 10mg.webp'
              };
              const productImg = bestSellerImages[slug] || '/product-images/SEMAGLUTIDE 5mg-2.webp';

              return (
                <div 
                  key={slug} 
                  className="reveal-card group relative flex flex-col h-[520px] rounded-[1.5rem] bg-white/[0.02] border border-white/10 p-6 transition-all duration-700 hover:bg-white/[0.05] hover:border-white/20 hover:shadow-[0_40px_80px_rgba(0,0,0,0.5)] hover:-translate-y-2"
                >
                  <Link 
                    href={`/products/${slug}`} 
                    className="flex flex-col h-full w-full text-left"
                  >
                    <div className="flex-grow flex flex-col">
                      {/* Seamless Light Backdrop for Product Bottle */}
                      <div className="relative w-full h-60 flex items-center justify-center mb-4 overflow-hidden rounded-xl bg-white p-4">
                        <Image 
                          src={productImg} 
                          alt={`${p.name} High Purity Wholesale Research Peptide`}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          className="object-contain filter group-hover:scale-105 transition-transform duration-700 ease-out" 
                        />
                      </div>

                      <div className="flex items-center gap-3 mb-4">
                        <span className="px-3 py-1 rounded-full bg-white/10 border border-white/10 text-white text-[8px] font-bold uppercase tracking-widest">{pt(`categories.${cat}.name`)}</span>
                        <div className="h-px flex-grow bg-white/10" />
                      </div>
                      
                      <h3 className="font-absans text-lg font-bold text-white tracking-tight mb-2 group-hover:text-white/80 transition-colors uppercase line-clamp-1">{p.name}</h3>
                      <p className="font-archia text-xs leading-relaxed text-white/40 line-clamp-2 mb-3">{p.desc}</p>
                      
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10 mt-auto">
                        <div>
                          <div className="text-[8px] font-bold uppercase tracking-widest text-white/30 mb-1">{t('BestSellers.technicalGrade')}</div>
                          <div className="font-archia text-xs font-bold text-white">{p.spec}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[8px] font-bold uppercase tracking-widest text-white/30 mb-1">{t('BestSellers.verifiedPurity')}</div>
                          <div className="font-archia text-xs font-bold text-emerald-400">&ge;99.0%</div>
                        </div>
                      </div>
                    </div>

                    <div 
                      className="mt-6 relative inline-flex items-center justify-center gap-4 py-4 rounded-2xl bg-white text-black overflow-hidden transition-all group-hover:pr-12 group-hover:bg-white/90"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] relative z-10 font-bold">{t('BestSellers.viewSpecs')}</span>
                      <ArrowRight className="h-4 w-4 absolute right-8 opacity-0 transition-all group-hover:opacity-100 group-hover:right-6" />
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>

          <FadeIn direction="up" delay={0.2} className="mt-24 flex justify-center">
            <Link 
              href="/products" 
              className="group relative inline-flex w-full sm:w-auto items-center justify-center gap-6 rounded-full border border-white/15 bg-white/5 px-10 py-5 transition-all duration-500 hover:border-white/30 hover:bg-white/10 hover:shadow-[0_10px_30px_rgba(255,255,255,0.05)] overflow-hidden"
            >
              <span className="text-[11px] font-bold uppercase tracking-[0.4em] text-white transition-transform duration-500 group-hover:-translate-x-1">
                {t('BestSellers.browseAll', { count: productsData.length })}
              </span>
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white text-black transition-all duration-500 group-hover:bg-white/90">
                <ArrowRight className="h-4 w-4 transition-transform duration-500 group-hover:translate-x-1" />
              </div>
              
              {/* Premium Specular Highlight */}
              <div className="absolute top-0 left-[-100%] w-1/2 h-full bg-gradient-to-r from-transparent via-white/[0.05] to-transparent skew-x-[-25deg] transition-all duration-1000 group-hover:left-[150%]" />
            </Link>
          </FadeIn>
        </div>
      </section>

      <section className="relative z-10 overflow-hidden bg-[#F2F2F2] py-32 md:py-48">
        <div className="absolute top-0 left-0 w-full px-6 lg:px-12 pt-2 z-20">
          <div className="container mx-auto">
            <svg viewBox="0 0 1200 4" className="w-full h-1 reveal-line" data-scrub="true">
              <path d="M0 2 H1200" stroke="rgba(0, 0, 0, 0.06)" strokeWidth="1.5" fill="none" />
            </svg>
          </div>
        </div>

        <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] pointer-events-none bg-[url('/images/noise.svg')]" />
        
        <div className="container mx-auto px-6 lg:px-12 relative z-10">
          <div className="mb-24 flex flex-col justify-between gap-12 md:flex-row md:items-end">
            <FadeIn className="max-w-3xl">
              <div className="inline-flex items-center gap-3 mb-6">
                <div className="w-10 h-px bg-black/10" />
                <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-black/40">{t('Categories.badge')}</span>
              </div>
              <h2 className="reveal-text font-absans text-3xl sm:text-4xl md:text-7xl font-bold text-black leading-[1.1] sm:leading-none tracking-tighter uppercase">
                {t('Categories.title').split('Library')[0]}
                <span className="text-black/20 italic font-medium lowercase ml-4">Library</span>
              </h2>
              <p className="mt-8 max-w-xl font-archia text-lg text-black/40 leading-relaxed">
                {t('Categories.subtitle')}
              </p>
            </FadeIn>
            <FadeIn direction="left" delay={0.2}>
              <Link href="/products" className="group inline-flex items-center gap-4 px-8 py-4 rounded-full border border-black/10 bg-white text-[10px] font-bold uppercase tracking-[0.3em] text-black transition-all hover:bg-black hover:text-white shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
                {t('Categories.cta')} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </FadeIn>
          </div>

          <div className="reveal-grid grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              { id: 'metabolic-research', icon: Zap },
              { id: 'cognitive-function', icon: Microscope },
              { id: 'sleep-cycle-investigation', icon: ShieldCheck },
              { id: 'growth-factor-research', icon: Award },
              { id: 'recovery-research', icon: Star },
              { id: 'cellular-health-research', icon: FlaskConical },
              { id: 'aminos', icon: Globe },
              { id: 'essentials', icon: Truck },
            ].map((cat, idx) => (
              <div key={cat.id} className="reveal-card">
                <Link 
                  href={`/products#${cat.id}`} 
                  className="group relative h-[400px] w-full block rounded-[2.5rem] border border-black/[0.06] bg-white p-10 overflow-hidden transition-all duration-700 hover:-translate-y-2 hover:border-black/15 shadow-[0_15px_40px_rgba(0,0,0,0.02)] hover:shadow-[0_25px_50px_rgba(0,0,0,0.06)]"
                >
                  <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[url('/images/noise.svg')]" />

                  <div className="flex h-full flex-col justify-between relative z-10">
                    <div>
                      <div className="mb-12 flex h-14 w-14 items-center justify-center rounded-2xl bg-black/5 border border-black/5 group-hover:bg-black group-hover:text-white transition-all duration-500">
                        <cat.icon className="h-6 w-6 text-black group-hover:text-white transition-colors duration-500" />
                      </div>
                      <h4 className="font-absans text-2xl font-bold leading-tight text-black tracking-tight mb-4">{pt(`categories.${cat.id}.name`)}</h4>
                      <p className="line-clamp-3 font-archia text-sm leading-relaxed text-black/45 group-hover:text-black/70 transition-colors">{pt(`categories.${cat.id}.desc`)}</p>
                    </div>
                    <div className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-[0.2em] text-black/35 group-hover:text-black transition-colors">
                      <div className="w-6 h-px bg-black/20 group-hover:w-10 transition-all" />
                      {t('Categories.exploreSeries')}
                    </div>
                  </div>
                </Link>
              </div>
            ))}

            <div className="reveal-card">
              <Link href="/products" className="group relative h-[400px] w-full block rounded-[2.5rem] bg-black p-10 overflow-hidden transition-all duration-700 hover:-translate-y-2 shadow-[0_25px_50px_rgba(0,0,0,0.15)]">
                <div className="absolute inset-0 opacity-[0.05] pointer-events-none bg-[url('/images/noise.svg')]" />
                <div className="flex h-full flex-col items-start justify-between relative z-10">
                  <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center text-black">
                    <FlaskConical className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="font-absans text-3xl font-bold uppercase tracking-tight text-white mb-4">{t('Categories.fullCatalog')}</h4>
                    <p className="font-archia text-sm leading-relaxed text-white/60 mb-10">{t('Categories.fullCatalogDesc')}</p>
                    <div className="inline-flex h-14 w-full items-center justify-center gap-4 rounded-2xl bg-white text-black transition-all duration-500 group-hover:gap-6">
                      <span className="text-[10px] font-bold uppercase tracking-widest">{t('Categories.accessCatalog')}</span>
                      <ArrowRight className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 border-y border-white/5 bg-[#0B0E14] text-white py-32 md:py-48">
        <div className="absolute top-0 left-0 w-full px-6 lg:px-12 pt-2 z-20">
          <div className="container mx-auto">
            <svg viewBox="0 0 1200 4" className="w-full h-1 reveal-line" data-scrub="true">
              <path d="M0 2 H1200" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1.5" fill="none" />
            </svg>
          </div>
        </div>

        <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('/images/noise.svg')]" />
        
        <div className="container mx-auto grid grid-cols-1 gap-14 px-6 lg:grid-cols-2 lg:px-12 relative z-10">
          <FadeIn className="lg:col-span-1">
            <div className="inline-flex items-center gap-3 mb-10">
              <div className="w-10 h-px bg-white/20" />
              <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-white/40">{t('Quality.technicalStandard')}</span>
            </div>
            <h2 className="reveal-text font-absans text-3xl sm:text-4xl md:text-7xl font-bold leading-[1.1] sm:leading-[0.9] tracking-tighter uppercase mb-8">
              {t('Quality.title').split('Verification')[0]}
              <span className="text-white/20 italic font-medium lowercase block mt-2">{t('Quality.verification')}</span>
            </h2>
            <p className="font-archia text-lg leading-relaxed text-white/40 max-w-xl mb-12">
              {t('Quality.description')}
            </p>
            <Link href="/quality" className="group inline-flex items-center gap-4 px-8 py-4 rounded-full border border-white/10 bg-white/5 text-[10px] font-bold uppercase tracking-[0.3em] text-white transition-all hover:bg-white hover:text-black">
              {t('Quality.cta')} <ArrowRight className="h-4 w-4" />
            </Link>
          </FadeIn>

          <div className="reveal-grid grid gap-6 lg:col-span-1">
            {qualityDownloads.map((item) => {
              const nameMap: Record<string, string> = {
                bpc: 'BPC-157',
                sema: 'Semaglutide',
                tirz: 'Tirzepatide'
              };
              const name = nameMap[item] || item;
              return (
                <div key={item} className="reveal-card">
                  <a 
                    href={`https://wa.me/18433307365?text=${encodeURIComponent(`Hi, I'd like to request the batch COA report for ${name}.`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative flex items-center justify-between gap-4 rounded-[1.5rem] sm:rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 sm:p-8 overflow-hidden transition-all duration-500 hover:bg-white/[0.08] hover:border-white/20 text-left"
                  >
                    <div className="relative z-10 flex-grow">
                      <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-white/20 mb-2 sm:mb-3">{t('Quality.batchReport')}</div>
                      <span className="block font-absans text-base xs:text-lg sm:text-2xl font-bold text-white uppercase tracking-tight leading-tight">{t(`Quality.downloads.${item}` as never)}</span>
                    </div>
                    <div className="relative z-10 w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white flex-shrink-0 transition-all group-hover:bg-white group-hover:text-black">
                      <Download className="h-5 w-5 sm:h-6 sm:w-6" />
                    </div>
                    <div className="absolute top-0 right-0 w-32 h-full bg-gradient-to-l from-white/[0.02] to-transparent pointer-events-none" />
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative z-10 bg-[#F4F6F4] py-32 md:py-48" id="wholesale-tiers">
        <div className="absolute top-0 left-0 w-full px-6 lg:px-12 pt-2 z-20">
          <div className="container mx-auto">
            <svg viewBox="0 0 1200 4" className="w-full h-1 reveal-line" data-scrub="true">
              <path d="M0 2 H1200" stroke="rgba(0, 0, 0, 0.06)" strokeWidth="1.5" fill="none" />
            </svg>
          </div>
        </div>

        <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[url('/images/noise.svg')]" />
        
        <div className="container mx-auto px-6 lg:px-12 relative z-10">
          <FadeIn className="mx-auto mb-24 max-w-3xl text-center">
            <div className="inline-flex items-center gap-3 mb-6">
              <div className="w-10 h-px bg-black/10" />
              <span className={eyebrow}>{t('Tiers.badge')}</span>
              <div className="w-10 h-px bg-black/10" />
            </div>
            <h2 className={`reveal-text ${heading} mt-5`}>{t('Tiers.title')}</h2>
            <p className="mt-8 font-archia text-lg leading-relaxed text-black/40">{t('Tiers.description')}</p>
          </FadeIn>
          
          <div className="reveal-grid grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {tierKeys.map((tierKey, i) => {
              const tier = (t.raw('Tiers.items') as Record<TierKey, TierItem>)[tierKey];
              const isPremium = i >= 2;
              return (
                <div key={tierKey} className="h-full reveal-card">
                  <div className={`group relative flex flex-col h-full rounded-[2.5rem] border transition-all duration-700 p-10 overflow-hidden ${isPremium ? 'bg-black text-white border-white/10 hover:shadow-[0_40px_80px_rgba(0,0,0,0.4)]' : 'bg-white text-black border-black/5 hover:shadow-[0_40px_80px_rgba(0,0,0,0.06)] hover:-translate-y-2'}`}>
                    {isPremium && <span className="absolute right-10 top-10 rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white">{t('Tiers.bestValue')}</span>}
                    
                    <div className="mb-10">
                      <div className={`text-[9px] font-bold uppercase tracking-[0.3em] mb-4 ${isPremium ? 'text-white/40' : 'text-black/40'}`}>{tier.label}</div>
                      <div className="font-absans text-5xl font-bold uppercase tracking-tighter mb-2">{tier.name}</div>
                      <div className={`font-archia text-xs font-bold uppercase tracking-widest ${isPremium ? 'text-white/30' : 'text-black/30'}`}>{tier.kits}</div>
                    </div>
                    
                    <p className={`font-archia text-sm leading-relaxed flex-grow ${isPremium ? 'text-white/40' : 'text-black/40'}`}>{tier.description}</p>
                    
                    <a 
                      href={`https://wa.me/18433307365?text=${encodeURIComponent(`Hi, I'd like to learn about wholesale tier ${tier.name} pricing.`)}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className={`mt-10 inline-flex w-full items-center justify-center rounded-2xl py-5 text-[10px] font-bold uppercase tracking-widest transition-all ${isPremium ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'}`}
                    >
                      {t('Tiers.getPricng')}
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mx-auto mt-14 max-w-3xl text-center font-archia text-[10px] font-bold uppercase tracking-[0.2em] text-black/30">{t('Tiers.onRequests')}</p>
        </div>
      </section>

      <section className="relative z-10 py-24 bg-black overflow-hidden border-y border-white/5">
        <div className="absolute top-0 left-0 w-full px-6 lg:px-12 pt-2 z-20">
          <div className="container mx-auto">
            <svg viewBox="0 0 1200 4" className="w-full h-1 reveal-line" data-scrub="true">
              <path d="M0 2 H1200" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1.5" fill="none" />
            </svg>
          </div>
        </div>
        <div className="container mx-auto px-6 lg:px-12 relative z-10">
          <div className="reveal-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {[
              { id: 'compounds', stat: '50+', icon: FlaskConical },
              { id: 'purity', stat: '99%+', icon: ShieldCheck },
              { id: 'clients', stat: 'COA', icon: Building2 },
              { id: 'coverage', stat: '50 States', icon: Globe },
            ].map((s, idx) => (
              <div 
                key={s.id} 
                className="reveal-card group relative p-8 md:p-10 rounded-[2.5rem] bg-white/[0.03] border border-white/10 transition-all duration-500 hover:bg-white/[0.07] hover:border-white/20 hover:-translate-y-1"
              >
                <div className="flex flex-col gap-8 relative z-10">
                   <div className="flex justify-between items-start">
                      <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white/40 group-hover:bg-white group-hover:text-black transition-all duration-500">
                         <s.icon className="w-5 h-5" />
                      </div>
                      <div className="font-dm-mono text-[9px] font-bold uppercase tracking-[0.4em] text-white/20 pt-2">
                         [ {idx + 1} ]
                      </div>
                   </div>

                   <div>
                      <div className="font-dm-mono text-[10px] font-bold uppercase tracking-[0.3em] text-white/40 mb-2">
                         {t(`StatsBar.${s.id}.label`)}
                      </div>
                      <div className="font-goku text-5xl md:text-6xl font-bold text-white leading-none mb-3">
                         {s.stat}
                      </div>
                      <div className="font-archia text-[9px] font-bold uppercase tracking-[0.2em] text-white/20">
                         {t(`StatsBar.${s.id}.sub`)}
                      </div>
                   </div>
                </div>
                
                {/* Subtle Technical Grid Line */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-0 bg-gradient-to-b from-white/20 to-transparent group-hover:h-full transition-all duration-700" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`relative z-10 bg-[#E8EAE6] ${sectionPad}`} id="testimonials">
        <div className="absolute top-0 left-0 w-full px-6 lg:px-12 pt-2 z-20">
          <div className="container mx-auto">
            <svg viewBox="0 0 1200 4" className="w-full h-1 reveal-line" data-scrub="true">
              <path d="M0 2 H1200" stroke="rgba(0, 0, 0, 0.06)" strokeWidth="1.5" fill="none" />
            </svg>
          </div>
        </div>

        <div className="container mx-auto px-6 lg:px-12">
          {/* Testimonials Header */}
          <div className="flex flex-col lg:flex-row justify-between items-end gap-12 mb-20">
            <FadeIn className="max-w-3xl">
              <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-black/40 mb-6 block">
                [ {t('Testimonials.badge')} ]
              </span>
              <h2 className="reveal-text font-absans text-3xl sm:text-4xl md:text-8xl font-bold text-black leading-[1.1] sm:leading-[0.9] uppercase tracking-tighter">
                {t('Testimonials.title')}
              </h2>
            </FadeIn>
            <FadeIn delay={0.3} className="shrink-0 pb-2 hidden lg:block">
              <div className="flex gap-2">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-black text-black" />
                ))}
              </div>
            </FadeIn>
          </div>

          <div className="reveal-grid grid grid-cols-1 md:grid-cols-3 gap-8">
            {(t.raw('Testimonials.items') as TestimonialItem[]).map((test, i) => (
              <div key={i} className="reveal-card group relative bg-white p-10 md:p-14 rounded-[2.5rem] flex flex-col min-h-[450px] transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_40px_100px_rgba(0,0,0,0.06)]">
                {/* Large Decorative Quote Icon */}
                <div className="absolute top-10 right-10 text-black/5 transition-colors group-hover:text-black/10">
                   <svg width="60" height="60" viewBox="0 0 60 60" fill="currentColor">
                      <path d="M14.5 38.5c0 3.3-2.7 6-6 6s-6-2.7-6-6c0-6.6 5.4-12 12-12v4c-4.4 0-8 3.6-8 8h8v10h-10v-10h10zm24 0c0 3.3-2.7 6-6 6s-6-2.7-6-6c0-6.6 5.4-12 12-12v4c-4.4 0-8 3.6-8 8h8v10h-10v-10h10z" />
                   </svg>
                </div>

                <div className="flex-grow pt-8">
                  <p className="font-archia text-lg md:text-xl leading-relaxed text-black/80 italic mb-10">
                    &ldquo;{test.quote}&rdquo;
                  </p>
                </div>

                <div className="mt-auto pt-8 border-t border-black/5">
                  <h4 className="font-absans text-lg font-bold text-black mb-1 uppercase tracking-tight">
                    {test.role}
                  </h4>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-[#d72f45] uppercase tracking-widest">
                      {test.location}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-black/10" />
                    <span className="text-[10px] font-bold text-black/30 uppercase tracking-widest">
                      {t('Testimonials.verifiedClient')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Institutional Trust Bar */}
          <div className="mt-20 pt-10 border-t border-black/10 flex flex-wrap justify-center md:justify-between items-center gap-8 opacity-40 grayscale transition-all hover:grayscale-0 hover:opacity-100">
             {(t.raw('Testimonials.institutionalTrust') as string[]).map((badge, idx) => (
               <span key={idx} className="font-dm-mono text-[11px] font-bold uppercase tracking-[0.3em]">{badge}</span>
             ))}
          </div>
        </div>
      </section>

      <section className={`relative z-10 bg-[#F9F9F7] ${sectionPad}`}>
        <div className="absolute top-0 left-0 w-full px-6 lg:px-12 pt-2 z-20">
          <div className="container mx-auto">
            <svg viewBox="0 0 1200 4" className="w-full h-1 reveal-line" data-scrub="true">
              <path d="M0 2 H1200" stroke="rgba(0, 0, 0, 0.06)" strokeWidth="1.5" fill="none" />
            </svg>
          </div>
        </div>

        <div className="container mx-auto px-6 lg:px-12">
          <div className="flex flex-col lg:flex-row justify-between items-start gap-12 mb-24">
            <FadeIn className="max-w-3xl">
              <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-black/40 mb-6 block">
                [ {t('Services.badge')} ]
              </span>
              <h2 className="reveal-text font-absans text-3xl sm:text-4xl md:text-8xl font-bold text-black leading-[1.1] sm:leading-[0.9] uppercase tracking-tighter mb-10">
                {t('Services.title')}
              </h2>
            </FadeIn>
            <FadeIn delay={0.3} className="lg:max-w-md pt-8">
              <p className="font-archia text-lg leading-relaxed text-black/60 mb-8 border-l-2 border-black/10 pl-8">
                {t('Services.description')}
              </p>
            </FadeIn>
          </div>

          <div className="reveal-grid grid grid-cols-1 md:grid-cols-2 gap-8 mb-24">
            {serviceItems.map((s) => {
              const service = (t.raw('Services.items') as Record<ServiceKey, ServiceItem>)[s.key];
              
              return (
                <div key={s.key} className="h-full reveal-card">
                  <div className="group h-full bg-white border border-black/5 p-10 md:p-14 rounded-[2rem] flex flex-col md:flex-row gap-10 transition-all duration-500 hover:border-black/20 hover:shadow-[0_40px_100px_rgba(0,0,0,0.04)]">
                    <div className="shrink-0">
                      <div className="w-16 h-16 rounded-2xl bg-black text-white flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform duration-500">
                        <s.icon className="h-7 w-7" />
                      </div>
                    </div>

                    <div>
                      <h4 className="font-absans text-2xl md:text-3xl font-bold text-black mb-6 leading-tight">
                        {service.title}
                      </h4>
                      <p className="font-archia text-sm leading-relaxed text-black/50 mb-8 max-w-sm">
                        {service.desc}
                      </p>
                      <ul className="space-y-3">
                        {(t.raw(`Services.benefits.${s.key}`) as string[]).map((benefit, idx) => (
                          <li key={idx} className="flex items-center gap-3 font-dm-mono text-[10px] font-bold uppercase tracking-widest text-black/40">
                            <span className="w-1 h-1 rounded-full bg-black/20" />
                            {benefit}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* New Section CTA */}
          <div className="reveal-card-3d relative overflow-hidden bg-black rounded-[3rem] p-12 md:p-24 text-white">
             <div className="absolute top-0 right-0 w-1/2 h-full opacity-10 pointer-events-none">
                 <svg width="100%" height="100%" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
                   <circle cx="200" cy="200" r="180" stroke="white" strokeWidth="1" strokeDasharray="10 10" />
                   <circle cx="200" cy="200" r="140" stroke="white" strokeWidth="0.5" />
                   <circle cx="200" cy="200" r="100" stroke="white" strokeWidth="2" strokeDasharray="5 5" />
                 </svg>
              </div>

              <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                 <div>
                    <h3 className="font-absans text-3xl sm:text-4xl md:text-7xl font-bold uppercase leading-[1.1] sm:leading-none tracking-tighter mb-8" dangerouslySetInnerHTML={{ __html: t('Services.scaleTitle') }} />
                    <p className="font-archia text-lg text-white/50 max-w-md">
                       {t('Services.scaleSubtitle')}
                    </p>
                 </div>
                 <div className="flex flex-col sm:flex-row gap-6">
                    <Link 
                       href="/services" 
                       className="group flex-1 bg-white text-black px-10 py-6 rounded-full font-bold uppercase tracking-widest text-center flex items-center justify-center gap-4 hover:bg-[#F1FF85] transition-all"
                    >
                       {t('Services.guide')}
                       <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                    </Link>
                    <Link 
                       href="/wholesale-application"
                       className="group flex-1 border border-white/20 text-white px-10 py-6 rounded-full font-bold uppercase tracking-widest text-center flex items-center justify-center gap-4 hover:bg-white hover:text-black transition-all"
                    >
                       {t('Services.wholesaleApp')}
                       <ArrowUpRight className="w-5 h-5 transition-transform group-hover:rotate-45" />
                    </Link>
                 </div>
              </div>
          </div>
        </div>
      </section>

      <section className={`relative z-10 bg-[#F2F4F2] ${sectionPad}`}>
        <div className="absolute top-0 left-0 w-full px-6 lg:px-12 pt-2 z-20">
          <div className="container mx-auto">
            <svg viewBox="0 0 1200 4" className="w-full h-1 reveal-line" data-scrub="true">
              <path d="M0 2 H1200" stroke="rgba(0, 0, 0, 0.06)" strokeWidth="1.5" fill="none" />
            </svg>
          </div>
        </div>

        <div className="container mx-auto px-6 lg:px-12">
          {/* Insights Header Bar */}
          <div className="flex justify-between items-center border-b border-black/10 pb-4 mb-12">
            <span className="text-[10px] md:text-[11px] font-bold uppercase tracking-[0.3em] text-black/40">({t('Blog.badge')})</span>
            <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-black/10 text-[10px] md:text-[11px] font-bold uppercase tracking-[0.2em] text-black/60">
              {(t.raw('Blog.items') as BlogItem[]).length.toString().padStart(2, '0')}
            </div>
          </div>

          <div className="flex flex-col lg:flex-row justify-between items-start gap-12 mb-16">
            <div className="max-w-4xl">
              <h2 className="reveal-text font-absans text-3xl sm:text-4xl md:text-8xl font-bold text-black leading-[1.1] sm:leading-[0.9] uppercase tracking-tighter">
                {t('Blog.title')}
              </h2>
            </div>
            <Link 
              href="/blog" 
              className="group inline-flex items-center gap-4 rounded-full border border-black/10 px-8 py-4 text-[11px] font-bold uppercase tracking-[0.2em] text-black transition-all hover:bg-black hover:text-white"
            >
              {t('Blog.cta')}
              <ArrowUpRight className="w-4 h-4 transition-transform group-hover:rotate-45" />
            </Link>
          </div>

          <div className="reveal-grid grid grid-cols-1 md:grid-cols-3 gap-8">
            {(t.raw('Blog.items') as BlogItem[]).map((post, i) => (
              <div key={post.slug} className="h-full reveal-card">
                <Link 
                  href={`/blog/${post.slug}`} 
                  className="group relative h-full bg-white border border-black/5 p-10 md:p-12 flex flex-col min-h-[420px] transition-all hover:border-black/20 hover:shadow-[0_40px_80px_rgba(0,0,0,0.04)]"
                >
                  <div className="flex justify-between items-start mb-12">
                    <span className="font-goku text-7xl md:text-8xl font-bold text-black/5 group-hover:text-black/10 transition-colors">
                      {(i + 1).toString().padStart(2, '0')}.
                    </span>
                    <div className="rounded-full border border-black/10 px-4 py-1.5 font-dm-mono text-[9px] font-bold uppercase tracking-widest text-black/40">
                      {post.tag}
                    </div>
                  </div>

                  <div className="flex-grow">
                    <h3 className="font-absans text-2xl md:text-3xl font-bold leading-tight text-black mb-6">
                      {post.title}
                    </h3>
                    <p className="font-archia text-sm md:text-base leading-relaxed text-black/50 line-clamp-3">
                      {post.desc}
                    </p>
                  </div>

                  <div className="mt-12 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.2em] text-black/40 group-hover:text-black transition-colors">
                    {t('Blog.readMore')} 
                    <div className="w-8 h-8 rounded-full border border-black/5 flex items-center justify-center group-hover:border-black/20 transition-all">
                      <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <FaqSection 
        title={t('FAQ.title')}
        subtitle={t('FAQ.subtitle')}
        items={t.raw('FAQ.items') as FaqItem[]}
        eyebrow="(FAQ)"
        theme="light"
      />

      <GlobalCTA 
        badge={t('FinalCta.badge')}
        title={t('FinalCta.title')}
        subtitle={t('FinalCta.subtitle')}
        primaryCtaText={t('FinalCta.whatsapp')}
        primaryCtaHref={`https://wa.me/18433307365?text=${encodeURIComponent(t('FinalCta.msg'))}`}
        secondaryCtaText={t('FinalCta.email')}
        secondaryCtaHref="mailto:sales@99puritywholesale.com"
      />
    </div>
  );
}
