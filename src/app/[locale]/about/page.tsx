import { getTranslations } from "next-intl/server";
import Image from "next/image";
import {
  ShieldCheck, Search, Users, FlaskConical, Globe,
  Award, CheckCircle2, Microscope, Star, Truck
} from "lucide-react";
import GlobalCTA from "@/components/layout/GlobalCTA";
import FaqSection from "@/components/shared/FaqSection";

export async function generateMetadata(props: any) {
  const params = props?.params || {};
  const locale = params?.locale || 'en';
  const t = await getTranslations({ locale, namespace: 'About' });
  return {
    title: `${t('Hero.title')}`,
    description: t('Hero.subtitle'),
    alternates: {
      canonical: `https://99puritywholesale.com${locale === 'en' ? '/about' : `/${locale}/about`}`
    }
  };
}

export default async function AboutPage({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'About' });

  return (
    <main className="min-h-screen bg-[#F8F8F6] text-black -mt-24 md:-mt-32">
      
      {/* Hero Section - Elegant Light Off-White */}
      <section className="relative overflow-hidden pt-52 pb-24 md:pt-64 md:pb-32 border-b border-black/5 bg-[#F8F8F6]">
        {/* Light Grain Texture */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[url('/images/noise.svg')]" />
        
        <div className="container mx-auto px-6 max-w-5xl relative z-10 text-center">
          <div>
            <div className="inline-block bg-black/5 border border-black/5 px-5 py-2 rounded-full text-[10px] font-bold font-dm-sans uppercase tracking-widest text-black/60 mb-6">
              {t("Hero.badge")}
            </div>
            
            <h1 className="reveal-text text-4xl sm:text-6xl md:text-7xl font-bold font-absans text-black uppercase tracking-tight leading-none mb-6 break-words w-full">
              {t("Hero.title")}
            </h1>
            
            <p className="reveal-text text-lg md:text-xl font-archia font-semibold text-black/75 mb-8 max-w-3xl mx-auto leading-relaxed">
              {t("Hero.subtitle")}
            </p>
            
            <p className="reveal-text text-sm md:text-base font-archia text-black/55 font-medium max-w-3xl mx-auto leading-relaxed">
              {t("Hero.p1")}
            </p>
          </div>
        </div>
      </section>

      {/* Brand Story - Stealth Luxury Black with Overlapping Image Collage */}
      <section className="py-24 md:py-32 bg-[#05080C] text-white relative border-b border-white/5 overflow-hidden">
        {/* Dark Grain Texture */}
        <div className="absolute inset-0 opacity-[0.015] pointer-events-none bg-[url('/images/noise.svg')]" />
        
        <div className="container mx-auto px-6 max-w-7xl relative z-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
            
            {/* Left Column: Story paragraphs & Integrated Features Grid */}
            <div className="lg:col-span-6 flex flex-col justify-center">
              <div>
                <span className="text-white/40 font-dm-sans font-bold text-xs uppercase tracking-widest mb-4 block">
                  {t("Story.badge")}
                </span>
                
                <h2 className="reveal-text text-3xl md:text-4xl lg:text-5xl font-bold font-absans text-white uppercase tracking-tight mb-8 leading-none">
                  {t("Story.title")}
                </h2>
                
                <div className="reveal-text space-y-6 text-white/60 font-archia text-sm md:text-base leading-relaxed font-medium mb-10">
                  <p>{t("Story.p1")}</p>
                  <p>{t("Story.p2")}</p>
                  <p>{t("Story.p3")}</p>
                  <p>{t("Story.p4")}</p>
                </div>
                
                {/* Technical Features Grid integrated beautifully below story paragraphs */}
                <div className="reveal-grid grid grid-cols-2 gap-6 pt-8 border-t border-white/5">
                  {(t.raw("Story.features") as any[]).slice(0, 4).map((item, i) => {
                    const icons = [FlaskConical, Award, ShieldCheck, Users];
                    const Icon = icons[i] || ShieldCheck;
                    return (
                      <div key={i} className="reveal-card flex gap-4 items-start group/feat">
                        <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center flex-shrink-0 transition-colors group-hover/feat:bg-white/10">
                          <Icon className="w-4 h-4 text-white/80" />
                        </div>
                        <div>
                          <h4 className="text-white font-absans font-bold text-xs uppercase tracking-wider">{item.title}</h4>
                          <p className="text-white/40 font-archia font-medium text-[10px] leading-relaxed mt-1">{item.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            
            {/* Right Column: Luxurious Multi-Dimensional Overlapping Image Collage */}
            <div className="lg:col-span-6 relative mt-16 lg:mt-0 px-6 pb-12 lg:pb-0">
              <div className="reveal-card relative w-full max-w-md mx-auto aspect-[4/5]">
                {/* Base Card: Pristine Laboratory Setting */}
                <div className="w-full h-full rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/5 group relative">
                  <Image 
                    src="/images/hero-lab.png"
                    alt="Pristine Peptide Chromatography Laboratory"
                    fill
                    className="object-cover transition-transform duration-[1.5s] ease-out group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
                </div>
                
                {/* Overlapping Floating Product Kit Card */}
                <div className="absolute -bottom-10 -left-6 md:-left-12 w-2/3 aspect-[4/3] rounded-3xl overflow-hidden border-[6px] border-[#05080C] shadow-[0_20px_50px_rgba(0,0,0,0.6)] z-20 group/kit transition-transform duration-500 hover:scale-105 hover:-rotate-1 relative">
                  <Image 
                    src="/product-images/glow-hair-skin-nail-blend.jpg"
                    alt="Certified 99 Purity Peptide Vial Kit"
                    fill
                    className="object-cover transition-transform duration-[1.2s] group-hover/kit:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />
                </div>
              </div>
            </div>
            
          </div>
        </div>
      </section>

      {/* Standalone Widescreen Clinical Laboratory Breakout Card */}
      <section className="bg-[#F8F8F6] pt-24 pb-8 relative overflow-hidden">
        <div className="container mx-auto px-6 max-w-7xl">
          <div className="reveal-card-3d relative overflow-hidden rounded-[2.5rem] h-[320px] md:h-[480px] border border-black/5 shadow-sm group">
            {/* Pristine Full-Color Clinical Laboratory Research Visual */}
            <Image 
              src="/images/hero-lab-bg.png"
              alt="99 Purity Wholesale Analytical Research Laboratory"
              fill
              className="object-cover transition-transform duration-[1.5s] ease-out group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent pointer-events-none" />
          </div>
        </div>
      </section>

      {/* Mission Statement - Clean Light Off-White Quote */}
      <section className="relative py-20 bg-[#F8F8F6] border-b border-black/5 overflow-hidden">
        <div className="container mx-auto px-6 max-w-5xl text-center relative z-10">
          <div>
            <Microscope className="w-12 h-12 text-black/30 mx-auto mb-8 animate-pulse" />
            <blockquote className="reveal-text font-absans text-2xl md:text-3xl lg:text-4xl font-bold text-black leading-tight mb-8 uppercase tracking-tight max-w-4xl mx-auto">
              "{t("Mission.quote")}"
            </blockquote>
            <p className="reveal-text text-black/50 font-dm-sans font-bold text-xs uppercase tracking-widest">
              — {t("Mission.author")}
            </p>
          </div>
        </div>
      </section>

      {/* Core Values - Stealth Luxury Black */}
      <section className="py-24 md:py-32 bg-[#05080C] text-white border-b border-white/5 relative overflow-hidden">
        <div className="container mx-auto px-6 max-w-7xl relative z-20">
          <div className="text-center mb-16">
            <div>
              <span className="text-white/40 font-dm-sans font-bold text-xs uppercase tracking-widest mb-4 block">
                {t("Values.badge")}
              </span>
              <h2 className="reveal-text text-3xl md:text-4xl font-bold font-absans text-white uppercase tracking-tight">
                {t("Values.title")}
              </h2>
            </div>
          </div>
          
          <div className="reveal-grid grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Value 1: Purity */}
            <div className="reveal-card bg-white/5 border border-white/5 rounded-[2.2rem] p-8 hover:border-white/20 transition-all duration-300 shadow-lg">
              <div className="w-14 h-14 bg-white/10 rounded-xl flex items-center justify-center mb-6">
                <ShieldCheck className="w-6 h-6 text-white/80" />
              </div>
              <h3 className="text-2xl font-bold font-absans text-white mb-4 uppercase tracking-wide">{t("Values.purity.title")}</h3>
              <p className="text-white/60 font-archia font-medium text-sm leading-relaxed mb-4">{t("Values.purity.desc")}</p>
              <p className="text-white/35 font-dm-sans text-xs leading-relaxed">{t("Values.purity.longDesc")}</p>
            </div>

            {/* Value 2: Transparency */}
            <div className="reveal-card bg-white/5 border border-white/5 rounded-[2.2rem] p-8 hover:border-white/20 transition-all duration-300 shadow-lg">
              <div className="w-14 h-14 bg-white/10 rounded-xl flex items-center justify-center mb-6">
                <Search className="w-6 h-6 text-white/80" />
              </div>
              <h3 className="text-2xl font-bold font-absans text-white mb-4 uppercase tracking-wide">{t("Values.transparency.title")}</h3>
              <p className="text-white/60 font-archia font-medium text-sm leading-relaxed mb-4">{t("Values.transparency.desc")}</p>
              <p className="text-white/35 font-dm-sans text-xs leading-relaxed">{t("Values.transparency.longDesc")}</p>
            </div>

            {/* Value 3: Partnership */}
            <div className="reveal-card bg-white/5 border border-white/5 rounded-[2.2rem] p-8 hover:border-white/20 transition-all duration-300 shadow-lg">
              <div className="w-14 h-14 bg-white/10 rounded-xl flex items-center justify-center mb-6">
                <Users className="w-6 h-6 text-white/80" />
              </div>
              <h3 className="text-2xl font-bold font-absans text-white mb-4 uppercase tracking-wide">{t("Values.partnership.title")}</h3>
              <p className="text-white/60 font-archia font-medium text-sm leading-relaxed mb-4">{t("Values.partnership.desc")}</p>
              <p className="text-white/35 font-dm-sans text-xs leading-relaxed">{t("Values.partnership.longDesc")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* How We Work - Pristine Light White */}
      <section className="py-24 md:py-32 bg-white text-black border-b border-black/5 relative overflow-hidden">
        <div className="container mx-auto px-6 max-w-7xl relative z-10">
          <div className="text-center mb-16">
            <div>
              <span className="text-black/45 font-dm-mono text-xs uppercase tracking-[0.3em] mb-4 block">
                {t("Process.badge")}
              </span>
              <h2 className="reveal-text text-3xl md:text-4xl font-bold font-absans text-black uppercase tracking-tight">
                {t("Process.title")}
              </h2>
              <p className="reveal-text text-black/50 font-archia text-sm mt-4 max-w-2xl mx-auto font-medium">
                {t("Process.subtitle")}
              </p>
            </div>
          </div>
          
          <div className="reveal-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 relative">
            <div className="hidden md:block absolute top-14 left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-black/10 to-transparent"></div>
            {(t.raw("Process.steps") as any[]).map((step, i) => {
              const icons = [FlaskConical, Microscope, Award, Truck];
              const Icon = icons[i] || Truck;
              return (
                <div key={i} className="reveal-card bg-[#F8F8F6] border border-black/5 rounded-[2.2rem] p-8 text-center relative z-10 hover:border-black/15 transition-all duration-300 hover:-translate-y-1 shadow-sm">
                  <div className="text-black/40 font-dm-mono text-[10px] uppercase tracking-widest mb-4">Step 0{i+1}</div>
                  <div className="w-12 h-12 bg-black/5 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-5 h-5 text-black/50" />
                  </div>
                  <h3 className="text-base font-bold font-absans text-black mb-2 uppercase tracking-wide">{step.title}</h3>
                  <p className="text-black/55 font-archia text-xs leading-relaxed font-medium">{step.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Who We Serve - Stealth Luxury Black with Creative Interactive Split Card */}
      <section className="py-24 md:py-32 bg-[#05080C] text-white border-b border-white/5 relative overflow-hidden">
        {/* Dark Grain Texture */}
        <div className="absolute inset-0 opacity-[0.015] pointer-events-none bg-[url('/images/noise.svg')]" />
        
        <div className="container mx-auto px-6 max-w-7xl relative z-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            
            {/* Left Column: Serve List */}
            <div>
              <div>
                <span className="text-white/40 font-dm-sans font-bold text-xs uppercase tracking-widest mb-4 block">
                  {t("Clients.badge")}
                </span>
                
                <h2 className="reveal-text text-3xl md:text-4xl font-bold font-absans text-white uppercase tracking-tight mb-6">
                  {t("Clients.title")}
                </h2>
                
                <p className="reveal-text text-white/60 font-archia text-sm font-medium leading-relaxed mb-8">
                  {t("Clients.subtitle")}
                </p>
                
                <div className="reveal-grid space-y-4">
                  {(t.raw("Clients.items") as any[]).map((client, i) => (
                    <div key={i} className="reveal-card flex items-start gap-4 p-5 bg-white/5 rounded-2xl border border-white/5 hover:border-white/15 transition-all">
                      <CheckCircle2 className="w-5 h-5 text-white/50 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-white font-bold font-absans text-sm uppercase tracking-wide">{client.label}</div>
                        <div className="text-white/40 font-archia font-medium text-xs mt-1 leading-relaxed">{client.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Right Column: Creative Interactive Graphic-Split Card Container */}
            <div>
              <div className="reveal-card bg-white/5 border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl min-h-[500px] flex flex-col group transition-all duration-500 hover:border-white/10">
                {/* Top Portion: High-End Pristine Quality Control Lab Showcase (100% Relatable & Local) */}
                <div className="h-56 relative overflow-hidden">
                  <Image 
                    src="/lab_quality_bg_1778896760027.png" 
                    alt="Quality Verification Clinical Testing Laboratory"
                    fill
                    className="object-cover transition-transform duration-[1.5s] group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#05080C] via-transparent to-transparent pointer-events-none" />
                  <div className="absolute bottom-6 left-8 right-6 z-10">
                    <h3 className="text-lg font-bold font-absans text-white uppercase tracking-wider">
                      {t("Clients.whyTitle")}
                    </h3>
                  </div>
                </div>
                
                {/* Bottom Portion: Solid High-Contrast B2B Value Checklist */}
                <div className="p-8 flex-1 flex flex-col justify-center bg-white/[0.01]">
                  <div className="space-y-5">
                    {(t.raw("Clients.whyPoints") as string[]).map((point, i) => (
                      <div key={i} className="flex items-start gap-4">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/70 flex-shrink-0 mt-1.5"></div>
                        <span className="text-white/70 font-archia font-medium text-xs leading-relaxed">{point}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      </section>

      {/* Corporate Stats - Light Minimalist Off-White */}
      <section className="py-24 bg-[#F8F8F6] border-b border-black/5 relative overflow-hidden">
        <div className="container mx-auto px-6 max-w-7xl relative z-10">
          <div className="text-center mb-16">
            <div>
              <h2 className="reveal-text text-3xl md:text-4xl font-bold font-absans text-black uppercase tracking-tight">
                {t("Stats.title")}
              </h2>
            </div>
          </div>
          
          <div className="reveal-grid grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {(t.raw("Stats.items") as any[]).map((s, i) => (
              <div key={i} className="reveal-card bg-white border border-black/5 rounded-2xl p-6 text-center hover:border-black/15 transition-all duration-300 shadow-sm hover:-translate-y-1">
                <div className="text-3xl font-bold text-black font-absans mb-2">{s.num}</div>
                <div className="text-[10px] text-black/50 uppercase tracking-widest font-dm-sans font-bold leading-tight">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compliance Statement - Symmetrical Embedded Dark Card */}
      <section className="py-24 bg-[#05080C] text-white border-b border-white/5 relative overflow-hidden">
        <div className="reveal-grid container mx-auto px-6 max-w-5xl relative z-20">
          <div className="reveal-card relative overflow-hidden bg-white/5 border border-white/5 rounded-[2.5rem] p-10 md:p-12 shadow-2xl">
            <div className="relative z-10 flex flex-col lg:flex-row gap-10 items-start">
              
              {/* Shield Column */}
              <div className="lg:w-1/3">
                <ShieldCheck className="w-12 h-12 text-white/55 mb-4 animate-pulse" />
                <h2 className="reveal-text text-2xl font-bold font-absans text-white mb-4 uppercase tracking-wide leading-tight">
                  {t("Compliance.title")}
                </h2>
                <p className="reveal-text text-white/40 font-archia font-medium text-xs leading-relaxed">
                  {t("Compliance.desc")}
                </p>
              </div>
              
              {/* Check List Column */}
              <div className="reveal-grid lg:w-2/3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(t.raw("Compliance.items") as any[]).map((item, i) => (
                  <div key={i} className="reveal-card flex items-start gap-3 p-4 bg-[#05080C] rounded-xl border border-white/5">
                    <CheckCircle2 className="w-5 h-5 text-white/40 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-white font-bold font-absans text-xs uppercase tracking-wider">{item.title}</div>
                      <div className="text-white/30 font-archia font-medium text-[10px] leading-relaxed mt-1">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <FaqSection
        id="about-faq"
        eyebrow="(FAQ)"
        title={t('FAQ.title')}
        subtitle={t('FAQ.subtitle')}
        items={t.raw('FAQ.items') as any[]}
        theme="light"
      />

      {/* Global B2B Call-To-Action Segment */}
      <GlobalCTA
        badge={t('Cta.title')}
        title={t('Cta.subtitle')}
        subtitle="Connect with our Laboratory Operations team directly to discuss high-volume procurement or specialized research needs."
        primaryCtaText={t('Cta.whatsapp')}
        primaryCtaHref={`https://wa.me/18433307365?text=${encodeURIComponent(t('Cta.msg'))}`}
        secondaryCtaText={t('Cta.email')}
        secondaryCtaHref="mailto:sales@99puritywholesale.com"
      />

    </main>
  );
}
