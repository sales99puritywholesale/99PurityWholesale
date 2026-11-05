import { notFound } from 'next/navigation';
import Image from 'next/image';
import { Zap, CheckCircle2, ShieldCheck, FlaskConical, ChevronRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';
import productsData from '@/data/products.json';
import AddToInquiryButton from '@/components/products/AddToInquiryButton';
import { FadeIn } from '@/components/shared/Motion';
import GlobalCTA from '@/components/layout/GlobalCTA';
import FaqSection from '@/components/shared/FaqSection';

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

const productImagesMap: Record<string, string> = {
  "5-amino-1mq": "5-AMINO-1MQ 50mg.webp",
  "5-amino-1mq-spray": "5-amino-1mq-spray-50mg.jpg",
  "tirzepatide-spray": "tirzepatide-spray-10mg.jpg",
  "semaglutide-spray": "semaglutide-spray-5mg.jpg",
  "retatrutide-spray": "retatrutide-spray-10mg.jpg",
  "thymosin-alpha-1-spray": "thymosin-alpha-1-spray-10mg.jpg",
  "tesamorelin-spray": "tesamorelin-spray-10mg.jpg",
  "tesamorelin-ipamorelin-spray": "tesamorelin-spray-10mg.jpg",
  "tb-500-spray": "tb-500-spray-5mg.jpg",
  "snap-8-spray": "snap-8-spray-10mg.jpg",
  "sermorelin-spray": "sermorelin-spray-10mg.jpg",
  "ss-31-spray": "ss-31-spray-10mg.jpg",
  "mots-c-spray": "mots-c-spray-10mg.jpg",
  "melanotan-1-spray": "melanotan-1-spray-10mg.jpg",
  "ll-37-spray": "ll-37-spray-1mg.jpg",
  "lipo-c-spray": "lipo-c-spray-120mg.jpg",
  "l-carnitine-spray": "l-carnitine-spray-400mg.jpg",
  "klow-spray": "klow-blend-spray-80mg.jpg",
  "kisspeptin-spray": "kisspeptin-spray-10mg.jpg",
  "ipamorelin-spray": "ipamorelin-spray-5mg.jpg",
  "igf-1-lr3-spray": "igf-1-lr3-spray-1mg.jpg",
  "hcg-spray": "hcg-spray-5000iu.jpg",
  "h-frag-spray": "h-frag-spray-5mg.jpg",
  "glutathione-spray": "glutathione-spray-600mg.jpg",
  "glow-spray": "glow-blend-spray-70mg.jpg",
  "ghrp-6-spray": "ghrp-6-spray-10mg.jpg",
  "ghrp-2-spray": "ghrp-2-spray-100mg.jpg",
  "dihexa-spray": "dihexa-spray-10mg.jpg",
  "cjc-1295-ipamorelin-spray": "cjc-1295-ipamorelin-spray-10mg.jpg",
  "cjc-1295-dac-spray": "cjc-1295-dac-spray-5mg.jpg",
  "cjc-1295-no-dac-spray": "cjc-1295-no-dac-spray-10mg.jpg",
  "cagrilintide-spray": "cagrilintide-spray-10mg.jpg",
  "bpc-157-tb-500-spray": "bpc-157-tb-500-spray-10mg.jpg",
  "ara-290-spray": "ara-290-spray-10mg.jpg",
  "aod9604-spray": "aod9604-spray-5mg.jpg",
  "ahk-cu-spray": "ahk-cu-50mg.png",
  "bioregulator-core-panel": "bioregulator-core-panel.webp",
  "bioregulator-full-master-set": "bioregulator-full-master-set.webp",
  "bioregulator-cardiovascular": "bioregulator-cardiovascular.webp",
  "bioregulator-hepatic-digestive": "bioregulator-hepatic-digestive.webp",
  "bioregulator-immune-thymic": "bioregulator-immune-thymic.webp",
  "bioregulator-neuro-pineal": "bioregulator-neuro-pineal.webp",
  "bioregulator-respiratory": "bioregulator-respiratory.webp",
  "bioregulator-urogenital": "bioregulator-urogenital.webp",
  "advanced-nootropic": "bundle-advanced-nootropic.webp",
  "advanced-repair-immune": "bundle-advanced-repair-immune.webp",
  "body-composition-kit": "bundle-body-composition.webp",
  "classic-secretagogue": "bundle-classic-secretagogue.webp",
  "extended-gh-igf": "bundle-extended-gh-igf.webp",
  "gh-secretagogue": "bundle-gh-secretagogue.webp",
  "gut-mucosal-panel": "bundle-gut-mucosal-panel.webp",
  "incretin-amylin": "bundle-incretin-amylin.webp",
  "longevity-mitochondrial": "bundle-longevity-mitochondrial.webp",
  "melanocortin-reproductive": "bundle-melanocortin-reproductive.webp",
  "metabolic-activation": "bundle-metabolic-activation.webp",
  "metabolic-support": "bundle-metabolic-support.webp",
  "nad-antioxidant": "bundle-nad-antioxidant.webp",
  "neuro-core": "bundle-neuro-core.webp",
  "recovery-sleep-stress": "bundle-recovery-sleep-stress.webp",
  "repair-trio": "bundle-repair-trio.webp",
  "reproductive-hpg-axis": "bundle-reproductive-hpg-axis.webp",
  "skin-cosmetic": "bundle-skin-cosmetic.webp",
  "vascular-immune-protection": "bundle-vascular-immune-protection.webp",
  "senescence-stack": "bundle-senescence-stack.webp",
  "pathway-genetic-optimization-test": "pathway-genetic-optimization-test.webp",
  "adamax": "adamax-5mg.webp",
  "adipotide-fttp": "adipotide-fttp-2mg.webp",
  "aod9604": "aod9604-5mg.webp",
  "b12": "b12-10mg.webp",
  "b7-33": "b7-33-2mg.webp",
  "bac-water": "BAC WATER 3ML.webp",
  "bpc-157": "BPC-157 5mg-5.webp",
  "bpc-5mg-tb-5mg": "BPC-157 TB-500 MIX 5mg 5mg-2.webp",
  "bpc-10mg-tb-10mg": "bpc-157-tb-500-10-10mg.jpg",
  "cagrilintide": "CAGRILINTIDE 10mg.webp",
  "cagrisema": "cagrisema-2-5-2-5-5mg.webp",
  "cjc-1295-dac": "cjc-1295-dac5mg.webp",
  "cjc-1295-no-dac": "cjc-1295-no-dac-5mg.webp",
  "cjc-1295-ipam": "cjc-1295-ipamorelin-10-10mg.jpg",
  "dihexa": "dihexa-10mg.webp",
  "dsip": "dsip-5mg.webp",
  "dulaglutide": "dulaglutide-5mg.webp",
  "epithalon": "EPITHALON 10mg.webp",
  "foxo4": "foxo4-2mg.webp",
  "foxo4-dri": "foxo4-dri-10mg.webp",
  "ghk-cu": "GHK-CU 50mg-1.webp",
  "glow-blend": "glow-hair-skin-nail-blend.jpg",
  "klow-blend": "klow-custom-peptide-kit.jpg",
  "glutathione": "glutathione-600mg.webp",
  "ipamorelin": "IPAMORELIN 5mg-2.webp",
  "kpv": "KPV 10mg.webp",
  "l-carnitine": "l-carnitine-1200mg.webp",
  "lipo-c": "LIPO-C.webp",
  "ll37": "ll37-5mg.jpg",
  "mic-blend": "mic-lipo-c-b12-10mg.webp",
  "mots-c": "MOTS-C 10mg-1.webp",
  "nad": "nad-plus-500mg-1.webp",
  "retatrutide": "RETATRUTIDE 10mg-6.webp",
  "selank": "SELANK 10mg.webp",
  "semaglutide": "SEMAGLUTIDE 5mg-2.webp",
  "semax": "SEMAX 10mg.webp",
  "sermorelin-acetate": "semorelin-acetate-5mg.webp",
  "snap-8": "SNAP 8  10mg.webp",
  "ss-31": "ss-31-10mg.webp",
  "tb-500": "TB-500  5mg-2.webp",
  "tesamorelin": "TESAMORELIN 10mg-1.webp",
  "thymalin-thymulin": "thymalin-thymylin-10mg.webp",
  "thymosin-alpha-1": "Thymosin Alpha 1mg.webp",
  "tirzepatide": "TIRZEPATIDE 10mg-3.webp",
  "vip": "vip-5mg.webp",
  "glutathione-600-1500": "GLUTATHIONE  200mg ml.webp",
  "epitalon-spray": "EPITALON spray 10mg.webp",
  "aod-9604-5mg-10mg": "AOD9604  5mg-2.webp",
  "cjc-1295-ipamorelin": "CJC 1295 IPAMORELIN 5mg 5mg-2.webp",
  "10-needles": "10 Needles-1.webp",
  "l-carnitine-600mg": "L-CARNATINE 600mg 20mg.webp",
  "h-frag": "H FRAG.webp",
  "ghrp-2-10mg": "GHRP-2  10mg.webp",
  "ss-31-elamipretide": "SS-31 10mg-1.webp",
  "ahk-cu-50mg-100mg": "AHK-CU 50mg-1.webp",
  "pt-141-bremelanotide": "PT-141 10mg.webp",
  "kisspeptin": "KISSPEPTIN  10mg.webp",
  "mt-1-10mg": "MT-1 10mg.webp",
  "semax-spray": "SEMAX spray 5mg.webp",
  "selank-spray": "SELANK spray 100mcg.webp",
  "semax-selank-spray": "semax-plus-selank-spray-300mcg.webp",
  "l-carnitine-400mg": "L-CARNATINE 400mg 20mg.webp",
  "l-carnitine-200mg": "L-CARNATINE 200mg 20ml.webp",
  "oxytocin-spray": "OXYTOCIN spray10mg.webp",
  "pt-141-spray": "PT-141  spray 10mg.webp",
  "dsip-spray": "DSIP spray 10mg.webp",
  "kpv-spray": "KPV spray 5mg.webp",
  "nad-spray": "nad-plus-spray-50mg.webp",
  "glow": "GLOW 70mg.webp",
  "klow": "KLOW.webp",
  "ara-290-10mg": "ARA-290  10mg.webp",
  "ghrp-6-10mg": "GHRP-6  10mg.webp",
  "sermorelin": "SERMORELIN 10mg.webp",
  "igf-1-lr3": "IGF1 LR31mg-2.webp",
  "dhea-10mg": "DHEA 10mg.webp",
  "hcg-5000-iu": "HCG  5000 IU.webp",
  "mt-2-melanotan-ii": "MT-2 10mg.webp",
  "vip-vasoactive-intestinal-peptide": "VIP 10mg.webp",
  "vip-spray": "VIP spray 10mg.webp",
  "mt-2-spray": "MT-2 spray 10mg.webp",
  "ghk-cu-spray": "GHK-CU spray 50mg.webp",
  "bpc-157-spray": "BPC-157 spray 5mg.webp",
  "dsip-delta-sleep-inducing-peptide": "DSIP 10mg.webp",
  "cjc-1295-no-dac-10mg": "CJC-1295 No DAC  10mg.webp",
  "cjc-1295-dac-5mg": "CJC W DAC  5mg.webp",
  "semax-selank-blend": "SEMAX SELANK 10 10.webp",
  "hcg-10000-iu": "HCG  10000 IU.webp",
  "tesamorelin-ipamorelin-research-peptide": "TESA IPA 6mg 3mg.webp"
};

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

  return (
    <main className="min-h-screen bg-[#F8F8F6] text-black -mt-24 md:-mt-32">

      {/* Hero Section - Elegant Light Off-White Linen with safety header padding */}
      <section className="relative overflow-hidden pt-44 pb-24 md:pt-56 md:pb-28 border-b border-black/5 bg-[#F8F8F6]">
        {/* Light Noise Texture */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[url('/images/noise.svg')]" />
        
        <div className="container mx-auto px-6 max-w-5xl relative z-10">
          <FadeIn>
            {/* Breadcrumb Navigation */}
            <div className="flex items-center gap-2 mb-8 text-black/30 font-dm-mono text-[10px] font-bold uppercase tracking-widest">
              <Link href="/" className="hover:text-black">{ct('home')}</Link>
              <span>/</span>
              <Link href="/products" className="hover:text-black">{ct('products')}</Link>
              <span>/</span>
              <span className="text-black/60">{t(`categories.${params.category}.title`)}</span>
            </div>

            {/* Badge */}
            <div className="inline-block bg-black/5 border border-black/5 px-5 py-2 rounded-full text-[10px] font-bold font-dm-sans uppercase tracking-widest text-black/60 mb-6">
              {t(`categories.${params.category}.badge`)}
            </div>

            {/* Header */}
            <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold font-absans text-black uppercase tracking-tight leading-none mb-6 break-words w-full">
              {t(`categories.${params.category}.title`)}
            </h1>

            {/* Description */}
            <p className="text-lg md:text-xl font-archia font-semibold text-black/75 max-w-3xl leading-relaxed">
              {t(`categories.${params.category}.desc`)}
            </p>

            {/* Specification Badges Tray */}
            <div className="flex flex-wrap gap-2.5 mt-10">
              {['≥99% Purity', 'Batch COA', 'U.S. Made', `${products.length} ${ct('products')}`].map(b => (
                <span 
                  key={b} 
                  className="bg-white border border-black/5 text-black/60 px-4 py-1.5 rounded-full font-dm-mono text-[10px] font-bold uppercase tracking-wider shadow-sm"
                >
                  {b}
                </span>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Products Grid - Consistent Light Linen Section */}
      <section className="py-24 md:py-32 bg-[#F8F8F6] border-b border-black/5 relative overflow-hidden">
        {/* Subtle Light Noise Texture */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[url('/images/noise.svg')]" />
        
        <div className="container mx-auto px-2 sm:px-6 max-w-7xl relative z-20">
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
            {products.map((product, idx) => {
              const productImage = productImagesMap[product.slug as keyof typeof productImagesMap];
              return (
                <FadeIn key={product.slug} delay={0.05 * idx} className="h-full">
                  <div className="group relative bg-white border border-black/5 rounded-[1.25rem] sm:rounded-[2.2rem] p-3 sm:p-6 hover:border-brand-accent/35 transition-all duration-500 flex flex-col hover:-translate-y-2 shadow-[0_15px_40px_rgba(0,0,0,0.03)] hover:shadow-[0_30px_90px_rgba(0,0,0,0.05)] overflow-hidden h-full">
                    {/* Grainy Noise Overlay for premium luxury depth */}
                    <div className="absolute inset-0 opacity-[0.01] pointer-events-none bg-[url('/images/noise.svg')]" />
                    
                    <Link href={`/products/${product.slug}`} className="flex flex-col h-full relative z-10">
                      {/* Luxury Product Thumbnail Showcase */}
                      <div className="relative aspect-square w-full rounded-xl sm:rounded-2xl bg-white overflow-hidden flex items-center justify-center mb-4 sm:mb-5 transition-all duration-500">
                        {productImage ? (
                          <Image 
                            src={`/product-images/${productImage}`}
                            alt={`${product.name} High Purity Wholesale Research Peptide`}
                            fill
                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                            className="object-contain p-[5%] rounded-lg transition-transform duration-700 ease-out group-hover:scale-[1.06]"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-center p-4 text-black/20 relative z-10">
                            <FlaskConical className="w-10 h-10 text-black/10 mb-2 group-hover:text-brand-accent/50 transition-colors" />
                            <span className="text-[9px] font-dm-mono uppercase tracking-[0.15em] text-black/20">Research Only</span>
                          </div>
                        )}
                      </div>
 
                      {/* Category Tag */}
                      <div className="mb-2.5 sm:mb-3.5">
                        <span className="text-[8px] font-dm-mono font-bold text-black/40 uppercase tracking-[0.2em] px-2 py-0.5 sm:px-2.5 sm:py-1 bg-black/5 rounded-full border border-black/5 group-hover:border-black/15 group-hover:text-black transition-all duration-300">
                          {product.category.replace(/-/g, ' ')}
                        </span>
                      </div>
                      
                      {/* Title */}
                      <h3 className="text-xs sm:text-base md:text-lg font-absans font-bold text-black mb-1 sm:mb-2 leading-tight group-hover:text-black/80 transition-colors duration-300 uppercase tracking-tight line-clamp-1 sm:line-clamp-none">
                        {product.name}
                      </h3>
                      
                      {/* Short localized Description */}
                      <p className="text-[10px] sm:text-xs text-black/50 font-archia leading-relaxed font-medium line-clamp-2 mb-3 sm:mb-6 group-hover:text-black/70 transition-colors duration-300 flex-grow">
                        {tDetail.has(`descriptions.${product.slug}`) ? tDetail(`descriptions.${product.slug}`) : product.description}
                      </p>
                    </Link>
 
                    {/* Inquiry & Details Action Drawer */}
                    <div className="flex flex-col gap-2.5 sm:gap-4 pt-3 sm:pt-5 border-t border-black/5 mt-auto relative z-10">
                      {(() => {
                        const [spec, kitSizeStr] = product.specs[0].split('×');
                        return (
                          <AddToInquiryButton
                            productId={product.slug}
                            productName={product.name}
                            category={product.category}
                            spec={spec}
                            kitSize={parseInt(kitSizeStr)}
                            categoryPage={`/products/${product.category}`}
                          />
                        );
                      })()}
                      
                      <div className="flex items-center justify-between mt-1">
                        <div className="text-[9px] font-dm-mono font-bold text-black/30 uppercase tracking-widest">
                          {product.specs.length} Specs
                        </div>
                        
                        <Link 
                          href={`/products/${product.slug}`} 
                          className="flex items-center gap-1 text-black/50 text-[10px] font-dm-mono font-bold uppercase tracking-widest transition-colors hover:text-black"
                        >
                          Details <ChevronRight className="w-3.5 h-3.5 ml-0.5 transform transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </FadeIn>
              );
            })}
          </div>
        </div>
      </section>

      {/* SEO Narrative & Clinical Guarantees Section - Contrast Off-White/Linen Grid */}
      <section className="py-24 md:py-32 bg-[#F8F8F6] border-b border-black/5 relative overflow-hidden">
        {/* Light Noise Texture */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[url('/images/noise.svg')]" />
        
        <div className="container mx-auto px-6 max-w-7xl relative z-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">
            
            {/* Left Portion: Compound Dynamic SEO Narrative */}
            <div className="lg:col-span-7 space-y-8">
              <FadeIn>
                <h2 className="text-3xl md:text-4xl font-bold font-absans text-black uppercase tracking-tight mb-8">
                  {ct('aboutTitle', { title: t(`categories.${params.category}.title`) })}
                </h2>
                <p className="text-black/60 font-archia leading-relaxed text-sm md:text-base font-medium mb-6">
                  {t(`categories.${params.category}.seoP1`)}
                </p>
                <p className="text-black/40 font-archia leading-relaxed text-sm font-medium">
                  {t(`categories.${params.category}.seoP2`)}
                </p>
              </FadeIn>
            </div>

            {/* Right Portion: Certified Guarantees Card */}
            <div className="lg:col-span-5">
              <FadeIn delay={0.1}>
                <div className="bg-white border border-black/5 rounded-[2.5rem] p-8 md:p-10 sticky top-28 shadow-sm hover:border-black/15 transition-all">
                  <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center mb-6 border border-black/5">
                    <ShieldCheck className="w-6 h-6 text-black" />
                  </div>
                  
                  <h3 className="text-2xl font-bold font-absans text-black mb-6 uppercase tracking-wide">
                    {t('guarantee.title')}
                  </h3>
                  
                  <ul className="space-y-4 mb-8 pl-0">
                    {(t.raw('guarantee.items') as string[]).map(p => (
                      <li key={p} className="flex items-start gap-3 text-black/60 font-archia text-sm font-medium">
                        <CheckCircle2 className="w-4 h-4 text-black/40 mt-0.5 flex-shrink-0" />
                        {p}
                      </li>
                    ))}
                  </ul>
                  
                  <a 
                    href={`https://wa.me/${(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '18433307365').replace(/\D/g, '')}`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="w-full bg-black hover:bg-black/90 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 font-dm-sans text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg active:scale-95 whitespace-nowrap"
                  >
                    <Zap className="w-4 h-4" /> {t('cta.getPricing')}
                  </a>
                </div>
              </FadeIn>
            </div>

          </div>
        </div>
      </section>

      {/* FAQs Section - Uniform Homepage Styling Component */}
      <FaqSection 
        title={ct('faqTitle', { title: t(`categories.${params.category}.title`) })}
        subtitle={t(`categories.${params.category}.desc`)}
        items={faqs}
        eyebrow="(FAQ)"
        theme="light"
      />

      {/* Bottom Global B2B Call-To-Action Block */}
      <GlobalCTA 
        badge={t(`categories.${params.category}.badge`)}
        title={t(`categories.${params.category}.title`)}
        subtitle={t(`categories.${params.category}.desc`)}
        primaryCtaText="WhatsApp Sales"
        primaryCtaHref="https://wa.me/18433307365?text=Hi,%20I'm%20interested%20in%20high-volume%20peptide%20sourcing%20and%20receiving%20the%20wholesale%20price%20list."
        secondaryCtaText="Email Laboratory"
        secondaryCtaHref="mailto:sales@99puritywholesale.com"
      />

    </main>
  );
}
