import { getTranslations } from 'next-intl/server';
import { CheckCircle2, ShieldCheck, FlaskConical, Users, Truck, Award, ArrowRight, Zap, MessageCircle, Mail } from 'lucide-react';
import FaqSection from '@/components/shared/FaqSection';
import GlobalCTA from '@/components/layout/GlobalCTA';
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
    <main className="min-h-screen bg-[#F8F8F6] text-black -mt-24 md:-mt-32 relative overflow-hidden">
      {/* Grain overlay */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[url('/images/noise.svg')]" />

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-44 pb-20 md:pt-56 md:pb-32 border-b border-black/5 bg-[#F8F8F6]">
        <div className="container mx-auto px-6 max-w-7xl relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            {/* Tag Badge */}
            <div className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#13a7b7]/10 border border-[#13a7b7]/15 text-[#0b7f8c] rounded-full text-[10px] font-dm-mono font-bold uppercase tracking-widest mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#13a7b7] animate-pulse" />
              {t('hero.badge')}
            </div>

            {/* Title */}
            <h1 className="reveal-text text-4xl md:text-6xl lg:text-7xl font-absans font-bold text-black uppercase tracking-tighter leading-[0.95] mb-6">
              {t('hero.title')}
            </h1>

            {/* Subtitle */}
            <p className="reveal-text text-base md:text-lg text-black/60 font-archia font-medium leading-relaxed max-w-2xl mx-auto">
              {t('hero.subtitle')}
            </p>
          </div>
        </div>
      </section>

      {/* Account Benefits */}
      <section className="py-24 border-b border-black/5 bg-white">
        <div className="container mx-auto px-6 max-w-7xl">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <h2 className="reveal-text text-3xl md:text-4xl font-absans font-bold text-black uppercase tracking-tight mb-4">
              {t('benefitsSection.title')}
            </h2>
            <p className="reveal-text text-black/55 font-archia font-semibold text-xs leading-relaxed">
              {t('benefitsSection.subtitle')}
            </p>
          </div>

          <div className="reveal-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((b, i) => (
              <div key={i} className="reveal-card">
                <div className="bg-[#F8F8F6] border border-black/5 rounded-[2rem] p-8 hover:border-[#13a7b7]/25 hover:shadow-md transition-all flex flex-col justify-between group h-full">
                  <div>
                    <div className="w-12 h-12 rounded-2xl bg-white border border-black/5 flex items-center justify-center text-black/50 group-hover:bg-[#13a7b7]/10 group-hover:text-[#13a7b7] transition-all mb-6 shadow-sm">
                      <b.icon className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-absans font-bold text-black uppercase tracking-tight mb-3">
                      {b.title}
                    </h3>
                    <p className="text-black/55 font-archia font-medium text-xs leading-relaxed">
                      {b.desc}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Eligibility & Requirements & Pricing */}
      <section className="py-24 bg-[#F8F8F6] border-b border-black/5">
        <div className="container mx-auto px-6 max-w-7xl">
          <div className="reveal-grid grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
            
             {/* Left: Requirements Container Card */}
            <div className="reveal-card h-full">
              <div className="bg-white border border-black/[0.06] rounded-[2.5rem] p-8 md:p-12 shadow-sm flex flex-col justify-between h-full hover:border-[#13a7b7]/15 transition-all duration-500">
                <div>
                  <h2 className="text-3xl font-absans font-bold text-black uppercase tracking-tight mb-4">
                    {t('eligibility.title')}
                  </h2>
                  <p className="text-black/60 font-archia font-semibold text-sm leading-relaxed mb-8">
                    {t('eligibility.description')}
                  </p>
                  
                  <div className="space-y-5">
                    {requirements.map((req, i) => (
                      <div key={i} className="flex items-start gap-4 pb-4 border-b border-black/[0.04] last:border-b-0 last:pb-0">
                        <div className="w-6 h-6 rounded-full bg-[#13a7b7]/10 flex items-center justify-center text-[#13a7b7] flex-shrink-0 mt-0.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-black/75 font-archia text-sm font-semibold leading-relaxed mt-0.5">
                          {req}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
 
            {/* Right: Pricing Tiers Container Card */}
            <div className="reveal-card h-full">
              <div className="bg-white border border-black/[0.06] rounded-[2.5rem] p-8 md:p-12 shadow-sm flex flex-col justify-between h-full hover:border-[#13a7b7]/15 transition-all duration-500">
                <div>
                  <h2 className="text-3xl font-absans font-bold text-black uppercase tracking-tight mb-4">
                    {t('pricing.title')}
                  </h2>
                  <p className="text-black/60 font-archia font-semibold text-sm leading-relaxed mb-8">
                    Select procurement tiers based on monthly vial counts to optimize chemical budgets.
                  </p>
                  
                  <div className="space-y-4">
                    {pricingTiers.map((tier, i) => (
                      <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-[#F8F8F6] rounded-2xl border border-black/[0.03] hover:border-[#13a7b7]/20 transition-all duration-300 group">
                        <div>
                          <div className="text-[#13a7b7] font-dm-mono text-[10px] font-bold uppercase tracking-widest mb-1">
                            {tier.tier}
                          </div>
                          <div className="text-black font-absans font-bold text-lg uppercase tracking-tight">
                            {tier.kits}
                          </div>
                        </div>
                        <p className="text-black/60 font-archia font-semibold text-sm leading-relaxed sm:text-right max-w-sm sm:max-w-[280px]">
                          {tier.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                
                <p className="text-black/45 font-archia font-semibold text-xs mt-8 pt-4 border-t border-black/[0.05] leading-relaxed">
                  {t('pricing.footer')}
                </p>
              </div>
            </div>
 
          </div>
        </div>
      </section>

      {/* Application Form Section */}
      <section className="py-24 border-b border-black/5 bg-white">
        <div className="container mx-auto px-6 max-w-3xl">
          <div className="text-center mb-12 max-w-xl mx-auto">
            <h2 className="reveal-text text-3xl md:text-4xl font-absans font-bold text-black uppercase tracking-tight mb-4">
              {t('form.title')}
            </h2>
            <p className="reveal-text text-black/55 font-archia font-semibold text-xs leading-relaxed">
              {t('form.subtitle')}
            </p>
          </div>

          <WholesaleForm />
        </div>
      </section>

      {/* FAQ Section */}
      <FaqSection
        id="wholesale-faq"
        eyebrow="(FAQ)"
        title={indexT('FAQ.title')}
        subtitle={indexT('FAQ.subtitle')}
        items={indexT.raw('FAQ.items') as any[]}
        theme="light"
      />

      {/* Global B2B Call-To-Action Segment */}
      <GlobalCTA
        badge="Instant Fast-Track"
        title="Ready to Fast-Track Your Approval?"
        subtitle={t('fastTrack.text')}
        primaryCtaText={t('fastTrack.whatsapp')}
        primaryCtaHref="https://wa.me/18433307365?text=Hi%2C%20I%27d%20like%20to%20apply%20for%20a%20wholesale%20peptide%20account."
        secondaryCtaText={t('fastTrack.email')}
        secondaryCtaHref="mailto:sales@99puritywholesale.com"
      />
      
    </main>
  );
}
