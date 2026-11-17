import { notFound } from 'next/navigation';
import { Link } from '@/i18n/routing';
import {
  Package, Rocket, MonitorSmartphone, TrendingUp, Tag, Settings,
  CheckCircle2, XCircle, ArrowRight, ChevronRight,
  ShieldCheck, Award, Zap, BarChart3, Globe, Users, Map, Handshake,
  ClipboardCheck, Truck, FlaskConical, Code, Search
} from 'lucide-react';
import { PageShell, PageHero, Section, CardGrid, InfoCard, CtaBand, PillButton, Eyebrow, RevealGroup, SplitHeading, WRAP, SECTION, h2, card } from '@/components/home/page-kit';
import FaqSection from '@/components/shared/FaqSection';
import BreadcrumbSchema from '@/components/seo/BreadcrumbSchema';
import servicesRegistry, { getServiceByLocale } from '@/data/services-content/index';

const ICON_MAP: Record<string, React.ElementType> = {
  Package, Rocket, MonitorSmartphone, TrendingUp, Tag, Settings,
  ShieldCheck, Award, Zap, BarChart: BarChart3, Globe, Users,
  Map, Handshake, ClipboardCheck, Truck, FlaskConical, Code, Search,
  BarChart3,
};

const SERVICE_ICONS: Record<string, React.ElementType> = {
  dropshipping: Package,
  'launch-support': Rocket,
  'website-development': MonitorSmartphone,
  'sales-distribution': TrendingUp,
  'private-label': Tag,
  'fulfillment-consulting': Settings,
};

// Pinned to the 1 hour this route had before the layout was raised to 2 days.
export const revalidate = 3600;

export async function generateStaticParams() {
  return Object.keys(servicesRegistry).map((slug) => ({ slug }));
}

export async function generateMetadata(props: any) {
  const params = props?.params || {};
  const locale = params?.locale || 'en';
  const service = getServiceByLocale(params.slug, locale);
  if (!service) return {};
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://99puritywholesale.com';
  const url = `${baseUrl}/${params.locale === 'en' ? '' : params.locale + '/'}services/${params.slug}`;
  const ogUrlImage = `${baseUrl}/api/og?title=${encodeURIComponent(service.meta.title)}&desc=${encodeURIComponent(service.meta.description)}&category=Services`;

  return {
    title: service.meta.title,
    description: service.meta.description,
    keywords: service.meta.keywords,
    alternates: {
      canonical: url,
      languages: {
        'en-US': `${baseUrl}/services/${params.slug}`,
        es: `${baseUrl}/es/services/${params.slug}`,
        'x-default': `${baseUrl}/services/${params.slug}`,
      },
    },
    openGraph: {
      title: service.meta.title,
      description: service.meta.description,
      url,
      siteName: '99 Purity Wholesale',
      images: [{ url: ogUrlImage, width: 1200, height: 630 }],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: service.meta.title,
      description: service.meta.description,
      images: [ogUrlImage],
    },
  };
}

