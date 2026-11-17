import { notFound } from 'next/navigation';
import { Zap, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';
import productsData from '@/data/products.json';
import ProductCard from '@/components/products/ProductCard';
import ProductFaq from '@/components/products/ProductFaq';
import ProductsCta from '@/components/products/ProductsCta';
import { PageShell, PageHero, RevealGroup, SplitHeading, WRAP, SECTION, card, h2 } from '@/components/home/page-kit';

export async function generateMetadata(props: any) {
  const params = props?.params || {};
  const locale = params?.locale || 'en';
  const t = await getTranslations({ locale: params.locale, namespace: 'CategoryDetail' });
  
  const categories = [
    'metabolic-research',
    'cognitive-function',
    'sleep-cycle-investigation',
    'growth-factor-research',
    'recovery-research',
    'cellular-health-research',
    'aminos',
    'essentials'
  ];
  if (!categories.includes(params.category)) return {};

  const path = `/products/${params.category}`;
  return {
    title: `${t(`categories.${params.category}.title`)} — Wholesale Bulk Supply`,
    description: t(`categories.${params.category}.desc`),
    alternates: {
      canonical: `https://99puritywholesale.com${params.locale === 'en' ? path : `/${params.locale}${path}`}`,
      languages: {
        'en-US': path,
        es: `/es${path}`,
        'x-default': path,
      },
    },
  };
}

// Dynamic helper to build 8 robust, localized B2B wholesale peptide FAQs
function getFAQList(locale: string, categoryTitle: string, categoryFaqs: {q: string, a: string}[]) {
  const isEs = locale === 'es';
  
  const generalFaqs = isEs ? [
    {
      q: `¿Cómo se verifica la pureza de los compuestos de la categoría ${categoryTitle}?`,
      a: "Todos los péptidos se someten a rigurosas pruebas analíticas en laboratorios acreditados de EE. UU. utilizando cromatografía líquida de alta resolución (HPLC) y espectrometría de masas (MS) para confirmar una pureza ≥99% y la identidad de la secuencia."
    },
    {
      q: "¿Sus instalaciones cumplen con las directrices cGMP de EE. UU.?",
      a: "Sí, todos los compuestos se sintetizan en laboratorios de última generación que cumplen con las directrices de buenas prácticas de fabricación vigentes (cGMP), garantizando un estricto control de calidad, esterilidad y reproducibilidad de lote a lote."
    },
    {
      q: "¿Cómo se envían los péptidos liofilizados al por mayor?",
      a: "Nuestros péptidos se envían liofilizados (polvo liofilizado) en viales sellados al vacío. La liofilización garantiza la estabilidad durante el tránsito doméstico y elimina la necesidad de transporte refrigerado de cadena de frío."
    },
    {
      q: "¿Cuáles son las condiciones óptimas de almacenamiento para la estabilidad?",
      a: "Para la estabilidad a largo plazo, los viales liofilizados deben almacenarse a -20 °C o menos. Una vez reconstituidos con agua bacteriostática, deben mantenerse refrigerados a 2-8 °C y utilizarse en un plazo de 30 días."
    },
    {
      q: "¿Cómo funcionan los descuentos por volumen para cuentas B2B?",
      a: "Ofrecemos una estructura de precios escalonada basada en el volumen total del pedido. Sus descuentos se aplican automáticamente en viales individuales o kits, independientemente de la categoría de péptido ordenada."
    },
    {
      q: "¿Cuál es el pedido mínimo para el programa de compras al por mayor?",
      a: "El pedido mínimo inicial es de 10 unidades (1 kit completo de viales) por producto. Esto nos permite mantener un embalaje clínico estéril y ofrecer precios preferenciales al por mayor."
    },
    {
      q: "¿Ofrecen servicios de marca privada o síntesis personalizada?",
      a: "Sí, ofrecemos servicios integrales de marca privada (Private Label) para clínicas y laboratorios autorizados, incluyendo viales personalizados, cajas de kit con marca propia y especificaciones de concentración exclusivas."
    },
    {
      q: "¿Se pueden utilizar estos compuestos para consumo terapéutico directo?",
      a: "No. Todos los productos químicos suministrados en nuestro catálogo al por mayor están destinados estrictamente a investigación de laboratorio e investigación in vitro. No están aprobados para uso terapéutico o consumo humano."
    }
  ] : [
    {
      q: `How is the purity of compounds in the ${categoryTitle} category verified?`,
      a: "Every single batch of peptides undergoes rigorous analytical testing at accredited U.S. laboratories using High-Performance Liquid Chromatography (HPLC) and Mass Spectrometry (MS) to confirm sequence identity and ≥99% purity levels."
    },
    {
      q: "Are your synthesis facilities cGMP compliant?",
      a: "Yes, all compounds are synthesized in state-of-the-art facilities complying with current Good Manufacturing Practices (cGMP) guidelines, ensuring sterile compounding, strict environment controls, and lot-to-lot reproducibility."
    },
    {
      q: "How are the lyophilized peptides shipped for wholesale orders?",
      a: "Our peptides are shipped in lyophilized (freeze-dried) powder form in vacuum-sealed vials. Lyophilization ensures maximum compound stability during transit and eliminates cold-chain requirements during shipping."
    },
    {
      q: "What are the recommended storage and stability guidelines?",
      a: "For long-term storage, lyophilized vials should be kept at -20°C or below. Once reconstituted with sterile bacteriostatic water, compounds must be kept refrigerated at 2-8°C and utilized within 30 days."
    },
    {
      q: "How do volume tier discounts apply to wholesale orders?",
      a: "We offer a highly scalable B2B discount structure based on your total catalog volume. The tier discount applies automatically across all product kits and compounding supplies in your cart."
    },
    {
      q: "What is the Minimum Order Quantity (MOQ) for wholesale accounts?",
      a: "Our standard wholesale MOQ is 10 units (1 kit) per product specification. This allows us to ship sterile clinical batch lots and provide tiered pricing models."
    },
    {
      q: "Do you offer private labeling or custom synthesis services?",
      a: "Yes. We offer fully customized B2B solutions including custom peptide synthesis, private labeling, branded boxes, and specialized vial sizes for clinics, spas, and laboratories."
    },
    {
      q: "Are these compounds approved for direct human consumption?",
      a: "No. All products listed in our wholesale catalog are synthesized exclusively for laboratory research and in vitro study. They are not approved for diagnostic, therapeutic, or direct human administration."
    }
  ];

  const merged = [...categoryFaqs, ...generalFaqs];
  return merged.slice(0, Math.max(8, categoryFaqs.length));
}

export default async function CategoryPage({ params }: { params: { locale: string; category: string } }) {
  const t = await getTranslations({ locale: params.locale, namespace: 'CategoryDetail' });
  const ct = await getTranslations({ locale: params.locale, namespace: 'CategoryTemplate' });
  const tDetail = await getTranslations({ locale: params.locale, namespace: 'ProductDetail' });
  
  const categoryKeys = [
    'metabolic-research',
    'cognitive-function',
    'sleep-cycle-investigation',
    'growth-factor-research',
    'recovery-research',
    'cellular-health-research',
    'aminos',
    'essentials'
  ];
  
  if (!categoryKeys.includes(params.category)) notFound();

  const products = productsData.filter(p => p.category === params.category);

  // Fetch category FAQs and dynamic list expansion to at least 8 FAQs
  const categoryFaqs = (t.raw(`categories.${params.category}.faqs`) as {q: string, a: string}[]) || [];
  const faqs = getFAQList(params.locale, t(`categories.${params.category}.title`), categoryFaqs);

  const title = t(`categories.${params.category}.title`);
  const wa = `https://wa.me/${(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '18433307365').replace(/\D/g, '')}`;

  return (
    <PageShell>
      {/* Breadcrumb navigation */}
      <nav aria-label="Breadcrumb" className={`${WRAP} pt-2 font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/45`}>
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link href="/" className="hover:text-[#0B0F14]">{ct('home')}</Link></li>
          <li aria-hidden>/</li>
          <li><Link href="/products" className="hover:text-[#0B0F14]">{ct('products')}</Link></li>
          <li aria-hidden>/</li>
          <li className="text-[#0B0F14]/75" aria-current="page">{title}</li>
        </ol>
      </nav>

      <PageHero
        eyebrow={t(`categories.${params.category}.badge`)}
        title={title}
        intro={t(`categories.${params.category}.desc`)}
        actions={
          <>
            {['≥99% Purity', 'Batch COA', 'U.S. Made', `${products.length} ${ct('products')}`].map((b) => (
              <span key={b} className="rounded-full border border-[#E6EAF1] bg-white px-4 py-2 font-dm-mono text-[10px] uppercase tracking-[0.14em] text-[#0B0F14]/60">
                {b}
              </span>
            ))}
          </>
        }
      />

      {/* Products grid */}
      <section className="pb-16 md:pb-24">
        <div className={WRAP}>
          <RevealGroup className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <ProductCard
                key={product.slug}
                product={product}
                description={tDetail.has(`descriptions.${product.slug}`) ? tDetail(`descriptions.${product.slug}`) : product.description}
              />
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* SEO narrative and guarantees */}
      <section className={`${SECTION} border-t border-[#E6EAF1]`}>
        <div className={WRAP}>
          <div className="grid items-start gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-7">
              <SplitHeading text={ct('aboutTitle', { title })} className={`${h2} mb-8`} />
              <p className="mb-6 text-[15px] leading-relaxed text-[#0B0F14]/65">{t(`categories.${params.category}.seoP1`)}</p>
              <p className="text-[14px] leading-relaxed text-[#0B0F14]/50">{t(`categories.${params.category}.seoP2`)}</p>
            </div>

            <div className="lg:col-span-5">
              <div className={`${card} p-7 md:p-9 lg:sticky lg:top-28`}>
                <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-full bg-[#F3F5FA] text-[#0B6F7B]">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h3 className="mb-6 text-[1.5rem] font-light leading-tight tracking-[-0.03em]">{t('guarantee.title')}</h3>
                <ul className="mb-8 space-y-4">
                  {(t.raw('guarantee.items') as string[]).map((p) => (
                    <li key={p} className="flex items-start gap-3 text-[13.5px] leading-relaxed text-[#0B0F14]/65">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#0B6F7B]" />
                      {p}
                    </li>
                  ))}
                </ul>
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0B0F14] px-5 py-3.5 font-dm-sans text-[13px] font-medium text-white transition-colors hover:bg-[#1b232d]"
                >
                  <Zap className="h-4 w-4 text-[#4FC3D0]" /> {t('cta.getPricing')}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ProductFaq
        title={ct('faqTitle', { title })}
        subtitle={t(`categories.${params.category}.desc`)}
        items={faqs}
        eyebrow="FAQ"
      />

      <ProductsCta
        eyebrow={t(`categories.${params.category}.badge`)}
        title={title}
        description={t(`categories.${params.category}.desc`)}
        primary={{ label: 'WhatsApp Sales', href: "https://wa.me/18433307365?text=Hi,%20I'm%20interested%20in%20high-volume%20peptide%20sourcing%20and%20receiving%20the%20wholesale%20price%20list.", external: true }}
        secondary={{ label: 'Email Laboratory', href: 'mailto:sales@99puritywholesale.com', external: true }}
      />
    </PageShell>
  );
}
