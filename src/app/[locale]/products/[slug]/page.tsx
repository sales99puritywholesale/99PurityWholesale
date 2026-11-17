import { notFound } from 'next/navigation';
import { ShieldCheck, Mail, Zap, CheckCircle2, FileText, Beaker, ChevronRight, Box, FlaskConical, MapPin, ArrowUpRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import productsData from '@/data/products.json';
import { getProductContent } from '@/data/productContent';
import locationsData from '@/data/locations.json';
import citiesData from '@/data/cities.json';
import { getTranslations } from 'next-intl/server';
import SpecSelector from '@/components/products/SpecSelector';
import ShareProduct from '@/components/products/ShareProduct';
import ProductFaq from '@/components/products/ProductFaq';
import ProductCard from '@/components/products/ProductCard';
import { PageShell, Eyebrow, PillButton, RevealGroup, SplitHeading, WRAP, SECTION, card, h2 } from '@/components/home/page-kit';
import ProductGallery from '@/components/products/ProductGallery';

// 2 days. Overrides the 1 hour inherited from [locale]/layout.tsx, so the catalog
// gets a longer window than the services and locations routes.
export const revalidate = 172800;

// Unknown slugs are typos or dead links, so 404 at the router instead of rendering.
export const dynamicParams = false;

export function generateStaticParams() {
  return productsData.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata(props: any) {
  const params = props?.params || {};
  const locale = params?.locale || 'en';
  const t = await getTranslations({ locale: params.locale, namespace: 'Meta' });
  const product = productsData.find(p => p.slug === params.slug);
  if (!product) return {};

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://99puritywholesale.com';
  const path = `/products/${params.slug}`;
  const url = params.locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${params.locale}${path}`;

  const ogTitle = t('productOgTitle', { name: product.name });
  const ogDesc = t('productOgDesc', { name: product.name });
  const ogUrlImage = `${baseUrl}/api/og?title=${encodeURIComponent(product.name)}&desc=${encodeURIComponent(ogDesc)}&category=Research%20Compound`;

  return {
    metadataBase: new URL(baseUrl),
    title: t('productTitle', { name: product.name }),
    description: t('productDesc', { name: product.name }),
    alternates: {
      canonical: url,
      languages: {
        'en-US': `${baseUrl}${path}`,
        es: `${baseUrl}/es${path}`,
        'x-default': `${baseUrl}${path}`,
      },
    },
    openGraph: {
      title: ogTitle,
      description: ogDesc,
      url: url,
      siteName: '99 Purity Wholesale',
      images: [
        {
          url: ogUrlImage,
          width: 1200,
          height: 630,
          alt: `${product.name} Wholesale Peptides`,
        },
      ],
      locale: params.locale,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: t('productTitle', { name: product.name }),
      description: t('productDesc', { name: product.name }),
      images: [ogUrlImage],
    },
  };
}

const productSpecImagesMap = {
  "5-amino-1mq": {
    "10mg": "5-AMINO-1MQ 50mg.webp",
  },
  "5-amino-1mq-spray": {
    "50mg": "5-amino-1mq-spray-50mg.jpg",
  },
  "tirzepatide-spray": {
    "10mg": "tirzepatide-spray-10mg.jpg",
    "20mg": "tirzepatide-spray-20mg.jpg",
    "30mg": "tirzepatide-spray-30mg.jpg",
  },
  "semaglutide-spray": {
    "5mg": "semaglutide-spray-5mg.jpg",
    "10mg": "semaglutide-spray-10mg.jpg",
    "20mg": "semaglutide-spray-20mg.jpg",
    "30mg": "semaglutide-spray-30mg.jpg",
  },
  "retatrutide-spray": {
    "10mg": "retatrutide-spray-10mg.jpg",
    "20mg": "retatrutide-spray-20mg.jpg",
    "30mg": "retatrutide-spray-30mg.jpg",
    "60mg": "retatrutide-spray-60mg.jpg",
  },
  "thymosin-alpha-1-spray": {
    "10mg": "thymosin-alpha-1-spray-10mg.jpg",
  },
  "tesamorelin-spray": {
    "10mg": "tesamorelin-spray-10mg.jpg",
    "20mg": "tesamorelin-spray-20mg.jpg",
  },
  "tesamorelin-ipamorelin-spray": {
    "10mg": "tesamorelin-spray-10mg.jpg",
  },
  "tb-500-spray": {
    "5mg": "tb-500-spray-5mg.jpg",
    "10mg": "tb-500-spray-10mg.jpg",
  },
  "snap-8-spray": {
    "10mg": "snap-8-spray-10mg.jpg",
    "20mg": "snap-8-spray-20mg.jpg",
  },
  "sermorelin-spray": {
    "10mg": "sermorelin-spray-10mg.jpg",
    "20mg": "sermorelin-spray-20mg.jpg",
  },
  "ss-31-spray": {
    "10mg": "ss-31-spray-10mg.jpg",
    "50mg": "ss-31-spray-50mg.jpg",
  },
  "mots-c-spray": {
    "10mg": "mots-c-spray-10mg.jpg",
    "40mg": "mots-c-spray-40mg.jpg",
  },
  "melanotan-1-spray": {
    "10mg": "melanotan-1-spray-10mg.jpg",
  },
  "ll-37-spray": {
    "1mg": "ll-37-spray-1mg.jpg",
  },
  "lipo-c-spray": {
    "120mg": "lipo-c-spray-120mg.jpg",
  },
  "l-carnitine-spray": {
    "400mg": "l-carnitine-spray-400mg.jpg",
  },
  "klow-spray": {
    "80mg": "klow-blend-spray-80mg.jpg",
  },
  "kisspeptin-spray": {
    "10mg": "kisspeptin-spray-10mg.jpg",
  },
  "ipamorelin-spray": {
    "5mg": "ipamorelin-spray-5mg.jpg",
    "10mg": "ipamorelin-spray-10mg.jpg",
  },
  "igf-1-lr3-spray": {
    "1mg": "igf-1-lr3-spray-1mg.jpg",
  },
  "hcg-spray": {
    "5000IU": "hcg-spray-5000iu.jpg",
    "10000IU": "hcg-spray-10000iu.jpg",
  },
  "h-frag-spray": {
    "5mg": "h-frag-spray-5mg.jpg",
  },
  "glutathione-spray": {
    "600mg": "glutathione-spray-600mg.jpg",
    "1500mg": "glutathione-spray-1500mg.jpg",
  },
  "glow-spray": {
    "70mg": "glow-blend-spray-70mg.jpg",
  },
  "ghrp-6-spray": {
    "10mg": "ghrp-6-spray-10mg.jpg",
  },
  "ghrp-2-spray": {
    "100mg": "ghrp-2-spray-100mg.jpg",
  },
  "dihexa-spray": {
    "10mg": "dihexa-spray-10mg.jpg",
  },
  "cjc-1295-ipamorelin-spray": {
    "10mg": "cjc-1295-ipamorelin-spray-10mg.jpg",
  },
  "cjc-1295-dac-spray": {
    "5mg": "cjc-1295-dac-spray-5mg.jpg",
  },
  "cjc-1295-no-dac-spray": {
    "10mg": "cjc-1295-no-dac-spray-10mg.jpg",
  },
  "cagrilintide-spray": {
    "10mg": "cagrilintide-spray-10mg.jpg",
  },
  "bpc-157-tb-500-spray": {
    "10mg": "bpc-157-tb-500-spray-10mg.jpg",
    "20mg": "bpc-157-tb-500-spray-20mg.jpg",
  },
  "ara-290-spray": {
    "10mg": "ara-290-spray-10mg.jpg",
  },
  "aod9604-spray": {
    "5mg": "aod9604-spray-5mg.jpg",
    "10mg": "aod9604-spray-10mg.jpg",
  },
  "ahk-cu-spray": {
    "50mg": "ahk-cu-50mg.png",
    "100mg": "ahk-cu-100mg.png",
  },
  "bioregulator-core-panel": {
    "20mg": "bioregulator-core-panel.webp",
  },
  "bioregulator-full-master-set": {
    "20mg": "bioregulator-full-master-set.webp",
  },
  "bioregulator-cardiovascular": {
    "20mg": "bioregulator-cardiovascular.webp",
  },
  "bioregulator-hepatic-digestive": {
    "20mg": "bioregulator-hepatic-digestive.webp",
  },
  "bioregulator-immune-thymic": {
    "20mg": "bioregulator-immune-thymic.webp",
  },
  "bioregulator-neuro-pineal": {
    "20mg": "bioregulator-neuro-pineal.webp",
  },
  "bioregulator-respiratory": {
    "20mg": "bioregulator-respiratory.webp",
  },
  "bioregulator-urogenital": {
    "20mg": "bioregulator-urogenital.webp",
  },
  "advanced-nootropic": {
    "50mg": "bundle-advanced-nootropic.webp",
  },
  "advanced-repair-immune": {
    "35mg": "bundle-advanced-repair-immune.webp",
  },
  "body-composition-kit": {
    "20mg": "bundle-body-composition.webp",
  },
  "classic-secretagogue": {
    "10mg": "bundle-classic-secretagogue.webp",
  },
  "extended-gh-igf": {
    "11mg": "bundle-extended-gh-igf.webp",
  },
  "gh-secretagogue": {
    "10mg": "bundle-gh-secretagogue.webp",
  },
  "gut-mucosal-panel": {
    "25mg": "bundle-gut-mucosal-panel.webp",
  },
  "incretin-amylin": {
    "15mg": "bundle-incretin-amylin.webp",
  },
  "longevity-mitochondrial": {
    "170mg": "bundle-longevity-mitochondrial.webp",
  },
  "melanocortin-reproductive": {
    "30mg": "bundle-melanocortin-reproductive.webp",
  },
  "metabolic-activation": {
    "170mg": "bundle-metabolic-activation.webp",
  },
  "metabolic-support": {
    "25mg": "bundle-metabolic-support.webp",
  },
  "nad-antioxidant": {
    "710mg": "bundle-nad-antioxidant.webp",
  },
  "neuro-core": {
    "20mg": "bundle-neuro-core.webp",
  },
  "recovery-sleep-stress": {
    "25mg": "bundle-recovery-sleep-stress.webp",
  },
  "repair-trio": {
    "60mg": "bundle-repair-trio.webp",
  },
  "reproductive-hpg-axis": {
    "20mg": "bundle-reproductive-hpg-axis.webp",
  },
  "skin-cosmetic": {
    "660mg": "bundle-skin-cosmetic.webp",
  },
  "vascular-immune-protection": {
    "31mg": "bundle-vascular-immune-protection.webp",
  },
  "senescence-stack": {
    "20mg": "bundle-senescence-stack.webp",
  },
  "pathway-genetic-optimization-test": {
    "1 Kit": "pathway-genetic-optimization-test.webp",
  },
  "adamax": {
    "5mg": "adamax-5mg.webp",
    "10mg": "adamax-10mg.webp",
  },
  "adipotide-fttp": {
    "2mg": "adipotide-fttp-2mg.webp",
    "5mg": "adipotide-fttp-5mg.webp",
    "10mg": "adipotide-fttp-10mg.webp",
  },
  "aod9604": {
    "5mg": "aod9604-5mg.webp",
    "10mg": "aod9604-10mg.webp",
  },
  "b12": {
    "10mg": "b12-10mg.webp",
  },
  "b7-33": {
    "2mg": "b7-33-2mg.webp",
    "10mg": "b7-33-10mg.webp",
  },
  "bac-water": {
    "10mg": "BAC WATER 3ML.webp",
  },
  "bpc-157": {
    "10mg": "BPC-157 5mg-5.webp",
  },
  "bpc-5mg-tb-5mg": {
    "10mg": "BPC-157 TB-500 MIX 5mg 5mg-2.webp",
  },
  "bpc-10mg-tb-10mg": {
    "20mg": "bpc-157-tb-500-10-10mg.jpg",
  },
  "cagrilintide": {
    "10mg": "CAGRILINTIDE 10mg.webp",
  },
  "cagrisema": {
    "5mg": "cagrisema-2-5-2-5-5mg.webp",
  },
  "cjc-1295-dac": {
    "5mg": "cjc-1295-dac5mg.webp",
  },
  "cjc-1295-no-dac": {
    "5mg": "cjc-1295-no-dac-5mg.webp",
    "10mg": "cjc-1295-no-dac-10mg.webp",
  },
  "cjc-1295-ipam": {
    "10mg": "cjc-1295-ipamorelin-10-10mg.jpg",
  },
  "dihexa": {
    "10mg": "dihexa-10mg.webp",
  },
  "dsip": {
    "5mg": "dsip-5mg.webp",
  },
  "dulaglutide": {
    "5mg": "dulaglutide-5mg.webp",
    "10mg": "dulaglutide-10mg.webp",
  },
  "epithalon": {
    "10mg": "EPITHALON 10mg.webp",
  },
  "foxo4": {
    "2mg": "foxo4-2mg.webp",
    "10mg": "fox04-10mg.jpg",
  },
  "foxo4-dri": {
    "10mg": "foxo4-dri-10mg.webp",
  },
  "ghk-cu": {
    "10mg": "GHK-CU 50mg-1.webp",
  },
  "glow-blend": {
    "70mg": "glow-hair-skin-nail-blend.jpg",
  },
  "klow-blend": {
    "80mg": "klow-custom-peptide-kit.jpg",
  },
  "glutathione": {
    "600mg": "glutathione-600mg.webp",
    "1500mg": "glutathione-1500mg.webp",
  },
  "ipamorelin": {
    "10mg": "IPAMORELIN 5mg-2.webp",
  },
  "kpv": {
    "10mg": "KPV 10mg.webp",
  },
  "l-carnitine": {
    "1200mg": "l-carnitine-1200mg.webp",
  },
  "lipo-c": {
    "10mg": "LIPO-C.webp",
  },
  "ll37": {
    "5mg": "ll37-5mg.jpg",
  },
  "mic-blend": {
    "10mg": "mic-lipo-c-b12-10mg.webp",
  },
  "mots-c": {
    "10mg": "MOTS-C 10mg-1.webp",
  },
  "nad": {
    "10mg": "nad-plus-500mg-1.webp",
  },
  "retatrutide": {
    "10mg": "RETATRUTIDE 10mg-6.webp",
  },
  "selank": {
    "10mg": "SELANK 10mg.webp",
  },
  "semaglutide": {
    "10mg": "SEMAGLUTIDE 5mg-2.webp",
  },
  "semax": {
    "10mg": "SEMAX 10mg.webp",
  },
  "sermorelin-acetate": {
    "5mg": "semorelin-acetate-5mg.webp",
    "10mg": "sermorelin-10mg.jpg",
  },
  "snap-8": {
    "10mg": "SNAP 8  10mg.webp",
  },
  "ss-31": {
    "10mg": "ss-31-10mg.webp",
    "50mg": "ss-31-50mg.jpg",
  },
  "tb-500": {
    "10mg": "TB-500  5mg-2.webp",
  },
  "tesamorelin": {
    "10mg": "TESAMORELIN 10mg-1.webp",
  },
  "thymalin-thymulin": {
    "10mg": "thymalin-thymylin-10mg.webp",
  },
  "thymosin-alpha-1": {
    "10mg": "Thymosin Alpha 1mg.webp",
  },
  "tirzepatide": {
    "10mg": "TIRZEPATIDE 10mg-3.webp",
  },
  "vip": {
    "5mg": "vip-5mg.webp",
    "10mg": "vip-10mg.jpg",
  },
  "glutathione-600-1500": {
    "10mg": "GLUTATHIONE  200mg ml.webp",
  },
  "epitalon-spray": {
    "10mg": "EPITALON spray 10mg.webp",
  },
  "aod-9604-5mg-10mg": {
    "10mg": "AOD9604  5mg-2.webp",
  },
  "cjc-1295-ipamorelin": {
    "10mg": "CJC 1295 IPAMORELIN 5mg 5mg-2.webp",
  },
  "10-needles": {
    "10mg": "10 Needles-1.webp",
  },
  "l-carnitine-600mg": {
    "10mg": "L-CARNATINE 600mg 20mg.webp",
  },
  "h-frag": {
    "10mg": "H FRAG.webp",
  },
  "ghrp-2-10mg": {
    "10mg": "GHRP-2  10mg.webp",
  },
  "ss-31-elamipretide": {
    "10mg": "SS-31 10mg-1.webp",
  },
  "ahk-cu-50mg-100mg": {
    "10mg": "AHK-CU 50mg-1.webp",
  },
  "pt-141-bremelanotide": {
    "10mg": "PT-141 10mg.webp",
  },
  "kisspeptin": {
    "10mg": "KISSPEPTIN  10mg.webp",
  },
  "mt-1-10mg": {
    "10mg": "MT-1 10mg.webp",
  },
  "semax-spray": {
    "10mg": "SEMAX spray 5mg.webp",
  },
  "selank-spray": {
    "10mg": "SELANK spray 100mcg.webp",
  },
  "semax-selank-spray": {
    "10mg": "semax-plus-selank-spray-300mcg.webp",
  },
  "l-carnitine-400mg": {
    "10mg": "L-CARNATINE 400mg 20mg.webp",
  },
  "l-carnitine-200mg": {
    "10mg": "L-CARNATINE 200mg 20ml.webp",
  },
  "oxytocin-spray": {
    "10mg": "OXYTOCIN spray10mg.webp",
  },
  "pt-141-spray": {
    "10mg": "PT-141  spray 10mg.webp",
  },
  "dsip-spray": {
    "10mg": "DSIP spray 10mg.webp",
  },
  "kpv-spray": {
    "10mg": "KPV spray 5mg.webp",
  },
  "nad-spray": {
    "10mg": "nad-plus-spray-50mg.webp",
  },
  "glow": {
    "10mg": "GLOW 70mg.webp",
  },
  "klow": {
    "10mg": "KLOW.webp",
  },
  "ara-290-10mg": {
    "10mg": "ARA-290  10mg.webp",
  },
  "ghrp-6-10mg": {
    "10mg": "GHRP-6  10mg.webp",
  },
  "sermorelin": {
    "10mg": "SERMORELIN 10mg.webp",
  },
  "igf-1-lr3": {
    "10mg": "IGF1 LR31mg-2.webp",
  },
  "dhea-10mg": {
    "10mg": "DHEA 10mg.webp",
  },
  "hcg-5000-iu": {
    "10mg": "HCG  5000 IU.webp",
  },
  "mt-2-melanotan-ii": {
    "10mg": "MT-2 10mg.webp",
  },
  "vip-vasoactive-intestinal-peptide": {
    "10mg": "VIP 10mg.webp",
  },
  "vip-spray": {
    "10mg": "VIP spray 10mg.webp",
  },
  "mt-2-spray": {
    "10mg": "MT-2 spray 10mg.webp",
  },
  "ghk-cu-spray": {
    "10mg": "GHK-CU spray 50mg.webp",
  },
  "bpc-157-spray": {
    "10mg": "BPC-157 spray 5mg.webp",
  },
  "dsip-delta-sleep-inducing-peptide": {
    "10mg": "DSIP 10mg.webp",
  },
  "cjc-1295-no-dac-10mg": {
    "10mg": "CJC-1295 No DAC  10mg.webp",
  },
  "cjc-1295-dac-5mg": {
    "10mg": "CJC W DAC  5mg.webp",
  },
  "semax-selank-blend": {
    "10mg": "SEMAX SELANK 10 10.webp",
  },
  "hcg-10000-iu": {
    "10mg": "HCG  10000 IU.webp",
  },
  "tesamorelin-ipamorelin-research-peptide": {
    "10mg": "TESA IPA 6mg 3mg.webp",
  },
};

export default async function ProductPage({ params }: { params: { locale: string, slug: string } }) {
  const t = await getTranslations({ locale: params.locale, namespace: 'ProductDetail' });
  const pt = await getTranslations({ locale: params.locale, namespace: 'ProductsIndex' });
  const tr = await getTranslations({ locale: params.locale, namespace: 'Research' });
  const product = productsData.find(p => p.slug === params.slug);

  if (!product) {
    notFound();
  }

  // Get localized category name from ProductsIndex namespace
  const localizedCategoryName = pt(`categories.${product.category}.name`);

  // Dynamically enrich descriptions and define 8 comprehensive localized FAQs at runtime
  const isEs = params.locale === 'es';
  // Pre-dissolved metered-spray SKUs. Scoped to slugs that have been content-reviewed —
  // the older `*-spray` entries still fall through to the lyophilized template copy.
  const SPRAY_SLUGS = ['5-amino-1mq-spray', 'tirzepatide-spray', 'semaglutide-spray',
    'retatrutide-spray', 'thymosin-alpha-1-spray', 'tesamorelin-spray', 'tesamorelin-ipamorelin-spray', 'tb-500-spray', 'snap-8-spray', 'sermorelin-spray', 'ss-31-spray', 'mots-c-spray', 'melanotan-1-spray', 'll-37-spray', 'lipo-c-spray', 'l-carnitine-spray', 'klow-spray', 'kisspeptin-spray', 'ipamorelin-spray', 'igf-1-lr3-spray', 'hcg-spray', 'h-frag-spray', 'glutathione-spray', 'glow-spray', 'ghrp-6-spray', 'ghrp-2-spray', 'dihexa-spray', 'cjc-1295-ipamorelin-spray', 'cjc-1295-dac-spray', 'cjc-1295-no-dac-spray', 'cagrilintide-spray', 'bpc-157-tb-500-spray', 'ara-290-spray', 'aod9604-spray', 'ahk-cu-spray'];
  const isSpray = SPRAY_SLUGS.includes(product.slug);
  // Non-chemical SKU: a DNA sample collection kit, not a synthesized compound.
  const isDnaKit = product.slug === 'pathway-genetic-optimization-test';
  const isLiquid = product.slug === 'bac-water' || product.slug === 'lipo-c' || isSpray;

  // Bespoke, compound-specific FAQs + dossier for SKUs that have them (see productContent.ts).
  // Everything else keeps the templated copy generated further down.
  const customContent = getProductContent(product.slug, isEs);

  let physicalForm = t('physicalForms.lyophilized');
  let recommendedStorage = t('storageValues.standard');

  if (product.slug === 'bac-water') {
    physicalForm = t('physicalForms.solvent');
    recommendedStorage = t('storageValues.bacWater');
  } else if (product.slug === 'lipo-c') {
    physicalForm = t('physicalForms.solution');
    recommendedStorage = t('storageValues.liquid');
  } else if (isSpray) {
    physicalForm = t('physicalForms.spray');
    recommendedStorage = t('storageValues.spray');
  } else if (isDnaKit) {
    physicalForm = t('physicalForms.dnaKit');
    recommendedStorage = t('storageValues.dnaKit');
  }

  const dnaKitExtension = isEs
    ? ` PATHWAY es una herramienta de bienestar y educación, no un diagnóstico, y no está destinada a diagnosticar, tratar, curar ni prevenir enfermedad alguna. El análisis lo realiza TruLab Dx, un laboratorio asociado con certificación CLIA; la certificación CLIA es un programa de los CMS que regula las operaciones de laboratorio y no evalúa si las afirmaciones de salud de una prueba son clínicamente válidas.`
    : ` PATHWAY is a wellness and education tool, not a diagnostic, and it is not intended to diagnose, treat, cure, or prevent any disease. Analysis is performed by TruLab Dx, a CLIA-certified partner laboratory; CLIA certification is a CMS program regulating laboratory operations and does not evaluate whether a test's health claims are clinically valid.`;

  const descExtension = isEs 
    ? ` Este compuesto ${isLiquid ? 'líquido' : (isSpray ? 'líquido' : 'liofilizado')} se sintetiza y purifica con el único propósito de investigación científica. Este material se proporciona estrictamente para fines de investigación de laboratorio e investigación in-vitro en entornos académicos y de desarrollo controlados. No está diseñado, aprobado ni destinado bajo ninguna circunstancia para el consumo humano, uso clínico, diagnóstico médico o administración terapéutica directa.`
    : ` This ${isLiquid ? 'liquid' : (isSpray ? 'liquid' : 'lyophilized')} compound is synthesized and purified for the sole purpose of scientific investigation. This material is supplied strictly for laboratory research purposes and in-vitro scientific testing in controlled developmental or academic settings. It is not designed, approved, or intended under any circumstances for human consumption, clinical application, medical diagnostics, or direct therapeutic administration.`;

  const originalDesc = t.has(`descriptions.${product.slug}`) 
    ? t(`descriptions.${product.slug}`) 
    : product.description;
    
  const enrichedDescription = `${originalDesc}${isDnaKit ? dnaKitExtension : descExtension}`;

  // Dynamic FAQ values for physical form and storage to optimize for SEO/AEO/GEO/search engines
  const formQ_En = product.slug === 'bac-water'
    ? `What is the physical form of wholesale Bacteriostatic Water?`
    : (product.slug === 'lipo-c'
      ? `What is the physical form of wholesale Lipo-C?`
      : `What is the physical form of wholesale ${product.name}?`);

  const formA_En = product.slug === 'bac-water'
    ? `Bacteriostatic Water is supplied as a sterile, clear, colorless liquid solvent containing 0.9% benzyl alcohol, which serves as a preservative to prevent bacterial growth. It is shipped in premium glass vials, ready for research use in reconstituting lyophilized compounds.`
    : (product.slug === 'lipo-c'
      ? `Lipo-C is supplied as a sterile liquid solution. It contains a specialized compounded mixture of lipotropic agents (Methionine, Inositol, Choline) and other essential compounds pre-dissolved in a sterile liquid carrier, optimized for in-vitro research testing.`
      : `${product.name} is supplied in the form of a lyophilized (freeze-dried) solid powder or cake in vacuum-sealed glass vials. This solid state is designed to protect the molecular stability of the peptide during transit and storage. It must be reconstituted with a sterile solvent prior to starting in-vitro laboratory assays.`);

  const storageQ_En = `What are the recommended storage temperatures and stability limits for ${product.name}?`;

  const storageA_En = product.slug === 'bac-water'
    ? `Bacteriostatic Water should be stored at controlled room temperature between 15°C and 30°C (59°F to 86°F). Do not freeze, as freezing compromises the vial's integrity and degrades the benzyl alcohol preservative. Keep in a dry place protected from light. Once opened/punctured, the vial remains stable for up to 28 days before it must be discarded.`
    : (product.slug === 'lipo-c'
      ? `Lipo-C liquid solution must be stored refrigerated between 2°C and 8°C (36°F to 46°F). Do not freeze, as sub-zero temperatures can cause active lipotropic ingredients to precipitate out of the liquid solution. Keep the vial upright, away from direct heat and light.`
      : `Lyophilized (Dry Powder) ${product.name} must be stored at -20°C for long-term preservation (up to 36 months) or refrigerated at 2°C to 8°C for short-term active study (up to 24 months). Protect from direct light. Important: Prior to opening, allow the dry vial to reach room temperature to prevent condensation and moisture absorption. Once reconstituted into liquid form, the solution must be refrigerated at 2°C to 8°C and analyzed or used within 8 to 30 days. Do not freeze the reconstituted liquid solution, as repeated freeze-thaw cycles cause rapid chemical degradation.`);

  const formQ_Es = product.slug === 'bac-water'
    ? `¿Cuál es la forma física del agua bacteriostática al por mayor?`
    : (product.slug === 'lipo-c'
      ? `¿Cuál es la forma física de Lipo-C al por mayor?`
      : `¿Cuál es la forma física de ${product.name} al por mayor?`);

  const formA_Es = product.slug === 'bac-water'
    ? `El agua bacteriostática se suministra como un solvente líquido estéril, claro e incoloro que contiene alcohol bencílico al 0.9%, el cual actúa como conservante para prevenir el crecimiento bacteriano. Se envía en viales de vidrio de alta calidad, listo para su uso en la reconstitución de compuestos liofilizados.`
    : (product.slug === 'lipo-c'
      ? `Lipo-C se suministra como una solución líquida estéril. Contiene una mezcla compuesta especializada de agentes lipotrópicos (metionina, inositol, colina) y otros compuestos esenciales predisueltos en un vehículo líquido estéril, optimizado para pruebas de investigación in vitro.`
      : `${product.name} se suministra en forma de polvo sólido liofilizado (secado por congelación) en viales de vidrio sellados al vacío. Este estado sólido está diseñado para proteger la estabilidad molecular del péptido durante el tránsito y almacenamiento. Debe reconstituirse con un solvente estéril antes de iniciar los ensayos de laboratorio in-vitro.`);

  const storageQ_Es = `¿Cuáles son las temperaturas de almacenamiento recomendadas y los límites de estabilidad para ${product.name}?`;

  const storageA_Es = product.slug === 'bac-water'
    ? `El agua bacteriostática debe almacenarse a temperatura ambiente controlada entre 15°C y 30°C (59°F a 86°F). No congelar, ya que la congelación compromete la integridad del vial y degrada el conservante de alcohol bencílico. Manténgase en un lugar seco y protegido de la luz. Una vez abierto o perforado, el vial permanece estable por hasta 28 días antes de que deba desecharse.`
    : (product.slug === 'lipo-c'
      ? `La solución líquida Lipo-C debe almacenarse refrigerada entre 2°C y 8°C (36°F a 46°F). No congelar, ya que las temperaturas bajo cero pueden hacer que los ingredientes lipotrópicos activos se precipiten fuera de la solución líquida. Mantenga el vial en posición vertical, lejos de la luz directa y del calor.`
      : `El ${product.name} liofilizado (polvo seco) debe almacenarse a -20°C para conservación a largo plazo (hasta 36 meses) o refrigerado a 2°C a 8°C para estudios activos a corto plazo (hasta 24 meses). Proteger de la luz directa. Importante: Antes de abrir, permita que el vial seco alcance la temperatura ambiente para evitar la condensación y la absorción de humedad. Una vez reconstituido en forma líquida, la solución debe refrigerarse a 2°C a 8°C y analizarse o usarse dentro de 8 a 30 días. No congele la solución líquida reconstituida, ya que los ciclos repetidos de congelación y descongelación causan una degradación química rápida.`);

  const templateFaqs = isEs ? [
    {
      q: `¿Cuál es el estándar de pureza de ${product.name} al por mayor?`,
      a: `Todos los lotes de ${product.name} se verifican rigurosamente mediante HPLC (cromatografía líquida de alta resolución) y espectrometría de masas para garantizar un nivel de pureza superior al ≥99.0%. Cada envío de distribución incluye informes analíticos específicos del lote para respaldar sus protocolos de investigación de laboratorio.`
    },
    {
      q: `¿Está destinado ${product.name} para uso terapéutico o consumo humano?`,
      a: `Absolutamente no. Todos los compuestos, incluyendo ${product.name}, se suministran estrictamente para fines de investigación de laboratorio y pruebas científicas in-vitro. Bajo ninguna circunstancia este material debe ser utilizado para el consumo humano, diagnóstico médico o intervención terapéutica directa.`
    },
    {
      q: `¿Cuál es la cantidad mínima de pedido (MOQ) para ${product.name} al por mayor?`,
      a: `La cantidad mínima de pedido para ${product.name} al por mayor es de 10 viales (lo que equivale a 1 kit estándar). Nos especializamos en la adquisición y suministro comercial a granel para instituciones de investigación, laboratorios y marcas de distribución, por lo que no realizamos ventas de viales individuales.`
    },
    {
      q: formQ_Es,
      a: formA_Es
    },
    {
      q: storageQ_Es,
      a: storageA_Es
    },
    {
      q: `¿Puedo solicitar concentraciones personalizadas o tamaños de vial para ${product.name}?`,
      a: `Sí. Los socios comerciales calificados que requieran especificaciones de investigación particulares pueden coordinar tamaños de viales personalizados, variaciones de concentración o formulaciones liofilizadas a medida. Póngase en contacto con nuestro equipo de ventas a granel para definir sus requisitos.`
    },
    {
      q: `¿Cómo se envía ${product.name} al por mayor?`,
      a: `Todos los pedidos se sellan al vacío en envases de alta resistencia térmica para preservar la integridad molecular de los péptidos. Los pedidos se envían desde nuestra instalación en EE. UU. mediante mensajería express con seguimiento a los 50 estados. Se proporciona seguimiento para cada envío.`
    },
    {
      q: `¿Puedo ver el informe de HPLC para el lote actual de ${product.name} antes de realizar un pedido?`,
      a: `Sí. Los directores de laboratorio y socios comerciales acreditados pueden solicitar el informe de HPLC y espectrometría de masas del lote de producción actual haciendo clic en el botón 'Solicitar COA' en esta página antes de confirmar su pedido.`
    },
    {
      q: `¿Proporciona 99 Purity pautas de reconstitución o instrucciones de dosificación para ${product.name}?`,
      a: `Como proveedor industrial de materias primas puras, no proporcionamos instrucciones de reconstitución, pautas de dilución o pautas de dosificación. Todos nuestros productos se suministran estrictamente para fines de investigación científica y deben ser manejados por investigadores y profesionales capacitados.`
    }
  ] : [
    {
      q: `What is the purity standard of 99 Purity's wholesale ${product.name}?`,
      a: `All batches of ${product.name} are rigorously verified via HPLC (High-Performance Liquid Chromatography) and Mass Spectrometry to guarantee a purity level exceeding ≥99.0%. Each wholesale shipment is accompanied by batch-specific analytical reports to support your laboratory research protocols.`
    },
    {
      q: `Is ${product.name} intended for therapeutic use or human consumption?`,
      a: `Absolutely not. All products, including ${product.name}, are supplied strictly for laboratory research purposes and in-vitro scientific testing. Under no circumstances is this material to be utilized for human consumption, diagnostic procedures, or therapeutic intervention.`
    },
    {
      q: `What is the minimum order quantity (MOQ) for wholesale ${product.name}?`,
      a: `The minimum order quantity for wholesale ${product.name} is 10 vials (which constitutes 1 standard kit). We specialize in commercial bulk supply for research institutions, laboratories, and distribution brands, and do not fulfill retail or single-vial inquiries.`
    },
    {
      q: formQ_En,
      a: formA_En
    },
    {
      q: storageQ_En,
      a: storageA_En
    },
    {
      q: `Can I request custom spec concentrations or vial sizes for wholesale ${product.name}?`,
      a: `Yes. Qualified procurement partners requiring specific experimental profiles can request custom concentration sizes, alternative vial counts, or custom lyophilized compound blending. Please contact our corporate sales desk to define your parameters.`
    },
    {
      q: `How is wholesale ${product.name} shipped?`,
      a: `We ship all bulk orders in high-grade, vacuum-sealed packaging with temperature stability buffers to preserve molecular integrity. Orders ship from our U.S. facility via tracked express courier to all 50 states. Tracking is provided for every shipment.`
    },
    {
      q: `Can I view the HPLC report for the current batch of ${product.name} before placing an order?`,
      a: `Yes. Qualified laboratory directors and commercial buyers can request the HPLC and Mass Spectrometry report for the current manufacturing batch by clicking the 'Request COA' button on this page prior to order confirmation.`
    },
    {
      q: `Does 99 Purity provide reconstitution instructions or laboratory dilution guidelines for ${product.name}?`,
      a: `As an industrial raw chemical manufacturer, we do not provide reconstitution guides, dilution instructions, or scientific experimental assistance. All materials are supplied strictly for research purposes and must be handled by certified professionals.`
    }
  ];

  const faqs = customContent?.faqs ?? templateFaqs;

  // FAQ JSON-LD is emitted by the <FaqSection> below (which renders this same faqs array) — no separate script here.

  // Get product spec images map
  const specImagesMap = productSpecImagesMap[product.slug as keyof typeof productSpecImagesMap] || {};
  const images = Object.values(specImagesMap);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://99puritywholesale.com';

  // No aggregateRating: there is no real review system to source it from — fabricated values
  // would violate Google's structured-data policy on reviews/ratings.
  const productPath = `/products/${params.slug}`;
  const productUrl = params.locale === 'en' ? `${baseUrl}${productPath}` : `${baseUrl}/${params.locale}${productPath}`;
  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: enrichedDescription,
    image: images.length ? `${baseUrl}/product-images/${encodeURI(images[0] as string)}` : `${baseUrl}/og-image.png`,
    sku: product.slug,
    brand: {
      '@type': 'Brand',
      name: '99 Purity Wholesale'
    },
    // No price or availability: rates are quoted per account and stock is not tracked
    // per product, so any value here would contradict the page. An Offer carrying only
    // a url is valid schema.org.
    offers: {
      '@type': 'Offer',
      url: productUrl,
    },
  };

  // Home -> Products -> Category -> Product, matching the visible breadcrumb trail.
  const localeBase = params.locale === 'en' ? baseUrl : `${baseUrl}/${params.locale}`;
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: isEs ? 'Inicio' : 'Home', item: localeBase },
      { '@type': 'ListItem', position: 2, name: t('breadcrumbs.products'), item: `${localeBase}/products` },
      { '@type': 'ListItem', position: 3, name: localizedCategoryName, item: `${localeBase}/products/${product.category}` },
      { '@type': 'ListItem', position: 4, name: product.name, item: productUrl },
    ],
  };

  // Find related products (same category, different slug, max 3)
  const relatedProducts = productsData
    .filter(p => p.category === product.category && p.slug !== product.slug)
    .slice(0, 3);

  // Cross-link to city/state location pages that actually list this compound as a popular product
  const matchedCities = citiesData
    .filter(c => c.popularProducts.some(p => p.toLowerCase() === product.name.toLowerCase()))
    .map(c => ({
      label: c.city,
      href: `/locations/${c.region.toLowerCase().replace(/ /g, '-')}/${c.stateSlug}/${c.slug}`,
    }));
  const matchedStates = locationsData
    .filter(l => l.slug !== 'united-states' && (l.popularProducts || []).some((p: string) => p.toLowerCase() === product.name.toLowerCase()))
    .map(l => ({
      label: l.city,
      href: `/locations/${l.region.toLowerCase().replace(/ /g, '-')}/${l.slug}`,
    }));
  const matchedLocations = [...matchedCities, ...matchedStates].slice(0, 8);

  const whatsappHref = `https://wa.me/${(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '18433307365').replace(/\D/g, '')}?text=${encodeURIComponent(t('whatsappMsg', { name: product.name }))}`;
  const eyebrowCls = 'font-dm-mono text-[9px] uppercase tracking-[0.16em] text-[#0B0F14]/45';
  const panelH2 = 'mb-6 flex items-center gap-3 border-b border-[#E6EAF1] pb-5 text-[clamp(1.5rem,2.4vw,2.1rem)] font-light leading-tight tracking-[-0.04em]';

  return (
    <PageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className={`${WRAP} pt-2`}>
        <ol className="flex items-center gap-2 overflow-x-auto whitespace-nowrap font-dm-mono text-[10px] uppercase tracking-[0.14em] text-[#0B0F14]/45">
          <li><Link href="/products" className="transition-colors hover:text-[#0B0F14]">{t('breadcrumbs.products')}</Link></li>
          <li aria-hidden><ChevronRight className="h-3.5 w-3.5" /></li>
          <li><Link href={`/products/${product.category}`} className="transition-colors hover:text-[#0B0F14]">{localizedCategoryName}</Link></li>
          <li aria-hidden><ChevronRight className="h-3.5 w-3.5" /></li>
          <li className="text-[#0B0F14]" aria-current="page">{product.name}</li>
        </ol>
      </nav>

      {/* Showcase */}
      <section className="pb-16 pt-8 md:pb-24 md:pt-12">
        <div className={WRAP}>
          <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-14">
            {/* Left: gallery and technical passport */}
            <div className="lg:col-span-5 lg:sticky lg:top-28">
              <div className={`${card} flex w-full flex-col p-3 md:p-4`}>
                <ProductGallery
                  images={images}
                  productName={product.name}
                  categoryName={localizedCategoryName}
                  specImagesMap={specImagesMap}
                />

                <div className="px-3 pb-3 pt-7 md:px-4 md:pb-4">
                  <div className="mb-6 flex items-center gap-2.5">
                    <Beaker className="h-3.5 w-3.5 text-[#0B6F7B]" />
                    <span className="font-dm-mono text-[10px] uppercase tracking-[0.18em] text-[#0B0F14]/60">{t('passportTitle')}</span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-5 text-sm leading-tight">
                    <div>
                      <dt className={`${eyebrowCls} mb-1.5`}>{t('compoundNameLabel')}</dt>
                      <dd className="text-[15px] font-medium">{product.name}</dd>
                    </div>
                    <div>
                      <dt className={`${eyebrowCls} mb-1.5`}>{t('casRegistryLabel')}</dt>
                      <dd className="font-dm-mono text-[13px] text-[#0B0F14]/80">{product.cas !== 'N/A' && product.cas !== 'Blend' ? product.cas : (product.cas === 'Blend' ? (isEs ? 'Mezcla' : 'Blend') : (isEs ? 'N/A (Peptide)' : 'N/A (Peptide)'))}</dd>
                    </div>
                    <div>
                      <dt className={`${eyebrowCls} mb-1.5`}>{t('purityGradeLabel')}</dt>
                      <dd className="text-[14px] font-medium text-[#0B6F7B]">≥99.0% ({isEs ? 'Verificado por HPLC' : 'HPLC Verified'})</dd>
                    </div>
                    <div>
                      <dt className={`${eyebrowCls} mb-1.5`}>{t('physicalFormLabel')}</dt>
                      <dd className="text-[14px] text-[#0B0F14]/70">{physicalForm}</dd>
                    </div>
                    <div>
                      <dt className={`${eyebrowCls} mb-1.5`}>{t('recommendedStorageLabel')}</dt>
                      <dd className="text-[14px] text-[#0B0F14]/70">{recommendedStorage}</dd>
                    </div>
                    <div>
                      <dt className={`${eyebrowCls} mb-1.5`}>{t('procurementLimitLabel')}</dt>
                      <dd className="text-[14px] text-[#0B0F14]/70">{t('moqValue')}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>

            {/* Right: meta, selector, research, share */}
            <div className="flex flex-col lg:col-span-7">
              <div className="mb-6 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E6EAF1] bg-white px-3.5 py-1.5 font-dm-mono text-[10px] uppercase tracking-[0.14em] text-[#0B0F14]">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#0B6F7B]" />
                  {t('purity')}
                </span>
                {product.cas !== 'N/A' && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E6EAF1] bg-white px-3.5 py-1.5 font-dm-mono text-[10px] uppercase tracking-[0.14em] text-[#0B0F14]/60">
                    {t('cas')} {product.cas}
                  </span>
                )}
              </div>

              <SplitHeading as="h1" text={product.name} className="mb-6 font-dm-sans text-[clamp(2.2rem,5vw,4.2rem)] font-light leading-[1] tracking-[-0.05em]" />

              <p className="mb-8 max-w-2xl text-[15px] leading-relaxed text-[#0B0F14]/60">
                {enrichedDescription}
              </p>

              <div className={`${card} mb-4 w-full p-6 md:p-8`}>
                <SpecSelector
                  productId={product.slug}
                  productName={product.name}
                  category={localizedCategoryName}
                  categoryPage={`/products/${product.category}`}
                  specs={Array.from(new Set(product.specs.map(s => s.split('×')[0])))}
                  kitSizes={Array.from(new Set(product.specs.map(s => parseInt(s.split('×')[1]))))}
                />
              </div>

              {/* Research paper card */}
              <div className="relative mb-2 w-full overflow-hidden rounded-[1.25rem] bg-[#0B0D10] p-6 text-white md:p-8">
                <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-center">
                  <div>
                    <Eyebrow light className="mb-3">{tr('academicTitle')}</Eyebrow>
                    <h2 className="mb-2 text-[1.5rem] font-light leading-tight tracking-[-0.03em] text-white">{product.name}</h2>
                    <p className="max-w-md text-[13px] leading-relaxed text-white/55">
                      {isEs
                        ? "Acceda a datos científicos detallados, mecanismos celulares y resultados de pureza del lote para este compuesto de investigación."
                        : "Access in-depth scientific literature, cellular signaling pathways, and HPLC batch verification for this compound."}
                    </p>
                  </div>
                  <PillButton href={`/products/${product.slug}/research`} variant="teal" className="self-start whitespace-nowrap md:self-auto">
                    {tr('readPaper')}
                  </PillButton>
                </div>
              </div>

              <ShareProduct
                title={product.name}
                url={`${process.env.NEXT_PUBLIC_BASE_URL || 'https://99puritywholesale.com'}/${params.locale}/products/${product.slug}`}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Details and specs */}
      <section className="pb-16 md:pb-24">
        <div className={`${WRAP} space-y-6 md:space-y-8`}>
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-8">
              <div className={`${card} p-6 md:p-10`}>
                <h2 className={panelH2}>
                  <Beaker className="h-5 w-5 text-[#0B6F7B]" />
                  {t('specsTitle')}
                </h2>

                <div className="mb-10">
                  <h3 className={`${eyebrowCls} mb-4 !text-[10px]`}>{t('availableSizes')}</h3>
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {product.specs.map(spec => (
                      <li key={spec} className="flex items-center gap-3 rounded-full border border-[#E6EAF1] bg-[#F3F5FA] px-5 py-3.5 text-[13.5px] font-medium">
                        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-[#0B6F7B]" />
                        <span>{spec}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="grid grid-cols-1 gap-4 border-t border-[#E6EAF1] pt-8 md:grid-cols-12">
                  <div className="flex flex-col justify-center rounded-[1rem] bg-[#4FC3D0]/10 p-6 md:col-span-4">
                    <div className="mb-2 flex items-center gap-2 text-[#0B6F7B]">
                      <Box className="h-5 w-5" />
                      <h3 className="text-[15px] font-medium tracking-[-0.01em]">{t('moqHeading')}</h3>
                    </div>
                    <p className="text-[12.5px] leading-relaxed text-[#0B0F14]/60">{t('moqSubtext')}</p>
                  </div>

                  <div className="rounded-[1rem] border border-[#E6EAF1] bg-[#F3F5FA] p-6 md:col-span-8">
                    <h3 className="mb-4 flex items-center gap-2 text-[15px] font-medium tracking-[-0.01em]">
                      <Zap className="h-4 w-4 text-[#0B6F7B]" />
                      {t('pricingHeading')}
                    </h3>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        { key: 'starter', range: '1-9' },
                        { key: 'tier1', range: '10-19' },
                        { key: 'tier2', range: '20-39' },
                        { key: 'tier3', range: '40+' }
                      ].map((tier) => (
                        <div key={tier.key} className="flex flex-col items-center rounded-[0.9rem] border border-[#E6EAF1] bg-white p-3 text-center">
                          <span className="mb-1 font-dm-mono text-[9px] uppercase leading-none tracking-[0.14em] text-[#0B0F14]/45">
                            {tier.key === 'starter'
                              ? t('pricing.starter')
                              : `${t('pricing.tier')} ${tier.key.replace('tier', '')}`
                            }
                          </span>
                          <span className="font-dm-mono text-[12px] tracking-tight">{tier.range} {t('pricing.kits')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Request pricing sidebar */}
            <aside className="lg:col-span-4 lg:sticky lg:top-28">
              <div className={`${card} p-7 md:p-8`}>
                <h2 className="mb-3 text-[1.7rem] font-light leading-tight tracking-[-0.04em]">{t('requestPricingTitle')}</h2>
                <p className="mb-7 text-[13.5px] leading-relaxed text-[#0B0F14]/60">
                  {t('requestPricingDesc', { name: product.name })}
                </p>

                <div className="space-y-3">
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-2.5 rounded-full bg-[#0B0F14] px-5 py-3.5 font-dm-sans text-[13px] font-medium text-white transition-colors hover:bg-[#4FC3D0] hover:text-[#0B0F14]"
                  >
                    <Zap className="h-4 w-4" /> {t('whatsappCta')}
                  </a>

                  <div className="relative flex items-center py-1">
                    <div className="flex-grow border-t border-[#E6EAF1]"></div>
                    <span className="mx-4 flex-shrink-0 font-dm-mono text-[9px] uppercase tracking-[0.18em] text-[#0B0F14]/40">{t('or')}</span>
                    <div className="flex-grow border-t border-[#E6EAF1]"></div>
                  </div>

                  <a
                    href={`mailto:sales@99purity.com?subject=Wholesale Inquiry: ${product.name}`}
                    className="flex w-full items-center justify-center gap-2.5 rounded-full border border-[#0B0F14]/15 px-5 py-3.5 font-dm-sans text-[13px] font-medium text-[#0B0F14] transition-colors hover:bg-[#0B0F14] hover:text-white"
                  >
                    <Mail className="h-4 w-4" /> {t('emailCta')}
                  </a>
                </div>

                <div className="mt-7 border-t border-[#E6EAF1] pt-6">
                  <div className="flex items-start gap-3 text-[12px] leading-relaxed text-[#0B0F14]/55">
                    <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#0B6F7B]" />
                    <p>{t('confidential')}</p>
                  </div>
                </div>
              </div>
            </aside>
          </div>

          {/* Scientific dossier */}
          <div className={`${card} w-full p-6 md:p-10`}>
            <h2 className="mb-2 text-[clamp(1.5rem,2.4vw,2.1rem)] font-light leading-tight tracking-[-0.04em]">
              {isEs ? "Dossier Clínico e Índice Técnico" : "Clinical Dossier & Technical Digest"}
            </h2>
            <p className={`${eyebrowCls} mb-7 !text-[10px]`}>
              {isEs ? "Perfil de referencia de datos químicos y especificaciones de laboratorio." : "Factual reference profile and clinical data specifications."}
            </p>

            <div className="max-w-4xl space-y-5 text-[14px] leading-relaxed text-[#0B0F14]/65">
              <p>
                {customContent
                  ? customContent.dossier.applicationProfile
                  : isEs
                  ? `Como reactivo de referencia química de primer nivel, ${product.name} sirve como una sonda molecular de alta fidelidad indispensable para el cribado experimental, los ensayos celulares de alta resolución y el análisis estructural in-vitro. En los campos de la síntesis avanzada de péptidos y el desarrollo biotecnológico, los investigadores de laboratorio utilizan ${product.name} para examinar detalladamente la afinidad de unión a receptores, el acoplamiento celular y las cascadas metabólicas secundarias.`
                  : `As a premier chemical reference reagent, ${product.name} serves as an indispensable, high-fidelity molecular probe for experimental screening, high-resolution cellular assays, and in-vitro structural analysis. In the fields of advanced peptide synthesis and biotechnological development, laboratory researchers utilize ${product.name} to closely examine receptor binding affinity, cell signaling pathways, and secondary metabolic cascades.`
                }
              </p>
              <p>
                {customContent
                  ? customContent.dossier.qualityAssurance
                  : isEs
                  ? `Nuestros protocolos de síntesis se ejecutan bajo los estándares industriales más estrictos para garantizar un producto libre de sales residuales o subproductos sintéticos. Con una pureza confirmada que supera el 99.0%, ${product.name} mitiga el riesgo de variables no deseadas en sus ensayos científicos, ofreciendo reproducibilidad de datos de referencia clínicos y de laboratorio.`
                  : `Our synthesis protocols are executed under the most stringent industrial standards to guarantee a product free of residual salts or synthetic byproducts. With a confirmed purity exceeding 99.0%, ${product.name} mitigates the risk of trace variables in your scientific assays, delivering pristine data reproducibility for peer-reviewed clinical and laboratory reference literature.`
                }
              </p>
            </div>

            {/* Structured procurement profile */}
            <div className="mt-8 rounded-[1rem] bg-[#F3F5FA] p-6">
              <div className="mb-5 flex items-center gap-2.5">
                <Beaker className="h-4 w-4 flex-shrink-0 text-[#0B6F7B]" />
                <h3 className="font-dm-mono text-[11px] uppercase tracking-[0.14em]">
                  {isEs ? "Perfil Estructurado de Adquisición y Referencia Científica" : "Structured Procurement Profile & Technical Reference"}
                </h3>
              </div>
              <ul className="grid grid-cols-1 gap-x-8 gap-y-4 text-[13px] text-[#0B0F14]/65 md:grid-cols-2">
                <li><strong className={`${eyebrowCls} mb-0.5 block !text-[#0B0F14]/50`}>{isEs ? "Nombre del Compuesto" : "Compound Reference"}</strong> {product.name}</li>
                <li><strong className={`${eyebrowCls} mb-0.5 block !text-[#0B0F14]/50`}>{isEs ? "Registro CAS" : "CAS Registry"}</strong> {product.cas !== 'N/A' ? product.cas : 'Peptide Specific'}</li>
                <li><strong className={`${eyebrowCls} mb-0.5 block !text-[#0B0F14]/50`}>{isEs ? "Grado Analítico" : "Analytical Grade"}</strong> &ge;99.0% High-Purity Research Standard</li>
                <li><strong className={`${eyebrowCls} mb-0.5 block !text-[#0B0F14]/50`}>{isEs ? "Uso Autorizado" : "Authorized Intended Use"}</strong> Strictly for Laboratory Research Purposes Only</li>
                <li><strong className={`${eyebrowCls} mb-0.5 block !text-[#0B0F14]/50`}>{isEs ? "Distribución" : "Supply Availability"}</strong> {isSpray ? 'Pre-Dissolved Spray Bulk Kits (10-unit standard)' : 'Lyophilized Bulk Kits (10-vial standard)'}</li>
                <li><strong className={`${eyebrowCls} mb-0.5 block !text-[#0B0F14]/50`}>{isEs ? "Distribuidor Global" : "Global Authorized Distributor"}</strong> 99 Purity Wholesale</li>
              </ul>
            </div>

            {/* Analytical QA */}
            <div className="mt-8 border-t border-[#E6EAF1] pt-8">
              <h3 className="mb-3 text-[1.15rem] font-medium tracking-[-0.02em]">
                {isEs ? "Protocolo de Control de Calidad Analítica" : "Analytical Quality Assurance Loop"}
              </h3>
              <p className="mb-6 max-w-4xl text-[13.5px] leading-relaxed text-[#0B0F14]/60">
                {isSpray
                  ? (isEs
                    ? `Cada lote de ${product.name} se somete a un proceso de verificación cromatográfica de doble pasada. Confirmamos la pureza por HPLC de fase reversa y la identidad por la masa exacta del catión mediante Espectrometría de Masas (LC-MS), junto con la verificación de la concentración de la solución dosificada. Las unidades terminadas se filtran en estéril, se purgan con nitrógeno y se envasan en vidrio ámbar para garantizar la estabilidad molecular a largo plazo.`
                    : `Every lot of ${product.name} undergoes a double-pass chromatography and verification process. We confirm purity by reverse-phase HPLC and identity by exact cation mass using Liquid Chromatography-Mass Spectrometry (LC-MS), alongside metered-solution concentration verification. Finished units are sterile-filtered, nitrogen-purged, and filled into amber glass for long-term molecular stability.`)
                  : isEs
                  ? `Cada lote sintético de ${product.name} se somete a un riguroso proceso de control de calidad de dos fases. Confirmamos la masa molecular exacta y la alineación de la secuencia de aminoácidos mediante Cromatografía Líquida de Alta Resolución (HPLC) y Espectrometría de Masas (LC-MS). Las muestras terminadas se purgan con nitrógeno y se sellan herméticamente para garantizar la estabilidad molecular a largo plazo.`
                  : `Every synthetic lot of ${product.name} undergoes an exhaustive, double-pass chromatography and verification process. We confirm molecular mass and exact peptide sequence alignment using High-Performance Liquid Chromatography (HPLC) and Liquid Chromatography-Mass Spectrometry (LC-MS). Finished samples are nitrogen-purged and vacuum-sealed for long-term stability.`
                }
              </p>
              <ul className="grid grid-cols-1 gap-3 text-[13px] font-medium sm:grid-cols-3">
                <li className="flex items-center gap-3 rounded-[0.9rem] border border-[#E6EAF1] px-5 py-4"><CheckCircle2 className="h-4 w-4 flex-shrink-0 text-[#0B6F7B]" /> HPLC Purity Verified</li>
                <li className="flex items-center gap-3 rounded-[0.9rem] border border-[#E6EAF1] px-5 py-4"><CheckCircle2 className="h-4 w-4 flex-shrink-0 text-[#0B6F7B]" /> LC-MS Mass Checked</li>
                <li className="flex items-center gap-3 rounded-[0.9rem] border border-[#E6EAF1] px-5 py-4"><CheckCircle2 className="h-4 w-4 flex-shrink-0 text-[#0B6F7B]" /> Nitrogen Purged Stability</li>
              </ul>
            </div>
          </div>

          {/* COA banner */}
          <div className={`${card} flex w-full flex-col items-start justify-between gap-6 p-6 sm:flex-row sm:items-center md:p-8`}>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[#F3F5FA] text-[#0B6F7B]">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-[1.2rem] font-normal tracking-[-0.03em]">{t('coaTitle')}</h2>
                <p className="text-[13px] text-[#0B0F14]/55">{t('coaDesc')}</p>
              </div>
            </div>
            <button className="whitespace-nowrap rounded-full bg-[#0B0F14] px-6 py-3 font-dm-sans text-[13px] font-medium text-white transition-colors hover:bg-[#4FC3D0] hover:text-[#0B0F14]">
              {t('requestCoa')}
            </button>
          </div>
        </div>
      </section>

      {/* FAQ (localized B2B research FAQs for every compound) */}
      <ProductFaq
        id="product-faq"
        eyebrow="FAQ"
        title={isEs ? `${product.name} Preguntas Frecuentes` : `${product.name} Procurement FAQ`}
        subtitle={isEs ? `Orientación completa de adquisición institucional, verificación de calidad HPLC y detalles de entrega para ${product.name} al por mayor.` : `Complete institutional procurement guidance, quality verification protocols, and delivery details for bulk wholesale ${product.name}.`}
        items={faqs}
        className="border-t border-[#E6EAF1]"
      />

      {/* Related products */}
      {relatedProducts.length > 0 && (
        <section className={`${SECTION} border-t border-[#E6EAF1]`}>
          <div className={WRAP}>
            <SplitHeading text={t('relatedTitle')} className={`${h2} mb-10 md:mb-14`} />
            <RevealGroup className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3">
              {relatedProducts.map(rp => {
                const rpSpecMap = productSpecImagesMap[rp.slug as keyof typeof productSpecImagesMap] || {};
                const rpImages = Object.values(rpSpecMap);
                const productImage = rpImages.length > 0 ? rpImages[0] : "";
                return (
                  <ProductCard
                    key={rp.slug}
                    product={rp}
                    imageSrc={productImage ? `/product-images/${productImage}` : null}
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    description={t.has(`descriptions.${rp.slug}`) ? t(`descriptions.${rp.slug}`) : rp.description}
                  />
                );
              })}
            </RevealGroup>
          </div>
        </section>
      )}

      {/* Available for wholesale in: location cross-links */}
      <section className="border-t border-[#E6EAF1] bg-white py-14 md:py-16">
        <div className={WRAP}>
          <h2 className="mb-3 text-[clamp(1.5rem,2.6vw,2.2rem)] font-light leading-tight tracking-[-0.04em]">
            {isEs ? `${product.name} Al Por Mayor Disponible En` : `Wholesale ${product.name} Available In`}
          </h2>
          <p className="mb-8 max-w-2xl text-[14px] leading-relaxed text-[#0B0F14]/60">
            {isEs
              ? 'Suministramos a instituciones y laboratorios autorizados en todo Estados Unidos. Explore nuestros centros regionales para conocer los plazos de entrega y la cobertura local.'
              : 'We supply licensed institutions and laboratories nationwide. Browse our regional hubs for local delivery timelines and coverage.'}
          </p>
          <div className="flex flex-wrap gap-2.5">
            {matchedLocations.map((loc) => (
              <Link
                key={loc.href}
                href={loc.href}
                className="inline-flex items-center gap-2 rounded-full border border-[#E6EAF1] bg-[#F3F5FA] px-4 py-2.5 text-[13px] font-medium text-[#0B0F14]/70 transition-colors hover:border-[#4FC3D0] hover:text-[#0B6F7B]"
              >
                <MapPin className="h-3.5 w-3.5 text-[#0B6F7B]" />
                {loc.label}
              </Link>
            ))}
            <Link
              href="/locations"
              className="inline-flex items-center gap-2 rounded-full bg-[#0B0F14] px-5 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-[#1b232d]"
            >
              {isEs ? 'Ver Todas las Ubicaciones' : 'Browse All Locations'} <ArrowUpRight className="h-3.5 w-3.5 text-[#4FC3D0]" />
            </Link>
          </div>
        </div>
      </section>

      {/* Mobile sticky CTA (small screens only) */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#E6EAF1] bg-white/95 p-4 backdrop-blur lg:hidden">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0B0F14] py-3.5 font-dm-sans text-[13px] font-medium text-white"
        >
          <Zap className="h-4 w-4 text-[#4FC3D0]" /> {t('requestPricingTitle')}
        </a>
      </div>
    </PageShell>
  );
}
