'use client';

import React from 'react';
import { ShieldCheck, ArrowRight, Activity, Beaker, Globe, Scale, BookOpen, Microscope, MapPin } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { FadeIn, StaggerContainer, StaggerItem } from '@/components/shared/Motion';
import locationsData from '@/data/locations.json';
import citiesData from '@/data/cities.json';
import WholesaleOrderingProcess from '@/components/locations/WholesaleOrderingProcess';
import CompoundSpotlight from '@/components/locations/CompoundSpotlight';
import NationwideLogisticsTable from '@/components/locations/NationwideLogisticsTable';
import QualityStandardsSection from '@/components/locations/QualityStandardsSection';
import { useLocale } from 'next-intl';

const stateDirectory = locationsData
  .filter((loc) => loc.slug !== 'united-states')
  .map((loc) => ({ slug: loc.slug, name: loc.city }))
  .sort((a, b) => a.name.localeCompare(b.name));

const cityDirectory = citiesData
  .map((c) => ({ slug: c.slug, name: c.city, stateSlug: c.stateSlug, state: c.state, region: c.region }))
  .sort((a, b) => a.name.localeCompare(b.name));

export default function UnitedStatesHubContent() {
  const locale = useLocale();
  const isEs = locale === 'es';

  return (
    <div className="space-y-20 w-full col-span-12">
      
      {/* 1. EEAT / Overview Section */}
      <section className="space-y-8">
        <FadeIn>
          <div className="prose prose-lg max-w-none text-black/70 leading-relaxed">
            <h2 className="text-3xl font-dm-sans font-light text-black tracking-[-0.03em] mb-6">
              {isEs 
                ? 'El Principal Centro Nacional de Péptidos de Grado de Investigación en los Estados Unidos'
                : 'The Premier National Hub for Research-Grade Peptides in the United States'}
            </h2>
            {isEs ? (
              <>
                <p className="mb-4">
                  A la vanguardia de la distribución bioquímica, 99 Purity Wholesale es el proveedor nacional definitivo de péptidos de máxima pureza para investigación en todo Estados Unidos: desde compuestos metabólicos como <Link href="/products/cagrilintide" className="text-[#0B6F7B] hover:underline font-semibold">Cagrilintide</Link> hasta péptidos regenerativos como <Link href="/products/tb-500" className="text-[#0B6F7B] hover:underline font-semibold">TB-500</Link>. Explore nuestro directorio completo de estados y ciudades a continuación para consultar plazos de entrega locales para laboratorios autorizados, universidades y centros de investigación clínica en su región.
                </p>
                <p className="mb-4">
                  El mercado nacional de péptidos exige una precisión absoluta, un riguroso cumplimiento normativo y una pureza inigualable. Comprendemos que en el ámbito del cribado de alto rendimiento, la biología molecular y los estudios analíticos, la integridad de los compuestos básicos no es negociable. Por ello, toda nuestra infraestructura operativa —desde la síntesis hasta la entrega final— está diseñada en torno a un estricto <strong>estándar de pureza ≥99%</strong>, verificado exclusivamente por laboratorios analíticos independientes con certificación ISO ubicados en los propios Estados Unidos.
                </p>
                <p className="mb-4">
                  Al asociarse con nuestra red de distribución en los Estados Unidos, no solo está adquiriendo reactivos bioquímicos; está integrando una cadena de suministro robusta y altamente fiable en su infraestructura de investigación. Eliminamos la incertidumbre de las importaciones internacionales, los retrasos en aduanas y las variaciones entre lotes, proporcionando a los investigadores estadounidenses una solución nacional y transparente para la adquisición de péptidos al por mayor.
                </p>
              </>
            ) : (
              <>
                <p className="mb-4">
                  Operating at the forefront of biochemical distribution, 99 Purity Wholesale is the definitive national supplier of premium, research-grade peptides across the United States — from metabolic compounds like <Link href="/products/cagrilintide" className="text-[#0B6F7B] hover:underline font-semibold">Cagrilintide</Link> to regenerative peptides like <Link href="/products/tb-500" className="text-[#0B6F7B] hover:underline font-semibold">TB-500</Link>. Browse our full state and city directory below to find local delivery estimates for licensed laboratories, universities, and clinical research organizations in your region.
                </p>
                <p className="mb-4">
                  The domestic peptide market demands absolute precision, stringent compliance, and unparalleled purity. We understand that in the realm of high-throughput screening, molecular biology, and clinical trials, the integrity of your base compounds is non-negotiable. That is why our entire operational framework—from synthesis to final mile delivery—is engineered around a strict <strong>≥99% purity standard</strong>, verified exclusively by independent, ISO-certified analytical laboratories located right here in the USA.
                </p>
                <p className="mb-4">
                  When you partner with our United States distribution network, you are not merely purchasing biochemicals; you are integrating a robust, highly reliable supply chain into your research infrastructure. We eliminate the unpredictability of international sourcing, customs delays, and inconsistent batch quality, providing American researchers with a seamless, domestic solution for bulk peptide procurement.
                </p>
              </>
            )}
          </div>
        </FadeIn>

        <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8">
          {[
            {
              icon: ShieldCheck,
              title: isEs ? "Estándares de Calidad Verificables" : "Verifiable Quality Standards",
              desc: isEs
                ? "Cada lote que distribuimos es trazable a un informe de laboratorio independiente. No nos basamos en declaraciones del fabricante: puede consultar el Certificado de Análisis real antes de comprar."
                : "Every batch we distribute is traceable to an independent lab report. Nothing here is a manufacturer's self-certified claim — you can pull the actual Certificate of Analysis for any lot before you buy."
            },
            {
              icon: Scale,
              title: isEs ? "Cumplimiento Normativo" : "Regulatory Compliance",
              desc: isEs
                ? "Cumplimos estrictamente las directrices nacionales. Nuestros compuestos se sintetizan y distribuyen exclusivamente para investigación in vitro y aplicaciones de laboratorio."
                : "We adhere strictly to domestic guidelines. Our compounds are synthesized and distributed strictly for in-vitro research and laboratory applications, ensuring full operational compliance."
            },
            {
              icon: Globe,
              title: isEs ? "Confiabilidad Nacional" : "Domestic Reliability",
              desc: isEs
                ? "Al mantener un amplio inventario dentro de EE. UU., protegemos a nuestros socios B2B de la volatilidad de la cadena de suministro internacional, asegurando un suministro rápido y constante."
                : "By maintaining vast inventory levels within the continental US, we shield our B2B partners from global supply chain volatility, ensuring consistent and rapid deployment."
            }
          ].map((feature, i) => (
            <StaggerItem key={i} className="bg-white border border-black/5 rounded-[1.25rem] p-8 shadow-sm hover:shadow-md transition-all">
              <feature.icon className="w-8 h-8 text-[#0B6F7B] mb-6" />
              <h3 className="text-lg font-dm-sans font-light text-black tracking-[-0.03em] mb-3">{feature.title}</h3>
              <p className="text-black/60 text-sm leading-relaxed">{feature.desc}</p>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </section>

      {/* 2. Top Peptides & Internal Linking Section */}
      <CompoundSpotlight
        heading={isEs ? "Compuestos de Alta Demanda en la Investigación de EE. UU." : "High-Demand Compounds Driving US Research"}
        intro={isEs 
          ? "El panorama de la investigación biomédica estadounidense es sumamente dinámico, con compuestos específicos que impulsan avances significativos en estudios metabólicos, regeneración de tejidos y neurobiología. Suministramos los péptidos más solicitados en cantidades escalables a granel, garantizando que los estudios de gran envergadura nunca se vean limitados por falta de material. Nuestro catálogo incluye agonistas del receptor GLP-1 y péptidos de recuperación validados exhaustivamente."
          : "The landscape of American biomedical research is dynamic, with specific compounds driving significant advancements in metabolic studies, tissue repair, and neurobiology. We supply the nation's most in-demand peptides in scalable bulk quantities, ensuring that large-scale studies are never bottlenecked by material shortages. Our portfolio includes extensively validated GLP-1 receptor agonists and sophisticated recovery peptides."}
      />

      {/* 3. GEO Focused Logistics Table */}
      <NationwideLogisticsTable />

      {/* 3b. Full State Directory (Internal Linking / GEO Coverage) */}
      <section className="bg-white border border-black/5 rounded-[1.75rem] p-8 md:p-12 shadow-sm">
        <FadeIn>
          <h2 className="text-3xl font-dm-sans font-light text-black tracking-[-0.03em] mb-3">
            {isEs ? "Explorar el Suministro Mayorista de Péptidos por Estado" : "Browse Wholesale Peptide Supply by State"}
          </h2>
          <p className="text-black/60 leading-relaxed mb-8 max-w-3xl">
            {isEs 
              ? "Cada página estatal a continuación contiene plazos de entrega estimados, preguntas frecuentes aplicables y detalles de cobertura institucional para compradores autorizados."
              : "Every state page below has its own local delivery estimates, applicable FAQs, and institution coverage details for licensed buyers in that state."}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-3">
            {stateDirectory.map((loc) => (
              <Link
                key={loc.slug}
                href={`/locations/united-states/${loc.slug}`}
                className="flex items-center gap-2 text-black/60 hover:text-[#0B6F7B] text-sm font-semibold transition-colors group"
              >
                <MapPin className="w-3 h-3 text-black/20 group-hover:text-[#0B6F7B] flex-shrink-0 transition-colors" />
                {loc.name}
              </Link>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* 3b-2. Top Cities Directory (Internal Linking / GEO Coverage) */}
      <section className="bg-white border border-black/5 rounded-[1.75rem] p-8 md:p-12 shadow-sm">
        <FadeIn>
          <h2 className="text-3xl font-dm-sans font-light text-black tracking-[-0.03em] mb-3">
            {isEs ? "Explorar el Suministro Mayorista de Péptidos por Ciudad" : "Browse Wholesale Peptide Supply by City"}
          </h2>
          <p className="text-black/60 leading-relaxed mb-8 max-w-3xl">
            {isEs
              ? "A continuación se presentan los centros metropolitanos de investigación que atendemos directamente, cada uno con estimaciones de entrega local y preguntas frecuentes específicas."
              : "Below are the metro-level institutional research and compounding hubs we serve directly, each with local delivery estimates and city-specific FAQs."}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-3">
            {cityDirectory.map((city) => (
              <Link
                key={city.slug}
                href={`/locations/${city.region.toLowerCase().replace(/ /g, '-')}/${city.stateSlug}/${city.slug}`}
                className="flex items-center gap-2 text-black/60 hover:text-[#0B6F7B] text-sm font-semibold transition-colors group"
              >
                <MapPin className="w-3 h-3 text-black/20 group-hover:text-[#0B6F7B] flex-shrink-0 transition-colors" />
                {city.name}
              </Link>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* 3c. Wholesale Ordering Process */}
      <WholesaleOrderingProcess locationName={isEs ? "Estados Unidos" : "United States"} />

      {/* 4. Institutions Served (GEO Content) */}
      <section className="bg-[#0B0D10] text-white border border-white/5 rounded-[1.75rem] p-8 md:p-12 relative overflow-hidden">
        
        <FadeIn className="relative z-10 flex flex-col gap-12">
          <div>
            <h2 className="text-3xl font-dm-sans font-light tracking-[-0.03em] mb-6">
              {isEs ? "Apoyando el Tejido de la Ciencia Estadounidense" : "Supporting the Fabric of American Science"}
            </h2>
            <div className="space-y-6 text-white/60 text-sm leading-relaxed">
              {isEs ? (
                <>
                  <p>
                    Los Estados Unidos albergan la red de investigación científica más avanzada del mundo, impulsada por un complejo ecosistema de laboratorios universitarios, instalaciones privadas de investigación e institutos biológicos. Nos enorgullece ser el proveedor de confianza de péptidos para una amplia variedad de clientes institucionales en toda la nación. Nuestros estrictos controles de calidad y procesos de verificación garantizan que colaboramos exclusivamente con organizaciones acreditadas dedicadas al avance del conocimiento científico — cada lote está respaldado por un <Link href="/certificates-of-analysis" className="text-[#1ed4e8] hover:underline font-semibold">Certificado de Análisis emitido de forma independiente</Link>.
                  </p>
                  <p>
                    <strong>Instituciones Académicas y Universidades:</strong> Apoyamos la investigación universitaria financiada por becas ofreciendo compuestos de alta pureza con total transparencia analítica. Cuando las universidades llevan a cabo estudios longitudinales de varios años, requieren una consistencia molecular absoluta para garantizar la validez de sus publicaciones. Garantizamos que el lote #001 adquirido hoy mantendrá exactamente el mismo perfil de pureza que el lote #100 adquirido el próximo año.
                  </p>
                  <p>
                    <strong>Empresas Privadas de Biotecnología:</strong> Para empresas emergentes de biotecnología y filiales farmacéuticas consolidadas, nuestro suministro a granel escalable previene retrasos en el desarrollo. En las etapas tempranas y críticas de descubrimiento de moléculas y mapeo de receptores, los retrasos en la adquisición química pueden costar miles de dólares diarios. Nuestra distribución nacional asegura que sus investigaciones nunca se detengan.
                  </p>
                  <p>
                    <strong>Organizaciones de Investigación por Contrato (CRO):</strong> Proporcionamos el material estandarizado y fiable que las organizaciones de investigación por contrato necesitan para realizar ensayos reproducibles a gran escala en nombre de sus clientes. Al gestionar pruebas biológicas externalizadas, los CRO no pueden arriesgarse a emplear compuestos degradados o impuros.
                  </p>
                  <p>
                    <strong>Ciencias Veterinarias e Institutos Agrícolas:</strong> Más allá de la investigación análoga a la humana, nuestros compuestos se utilizan frecuentemente en biología veterinaria avanzada. El estudio de la regeneración tisular, la regulación metabólica y la secreción de hormonas de crecimiento en modelos mamíferos depende en gran medida de cadenas de péptidos sintéticos puros para aislar respuestas biológicas específicas.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    The United States houses the world&apos;s most advanced network of scientific inquiry, driven by a complex ecosystem of university laboratories, independent research facilities, and government-funded biological institutes. We are immensely proud to be the trusted peptide supplier for a diverse array of institutional clients across the nation. Our stringent quality controls and rigorous vetting processes ensure that we partner exclusively with verified organizations dedicated to advancing scientific knowledge, cellular biology, and metabolic function — every batch is backed by an <Link href="/certificates-of-analysis" className="text-[#1ed4e8] hover:underline font-semibold">independently issued Certificate of Analysis</Link>.
                  </p>
                  <p>
                    <strong>Academic Institutions & Universities:</strong> We support grant-funded academic research by providing highly pure compounds with full analytical transparency. When universities conduct multi-year longitudinal studies, they require absolute molecular consistency to ensure publication validity and peer-reviewed integrity. We guarantee that batch #001 purchased today will maintain the exact same purity profile as batch #100 purchased next year.
                  </p>
                  <p>
                    <strong>Private Biotechnology Firms:</strong> For agile biotech startups and established pharma subsidiaries, our scalable bulk supply prevents developmental bottlenecks. During the crucial early stages of molecule discovery, receptor mapping, and cellular response testing, delays in chemical procurement can cost thousands of dollars a day. Our domestic distribution ensures your incubators never sit empty.
                  </p>
                  <p>
                    <strong>Clinical Research Organizations (CROs):</strong> We provide the reliable, standardized material required by contract research organizations to conduct reproducible, large-scale assays on behalf of their clientele. When handling outsourced biological testing, CROs cannot risk using degraded or impure synthetic compounds.
                  </p>
                  <p>
                    <strong>Veterinary Science & Agricultural Institutes:</strong> Beyond human-analogous research, our compounds are frequently utilized in cutting-edge veterinary biology. The study of tissue repair, metabolic regulation, and growth hormone secretion in mammalian models relies heavily on synthetic peptide chains to isolate specific biological responses without introducing confounding organic variables.
                  </p>
                </>
              )}
            </div>
            
            <Link href="/wholesale-application" className="mt-10 inline-flex items-center gap-3 bg-white text-black font-dm-sans font-medium tracking-[-0.01em] text-xs px-8 py-4 rounded-full hover:bg-[#0B6F7B] hover:text-white transition-all shadow-[0_10px_30px_rgba(255,255,255,0.1)] hover:shadow-[0_10px_30px_rgba(19,167,183,0.3)]">
              {isEs ? 'Solicitar una Cuenta al Por Mayor' : 'Apply For a Wholesale Account'} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 w-full">
             <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col justify-center items-center text-center">
               <Beaker className="w-8 h-8 text-[#0B6F7B] mb-4" />
               <span className="font-dm-sans font-medium uppercase text-sm tracking-wider">{isEs ? 'Laboratorios Independientes' : 'Independent Labs'}</span>
             </div>
             <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col justify-center items-center text-center">
               <BookOpen className="w-8 h-8 text-[#0B6F7B] mb-4" />
               <span className="font-dm-sans font-medium uppercase text-sm tracking-wider">{isEs ? 'Universidades' : 'Universities'}</span>
             </div>
             <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col justify-center items-center text-center">
               <Microscope className="w-8 h-8 text-[#0B6F7B] mb-4" />
               <span className="font-dm-sans font-medium uppercase text-sm tracking-wider">{isEs ? 'CROs' : 'CROs'}</span>
             </div>
             <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col justify-center items-center text-center">
               <Activity className="w-8 h-8 text-[#0B6F7B] mb-4" />
               <span className="font-dm-sans font-medium uppercase text-sm tracking-wider">{isEs ? 'Startups Biotecnológicas' : 'Biotech Startups'}</span>
             </div>
          </div>
        </FadeIn>
      </section>

      {/* 5-9. Quality, Compliance & Testing Standards */}
      <QualityStandardsSection />

    </div>
  );
}
