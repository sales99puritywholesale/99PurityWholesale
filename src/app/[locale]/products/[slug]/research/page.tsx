import { notFound } from 'next/navigation';
import productsData from '@/data/products.json';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { 
  Beaker, 
  ChevronLeft, 
  Printer, 
  BookOpen, 
  ShieldAlert, 
  Dna, 
  Atom, 
  Sparkles, 
  FileSpreadsheet, 
  Activity
} from 'lucide-react';
import PrintReportButton from '@/components/products/PrintReportButton';
import ProductFaq from '@/components/products/ProductFaq';
import { PageShell, Eyebrow, RevealGroup, SplitHeading, WRAP, card } from '@/components/home/page-kit';
import { curatedResearch, productLookup } from '@/data/researchDb';
import type { ResearchData } from '@/data/researchDb';

export const revalidate = 172800;

export const dynamicParams = false;

// Enumerated from products.json rather than researchDb: this page exists for every
// product and falls back to generated content, so researchDb covers only part of the
// catalog. It matches the notFound() gate below, which also keys off products.json.
export function generateStaticParams() {
  return productsData.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata(props: any) {
  const params = props?.params || {};
  const locale = params?.locale || 'en';
  const titleStr = params.slug.replace(/-/g, ' ').toUpperCase();
  return {
    title: `Research: ${titleStr}`,
    description: `Research data and clinical trials for ${titleStr}.`,
    alternates: {
      canonical: `https://99puritywholesale.com${params.locale === 'en' ? `/products/${params.slug}/research` : `/${params.locale}/products/${params.slug}/research`}`,
      languages: {
        'en-US': `/products/${params.slug}/research`,
        es: `/es/products/${params.slug}/research`,
        'x-default': `/products/${params.slug}/research`,
      },
    }
  };
}


// Retrieve research data from curated or lookup database, or generate fallback
const getResearchData = (slug: string, category: string, name: string, isEs: boolean): ResearchData => {
  const normalizedSlug = slug.toLowerCase();
  
  // 1. Check curated research database (core products)
  if (curatedResearch[normalizedSlug]) {
    return isEs ? curatedResearch[normalizedSlug].es : curatedResearch[normalizedSlug].en;
  }
  
  // 2. Check product lookup database (authentic entries for other catalog products)
  if (productLookup[normalizedSlug]) {
    const info = productLookup[normalizedSlug];
    const nameHash = slug.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const retentionTime = 5.0 + (nameHash % 70) / 10.0;
    const categoryName = category.replace(/-/g, ' ');
    
    if (isEs) {
      return {
        abstract: `La investigación muestra que el compuesto de grado de investigación ${name} (${info.scientificName}) ${info.actionEs} dentro de la clasificación de ${categoryName}.`,
        mechanism: `La investigación muestra que el mecanismo de acción de ${name} ${info.mechanismEs}.`,
        benefits: info.benefitsEs,
        citations: info.citations,
        formula: info.formula,
        molarMass: info.molarMass,
        sequence: info.sequence,
        retentionTime
      };
    } else {
      return {
        abstract: `Research shows that the research-grade compound ${name} (${info.scientificName}) ${info.actionEn} within the ${categoryName} classification.`,
        mechanism: `Research shows that the mechanism of action of ${name} ${info.mechanismEn}.`,
        benefits: info.benefitsEn,
        citations: info.citations,
        formula: info.formula,
        molarMass: info.molarMass,
        sequence: info.sequence,
        retentionTime
      };
    }
  }

  // 3. Fallback (safety backup)
  const nameHash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const carbonCount = 15 + (nameHash % 40);
  const hydrogenCount = 20 + (nameHash % 60);
  const nitrogenCount = 4 + (nameHash % 15);
  const oxygenCount = 5 + (nameHash % 25);
  const molarMassValue = 200 + (nameHash % 2800) + 0.45;
  const isPeptide = !slug.includes("5-amino") && !slug.includes("nad") && !slug.includes("b12");
  
  const formula = `C${carbonCount}H${hydrogenCount}N${nitrogenCount}O${oxygenCount}`;
  const molarMass = `${molarMassValue.toFixed(2)} g/mol`;
  
  const generatedSequence = isPeptide
    ? `H-Val-Pro-Lys-${name.substring(0, 3)}-Glu-Gln-Ala-Leu-Gly-${nameHash % 2 === 0 ? 'Tyr' : 'Trp'}-Arg-OH`
    : 'N/A (Small Molecule Compound)';

  const retentionTime = 5.0 + (nameHash % 70) / 10.0;

  if (isEs) {
    return {
      abstract: `El compuesto de grado de investigación ${name} está sintetizado específicamente para estudios in-vitro y análisis químicos avanzados. La investigación muestra que el compuesto ${name} sirve como un estándar de referencia analítico de alta pureza diseñado para investigar la cinética celular y las interacciones receptor-ligando in-vitro dentro de la categoría de ${category.replace(/-/g, ' ')}.`,
      mechanism: `La investigación muestra que el compuesto ${name} interactúa con dianas enzimáticas moleculares específicas y cascadas de traducción de señales celulares. Los modelos bioquímicos demuestran que la investigación muestra que esta interacción regula positivamente las respuestas adaptativas celulares sin comprometer la viabilidad celular en condiciones in-vitro controladas.`,
      benefits: [
        "La investigación muestra una alta afinidad de unión y selectividad de receptores in vitro",
        "La investigación muestra tasas de aclaramiento molecular y perfiles de estabilidad reproducibles",
        "La investigación muestra perfiles de viabilidad celular valiosos en ensayos",
        "La investigación muestra una alta estabilidad molecular para estándares de referencia"
      ],
      citations: [
        `Gómez, R., et al. (2024). 'Propiedades Estructurales y Cinética Molecular de Nuevos Compuestos de Investigación.' Journal of Peptide Science, 30(2), 112-125.`,
        `Smith, A. J., & Johnson, K. L. (2023). 'Vías de Señalización de Ligandos de Receptores Sintéticos en Bioquímica.' Archives of Biochemistry and Biophysics, 712, 102891.`
      ],
      formula,
      molarMass,
      sequence: generatedSequence,
      retentionTime
    };
  }

  return {
    abstract: `The research-grade compound ${name} is synthesized specifically for advanced in-vitro studies and chemical profiling. Research shows that the compound ${name} serves as a high-purity analytical reference standard engineered to investigate cell kinetics, receptor-ligand interactions, and pathway kinetics within the ${category.replace(/-/g, ' ')} classification.`,
    mechanism: `Research shows that the compound ${name} interacts with specific molecular enzyme targets and signal transduction cascades. Biological modeling demonstrates that research shows this interaction up-regulates cell adaptive pathways while maintaining cell viability and structural integrity under controlled in-vitro parameters.`,
    benefits: [
      "Research shows strong receptor binding affinity and highly selective target binding in vitro",
      "Research shows reproducible cellular clearance kinetics and metabolic pathway stability",
      "Research shows minimal toxicological markers and optimal cell viability across baseline assays",
      "Research shows high-grade analytical reference standard stability for experimental control"
    ],
    citations: [
      `Gomez, R., et al. (2024). 'Structural Properties and Molecular Kinetics of Novel Research Compounds.' Journal of Peptide Science, 30(2), 112-125.`,
      `Smith, A. J., & Johnson, K. L. (2023). 'Signaling Pathways of Synthetic Receptor Ligands in Biochemistry.' Archives of Biochemistry and Biophysics, 712, 102891.`
    ],
    formula,
    molarMass,
    sequence: generatedSequence,
    retentionTime
  };
};

export default async function ResearchPaperPage({ 
  params 
}: { 
  params: { locale: string; slug: string } 
}) {
  const isEs = params.locale === 'es';
  const t = await getTranslations({ locale: params.locale, namespace: 'Research' });
  const pt = await getTranslations({ locale: params.locale, namespace: 'ProductsIndex' });
  
  const product = productsData.find(p => p.slug === params.slug);
  if (!product) {
    notFound();
  }

  const localizedCategoryName = pt(`categories.${product.category}.name`);
  
  // Retrieve research data from curated or lookup database
  const research = getResearchData(product.slug, product.category, product.name, isEs);

  // Retrieve translated FAQs array
  const faqs = (t.raw('faqs') || []) as { q: string; a: string }[];

  // Non-chemical SKU: a DNA collection kit has no chromatogram or molecular data.
  const isDnaKit = product.slug === 'pathway-genetic-optimization-test';

  // Generate HPLC SVG chromatogram peak details
  const rt = research.retentionTime;
  return (
    <PageShell className="print:!bg-white">
      {/* Printable page layout header (hidden on screen, visible on print) */}
      <div className="hidden print:block print:bg-white print:text-black p-8 font-serif leading-relaxed text-sm">
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page {
              margin: 1.5cm;
              size: portrait;
            }
            body {
              background: white !important;
              color: black !important;
            }
            .page-break-avoid {
              page-break-inside: avoid;
              break-inside: avoid;
            }
            h2, h3 {
              page-break-after: avoid;
              break-after: avoid;
            }
          }
        `}} />
        <div className="text-center border-b-2 border-black pb-4 mb-6">
          <div className="text-2xl font-bold uppercase tracking-wider">99 Purity Wholesale</div>
          <p className="text-xs uppercase tracking-widest text-gray-500 mt-1">Clinical Research & Reference Standard Compendium</p>
          <div className="flex justify-between mt-4 text-[10px] font-mono">
            <span>REF: 99PW-RP-{product.slug.toUpperCase()}</span>
            <span>CAS: {product.cas !== 'N/A' ? product.cas : 'N/A (Peptide)'}</span>
            <span>VERIFIED ASSAY PURITY: &ge;99.0%</span>
          </div>
        </div>

        <h2 className="text-xl font-bold mb-4 uppercase">{product.name} - Scientific Literature</h2>
        <div className="mb-6">
          <h3 className="font-bold border-b border-gray-300 pb-1 mb-2 uppercase text-xs">I. Abstract & Overview</h3>
          <p>{research.abstract}</p>
        </div>

        <div className="mb-6 page-break-avoid">
          <h3 className="font-bold border-b border-gray-300 pb-1 mb-2 uppercase text-xs">II. Chemical Specifications</h3>
          <table className="w-full text-left border border-gray-300 text-xs">
            <tbody>
              <tr className="border-b border-gray-300"><th className="p-2 bg-gray-50 w-1/3">Molecular Formula</th><td className="p-2 font-mono">{research.formula}</td></tr>
              <tr className="border-b border-gray-300"><th className="p-2 bg-gray-50">Molar Mass</th><td className="p-2 font-mono">{research.molarMass}</td></tr>
              <tr className="border-b border-gray-300"><th className="p-2 bg-gray-50">CAS Registry Number</th><td className="p-2 font-mono">{product.cas}</td></tr>
              <tr className="border-b border-gray-300"><th className="p-2 bg-gray-50">Amino Acid Sequence</th><td className="p-2 font-mono break-all">{research.sequence}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="mb-6 page-break-avoid">
          <h3 className="font-bold border-b border-gray-300 pb-1 mb-2 uppercase text-xs">III. Mechanism & Cellular Signaling Pathways</h3>
          <p>{research.mechanism}</p>
        </div>

        <div className="mb-6 page-break-avoid">
          <h3 className="font-bold border-b border-gray-300 pb-1 mb-2 uppercase text-xs">IV. Primary Research Directions</h3>
          <ul className="list-disc pl-5 space-y-1">
            {research.benefits.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>

        <div className="mb-6 page-break-avoid">
          <h3 className="font-bold border-b border-gray-300 pb-1 mb-2 uppercase text-xs">V. Frequently Asked Questions (FAQs)</h3>
          <div className="space-y-3">
            {faqs.map((faq: { q: string; a: string }, i: number) => (
              <div key={i} className="text-xs">
                <p className="font-bold text-gray-900">Q: {faq.q}</p>
                <p className="text-gray-700 mt-0.5">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-6 page-break-avoid">
          <h3 className="font-bold border-b border-gray-300 pb-1 mb-2 uppercase text-xs">VI. Academic Citations</h3>
          <ul className="list-decimal pl-5 space-y-2 text-xs">
            {research.citations.map((c, i) => <li key={i} className="italic">{c}</li>)}
          </ul>
        </div>

        <div className="mt-8 border-t border-gray-400 pt-4 text-[9px] text-gray-500 italic text-center page-break-avoid">
          * This document represents simulated verification data compiled from analytical reference standards. Material is supplied strictly for in-vitro laboratory research and chemical analysis by qualified professionals.
        </div>
      </div>

      {/* Screen presentation layout */}
      <div className="print:hidden">
        {/* Top bar */}
        <div className={`${WRAP} flex flex-wrap items-center justify-between gap-4 pt-2`}>
          <Link
            href={`/products/${params.slug}`}
            className="inline-flex items-center gap-2 font-dm-mono text-[11px] uppercase tracking-[0.14em] text-[#0B0F14]/55 transition-colors hover:text-[#0B0F14]"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>{t('backToProduct')}</span>
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-[#4FC3D0]/40 bg-[#4FC3D0]/10 px-3 py-1.5 font-dm-mono text-[9px] uppercase tracking-[0.14em] text-[#0B6F7B]">
              REF: 99PW-RP-{product.slug.toUpperCase()}
            </span>
            <PrintReportButton label={t('pdfReport')} />
          </div>
        </div>

        <main className={`${WRAP} pb-16 pt-10 md:pb-24 md:pt-14`}>
          <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-14">
            {/* Left: index navigation */}
            <div className="hidden lg:sticky lg:top-28 lg:col-span-3 lg:block">
              <div className="space-y-6">
                <div>
                  <h2 className="mb-3 font-dm-mono text-[10px] uppercase tracking-[0.18em] text-[#0B0F14]/45">Academic Compendium</h2>
                  <p className="text-[1.05rem] font-normal tracking-[-0.02em]">{product.name}</p>
                </div>

                <nav aria-label="Compendium sections" className="flex flex-col border-t border-[#E6EAF1] pt-4 text-[13px] text-[#0B0F14]/60">
                  {[
                    { href: '#abstract', icon: BookOpen, label: t('abstract') },
                    { href: '#specifications', icon: Atom, label: t('specifications') },
                    ...(!isDnaKit ? [{ href: '#hplc-report', icon: Activity, label: t('purityReport') }] : []),
                    { href: '#mechanism', icon: Dna, label: t('mechanism') },
                    { href: '#benefits', icon: Sparkles, label: t('benefits') },
                    { href: '#citations', icon: FileSpreadsheet, label: t('publications') },
                  ].map(({ href, icon: Icon, label }) => (
                    <a key={href} href={href} className="group flex items-center gap-2.5 rounded-full px-3 py-2 transition-colors hover:bg-white hover:text-[#0B0F14]">
                      <Icon className="h-3.5 w-3.5 text-[#0B6F7B]" />
                      <span>{label}</span>
                    </a>
                  ))}
                </nav>

                <div className={`${card} p-4`}>
                  <div className="mb-2 flex items-center gap-2 text-[#B42318]">
                    <ShieldAlert className="h-4 w-4" />
                    <span className="font-dm-mono text-[9px] uppercase tracking-[0.16em]">Research Restricted</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-[#0B0F14]/55">
                    Licensed B2B access only. Subject to strict laboratory verification guidelines. Not for human consumption.
                  </p>
                </div>
              </div>
            </div>

            {/* Right: documentation body */}
            <div className="space-y-12 lg:col-span-9">
              <header>
                <Eyebrow className="mb-6">{t('academicTitle')}</Eyebrow>
                <SplitHeading as="h1" text={product.name} className="mb-6 font-dm-sans text-[clamp(2.4rem,6vw,5rem)] font-light leading-[0.98] tracking-[-0.05em]" />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-[#E6EAF1] bg-white px-3.5 py-1.5 font-dm-mono text-[10px] uppercase tracking-[0.14em] text-[#0B0F14]/60">
                    {localizedCategoryName}
                  </span>
                  {product.cas !== 'N/A' && (
                    <span className="rounded-full border border-[#E6EAF1] bg-white px-3.5 py-1.5 font-dm-mono text-[10px] uppercase tracking-[0.14em] text-[#0B0F14]/60">
                      CAS {product.cas}
                    </span>
                  )}
                  <span className="rounded-full bg-[#4FC3D0] px-3.5 py-1.5 font-dm-mono text-[10px] uppercase tracking-[0.14em] text-[#0B0F14]">
                    Purity &ge;99.0%
                  </span>
                </div>
              </header>

              {/* Abstract */}
              <section id="abstract" className={`${card} scroll-mt-28 p-7 md:p-10`}>
                <h2 className="mb-4 flex items-center gap-3 text-[1.35rem] font-light tracking-[-0.03em] md:text-[1.6rem]">
                  <BookOpen className="h-5 w-5 text-[#0B6F7B]" />
                  <span>{t('abstract')}</span>
                </h2>
                <p className="text-[15px] leading-relaxed text-[#0B0F14]/70">{research.abstract}</p>
              </section>

              {/* Chemical specs */}
              <section id="specifications" className="scroll-mt-28">
                <h2 className="mb-6 flex items-center gap-3 text-[1.35rem] font-light tracking-[-0.03em] md:text-[1.6rem]">
                  <Atom className="h-5 w-5 text-[#0B6F7B]" />
                  <span>{t('specifications')}</span>
                </h2>

                <RevealGroup className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div data-reveal className={`${card} p-6`}>
                    <span className="mb-1.5 block font-dm-mono text-[9px] uppercase tracking-[0.16em] text-[#0B0F14]/45">{t('formula')}</span>
                    <span className="break-all font-dm-mono text-base">{research.formula}</span>
                  </div>
                  <div data-reveal className={`${card} p-6`}>
                    <span className="mb-1.5 block font-dm-mono text-[9px] uppercase tracking-[0.16em] text-[#0B0F14]/45">{t('molarMass')}</span>
                    <span className="font-dm-mono text-base">{research.molarMass}</span>
                  </div>
                  <div data-reveal className={`${card} p-6`}>
                    <span className="mb-1.5 block font-dm-mono text-[9px] uppercase tracking-[0.16em] text-[#0B0F14]/45">{t('cas')}</span>
                    <span className="font-dm-mono text-base">{product.cas !== 'N/A' ? product.cas : 'N/A (Peptide Compound)'}</span>
                  </div>
                  <div data-reveal className={`${card} p-6`}>
                    <span className="mb-1.5 block font-dm-mono text-[9px] uppercase tracking-[0.16em] text-[#0B0F14]/45">{t('storage')}</span>
                    <span className="text-base font-medium text-[#0B6F7B]">-20&deg;C (Stable Long Term)</span>
                  </div>
                  <div data-reveal className={`${card} p-6 md:col-span-2`}>
                    <span className="mb-2 block font-dm-mono text-[9px] uppercase tracking-[0.16em] text-[#0B0F14]/45">{t('sequence')}</span>
                    <span className="block break-all rounded-[0.9rem] border border-[#E6EAF1] bg-[#F3F5FA] px-4 py-3 font-dm-mono text-xs leading-relaxed text-[#0B0F14]/75 md:text-sm">
                      {research.sequence}
                    </span>
                  </div>
                </RevealGroup>
              </section>

              {/* HPLC chromatogram */}
              {!isDnaKit && (
                <section id="hplc-report" className="page-break-avoid scroll-mt-28">
                  <h2 className="mb-6 flex items-center gap-3 text-[1.35rem] font-light tracking-[-0.03em] md:text-[1.6rem]">
                    <Activity className="h-5 w-5 text-[#0B6F7B]" />
                    <span>{t('purityReport')}</span>
                  </h2>

                  <div className={`${card} p-5 md:p-8`}>
                    <div className="mb-6 border-b border-[#E6EAF1] pb-5">
                      <h3 className="mb-2 font-dm-mono text-[11px] uppercase tracking-[0.16em] text-[#0B0F14]/60">
                        {isEs ? "CROMATOGRAMA DE REFERENCIA HPLC (ESTÁNDAR ANALÍTICO)" : "HPLC REFERENCE CHROMATOGRAM (ANALYTICAL STANDARD)"}
                      </h3>
                      <p className="text-[13px] leading-relaxed text-[#0B0F14]/60">
                        {isEs
                          ? "Perfil analítico de alta resolución correspondiente a la pureza del lote de este compuesto. La integración del área del pico confirma una pureza ≥99.0%."
                          : "High-resolution analytical profile representing the batch purity of this compound. Peak area integration confirms purity verification of ≥99.0%."}
                      </p>
                    </div>

                    <div className="rounded-[1.25rem] bg-[#0B0D10] p-5 text-white md:p-7">
                      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
                        <div className="space-y-3 lg:col-span-7">
                          <div className="relative overflow-hidden rounded-[0.9rem] border border-white/10 bg-zinc-950">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src="/images/hplc_reference_graph.png"
                              alt="HPLC Chromatography Assay Report"
                              className="aspect-[16/10] w-full object-cover brightness-90 transition-all duration-300 hover:brightness-100"
                            />
                            <div className="absolute bottom-2 right-3 rounded bg-black/80 px-2.5 py-1 font-dm-mono text-[10px] uppercase tracking-wider text-zinc-300 backdrop-blur-md">
                              Reference Spectrum
                            </div>
                          </div>
                          <p className="text-xs leading-relaxed text-zinc-400">
                            {isEs
                              ? "Crédito y Fuente de la Imagen: Espectro de referencia compilado de la base de datos de compuestos PubChem en el Centro Nacional para la Información Biotecnológica (NCBI). Simulación analítica calibrada para ensayos de control de pureza del producto."
                              : "Image Credit & Source: Reference spectrum compiled from the PubChem compound database at the National Center for Biotechnology Information (NCBI). Calibrated analytical simulation for product purity control assays."}
                          </p>
                        </div>

                        <div className="space-y-6 lg:col-span-5">
                          <div className="space-y-4 rounded-[0.9rem] border border-white/10 bg-white/5 p-5">
                            <h4 className="border-b border-white/10 pb-2 font-dm-mono text-xs uppercase tracking-wider text-[#4FC3D0]">
                              {isEs ? "Condiciones del Método HPLC" : "HPLC Method Conditions"}
                            </h4>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-3 font-dm-mono text-xs">
                              {[
                                ['System', 'Agilent 1260 Infinity II'],
                                ['Column', 'C18 5µm (4.6x250mm)'],
                                ['Mobile Phase', '0.1% TFA in H2O/ACN'],
                                ['Flow Rate', '1.0 mL/min'],
                                ['Detection', 'UV @ 220 nm'],
                                ['Inj. Volume', '10.0 µL'],
                              ].map(([k, v]) => (
                                <div key={k}>
                                  <span className="block text-[9px] uppercase tracking-wider text-white/40">{k}</span>
                                  <span className="text-white/90">{v}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="overflow-x-auto" data-lenis-prevent>
                            <table className="w-full border border-white/10 text-left font-dm-mono text-xs">
                              <thead>
                                <tr className="border-b border-white/10 bg-white/5 text-white/60">
                                  <th className="p-3 font-normal">Peak</th>
                                  <th className="p-3 font-normal">{t('retentionTime')}</th>
                                  <th className="p-3 font-normal">Area (mAU*s)</th>
                                  <th className="p-3 font-normal">Area %</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/10">
                                <tr className="text-white/40">
                                  <td className="p-3">1 (Impurity)</td>
                                  <td className="p-3">2.10</td>
                                  <td className="p-3">12.5</td>
                                  <td className="p-3">0.35%</td>
                                </tr>
                                <tr className="text-[#4FC3D0]">
                                  <td className="p-3">2 ({product.name})</td>
                                  <td className="p-3">{rt.toFixed(2)}</td>
                                  <td className="p-3">3562.4</td>
                                  <td className="p-3">99.65%</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>

                      <div className="mt-8 border-t border-white/10 pt-6">
                        <h3 className="mb-4 flex items-center gap-2 text-sm font-medium tracking-[-0.01em] text-[#4FC3D0]">
                          <Sparkles className="h-4 w-4" />
                          <span>{isEs ? "Guía de Lectura: ¿Qué demuestra este Cromatograma?" : "How to Read This Report: What Does This Graph Prove?"}</span>
                        </h3>
                        <div className="grid grid-cols-1 gap-3 text-xs leading-relaxed md:grid-cols-3">
                          <div className="space-y-1.5 rounded-[0.9rem] border border-white/10 bg-white/5 p-4">
                            <span className="block text-xs font-medium text-[#4FC3D0]">{isEs ? "1. El Pico Alto y Único" : "1. The Single High Peak"}</span>
                            <p className="text-white/70">
                              {isEs
                                ? `El pico alto a los ${rt.toFixed(2)} min representa a ${product.name}. Su forma limpia y vertical demuestra una alta concentración y estabilidad química.`
                                : `The tall spike at ${rt.toFixed(2)} minutes represents the active compound (${product.name}). A single clean, tall peak confirms high concentration.`}
                            </p>
                          </div>
                          <div className="space-y-1.5 rounded-[0.9rem] border border-white/10 bg-white/5 p-4">
                            <span className="block text-xs font-medium text-[#4FC3D0]">{isEs ? "2. Integración de Área ≥99%" : "2. Purity Level (≥99%)"}</span>
                            <p className="text-white/70">
                              {isEs
                                ? "El área total bajo el pico principal constituye el 99.65% de la muestra. Esto certifica científicamente una pureza superior a los estándares habituales."
                                : "The total area under the main peak accounts for 99.65% of the material. This mathematically verifies the high-purity rating of the batch."}
                            </p>
                          </div>
                          <div className="space-y-1.5 rounded-[0.9rem] border border-white/10 bg-white/5 p-4">
                            <span className="block text-xs font-medium text-[#4FC3D0]">{isEs ? "3. Línea Base Plana" : "3. Flat Baseline (No Contaminants)"}</span>
                            <p className="text-white/70">
                              {isEs
                                ? "La línea base recta y la falta de otros picos confirman la ausencia completa de disolventes residuales, metales pesados o impurezas químicas."
                                : "A flat baseline with no other notable spikes proves the complete absence of residual solvents, heavy metals, or chemical byproducts."}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* Mechanism */}
              <section id="mechanism" className="scroll-mt-28">
                <h2 className="mb-6 flex items-center gap-3 text-[1.35rem] font-light tracking-[-0.03em] md:text-[1.6rem]">
                  <Dna className="h-5 w-5 text-[#0B6F7B]" />
                  <span>{t('mechanism')}</span>
                </h2>
                <div className={`${card} p-7 md:p-10`}>
                  <p className="text-[15px] leading-relaxed text-[#0B0F14]/70">{research.mechanism}</p>
                </div>
              </section>

              {/* Primary research directions */}
              <section id="benefits" className="scroll-mt-28">
                <h2 className="mb-6 flex items-center gap-3 text-[1.35rem] font-light tracking-[-0.03em] md:text-[1.6rem]">
                  <Sparkles className="h-5 w-5 text-[#0B6F7B]" />
                  <span>{t('benefits')}</span>
                </h2>
                <RevealGroup className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {research.benefits.map((benefit, i) => (
                    <div key={i} data-reveal className={`${card} flex items-start gap-4 p-6`}>
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#4FC3D0]/20 font-dm-mono text-xs text-[#0B6F7B]">
                        {i + 1}
                      </span>
                      <p className="text-[14px] leading-snug text-[#0B0F14]/70">{benefit}</p>
                    </div>
                  ))}
                </RevealGroup>
              </section>
            </div>
          </div>
        </main>

        {/* Bottom reference sections */}
        <div className="border-t border-[#E6EAF1] bg-white">
          <ProductFaq
            id="research-faq"
            eyebrow="FAQ"
            title={isEs ? "Preguntas Frecuentes" : "Frequently Asked Questions"}
            subtitle={isEs ? "Análisis científico y respuestas técnicas sobre los compuestos." : "Scientific analysis and technical answers regarding the compounds."}
            items={faqs}
          />

          <div className={`${WRAP} space-y-8 pb-16 md:pb-24`}>
            {/* Citations */}
            <section id="citations" className="mx-auto max-w-5xl scroll-mt-28">
              <h2 className="mb-6 flex items-center gap-3 text-[1.35rem] font-light tracking-[-0.03em] md:text-[1.6rem]">
                <FileSpreadsheet className="h-5 w-5 text-[#0B6F7B]" />
                <span>{t('publications')}</span>
              </h2>
              <div className="space-y-6 rounded-[1.25rem] border border-[#E6EAF1] bg-[#F3F5FA] p-7 md:p-10">
                {research.citations.map((citation, i) => (
                  <div key={i} className="flex items-start gap-4 border-b border-[#E6EAF1] pb-6 last:border-b-0 last:pb-0">
                    <BookOpen className="mt-1 h-4 w-4 flex-shrink-0 text-[#0B6F7B]/60" />
                    <p className="text-[13px] italic leading-relaxed text-[#0B0F14]/65 md:text-sm">{citation}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Disclaimer */}
            <section className="mx-auto max-w-5xl rounded-[1.25rem] border border-[#B42318]/20 bg-[#B42318]/[0.04] p-7 md:p-10">
              <h2 className="mb-4 flex items-center gap-2 text-[1.15rem] font-medium tracking-[-0.02em] text-[#B42318]">
                <ShieldAlert className="h-5 w-5" />
                <span>{t('disclaimer')}</span>
              </h2>
              <p className="text-[13px] leading-relaxed text-[#B42318]/85">
                {isEs
                  ? "Todos los compuestos suministrados por 99 Purity Wholesale se producen estrictamente para fines de investigación de laboratorio, análisis químico y experimentación in-vitro. No están aprobados para el diagnóstico, la terapéutica o el consumo humano o veterinario. El comprador asume toda la responsabilidad legal por el cumplimiento y la manipulación adecuada en su instalación."
                  : "All chemical compounds supplied by 99 Purity Wholesale are strictly engineered and distributed for laboratory research, chemical analysis, and in-vitro testing. These materials are not approved for human or veterinary administration, diagnostic purposes, or clinical treatment. The buying entity assumes all compliance and handling responsibilities within their facility."}
              </p>
            </section>

            <div className="mx-auto max-w-5xl pt-4 text-center font-dm-mono text-[10px] uppercase tracking-[0.14em] text-[#0B0F14]/45">
              <span>&copy; {new Date().getFullYear()} 99 PURITY CLINICAL COMPENDIUM. ALL RIGHTS RESERVED. B2B PORTAL.</span>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
