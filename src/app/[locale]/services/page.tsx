import { Package, Rocket, MonitorSmartphone, TrendingUp, Tag, PhoneCall, CheckCircle2, Settings, ShieldCheck, Award, Users, Globe, Lock, FlaskConical, ClipboardCheck, Handshake, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { PageShell, PageHero, Section, CardGrid, InfoCard, CtaBand, PillButton, WRAP, card } from '@/components/home/page-kit';
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
    <PageShell>
      {/* FAQ Schema (markdown-stripped; see faqSchemaItems above) */}
      <FaqSchema items={faqSchemaItems} />

      <PageHero
        eyebrow={t('badge')}
        title={t('title')}
        intro={t('subtitle')}
        actions={
          <>
            <PillButton href={`https://wa.me/18433307365?text=${encodeURIComponent(t('heroCta.msg'))}`} external>
              {t('heroCta.primary')}
            </PillButton>
            <PillButton href="/products" variant="outline">
              {t('heroCta.secondary')}
            </PillButton>
          </>
        }
        facts={[
          { value: t('heroStats.stat1Num'), label: t('heroStats.stat1Label') },
          { value: t('heroStats.stat2Num'), label: t('heroStats.stat2Label') },
          { value: t('heroStats.stat3Num'), label: t('heroStats.stat3Label') },
          { value: t('heroStats.stat4Num'), label: t('heroStats.stat4Label') },
        ]}
      />

      {/* Trust bar */}
      <div className={WRAP}>
        <ul className="flex flex-wrap items-center gap-x-8 gap-y-3 border-y border-[#E6EAF1] py-5">
          {[
            { icon: ShieldCheck, text: t('trustBar.t1') },
            { icon: Award, text: t('trustBar.t2') },
            { icon: Users, text: t('trustBar.t3') },
            { icon: Globe, text: t('trustBar.t4') },
            { icon: Lock, text: t('trustBar.t5') },
          ].map((item, index) => {
            const IconComponent = item.icon;
            return (
              <li key={index} className="flex items-center gap-2.5 font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/60">
                <IconComponent className="h-4 w-4 shrink-0 text-[#0B6F7B]" />
                {item.text}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Services grid */}
      <Section eyebrow={t('intro.badge')} title={t('intro.title')} description={t('intro.desc')}>
        <CardGrid cols={2}>
          {services.map((service) => (
            <div key={service.id} data-reveal className={`${card} group relative flex flex-col p-7 transition-colors duration-300 hover:border-[#4FC3D0] md:p-9`}>
              {/* Full card overlay link */}
              <Link href={`/services/${service.id}` as any} className="absolute inset-0 z-10 rounded-[1.25rem]">
                <span className="sr-only">View Details for {service.title}</span>
              </Link>

              <div className="mb-8 flex items-center justify-between gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F3F5FA] text-[#0B6F7B]">
                  <service.icon className="h-5 w-5" />
                </div>
                <span className="rounded-full border border-[#E6EAF1] px-3 py-1 font-dm-mono text-[9px] uppercase tracking-[0.16em] text-[#0B0F14]/55">
                  {service.eyebrow}
                </span>
              </div>

              <h3 className="mb-3 text-[1.6rem] font-light leading-tight tracking-[-0.03em]">{service.title}</h3>
              <p className="mb-6 text-[14px] leading-relaxed text-[#0B0F14]/60">{service.description}</p>

              <div className="mb-6 flex flex-wrap gap-2">
                {service.tags.map((tag, idx) => (
                  <span key={idx} className="rounded-full bg-[#F3F5FA] px-3 py-1 font-dm-mono text-[9px] uppercase tracking-[0.14em] text-[#0B0F14]/55">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="mb-8 flex-grow border-t border-[#E6EAF1] pt-6">
                <div className="mb-3 font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/50">{params.locale === 'es' ? 'Ideal Para' : 'Ideal For'}</div>
                <ul className="space-y-2">
                  {service.idealFor.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-[#0B0F14]/60">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0B6F7B]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pointer-events-none relative z-20 flex flex-wrap items-center gap-3">
                <a
                  href={`https://wa.me/18433307365?text=${encodeURIComponent(service.whatsappMsg)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-[#0B0F14] px-5 py-3 text-[13px] font-medium text-white transition-colors hover:bg-[#1b232d]"
                >
                  <PhoneCall className="h-3.5 w-3.5" />
                  {service.ctaText}
                </a>
                <span className="inline-flex items-center gap-2 text-[13px] font-medium text-[#0B0F14]/60 transition-colors group-hover:text-[#0B0F14]">
                  View Full Details <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          ))}
        </CardGrid>
      </Section>

      {/* Lab image */}
      <div className={WRAP}>
        <div className="relative h-[260px] overflow-hidden rounded-[1.25rem] border border-[#E6EAF1] md:h-[440px]">
          <Image
            src="/images/hero-lab-bg-v2.png"
            alt="99 Purity Wholesale Certified Quality Control Laboratory"
            fill
            sizes="(max-width: 1440px) 100vw, 1440px"
            className="object-cover"
          />
        </div>
      </div>

      {/* Why partner */}
      <Section eyebrow={t('whyPartner.badge')} title={t('whyPartner.title')}>
        <CardGrid cols={3}>
          {[
            { icon: FlaskConical, label: t('whyPartner.col1Label'), text: t('whyPartner.col1Text'), num: '01' },
            { icon: ClipboardCheck, label: t('whyPartner.col2Label'), text: t('whyPartner.col2Text'), num: '02' },
            { icon: Handshake, label: t('whyPartner.col3Label'), text: t('whyPartner.col3Text'), num: '03' },
          ].map((col, i) => {
            const IconComponent = col.icon;
            return (
              <InfoCard key={i} icon={<IconComponent className="h-4 w-4" />} title={col.label}>
                <span className="mb-3 block font-dm-mono text-[10px] tracking-[0.16em] text-[#0B0F14]/35">{col.num}</span>
                {col.text}
              </InfoCard>
            );
          })}
        </CardGrid>
      </Section>

      {/* Steps */}
      <Section eyebrow={t('stepsSubtitle')} title={t('stepsTitle')} className="pt-0 md:pt-0">
        <CardGrid cols={3}>
          {[
            { n: '01', icon: PhoneCall, title: t('step1Title'), desc: t('step1Desc') },
            { n: '02', icon: ClipboardCheck, title: t('step2Title'), desc: t('step2Desc') },
            { n: '03', icon: CheckCircle2, title: t('step3Title'), desc: t('step3Desc') },
          ].map((s) => (
            <div key={s.n} data-reveal className={`${card} p-7 md:p-8`}>
              <div className="mb-8 flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F3F5FA] text-[#0B6F7B]">
                  <s.icon className="h-5 w-5" />
                </div>
                <span className="font-dm-mono text-[11px] tracking-[0.16em] text-[#0B0F14]/40">Step {s.n}</span>
              </div>
              <h3 className="mb-2 text-[1.2rem] font-medium leading-snug tracking-[-0.02em]">{s.title}</h3>
              <p className="text-[13.5px] leading-relaxed text-[#0B0F14]/60">{s.desc}</p>
            </div>
          ))}
        </CardGrid>
      </Section>

      {/* FAQ */}
      <FaqSection
        id="services-faq"
        eyebrow="FAQ"
        title={t('faq.title')}
        items={faqs}
        theme="light"
        includeSchema={false}
      />

      <CtaBand
        eyebrow={t('badge')}
        title={t('scheduleCta')}
        description={t('subtitle')}
        primary={{ label: 'WhatsApp Sales', href: `https://wa.me/18433307365?text=${encodeURIComponent(t('scheduleMsg'))}`, external: true }}
        secondary={{ label: 'Email Laboratory', href: 'mailto:sales@99puritywholesale.com' }}
      />
    </PageShell>
  );
}