export default function ServiceDetailPage({ params }: { params: { locale: string; slug: string } }) {
  const isEs = params.locale === 'es';
  const service = getServiceByLocale(params.slug, params.locale);
  if (!service) notFound();

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://99puritywholesale.com';
  const localePrefix = params.locale === 'en' ? '' : `${params.locale}/`;

  const serviceSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.hero.h1,
    description: service.meta.description,
    provider: {
      '@type': 'Organization',
      name: '99 Purity Wholesale',
      url: 'https://99puritywholesale.com',
    },
    areaServed: { '@type': 'Country', name: 'United States' },
    serviceType: service.hero.eyebrow,
    url: `${baseUrl}/${localePrefix}services/${service.slug}`,
  };

  // FAQ JSON-LD is emitted by the <FaqSection> below (which renders this same faqItems array) — no separate script here.
  const faqItems = service.faqs.map((f) => ({ q: f.q, a: f.a }));

  return (
    <PageShell>
      {/* Schemas */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }} />
      <BreadcrumbSchema items={[
        { name: isEs ? 'Servicios' : 'Services', item: `${baseUrl}/${localePrefix}services` },
        { name: service.hero.h1, item: `${baseUrl}/${localePrefix}services/${service.slug}` },
      ]} />

      {/* Breadcrumb nav */}
      <div className={`${WRAP} pt-4 md:pt-6`}>
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/45">
          <Link href="/services" className="transition-colors hover:text-[#0B0F14]">{isEs ? 'Servicios' : 'Services'}</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-[#0B0F14]/70">{service.hero.eyebrow}</span>
        </nav>
      </div>

      <PageHero
        eyebrow={service.hero.eyebrow}
        title={service.hero.h1}
        intro={service.hero.subtitle}
        actions={
          <>
            <PillButton href={`https://wa.me/18433307365?text=${encodeURIComponent(service.hero.ctaMsg)}`} external>
              {service.hero.ctaText}
            </PillButton>
            <PillButton href="/services" variant="outline">
              {isEs ? 'Todos los Servicios' : 'All Services'}
            </PillButton>
          </>
        }
        facts={[
          { value: '≥99%', label: isEs ? 'Estándar de Pureza' : 'Purity Standard' },
          { value: 'COA', label: isEs ? 'En Cada Pedido' : 'On Every Order' },
          { value: 'U.S.', label: isEs ? 'Fabricado en EE. UU.' : 'Manufactured' },
          { value: 'B2B', label: isEs ? 'Programa Exclusivo' : 'Exclusive Program' },
        ]}
      />

      {/* Introduction */}
      <section className={SECTION}>
        <div className={WRAP}>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <Eyebrow className="mb-5">{service.hero.eyebrow}</Eyebrow>
              <SplitHeading text={service.intro.heading} className={h2} />
            </div>
            <RevealGroup className="space-y-5 lg:col-span-7">
              {service.intro.body.map((paragraph, i) => (
                <p key={i} data-reveal className="text-[15px] leading-[1.75] text-[#0B0F14]/65 md:text-[16px]">
                  {paragraph}
                </p>
              ))}
            </RevealGroup>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <Section eyebrow={isEs ? 'Beneficios' : 'Benefits'} title={isEs ? 'Beneficios Clave' : 'Key Benefits'} className="pt-0 md:pt-0">
        <CardGrid cols={3}>
          {service.benefits.map((benefit, i) => {
            const BenIcon = ICON_MAP[benefit.icon] || ShieldCheck;
            return (
              <InfoCard key={i} icon={<BenIcon className="h-4 w-4" />} title={benefit.title}>
                {benefit.description}
              </InfoCard>
            );
          })}
        </CardGrid>
      </Section>

      {/* How it works */}
      <Section eyebrow={isEs ? 'Proceso' : 'Process'} title={isEs ? 'Cómo Funciona' : 'How It Works'} className="pt-0 md:pt-0">
        <CardGrid cols={2}>
          {service.howItWorks.map((step, i) => (
            <div key={i} data-reveal className={`${card} flex gap-5 p-6 md:gap-7 md:p-8`}>
              <div className="shrink-0 pt-1 font-dm-mono text-[1.6rem] font-light leading-none tracking-[-0.04em] text-[#0B6F7B]">
                {step.number}
              </div>
              <div>
                <h3 className="mb-2 text-[1.15rem] font-medium leading-snug tracking-[-0.02em]">{step.title}</h3>
                <p className="text-[13.5px] leading-relaxed text-[#0B0F14]/60">{step.description}</p>
              </div>
            </div>
          ))}
        </CardGrid>
      </Section>

      {/* Comparison table */}
      <Section eyebrow={isEs ? 'Idoneidad' : 'Fit'} title={service.comparisonTable.heading} className="pt-0 md:pt-0">
        <div className={`${card} overflow-hidden`}>
          <div className="hidden grid-cols-12 gap-4 border-b border-[#E6EAF1] bg-[#F3F5FA] px-6 py-3 md:grid">
            <div className="col-span-5 font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/50">{isEs ? 'Perfil / Caso de Uso' : 'Profile / Use Case'}</div>
            <div className="col-span-2 text-center font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/50">{isEs ? 'Adecuado' : 'Suitable'}</div>
            <div className="col-span-5 font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/50">{isEs ? 'Motivo' : 'Why'}</div>
          </div>
          {service.comparisonTable.rows.map((row, i) => (
            <div key={i} className="grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-1 border-b border-[#E6EAF1] px-5 py-5 last:border-b-0 md:grid-cols-12 md:items-center md:gap-4 md:px-6">
              <div className="col-start-2 text-[14px] font-medium md:col-span-5 md:col-start-auto">{row.businessType}</div>
              <div className="col-start-1 row-start-1 flex items-center md:col-span-2 md:col-start-auto md:row-start-auto md:justify-center">
                {row.suitable
                  ? <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-label={isEs ? 'Adecuado' : 'Suitable'} />
                  : <XCircle className="h-5 w-5 text-red-400" aria-label={isEs ? 'No adecuado' : 'Not suitable'} />}
              </div>
              <div className="col-start-2 text-[13.5px] leading-relaxed text-[#0B0F14]/55 md:col-span-5 md:col-start-auto">{row.reason}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Pricing tiers (conditional) */}
      {service.pricingSection && (
        <Section title={service.pricingSection.heading} description={service.pricingSection.subheading} className="pt-0 md:pt-0">
          <CardGrid cols={4}>
            {service.pricingSection.tiers.map((tier, i) => (
              <div
                key={i}
                data-reveal
                className={`rounded-[1.25rem] border p-7 ${tier.highlight ? 'border-[#0B0D10] bg-[#0B0D10] text-white' : 'border-[#E6EAF1] bg-white'}`}
              >
                <div className={`mb-3 font-dm-mono text-[10px] uppercase tracking-[0.16em] ${tier.highlight ? 'text-white/50' : 'text-[#0B0F14]/45'}`}>{isEs ? 'Volumen' : 'Volume'}</div>
                <div className="mb-1 text-[1.5rem] font-light tracking-[-0.03em]">{tier.name}</div>
                <div className={`mb-5 font-dm-mono text-[11px] ${tier.highlight ? 'text-[#4FC3D0]' : 'text-[#0B6F7B]'}`}>{tier.volume}</div>
                <p className={`text-[13.5px] leading-relaxed ${tier.highlight ? 'text-white/65' : 'text-[#0B0F14]/60'}`}>{tier.description}</p>
              </div>
            ))}
          </CardGrid>
          <p className="mt-6 font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/45">{service.pricingSection.footer}</p>
        </Section>
      )}

      {/* Technical deep dive: the single dark panel */}
      <section className="px-3 py-6 md:px-4">
        <div className="mx-auto max-w-[1760px] rounded-[1.75rem] bg-[#0B0D10] px-6 py-16 text-white md:px-12 md:py-24">
          <div className="mx-auto max-w-[1360px]">
            <div className="mb-12 max-w-3xl">
              <Eyebrow light className="mb-5">{isEs ? 'Detalle Técnico' : 'Technical Detail'}</Eyebrow>
              <h2 className={`${h2} mb-5 !text-white`}>{service.technicalDeepDive.heading}</h2>
              <p className="text-[14px] leading-relaxed text-white/55">{service.technicalDeepDive.subheading}</p>
            </div>
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
              <div className="space-y-5">
                {service.technicalDeepDive.body.map((para, i) => (
                  <p key={i} className="text-[15px] leading-relaxed text-white/65">{para}</p>
                ))}
              </div>
              {service.technicalDeepDive.statsTable && (
                <div className="self-start overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/[0.03]">
                  <div className="border-b border-white/10 px-6 py-3">
                    <span className="font-dm-mono text-[10px] uppercase tracking-[0.16em] text-white/45">{isEs ? 'Especificaciones Operativas' : 'Operational Specifications'}</span>
                  </div>
                  {service.technicalDeepDive.statsTable.map((row, i) => (
                    <div key={i} className="flex justify-between gap-4 border-b border-white/5 px-6 py-4 last:border-0">
                      <span className="text-[13.5px] text-white/50">{row.label}</span>
                      <span className="text-right font-dm-mono text-[12px] text-white">{row.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Trust */}
      <Section eyebrow={isEs ? 'Confianza' : 'Trust'} title={service.trustSection.heading}>
        <CardGrid cols={2}>
          {service.trustSection.points.map((point, i) => (
            <div key={i} data-reveal className={`${card} flex items-start gap-4 p-6`}>
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#0B6F7B]" />
              <p className="text-[14px] leading-relaxed text-[#0B0F14]/65">{point}</p>
            </div>
          ))}
        </CardGrid>
      </Section>

      {/* FAQ */}
      <FaqSection
        id={`${service.slug}-faq`}
        eyebrow="(FAQ)"
        title={isEs ? `${service.hero.h1} — Preguntas Frecuentes` : `${service.hero.h1} — Frequently Asked Questions`}
        subtitle={isEs ? 'Respuestas completas a las preguntas más habituales sobre este programa de servicios.' : 'Comprehensive answers to the most common questions about this service program.'}
        items={faqItems}
        theme="light"
      />

      {/* Related services */}
      <Section eyebrow={isEs ? 'Explorar' : 'Explore'} title={isEs ? 'Servicios Relacionados' : 'Related Services'}>
        <CardGrid cols={3}>
          {service.relatedServices.map((rel) => {
            const RelIcon = SERVICE_ICONS[rel.slug] || Package;
            return (
              <Link key={rel.slug} href={`/services/${rel.slug}` as any} data-reveal className={`${card} group flex flex-col gap-5 p-7 transition-colors duration-300 hover:border-[#4FC3D0]`}>
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F3F5FA] text-[#0B6F7B]">
                  <RelIcon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="mb-2 text-[1.2rem] font-medium leading-snug tracking-[-0.02em]">{rel.title}</h3>
                  <p className="text-[13.5px] leading-relaxed text-[#0B0F14]/60">{rel.description}</p>
                </div>
                <div className="mt-auto flex items-center gap-2 text-[13px] font-medium text-[#0B0F14]/60 transition-colors group-hover:text-[#0B0F14]">
                  {isEs ? 'Más Información' : 'Learn More'} <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </Link>
            );
          })}
        </CardGrid>
      </Section>

      <CtaBand
        eyebrow={isEs ? 'Servicios B2B' : 'B2B Services'}
        title={isEs ? '¿Listo para Comenzar?' : 'Ready to Get Started?'}
        description={isEs ? 'Póngase en contacto con nuestro equipo B2B a través de WhatsApp o correo electrónico para analizar sus requisitos. Respondemos a todas las consultas en 1 día hábil.' : 'Contact our B2B team via WhatsApp or email to discuss your requirements. We respond to all qualified inquiries within 1 business day.'}
        primary={{ label: service.hero.ctaText, href: `https://wa.me/18433307365?text=${encodeURIComponent(service.hero.ctaMsg)}`, external: true }}
      />
    </PageShell>
  );
}
