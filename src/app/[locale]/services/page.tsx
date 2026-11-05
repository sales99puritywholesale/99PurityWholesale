import { Zap, Package, Rocket, MonitorSmartphone, TrendingUp, Tag, PhoneCall, CheckCircle2, Settings, ShieldCheck, Award, Users, Globe, Lock, FlaskConical, ClipboardCheck, Handshake, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import GlobalCTA from '@/components/layout/GlobalCTA';
import FaqSection from '@/components/shared/FaqSection';
import FaqSchema from '@/components/seo/FaqSchema';

export async function generateMetadata(props: any) {
  const params = props?.params || {};
  const locale = params?.locale || 'en';
  const t = await getTranslations({locale, namespace: 'Meta'});
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://99puritywholesale.com';
  const path = '/services';
  const url = locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  const ogTitle = t('servicesOgTitle');
  const ogDesc = t('servicesOgDesc');
  const ogUrlImage = `${baseUrl}/api/og?title=${encodeURIComponent('B2B Wholesale Services')}&desc=${encodeURIComponent(ogDesc)}&category=Services`;

  return {
    metadataBase: new URL(baseUrl),
    title: t('servicesTitle'),
    description: t('servicesDesc'),
    alternates: {
      canonical: url,
      languages: {
        'en-US': `${baseUrl}${path}`,
        es: `${baseUrl}/es${path}`,
        'x-default': `${baseUrl}${path}`,
      },
    },
    openGraph: {
      title: ogTitle,
      description: ogDesc,
      url: url,
      siteName: '99 Purity Wholesale',
      images: [
        {
          url: ogUrlImage,
          width: 1200,
          height: 630,
          alt: '99 Purity Wholesale B2B Services',
        },
      ],
      locale: locale,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: t('servicesTitle'),
      description: t('servicesDesc'),
      images: [ogUrlImage],
    },
    robots: 'index, follow',
    keywords: [
      t('servicesKeywords.k1'),
      t('servicesKeywords.k2'),
      t('servicesKeywords.k3'),
      t('servicesKeywords.k4'),
      t('servicesKeywords.k5'),
      t('servicesKeywords.k6'),
      t('servicesKeywords.k7'),
      t('servicesKeywords.k8'),
      t('servicesKeywords.k9'),
      t('servicesKeywords.k10'),
      t('servicesKeywords.k11'),
    ],
  };
}

function stripLinks(text: string) {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

export default async function ServicesPage({ params }: { params: { locale: string } }) {
  const t = await getTranslations({ locale: params.locale, namespace: 'Services' });
  const faqs = t.raw('faq.items') as { q: string; a: string }[];
  // Schema text needs markdown links stripped to plain text; the visual <FaqSection> below
  // needs the raw markdown to render real links, so it renders with includeSchema={false}.
  const faqSchemaItems = faqs.map(f => ({ q: f.q, a: stripLinks(f.a) }));

  const services = [
    {
      id: 'dropshipping',
      icon: Package,
      eyebrow: t('items.dropshipping.eyebrow'),
      title: t('items.dropshipping.title'),
      description: t('items.dropshipping.desc'),
      tags: [
        t('items.dropshipping.tags.t1'),
        t('items.dropshipping.tags.t2'),
        t('items.dropshipping.tags.t3')
      ],
      idealFor: [
        t('items.dropshipping.idealFor.i1'),
        t('items.dropshipping.idealFor.i2'),
        t('items.dropshipping.idealFor.i3')
      ],
      ctaText: t('items.dropshipping.ctaText'),
      whatsappMsg: t('items.dropshipping.msg')
    },
    {
      id: 'launch-support',
      icon: Rocket,
      eyebrow: t('items.launch-support.eyebrow'),
      title: t('items.launch-support.title'),
      description: t('items.launch-support.desc'),
      tags: [
        t('items.launch-support.tags.t1'),
        t('items.launch-support.tags.t2'),
        t('items.launch-support.tags.t3')
      ],
      idealFor: [
        t('items.launch-support.idealFor.i1'),
        t('items.launch-support.idealFor.i2'),
        t('items.launch-support.idealFor.i3')
      ],
      ctaText: t('items.launch-support.ctaText'),
      whatsappMsg: t('items.launch-support.msg')
    },
    {
      id: 'website-development',
      icon: MonitorSmartphone,
      eyebrow: t('items.website-development.eyebrow'),
      title: t('items.website-development.title'),
      description: t('items.website-development.desc'),
      tags: [
        t('items.website-development.tags.t1'),
        t('items.website-development.tags.t2'),
        t('items.website-development.tags.t3')
      ],
      idealFor: [
        t('items.website-development.idealFor.i1'),
        t('items.website-development.idealFor.i2'),
        t('items.website-development.idealFor.i3')
      ],
      ctaText: t('items.website-development.ctaText'),
      whatsappMsg: t('items.website-development.msg')
    },
    {
      id: 'sales-distribution',
      icon: TrendingUp,
      eyebrow: t('items.sales-distribution.eyebrow'),
      title: t('items.sales-distribution.title'),
      description: t('items.sales-distribution.desc'),
      tags: [
        t('items.sales-distribution.tags.t1'),
        t('items.sales-distribution.tags.t2'),
        t('items.sales-distribution.tags.t3')
      ],
      idealFor: [
        t('items.sales-distribution.idealFor.i1'),
        t('items.sales-distribution.idealFor.i2'),
        t('items.sales-distribution.idealFor.i3')
      ],
      ctaText: t('items.sales-distribution.ctaText'),
      whatsappMsg: t('items.sales-distribution.msg')
    },
    {
      id: 'private-label',
      icon: Tag,
      eyebrow: t('items.private-label.eyebrow'),
      title: t('items.private-label.title'),
      description: t('items.private-label.desc'),
      tags: [
        t('items.private-label.tags.t1'),
        t('items.private-label.tags.t2'),
        t('items.private-label.tags.t3')
      ],
      idealFor: [
        t('items.private-label.idealFor.i1'),
        t('items.private-label.idealFor.i2'),
        t('items.private-label.idealFor.i3')
      ],
      ctaText: t('items.private-label.ctaText'),
      whatsappMsg: t('items.private-label.msg')
    },
    {
      id: 'fulfillment-consulting',
      icon: Settings,
      eyebrow: t('items.fulfillment-consulting.eyebrow'),
      title: t('items.fulfillment-consulting.title'),
      description: t('items.fulfillment-consulting.desc'),
      tags: [
        t('items.fulfillment-consulting.tags.t1'),
        t('items.fulfillment-consulting.tags.t2'),
        t('items.fulfillment-consulting.tags.t3')
      ],
      idealFor: [
        t('items.fulfillment-consulting.idealFor.i1'),
        t('items.fulfillment-consulting.idealFor.i2'),
        t('items.fulfillment-consulting.idealFor.i3')
      ],
      ctaText: t('items.fulfillment-consulting.ctaText'),
      whatsappMsg: t('items.fulfillment-consulting.msg')
    }
  ];

  return (
    <main className="min-h-screen bg-[#F8F8F6] text-black -mt-24 md:-mt-32">
      {/* FAQ Schema (markdown-stripped; see faqSchemaItems above) */}
      <FaqSchema items={faqSchemaItems} />

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

            {/* Two CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
              <a 
                href={`https://wa.me/18433307365?text=${encodeURIComponent(t('heroCta.msg'))}`} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="group relative flex w-full sm:w-auto items-center justify-center gap-3 px-10 py-5 bg-black hover:bg-black/90 text-white rounded-xl font-bold uppercase tracking-[0.2em] text-[10px] lg:text-xs transition-all shadow-lg active:scale-95 whitespace-nowrap"
              >
                <PhoneCall className="w-4 h-4 text-white" /> 
                {t('heroCta.primary')}
              </a>
              <Link 
                href="/products" 
                className="group relative flex w-full sm:w-auto items-center justify-center gap-3 px-10 py-5 border border-black/15 hover:border-black/30 hover:bg-black/5 text-black rounded-xl font-bold uppercase tracking-[0.2em] text-[10px] lg:text-xs transition-all active:scale-95 whitespace-nowrap"
              >
                <Zap className="w-4 h-4 text-black" /> 
                {t('heroCta.secondary')}
              </Link>
            </div>

            {/* Hero Stats Row - 4 numbers in a horizontal strip */}
            <div className="reveal-grid grid grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto pt-12 border-t border-black/5 mt-16">
              {[
                { num: t('heroStats.stat1Num'), label: t('heroStats.stat1Label') },
                { num: t('heroStats.stat2Num'), label: t('heroStats.stat2Label') },
                { num: t('heroStats.stat3Num'), label: t('heroStats.stat3Label') },
                { num: t('heroStats.stat4Num'), label: t('heroStats.stat4Label') }
              ].map((stat, i) => (
                <div key={i} className="reveal-card flex flex-col items-center justify-center p-6 bg-white border border-black/5 rounded-[2rem] hover:border-black/15 transition-all duration-500 shadow-sm">
                  <span className="text-3xl md:text-4xl font-bold font-absans text-black mb-1">{stat.num}</span>
                  <span className="text-[9px] md:text-[10px] font-bold font-dm-mono uppercase tracking-[0.2em] text-black/40 text-center leading-normal max-w-[160px]">{stat.label}</span>
                </div>
              ))}
            </div>

          </div>
        </div>
      </section>

      {/* Trust Bar Section - Sleek Off-White Strip */}
      <section className="bg-[#FAF9F5] border-b border-black/5 py-8 overflow-x-auto scrollbar-none">
        <div className="container mx-auto px-6 max-w-7xl">
          <div className="flex flex-row items-center justify-between min-w-max lg:min-w-0 divide-x divide-black/10">
            {[
              { icon: ShieldCheck, text: t('trustBar.t1') },
              { icon: Award, text: t('trustBar.t2') },
              { icon: Users, text: t('trustBar.t3') },
              { icon: Globe, text: t('trustBar.t4') },
              { icon: Lock, text: t('trustBar.t5') }
            ].map((item, index) => {
              const IconComponent = item.icon;
              return (
                <div key={index} className="flex items-center justify-center gap-3 px-6 first:pl-0 last:pr-0">
                  <IconComponent className="w-4 h-4 text-black/50 flex-shrink-0" />
                  <span className="text-[10px] md:text-[11px] font-bold font-dm-mono uppercase tracking-[0.2em] text-black/60">
                    {item.text}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Services Grid Section - Stealth Luxury Black */}
      <section className="py-24 md:py-32 bg-[#05080C] text-white border-b border-white/5 relative overflow-hidden">
        {/* Dark Noise Texture */}
        <div className="absolute inset-0 opacity-[0.015] pointer-events-none bg-[url('/images/noise.svg')]" />
        
        <div className="container mx-auto px-6 max-w-7xl relative z-20">
          
          {/* SECTION 3 — SECTION INTRO */}
          <div className="text-center mb-20">
            <div>
              <div className="inline-block bg-white/5 border border-white/5 px-5 py-2 rounded-full text-[10px] font-bold font-dm-sans uppercase tracking-widest text-white/60 mb-6">
                {t('intro.badge')}
              </div>
              
              <h2 className="reveal-text text-3xl md:text-5xl lg:text-6xl font-bold font-absans text-white uppercase tracking-tight leading-none mb-6 max-w-4xl mx-auto">
                {t('intro.title')}
              </h2>
              
              <p className="reveal-text text-sm md:text-base font-archia font-medium text-white/55 max-w-3xl mx-auto leading-relaxed">
                {t('intro.desc')}
              </p>
            </div>
          </div>

          {/* SECTION 4 — SERVICE CARDS (2-column grid desktop, 1-column mobile) */}
          <div className="reveal-grid grid grid-cols-1 lg:grid-cols-2 gap-8">
            {services.map((service, i) => (
              <div key={service.id} className="reveal-card bg-white/[0.02] border border-white/5 rounded-[2.5rem] p-8 md:p-10 hover:border-white/20 hover:bg-white/[0.03] transition-all duration-500 shadow-2xl flex flex-col group relative overflow-hidden">
                {/* Full Card Overlay Link */}
                <Link href={`/services/${service.id}` as any} className="absolute inset-0 z-10">
                  <span className="sr-only">View Details for {service.title}</span>
                </Link>
                
                {/* Card Top Row: Icon and Eyebrow */}
                <div className="flex items-center justify-between mb-8">
                  {/* Clean Dark-Glass Icon Badge */}
                  <div className="w-14 h-14 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-center group-hover:scale-105 group-hover:bg-white/10 group-hover:border-white/20 transition-all duration-500 flex-shrink-0">
                    <service.icon className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-[9px] md:text-[10px] font-bold font-dm-mono uppercase tracking-widest text-white/80 border border-white/10 px-3 py-1 rounded-full bg-white/5">
                    {service.eyebrow}
                  </span>
                </div>
                
                {/* Title */}
                <h3 className="text-2xl font-bold font-absans text-white mb-4 uppercase tracking-wide group-hover:text-white/90 transition-colors">
                  {service.title}
                </h3>
                
                {/* Description */}
                <p className="text-white/60 font-archia font-medium text-sm leading-relaxed mb-6">
                  {service.description}
                </p>

                {/* Keyword Tags pills */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {service.tags.map((tag, idx) => (
                    <span key={idx} className="text-[9px] font-dm-mono uppercase tracking-wider text-white/40 bg-white/5 border border-white/5 px-3 py-1 rounded-full group-hover:bg-white/10 transition-colors">
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Divider */}
                <div className="w-full h-[1px] bg-white/5 mb-6" />

                {/* Ideal For Bullet List */}
                <div className="mb-8 flex-grow">
                  <div className="text-[10px] font-bold font-dm-mono uppercase tracking-widest text-white/50 mb-3">Ideal For:</div>
                  <ul className="space-y-2">
                    {service.idealFor.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-xs text-white/50 font-archia font-medium leading-relaxed">
                        <CheckCircle2 className="w-3.5 h-3.5 text-white/70 flex-shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div className="flex flex-col gap-3 relative z-20 pointer-events-none">
                  <a 
                    href={`https://wa.me/18433307365?text=${encodeURIComponent(service.whatsappMsg)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-white border border-white text-black hover:bg-transparent hover:text-white hover:border-white/30 transition-all duration-300 font-bold font-dm-sans text-[10px] md:text-xs uppercase tracking-[0.2em] py-4 rounded-xl flex items-center justify-center gap-2 active:scale-98 pointer-events-auto"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    {service.ctaText}
                  </a>
                  <div className="w-full border border-white/10 text-white/50 group-hover:text-white group-hover:border-white/30 transition-all duration-300 font-bold font-dm-sans text-[10px] uppercase tracking-[0.2em] py-3.5 rounded-xl flex items-center justify-center gap-2">
                    View Full Details <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* Standalone Widescreen Clinical Laboratory Breakout Card */}
      <section className="bg-[#F8F8F6] pt-24 pb-8 relative overflow-hidden">
        <div className="container mx-auto px-6 max-w-7xl">
          <div className="reveal-card-3d relative overflow-hidden rounded-[2.5rem] h-[320px] md:h-[480px] border border-black/5 shadow-sm group">
            {/* Pristine Full-Color Clinical Laboratory v2 Visual */}
            <Image 
              src="/images/hero-lab-bg-v2.png"
              alt="99 Purity Wholesale Certified Quality Control Laboratory"
              fill
              sizes="(max-width: 1200px) 100vw, 1200px"
              className="object-cover transition-transform duration-[1.5s] ease-out group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent pointer-events-none" />
          </div>
        </div>
      </section>

      {/* SECTION 5 — WHY Partner With Us */}
      <section className="py-24 md:py-32 bg-[#F8F8F6] border-b border-black/5 relative overflow-hidden">
        <div className="container mx-auto px-6 max-w-7xl relative z-10">
          <div className="text-center mb-16">
            <div>
              <div className="inline-block bg-black/5 border border-black/5 px-5 py-2 rounded-full text-[10px] font-bold font-dm-sans uppercase tracking-widest text-black/60 mb-6">
                {t('whyPartner.badge')}
              </div>
              
              <h2 className="reveal-text text-3xl md:text-5xl font-bold font-absans text-black uppercase tracking-tight max-w-4xl mx-auto">
                {t('whyPartner.title')}
              </h2>
            </div>
          </div>

          <div className="reveal-grid grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: FlaskConical, label: t('whyPartner.col1Label'), text: t('whyPartner.col1Text'), num: '01' },
              { icon: ClipboardCheck, label: t('whyPartner.col2Label'), text: t('whyPartner.col2Text'), num: '02' },
              { icon: Handshake, label: t('whyPartner.col3Label'), text: t('whyPartner.col3Text'), num: '03' }
            ].map((col, i) => {
              const IconComponent = col.icon;
              return (
                <div key={i} className="reveal-card bg-white border border-black/5 rounded-[2.5rem] p-8 hover:border-brand-accent/30 hover:shadow-[0_20px_50px_rgba(19,32,52,0.02)] transition-all duration-500 flex flex-col items-start relative overflow-hidden">
                  <div className="flex justify-between items-center w-full mb-6">
                    <div className="w-12 h-12 bg-black/5 rounded-2xl flex items-center justify-center border border-black/5">
                      <IconComponent className="w-5 h-5 text-black/60" />
                    </div>
                    <span className="text-[10px] font-bold font-dm-mono text-black/20">{col.num}</span>
                  </div>
                  <h3 className="text-lg font-bold font-absans text-black mb-3 uppercase tracking-wide leading-snug">
                    {col.label}
                  </h3>
                  <p className="text-black/55 font-archia text-xs leading-relaxed font-medium">
                    {col.text}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECTION 6 — HOW TO GET STARTED (3-Step Process) */}
      <section className="py-24 md:py-32 bg-[#F8F8F6] border-b border-black/5 relative overflow-hidden">
        <div className="container mx-auto px-6 max-w-6xl relative z-10">
          <div className="text-center mb-16">
            <div>
              <div className="inline-block bg-black/5 border border-black/5 px-5 py-2 rounded-full text-[10px] font-bold font-dm-sans uppercase tracking-widest text-black/60 mb-6">
                {t('stepsSubtitle')}
              </div>
              <h2 className="reveal-text text-3xl md:text-5xl font-bold font-absans text-black uppercase tracking-tight mb-4 max-w-4xl mx-auto leading-tight">
                {t('stepsTitle')}
              </h2>
            </div>
          </div>

          <div className="reveal-grid grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Desktop connecting line */}
            <div className="hidden md:block absolute top-1/2 left-[15%] right-[15%] h-[1px] bg-gradient-to-r from-transparent via-black/10 to-transparent -translate-y-1/2"></div>
            
            {/* Step 1 */}
            <div className="reveal-card bg-white border border-black/5 rounded-[2.2rem] p-8 text-center relative z-10 hover:border-black/15 transition-all duration-300 hover:-translate-y-1 shadow-sm">
              <div className="w-16 h-16 bg-[#F8F8F6] rounded-full flex items-center justify-center mx-auto mb-6 border border-black/5">
                <PhoneCall className="w-5 h-5 text-black/60" />
              </div>
              <div className="text-black/40 font-dm-mono font-bold text-[10px] uppercase tracking-widest mb-2">Step 01</div>
              <h3 className="text-lg font-bold font-absans text-black mb-3 uppercase tracking-wide">{t('step1Title')}</h3>
              <p className="text-black/55 font-archia text-xs leading-relaxed font-medium">
                {t('step1Desc')}
              </p>
            </div>

            {/* Step 2 */}
            <div className="reveal-card bg-white border border-black/5 rounded-[2.2rem] p-8 text-center relative z-10 hover:border-black/15 transition-all duration-300 hover:-translate-y-1 shadow-sm">
              <div className="w-16 h-16 bg-[#F8F8F6] rounded-full flex items-center justify-center mx-auto mb-6 border border-black/5">
                <ClipboardCheck className="w-5 h-5 text-black/60" />
              </div>
              <div className="text-black/40 font-dm-mono font-bold text-[10px] uppercase tracking-widest mb-2">Step 02</div>
              <h3 className="text-lg font-bold font-absans text-black mb-3 uppercase tracking-wide">{t('step2Title')}</h3>
              <p className="text-black/55 font-archia text-xs leading-relaxed font-medium">
                {t('step2Desc')}
              </p>
            </div>

            {/* Step 3 */}
            <div className="reveal-card bg-white border border-black/15 rounded-[2.2rem] p-8 text-center relative z-10 hover:border-black/25 transition-all duration-300 hover:-translate-y-1 shadow-md">
              <div className="w-16 h-16 bg-black/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-black/10">
                <CheckCircle2 className="w-5 h-5 text-black/70" />
              </div>
              <div className="text-black/40 font-dm-mono font-bold text-[10px] uppercase tracking-widest mb-2">Step 03</div>
              <h3 className="text-lg font-bold font-absans text-black mb-3 uppercase tracking-wide">{t('step3Title')}</h3>
              <p className="text-black/55 font-archia text-xs leading-relaxed font-medium">
                {t('step3Desc')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 7 — FAQ (SEO-Rich Accordion) */}
      <FaqSection
        id="services-faq"
        eyebrow="FAQ"
        title={t('faq.title')}
        items={faqs}
        theme="light"
        includeSchema={false}
      />

      {/* Global B2B Call-To-Action Segment (Dark Theme) */}
      <GlobalCTA 
        badge={t('badge')}
        title={t('scheduleCta')}
        subtitle={t('subtitle')}
        primaryCtaText="WhatsApp Sales"
        primaryCtaHref={`https://wa.me/18433307365?text=${encodeURIComponent(t('scheduleMsg'))}`}
        secondaryCtaText="Email Laboratory"
        secondaryCtaHref="mailto:sales@99puritywholesale.com"
      />

    </main>
  );
}
