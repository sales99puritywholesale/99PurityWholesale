import { getTranslations } from 'next-intl/server';
import { CheckCircle2, ShieldCheck, FlaskConical, Users, Truck, Award, ArrowRight } from 'lucide-react';
import { PageShell, PageHero, Section, CardGrid, InfoCard, Panel, CtaBand, RevealGroup, WRAP } from '@/components/home/page-kit';
import FaqLight from '@/components/shared/FaqLight';
import WholesaleForm from '@/components/wholesale/WholesaleForm';

export async function generateMetadata(props: any) {
  const params = props?.params || {};
  const locale = params?.locale || 'en';
  const t = await getTranslations({ locale, namespace: 'WholesaleApplication' });
  return {
    title: t('metadata.title'),
    description: t('metadata.description'),
  
    alternates: {
      canonical: `https://99puritywholesale.com${locale === 'en' ? '/wholesale-application' : `/${locale}/wholesale-application`}`,
      languages: { 'en-US': '/wholesale-application', es: '/es/wholesale-application', 'x-default': '/wholesale-application' },
    },
  };
}

export default async function WholesaleApplicationPage({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'WholesaleApplication' });
  const indexT = await getTranslations({ locale, namespace: 'Index' });

  const requirementsRaw = t.raw('eligibility.items');
  const requirements = Array.isArray(requirementsRaw) ? requirementsRaw : [];

  const benefits = [
    { icon: FlaskConical, title: t('benefitsSection.items.catalog.title'), desc: t('benefitsSection.items.catalog.desc') },
    { icon: ShieldCheck, title: t('benefitsSection.items.purity.title'), desc: t('benefitsSection.items.purity.desc') },
    { icon: Award, title: t('benefitsSection.items.pricing.title'), desc: t('benefitsSection.items.pricing.desc') },
    { icon: Truck, title: t('benefitsSection.items.shipping.title'), desc: t('benefitsSection.items.shipping.desc') },
    { icon: Users, title: t('benefitsSection.items.support.title'), desc: t('benefitsSection.items.support.desc') },
    { icon: ArrowRight, title: t('benefitsSection.items.services.title'), desc: t('benefitsSection.items.services.desc') },
  ];

  const pricingTiers = [
    { tier: t('pricing.tiers.start.name'), kits: t('pricing.tiers.start.kits'), desc: t('pricing.tiers.start.desc') },
    { tier: t('pricing.tiers.tier1.name'), kits: t('pricing.tiers.tier1.kits'), desc: t('pricing.tiers.tier1.desc') },
    { tier: t('pricing.tiers.tier2.name'), kits: t('pricing.tiers.tier2.kits'), desc: t('pricing.tiers.tier2.desc') },
    { tier: t('pricing.tiers.tier3.name'), kits: t('pricing.tiers.tier3.kits'), desc: t('pricing.tiers.tier3.desc') },
  ];

  return (
    <PageShell>
      <PageHero eyebrow={t('hero.badge')} title={t('hero.title')} intro={t('hero.subtitle')} />

      {/* Account Benefits */}
      <Section title={t('benefitsSection.title')} description={t('benefitsSection.subtitle')}>
        <CardGrid cols={3}>
          {benefits.map((b, i) => (
            <InfoCard key={i} icon={<b.icon className="h-5 w-5" />} title={b.title}>
              {b.desc}
            </InfoCard>
          ))}
        </CardGrid>
      </Section>

      {/* Eligibility & Requirements & Pricing */}
      <section className="pb-16 md:pb-24">
        <div className={WRAP}>
          <RevealGroup className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
            <div data-reveal className="h-full">
              <Panel className="h-full">
                <h2 className="mb-4 text-[clamp(1.5rem,2.6vw,2rem)] font-light leading-tight tracking-[-0.03em]">{t('eligibility.title')}</h2>
                <p className="mb-8 text-[14px] leading-relaxed text-[#0B0F14]/60">{t('eligibility.description')}</p>
                <ul className="space-y-4">
                  {requirements.map((req, i) => (
                    <li key={i} className="flex items-start gap-4 border-b border-[#E6EAF1] pb-4 last:border-b-0 last:pb-0">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4FC3D0]/15 text-[#0B6F7B]">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </span>
                      <span className="mt-0.5 text-[14px] leading-relaxed text-[#0B0F14]/75">{req}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>

            <div data-reveal className="h-full">
              <Panel className="flex h-full flex-col justify-between">
                <div>
                  <h2 className="mb-4 text-[clamp(1.5rem,2.6vw,2rem)] font-light leading-tight tracking-[-0.03em]">{t('pricing.title')}</h2>
                  <p className="mb-8 text-[14px] leading-relaxed text-[#0B0F14]/60">
                    Select procurement tiers based on monthly vial counts to optimize chemical budgets.
                  </p>
                  <div className="space-y-3">
                    {pricingTiers.map((tier, i) => (
                      <div key={i} className="flex flex-col justify-between gap-3 rounded-2xl border border-[#E6EAF1] bg-[#F3F5FA] p-5 sm:flex-row sm:items-center">
                        <div>
                          <div className="mb-1 font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B6F7B]">{tier.tier}</div>
                          <div className="text-[1.15rem] font-light tracking-[-0.02em]">{tier.kits}</div>
                        </div>
                        <p className="max-w-sm text-[13px] leading-relaxed text-[#0B0F14]/60 sm:max-w-[260px] sm:text-right">{tier.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="mt-8 border-t border-[#E6EAF1] pt-4 text-[12px] leading-relaxed text-[#0B0F14]/50">{t('pricing.footer')}</p>
              </Panel>
            </div>
          </RevealGroup>
        </div>
      </section>

      {/* Application Form Section */}
      <Section id="apply" title={t('form.title')} description={t('form.subtitle')}>
        <div className="mx-auto max-w-3xl">
          <WholesaleForm />
        </div>
      </Section>

      <FaqLight
        id="wholesale-faq"
        title={indexT('FAQ.title')}
        subtitle={indexT('FAQ.subtitle')}
        items={indexT.raw('FAQ.items') as any[]}
      />

      <CtaBand
        eyebrow="Instant Fast-Track"
        title="Ready to Fast-Track Your Approval?"
        description={t('fastTrack.text')}
        primary={{ label: t('fastTrack.whatsapp'), href: 'https://wa.me/18433307365?text=Hi%2C%20I%27d%20like%20to%20apply%20for%20a%20wholesale%20peptide%20account.', external: true }}
        secondary={{ label: t('fastTrack.email'), href: 'mailto:sales@99puritywholesale.com' }}
      />
    </PageShell>
  );
}
