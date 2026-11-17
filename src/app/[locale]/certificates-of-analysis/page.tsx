'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldCheck, FileText, Check, X, Search, Beaker, FlaskConical, Microscope, Award, Globe } from 'lucide-react';
import productsData from '@/data/products.json';
import FaqSection from '@/components/shared/FaqSection';
import Parallax from '@/components/home/Parallax';
import { Photo } from '@/components/home/ui';
import { PageShell, PageHero, Section, CardGrid, InfoCard, CtaBand, Eyebrow, RevealGroup, SplitHeading, WRAP, SECTION, h2, card } from '@/components/home/page-kit';
import { useNestedSmoothScroll } from '@/hooks/useNestedSmoothScroll';

export default function COAPage() {
  const t = useTranslations('COAPage');
  const [searchTerm, setSearchTerm] = useState('');

  const comparisonTableRef = useNestedSmoothScroll<HTMLDivElement>({ orientation: 'horizontal' });
  const desktopLibraryRef = useNestedSmoothScroll<HTMLDivElement>();
  const mobileLibraryRef = useNestedSmoothScroll<HTMLDivElement>();

  const filteredProducts = productsData.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const comparisonRows = [
    { id: 'purity', crit: t('comparison.rows.purity.crit'), ours: t('comparison.rows.purity.ours'), theirs: t('comparison.rows.purity.theirs') },
    { id: 'testing', crit: t('comparison.rows.testing.crit'), ours: t('comparison.rows.testing.ours'), theirs: t('comparison.rows.testing.theirs') },
    { id: 'coa', crit: t('comparison.rows.coa.crit'), ours: t('comparison.rows.coa.ours'), theirs: t('comparison.rows.coa.theirs') },
    { id: 'support', crit: t('comparison.rows.support.crit'), ours: t('comparison.rows.support.ours'), theirs: t('comparison.rows.support.theirs') },
    { id: 'shipping', crit: t('comparison.rows.shipping.crit'), ours: t('comparison.rows.shipping.ours'), theirs: t('comparison.rows.shipping.theirs') },
  ];

  const th = 'p-4 md:p-5 font-dm-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[#0B0F14]/45';
  const pill = 'inline-flex items-center rounded-full border border-[#4FC3D0]/40 bg-[#4FC3D0]/10 px-3 py-1 font-dm-mono text-[10px] uppercase tracking-[0.14em] text-[#0B6F7B]';
  const dl = 'inline-flex items-center justify-center gap-2 rounded-full border border-[#0B0F14]/15 px-4 py-2.5 font-dm-sans text-[12px] font-medium text-[#0B0F14] transition-colors hover:bg-[#0B0F14] hover:text-white';

  return (
    <PageShell>
      <PageHero
        eyebrow={t('badge')}
        title={t('title')}
        intro={t('subtitle')}
        aside={
          <Parallax className="aspect-[4/3] rounded-[1.25rem] border border-[#E6EAF1] bg-white">
            <Photo src="/lab_quality_bg_1778896760027.png" alt="99 Purity Wholesale Certified Quality Control Laboratory" sizes="(max-width: 1024px) 100vw, 40vw" priority />
          </Parallax>
        }
      />

      {/* COA Document Library */}
      <Section eyebrow="ANALYTICAL DATABASE" title={t('library.title')} description={t('library.subtitle')}>
        <div className="mb-6 max-w-md">
          <div className="relative w-full">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-5">
              <Search className="h-4 w-4 text-[#0B0F14]/40" />
            </div>
            <input
              type="text"
              aria-label={t('library.placeholder')}
              className="w-full rounded-full border border-[#E6EAF1] bg-white py-3.5 pl-12 pr-5 font-dm-sans text-[14px] text-[#0B0F14] shadow-sm transition-all placeholder:text-[#0B0F14]/40 focus:border-[#0B6F7B] focus:outline-none focus:ring-2 focus:ring-[#4FC3D0]/40"
              placeholder={t('library.placeholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <RevealGroup>
          <div data-reveal className={`${card} overflow-hidden`}>
            {/* Desktop Table View */}
            <div ref={desktopLibraryRef} className="hidden max-h-[600px] overflow-y-auto md:block" data-lenis-prevent>
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-[#F3F5FA]">
                  <tr className="border-b border-[#E6EAF1]">
                    <th className={th}>{t('library.headers.name')}</th>
                    <th className={th}>{t('library.headers.category')}</th>
                    <th className={th}>{t('library.headers.batch')}</th>
                    <th className={`${th} text-right`}>{t('library.headers.action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E6EAF1] text-sm">
                  {filteredProducts.length > 0 ? (
                    filteredProducts.map((product, idx) => (
                      <tr key={idx} className="transition-colors hover:bg-[#F3F5FA]/60">
                        <td className="p-4 md:p-5">
                          <div className="text-[15px] font-medium tracking-[-0.01em] text-[#0B0F14]">{product.name}</div>
                          {product.cas !== 'N/A' && (
                            <div className="mt-1 font-dm-mono text-[10px] uppercase tracking-[0.14em] text-[#0B0F14]/40">CAS: {product.cas}</div>
                          )}
                        </td>
                        <td className="p-4 capitalize text-[#0B0F14]/60 md:p-5">{product.category.replace(/-/g, ' ')}</td>
                        <td className="p-4 md:p-5">
                          <span className={pill}>{t('library.verified')}</span>
                        </td>
                        <td className="p-4 text-right md:p-5">
                          <a href="/placeholder-coa.pdf" target="_blank" rel="noopener noreferrer" className={dl}>
                            <FileText className="h-3.5 w-3.5" />
                            {t('library.download')}
                          </a>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="p-12 text-center text-[#0B0F14]/40">
                        {t('library.empty', { searchTerm })}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div ref={mobileLibraryRef} className="max-h-[600px] divide-y divide-[#E6EAF1] overflow-y-auto md:hidden" data-lenis-prevent>
              {filteredProducts.length > 0 ? (
                filteredProducts.map((product, idx) => (
                  <div key={idx} className="flex flex-col gap-4 p-5">
                    <div>
                      <div className="text-[15px] font-medium text-[#0B0F14]">{product.name}</div>
                      {product.cas !== 'N/A' && (
                        <div className="mt-1 font-dm-mono text-[10px] uppercase tracking-[0.14em] text-[#0B0F14]/40">CAS: {product.cas}</div>
                      )}
                      <div className="mt-1 text-xs capitalize text-[#0B0F14]/55">Category: {product.category.replace(/-/g, ' ')}</div>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className={pill}>{t('library.verified')}</span>
                      <a href="/placeholder-coa.pdf" target="_blank" rel="noopener noreferrer" className={dl}>
                        <FileText className="h-3.5 w-3.5" />
                        {t('library.download')}
                      </a>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-10 text-center text-sm text-[#0B0F14]/40">{t('library.empty', { searchTerm })}</div>
              )}
            </div>
          </div>
        </RevealGroup>
      </Section>

      {/* How to read a COA */}
      <section className={SECTION}>
        <div className={WRAP}>
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
            {/* Illustrative COA document (decorative) */}
            <RevealGroup>
              <div data-reveal className={`${card} p-5 md:p-8`} aria-hidden="true">
                <div className="relative flex h-[380px] flex-col overflow-hidden rounded-xl border border-[#E6EAF1] bg-[#F3F5FA]">
                  <div className="flex items-start justify-between border-b border-[#E6EAF1] p-5">
                    <div>
                      <div className="mb-2 h-3.5 w-24 rounded bg-[#0B0F14]/10" />
                      <div className="h-3 w-32 rounded bg-[#0B0F14]/5" />
                    </div>
                    <div className="h-11 w-11 rounded-full bg-[#4FC3D0]/25" />
                  </div>
                  <div className="relative flex-1 p-5">
                    <div className="absolute bottom-5 left-5 right-5 flex h-32 items-end gap-2 border-b border-l border-[#0B0F14]/10">
                      <div className="h-1/6 w-1/6 rounded-t bg-[#4FC3D0]/25" />
                      <div className="relative h-full w-1/6 rounded-t bg-[#4FC3D0]">
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-[#0B0F14] px-2 py-1 font-dm-mono text-[10px] text-white">99.8%</div>
                      </div>
                      <div className="h-1/4 w-1/6 rounded-t bg-[#4FC3D0]/45" />
                      <div className="h-1/5 w-1/6 rounded-t bg-[#4FC3D0]/35" />
                    </div>
                  </div>
                  <div className="flex justify-end border-t border-[#E6EAF1] p-5">
                    <div className="h-6 w-28 rounded bg-[#0B0F14]/10" />
                  </div>
                  <div className="absolute left-[28px] top-[78px] flex h-6 w-6 items-center justify-center rounded-full bg-[#0B0F14] font-dm-mono text-[10px] text-white">01</div>
                  <div className="absolute left-[150px] top-[190px] flex h-6 w-6 items-center justify-center rounded-full bg-[#0B0F14] font-dm-mono text-[10px] text-white">02</div>
                  <div className="absolute left-[240px] top-[270px] flex h-6 w-6 items-center justify-center rounded-full bg-[#0B0F14] font-dm-mono text-[10px] text-white">03</div>
                  <div className="absolute bottom-[30px] right-[30px] flex h-6 w-6 items-center justify-center rounded-full bg-[#0B0F14] font-dm-mono text-[10px] text-white">04</div>
                </div>
              </div>
            </RevealGroup>

            <div>
              <Eyebrow className="mb-5">DOCUMENT ANATOMY</Eyebrow>
              <SplitHeading text={t('howToRead.title')} className={`${h2} mb-5`} />
              <p className="mb-10 text-[15px] leading-relaxed text-[#0B0F14]/60">{t('howToRead.subtitle')}</p>
              <RevealGroup className="space-y-6">
                {t.raw('howToRead.steps').map((step: any, i: number) => (
                  <div key={i} data-reveal className="flex gap-5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#E6EAF1] bg-white font-dm-mono text-[12px] text-[#0B6F7B]">{step.id}</div>
                    <div>
                      <h3 className="mb-1.5 text-[1.1rem] font-medium tracking-[-0.02em]">{step.title}</h3>
                      <p className="text-[13.5px] leading-relaxed text-[#0B0F14]/60">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </RevealGroup>
            </div>
          </div>
        </div>
      </section>

      {/* Testing parameters */}
      <Section eyebrow="BEYOND PURITY" title={t('parameters.title')} description={t('parameters.subtitle')}>
        <CardGrid cols={3}>
          {t.raw('parameters.cards').map((c: any, idx: number) => (
            <InfoCard
              key={idx}
              icon={idx === 0 ? <Microscope className="h-4 w-4" /> : idx === 1 ? <FlaskConical className="h-4 w-4" /> : <Beaker className="h-4 w-4" />}
              title={c.title}
            >
              <div className="mb-2 font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/40">{c.subtitle}</div>
              {c.desc}
            </InfoCard>
          ))}
        </CardGrid>
      </Section>

      {/* Testing pipeline: the one dark panel besides the CTA */}
      <section className="px-3 py-6 md:px-4">
        <div className="relative mx-auto max-w-[1760px] overflow-hidden rounded-[1.75rem] bg-[#0B0D10] px-6 py-16 text-white md:px-12 md:py-24">
          <div className="mx-auto max-w-[1360px]">
            <div className="mb-12 max-w-3xl md:mb-16">
              <Eyebrow light className="mb-5">QUALITY ASSURANCE LOOP</Eyebrow>
              <SplitHeading text={t('pipeline.title')} className={`${h2} mb-5 !text-white`} />
              <p className="text-[15px] leading-relaxed text-white/55">{t('pipeline.subtitle')}</p>
            </div>
            <RevealGroup className="grid gap-4 md:grid-cols-3">
              {[
                { Icon: FlaskConical, k: 'step1' },
                { Icon: Microscope, k: 'step2' },
                { Icon: FileText, k: 'step3' },
              ].map(({ Icon, k }, i) => (
                <div key={k} data-reveal className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-6 md:p-8">
                  <div className="mb-6 flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#4FC3D0]/15 text-[#4FC3D0]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="font-dm-mono text-[10px] uppercase tracking-[0.2em] text-white/40">Step 0{i + 1}</span>
                  </div>
                  <h3 className="mb-3 text-[1.25rem] font-light tracking-[-0.02em]">{t(`pipeline.${k}.title`)}</h3>
                  <p className="text-[13.5px] leading-relaxed text-white/55">{t(`pipeline.${k}.desc`)}</p>
                </div>
              ))}
            </RevealGroup>
          </div>
        </div>
      </section>

      {/* Comparison */}
      <Section eyebrow="COMPARATIVE STANDARDS" title={t('comparison.title')} description={t('comparison.subtitle')}>
        <RevealGroup>
          <div data-reveal className={`${card} overflow-hidden`}>
            <div ref={comparisonTableRef} className="overflow-x-auto" data-lenis-prevent>
              <table className="w-full min-w-[600px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[#E6EAF1] bg-[#F3F5FA]">
                    <th className={`${th} w-1/3`}>{t('comparison.headers.criteria')}</th>
                    <th className="w-1/3 bg-[#4FC3D0]/10 p-4 text-[14px] font-medium text-[#0B0F14] md:p-5">
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-[#0B6F7B]" />
                        {t('comparison.headers.ours')}
                      </div>
                    </th>
                    <th className="w-1/3 p-4 text-[14px] font-medium text-[#0B0F14]/55 md:p-5">{t('comparison.headers.theirs')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E6EAF1] text-sm">
                  {comparisonRows.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-[#F3F5FA]/50">
                      <td className="p-4 font-dm-mono text-[11px] uppercase tracking-[0.12em] text-[#0B0F14] md:p-5">{row.crit}</td>
                      <td className="bg-[#4FC3D0]/[0.06] p-4 text-[#0B0F14] md:p-5">
                        <div className="flex items-start gap-2.5">
                          <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#0B6F7B]" />
                          <span>{row.ours}</span>
                        </div>
                      </td>
                      <td className="p-4 text-[#0B0F14]/45 md:p-5">
                        <div className="flex items-start gap-2.5">
                          <X className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#0B0F14]/30" />
                          <span>{row.theirs}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </RevealGroup>
      </Section>

      {/* Lab credentials */}
      <section className={SECTION}>
        <div className={`${WRAP} text-center`}>
          <ShieldCheck className="mx-auto mb-6 h-9 w-9 text-[#0B6F7B]" aria-hidden="true" />
          <SplitHeading text={t('trust.title')} className={`${h2} mx-auto mb-5 max-w-3xl`} />
          <p className="mx-auto mb-10 max-w-2xl text-[15px] leading-relaxed text-[#0B0F14]/60">{t('trust.desc')}</p>
          <RevealGroup className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-3">
            {[
              { Icon: Globe, k: 'us' },
              { Icon: Award, k: 'cgmp' },
              { Icon: Beaker, k: 'qa' },
            ].map(({ Icon, k }) => (
              <div key={k} data-reveal className={`${card} flex items-center justify-center gap-3 px-6 py-5`}>
                <Icon className="h-5 w-5 text-[#0B6F7B]" />
                <span className="text-[14px] font-medium tracking-[-0.01em]">{t(`trust.badges.${k}`)}</span>
              </div>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* Quality & Testing FAQ */}
      <FaqSection
        id="quality-faq"
        eyebrow="(FAQ)"
        title={t('FAQ.title')}
        subtitle={t('FAQ.subtitle')}
        items={t.raw('FAQ.items') as any[]}
        theme="light"
      />

      <CtaBand
        eyebrow={t('cta.badge')}
        title={t('cta.title')}
        description={t('cta.subtitle')}
        primary={{ label: 'WhatsApp Sales', href: "https://wa.me/18433307365?text=Hi,%20I'm%20interested%20in%20learning%20more%20about%20your%20verified%20batch%20quality%20and%20receiving%20the%20wholesale%20price%20list.", external: true }}
        secondary={{ label: 'Email Laboratory', href: 'mailto:sales@99puritywholesale.com' }}
      />
    </PageShell>
  );
}
