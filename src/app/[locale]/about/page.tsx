import { getTranslations } from "next-intl/server";
import { ShieldCheck, Search, Users, FlaskConical, Award, CheckCircle2, Microscope, Truck } from "lucide-react";
import FaqSection from "@/components/shared/FaqSection";
import Parallax from "@/components/home/Parallax";
import { Photo } from "@/components/home/ui";
import { PageShell, PageHero, Section, CardGrid, InfoCard, CtaBand, Eyebrow, RevealGroup, SplitHeading, WRAP, SECTION, h2, card } from "@/components/home/page-kit";

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
  const storyIcons = [FlaskConical, Award, ShieldCheck, Users];
  const stepIcons = [FlaskConical, Microscope, Award, Truck];

  return (
    <PageShell>
      <PageHero
        eyebrow={t("Hero.badge")}
        title={t("Hero.title")}
        intro={
          <>
            <p className="mb-4 text-[17px] leading-relaxed text-[#0B0F14]/80 md:text-[19px]">{t("Hero.subtitle")}</p>
            <p>{t("Hero.p1")}</p>
          </>
        }
        aside={
          <Parallax className="aspect-[4/3] rounded-[1.25rem] border border-[#E6EAF1] bg-white">
            <Photo src="/images/hero-lab.png" alt="Pristine Peptide Chromatography Laboratory" sizes="(max-width: 1024px) 100vw, 40vw" priority />
          </Parallax>
        }
      />

      {/* Brand story */}
      <section className={SECTION}>
        <div className={WRAP}>
          <div className="grid items-start gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
            <div>
              <Eyebrow className="mb-5">{t("Story.badge")}</Eyebrow>
              <SplitHeading text={t("Story.title")} className={`${h2} mb-8`} />
              <RevealGroup className="space-y-5 text-[15px] leading-relaxed text-[#0B0F14]/65">
                <p data-reveal>{t("Story.p1")}</p>
                <p data-reveal>{t("Story.p2")}</p>
                <p data-reveal>{t("Story.p3")}</p>
                <p data-reveal>{t("Story.p4")}</p>
              </RevealGroup>
            </div>
            <div className="relative">
              <Parallax className="aspect-[4/5] rounded-[1.25rem] border border-[#E6EAF1] bg-white">
                <Photo src="/product-images/glow-hair-skin-nail-blend.jpg" alt="Certified 99 Purity Peptide Vial Kit" sizes="(max-width: 1024px) 100vw, 40vw" />
              </Parallax>
            </div>
          </div>
          <CardGrid cols={4} className="mt-12 md:mt-16">
            {(t.raw("Story.features") as any[]).slice(0, 4).map((item, i) => {
              const Icon = storyIcons[i] || ShieldCheck;
              return (
                <InfoCard key={i} icon={<Icon className="h-4 w-4" />} title={item.title}>
                  {item.desc}
                </InfoCard>
              );
            })}
          </CardGrid>
        </div>
      </section>

      {/* Lab banner */}
      <section className="pb-4">
        <div className={WRAP}>
          <Parallax className="h-[280px] rounded-[1.25rem] border border-[#E6EAF1] bg-white md:h-[460px]">
            <Photo src="/images/hero-lab-bg.png" alt="99 Purity Wholesale Analytical Research Laboratory" sizes="(max-width: 1440px) 100vw, 1440px" />
          </Parallax>
        </div>
      </section>

      {/* Mission */}
      <section className={SECTION}>
        <div className={`${WRAP} text-center`}>
          <Microscope className="mx-auto mb-8 h-8 w-8 text-[#0B6F7B]" aria-hidden="true" />
          <blockquote className="mx-auto max-w-4xl font-dm-sans text-[clamp(1.6rem,3.4vw,2.9rem)] font-light leading-[1.12] tracking-[-0.035em]">
            &ldquo;{t("Mission.quote")}&rdquo;
          </blockquote>
          <p className="mt-8 font-dm-mono text-[11px] uppercase tracking-[0.2em] text-[#0B0F14]/50">&mdash; {t("Mission.author")}</p>
        </div>
      </section>

      {/* Values */}
      <Section eyebrow={t("Values.badge")} title={t("Values.title")}>
        <CardGrid cols={3}>
          {[
            { k: "purity", Icon: ShieldCheck },
            { k: "transparency", Icon: Search },
            { k: "partnership", Icon: Users },
          ].map(({ k, Icon }) => (
            <InfoCard key={k} icon={<Icon className="h-4 w-4" />} title={t(`Values.${k}.title`)}>
              <p className="mb-3">{t(`Values.${k}.desc`)}</p>
              <p className="text-[12.5px] text-[#0B0F14]/45">{t(`Values.${k}.longDesc`)}</p>
            </InfoCard>
          ))}
        </CardGrid>
      </Section>

      {/* Process */}
      <Section eyebrow={t("Process.badge")} title={t("Process.title")} description={t("Process.subtitle")}>
        <CardGrid cols={4}>
          {(t.raw("Process.steps") as any[]).map((step, i) => {
            const Icon = stepIcons[i] || Truck;
            return (
              <InfoCard key={i} icon={<Icon className="h-4 w-4" />} title={step.title}>
                <div className="mb-3 font-dm-mono text-[10px] uppercase tracking-[0.18em] text-[#0B0F14]/40">Step 0{i + 1}</div>
                {step.desc}
              </InfoCard>
            );
          })}
        </CardGrid>
      </Section>

      {/* Who we serve */}
      <section className={SECTION}>
        <div className={WRAP}>
          <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <Eyebrow className="mb-5">{t("Clients.badge")}</Eyebrow>
              <SplitHeading text={t("Clients.title")} className={`${h2} mb-6`} />
              <p className="mb-8 max-w-xl text-[15px] leading-relaxed text-[#0B0F14]/60">{t("Clients.subtitle")}</p>
              <RevealGroup className="space-y-3">
                {(t.raw("Clients.items") as any[]).map((client, i) => (
                  <div key={i} data-reveal className={`${card} flex items-start gap-4 p-5`}>
                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#0B6F7B]" aria-hidden="true" />
                    <div>
                      <div className="text-[15px] font-medium tracking-[-0.01em]">{client.label}</div>
                      <div className="mt-1 text-[13px] leading-relaxed text-[#0B0F14]/55">{client.desc}</div>
                    </div>
                  </div>
                ))}
              </RevealGroup>
            </div>
            <RevealGroup>
              <div data-reveal className={`${card} overflow-hidden`}>
                <Parallax className="relative h-56 md:h-64">
                  <Photo src="/lab_quality_bg_1778896760027.png" alt="Quality Verification Clinical Testing Laboratory" sizes="(max-width: 1024px) 100vw, 45vw" />
                </Parallax>
                <div className="p-6 md:p-8">
                  <h3 className="mb-5 text-[1.3rem] font-light tracking-[-0.03em]">{t("Clients.whyTitle")}</h3>
                  <ul className="space-y-4">
                    {(t.raw("Clients.whyPoints") as string[]).map((point, i) => (
                      <li key={i} className="flex items-start gap-3 text-[13.5px] leading-relaxed text-[#0B0F14]/65">
                        <span className="mt-[7px] h-[6px] w-[6px] flex-shrink-0 bg-[#4FC3D0]" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </RevealGroup>
          </div>
        </div>
      </section>

      {/* Stats */}
      <Section title={t("Stats.title")}>
        <RevealGroup className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {(t.raw("Stats.items") as any[]).map((s, i) => (
            <div key={i} data-reveal className={`${card} p-5 md:p-6`}>
              <div className="text-[clamp(1.6rem,2.6vw,2.2rem)] font-light leading-none tracking-[-0.04em]">{s.num}</div>
              <div className="mt-3 font-dm-mono text-[10px] uppercase leading-snug tracking-[0.14em] text-[#0B0F14]/50">{s.label}</div>
            </div>
          ))}
        </RevealGroup>
      </Section>

      {/* Compliance */}
      <section className={SECTION}>
        <div className={WRAP}>
          <div className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
            <div>
              <ShieldCheck className="mb-5 h-8 w-8 text-[#0B6F7B]" aria-hidden="true" />
              <SplitHeading text={t("Compliance.title")} className="mb-4 font-dm-sans text-[clamp(1.6rem,2.8vw,2.4rem)] font-light leading-[1.05] tracking-[-0.04em]" />
              <p className="text-[14px] leading-relaxed text-[#0B0F14]/60">{t("Compliance.desc")}</p>
            </div>
            <RevealGroup className="grid gap-4 sm:grid-cols-2">
              {(t.raw("Compliance.items") as any[]).map((item, i) => (
                <div key={i} data-reveal className={`${card} flex items-start gap-3 p-5`}>
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#0B6F7B]" aria-hidden="true" />
                  <div>
                    <div className="text-[15px] font-medium tracking-[-0.01em]">{item.title}</div>
                    <div className="mt-1 text-[13px] leading-relaxed text-[#0B0F14]/55">{item.desc}</div>
                  </div>
                </div>
              ))}
            </RevealGroup>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FaqSection
        id="about-faq"
        eyebrow="(FAQ)"
        title={t('FAQ.title')}
        subtitle={t('FAQ.subtitle')}
        items={t.raw('FAQ.items') as any[]}
        theme="light"
      />

      <CtaBand
        eyebrow={t('Cta.title')}
        title={t('Cta.subtitle')}
        description="Connect with our Laboratory Operations team directly to discuss high-volume procurement or specialized research needs."
        primary={{ label: t('Cta.whatsapp'), href: `https://wa.me/18433307365?text=${encodeURIComponent(t('Cta.msg'))}`, external: true }}
        secondary={{ label: t('Cta.email'), href: "mailto:sales@99puritywholesale.com" }}
      />
    </PageShell>
  );
}
