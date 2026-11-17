import { getPostBySlug, getAllPosts } from '@/utils/mdx';
import Image from 'next/image';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { Link } from '@/i18n/routing';
import { ArrowLeft, ArrowRight, ShieldCheck, Beaker, Award } from 'lucide-react';
import { notFound } from 'next/navigation';
import BlogFAQ from '@/components/blog/BlogFAQ';
import { getTranslations } from 'next-intl/server';
import { PageShell, CtaBand, Eyebrow, SplitHeading, card, WRAP } from '@/components/home/page-kit';
import ArticleSchema from '@/components/seo/ArticleSchema';
import BreadcrumbSchema from '@/components/seo/BreadcrumbSchema';

export const revalidate = 172800;

export const dynamicParams = false;

// getAllPosts already excludes the .es.mdx translations, so these are the base slugs;
// the [locale] segment above pairs each one with en and es.
export async function generateStaticParams() {
  const posts = await getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

// Builds a descriptive alt string from an image filename, e.g. "/product-images/semaglutide-20mg.jpg" -> "Semaglutide 20mg"
function humanizeImageAlt(path: string): string {
  const filename = path.split('/').pop() || path;
  const withoutExt = filename.replace(/\.(jpg|jpeg|png|webp|avif)$/i, '');
  return withoutExt
    .split('-')
    .map(word => (/^\d/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

// Dynamic helper to serve contextual images and compounds based on post content keywords
function getRelatedImages(slug: string, title: string): { images: string[], compounds: { name: string, slug: string, img: string, desc: string }[] } {
  const normSlug = slug.toLowerCase();
  
  const compounds: { name: string, slug: string, img: string, desc: string }[] = [];
  const images: string[] = [];

  if (normSlug.includes('verify') || normSlug.includes('supplier') || normSlug.includes('sourcing') || normSlug.includes('fda') || normSlug.includes('compliance') || normSlug.includes('procurement') || normSlug.includes('california') || normSlug.includes('texas') || normSlug.includes('florida') || normSlug.includes('new-york')) {
    compounds.push(
      { name: 'BPC-157 5mg', slug: 'bpc-157', img: '/product-images/BPC-157 5mg-5.webp', desc: '≥99% purity verified HPLC batch.' },
      { name: 'Semaglutide 5mg', slug: 'semaglutide', img: '/product-images/SEMAGLUTIDE 5mg-2.webp', desc: 'LC-MS identity confirmed lot.' },
      { name: 'Tirzepatide 10mg', slug: 'tirzepatide', img: '/product-images/TIRZEPATIDE 10mg-3.webp', desc: 'Batch-specific COA verified.' }
    );
    images.push(
      '/images/peptide-supplier-verification-coa-audit.jpg',
      '/images/peptide-supplier-batch-traceability-qc.jpg'
    );
  } else if (normSlug.includes('spps') || normSlug.includes('lpps') || normSlug.includes('synthesis')) {
    compounds.push(
      { name: 'Tirzepatide 10mg', slug: 'tirzepatide', img: '/product-images/TIRZEPATIDE 10mg-3.webp', desc: 'Hybrid synthesis benchmark compound.' },
      { name: 'BPC-157 5mg', slug: 'bpc-157', img: '/product-images/BPC-157 5mg-5.webp', desc: 'Pentadecapeptide research standard.' },
      { name: 'Semaglutide 5mg', slug: 'semaglutide', img: '/product-images/SEMAGLUTIDE 5mg-2.webp', desc: 'Continuous SPPS benchmark peptide.' }
    );
    images.push(
      '/images/spps-automated-synthesizer-lab.jpg',
      '/images/hybrid-peptide-synthesis-purification.jpg'
    );
  } else if (normSlug.includes('fluorescence') || normSlug.includes('chemiluminescence') || normSlug.includes('bioluminescence')) {
    compounds.push(
      { name: 'Semaglutide 5mg', slug: 'semaglutide', img: '/product-images/SEMAGLUTIDE 5mg-2.webp', desc: 'Selective GLP-1 receptor agonist.' },
      { name: 'BPC-157 5mg', slug: 'bpc-157', img: '/product-images/BPC-157 5mg-5.webp', desc: 'Pentadecapeptide for tissue recovery.' },
      { name: 'NAD+ 500mg', slug: 'nad', img: '/product-images/nad-plus-500mg-1.webp', desc: 'Nicotinamide Adenine Dinucleotide.' }
    );
    images.push(
      '/images/fluorescence-spectrofluorometer-lab.jpg',
      '/images/luminescence-assay-plate.jpg'
    );
  } else if (normSlug.includes('spray') || normSlug.includes('lyophilized') || normSlug.includes('pre-dissolved')) {
    compounds.push(
      { name: 'BPC-157 + TB-500 Spray', slug: 'bpc-157-tb-500-spray', img: '/product-images/bpc-157-tb-500-spray-10mg.jpg', desc: 'Pre-dissolved 0.1 mL metered spray.' },
      { name: '5-Amino-1MQ Spray', slug: '5-amino-1mq-spray', img: '/product-images/5-amino-1mq-spray-50mg.jpg', desc: 'Solution-phase NNMT inhibitor spray.' },
      { name: 'Semaglutide Spray', slug: 'semaglutide-spray', img: '/product-images/semaglutide-spray-10mg.jpg', desc: 'Pre-dissolved GLP-1 research spray.' }
    );
    images.push(
      '/product-images/bpc-157-tb-500-spray-10mg.jpg',
      '/product-images/5-amino-1mq-spray-50mg.jpg',
      '/product-images/semaglutide-spray-10mg.jpg'
    );
  } else if (normSlug.includes('retatrutide')) {
    compounds.push(
      { name: 'Retatrutide 10mg', slug: 'retatrutide', img: '/product-images/RETATRUTIDE 10mg-6.webp', desc: 'Triple agonist research compound.' },
      { name: 'Tirzepatide 10mg', slug: 'tirzepatide', img: '/product-images/TIRZEPATIDE 10mg-3.webp', desc: 'Dual GIP/GLP-1 receptor agonist lot.' },
      { name: 'Semaglutide 5mg', slug: 'semaglutide', img: '/product-images/SEMAGLUTIDE 5mg-2.webp', desc: 'Selective GLP-1 receptor agonist.' }
    );
    images.push(
      '/product-images/RETATRUTIDE 10mg-6.webp',
      '/product-images/TIRZEPATIDE 10mg-3.webp'
    );
  } else if (normSlug.includes('glp') || normSlug.includes('weight') || normSlug.includes('tirzepatide') || normSlug.includes('semaglutide')) {
    compounds.push(
      { name: 'Tirzepatide 10mg', slug: 'tirzepatide', img: '/product-images/TIRZEPATIDE 10mg-3.webp', desc: 'Dual GIP/GLP-1 receptor agonist lot.' },
      { name: 'Semaglutide 5mg', slug: 'semaglutide', img: '/product-images/SEMAGLUTIDE 5mg-2.webp', desc: 'Selective GLP-1 receptor agonist.' },
      { name: 'Retatrutide 10mg', slug: 'retatrutide', img: '/product-images/RETATRUTIDE 10mg-6.webp', desc: 'Triple agonist research compound.' }
    );
    images.push(
      '/product-images/SEMAGLUTIDE 5mg-2.webp',
      '/product-images/TIRZEPATIDE 10mg-3.webp',
      '/lab_quality_bg_1778896760027.png',
      '/product-images/SEMAGLUTIDE 5mg-2.webp'
    );
  } else if (normSlug.includes('bpc') || normSlug.includes('tb500') || normSlug.includes('recovery')) {
    compounds.push(
      { name: 'BPC-157 5mg', slug: 'bpc-157', img: '/product-images/BPC-157 5mg-5.webp', desc: 'Pentadecapeptide for tissue recovery.' },
      { name: 'BPC-157 + TB-500', slug: 'bpc-5mg-tb-5mg', img: '/product-images/BPC-157 TB-500 MIX 5mg 5mg-2.webp', desc: 'Synergistic cellular recovery blend.' },
      { name: 'TB-500 5mg', slug: 'tb-500', img: '/product-images/TB-500  5mg-2.webp', desc: 'Synthetic fraction of thymosin beta-4.' }
    );
    images.push(
      '/product-images/BPC-157 5mg-5.webp',
      '/product-images/BPC-157 TB-500 MIX 5mg 5mg-2.webp',
      '/images/hero-lab.png',
      '/product-images/TB-500  5mg-2.webp'
    );
  } else if (normSlug.includes('nad') || normSlug.includes('longevity') || normSlug.includes('aging')) {
    compounds.push(
      { name: 'NAD+ 500mg', slug: 'nad', img: '/product-images/nad-plus-500mg-1.webp', desc: 'Nicotinamide Adenine Dinucleotide.' },
      { name: '5-Amino-1MQ 50mg', slug: '5-amino-1mq', img: '/product-images/5-AMINO-1MQ 50mg.webp', desc: 'Targeted NNMT cellular enzyme inhibitor.' },
      { name: 'Epithalon 10mg', slug: 'epithalon', img: '/product-images/EPITHALON 10mg.webp', desc: 'Telomerase activator research peptide.' }
    );
    images.push(
      '/product-images/nad-plus-500mg-1.webp',
      '/product-images/5-AMINO-1MQ 50mg.webp',
      '/images/hero-lab-bg.png',
      '/product-images/EPITHALON 10mg.webp'
    );
  } else if (normSlug.includes('kpv')) {
    compounds.push(
      { name: 'KPV 10mg', slug: 'kpv', img: '/product-images/KPV 10mg.webp', desc: 'Lys-Pro-Val tripeptide for mucosal research.' },
      { name: 'KPV Spray 5mg', slug: 'kpv-spray', img: '/product-images/KPV spray 5mg.webp', desc: 'Pre-dissolved metered research spray.' },
      { name: 'Gut & Mucosal Panel', slug: 'gut-mucosal-panel', img: '/product-images/bundle-gut-mucosal-panel.webp', desc: 'BPC-157, KPV & Thymosin Alpha-1 research kit.' }
    );
    images.push(
      '/images/kpv-pept1-nfkb-mapk-mechanism-schematic.jpg',
      '/images/kpv-fda-pcac-regulatory-timeline-2026.jpg'
    );
  } else if (normSlug.includes('private-label') || normSlug.includes('start-peptide') || normSlug.includes('launch') || normSlug.includes('business')) {
    compounds.push(
      { name: 'Custom Peptide Kit', slug: 'klow-blend', img: '/product-images/klow-custom-peptide-kit.jpg', desc: 'Private label kit customization.' },
      { name: 'Hair, Skin & Nail Blend', slug: 'glow-blend', img: '/product-images/glow-hair-skin-nail-blend.jpg', desc: 'GHK-Cu dynamic skin formulation.' },
      { name: 'BPC-157 5mg', slug: 'bpc-157', img: '/product-images/BPC-157 5mg-5.webp', desc: 'High-demand clinic starter stock.' }
    );
    images.push(
      '/product-images/glow-hair-skin-nail-blend.jpg',
      '/product-images/mic-lipo-c-b12-10mg.webp',
      '/lab_quality_bg_1778896760027.png',
      '/product-images/SEMAGLUTIDE 5mg-2.webp'
    );
  } else {
    compounds.push(
      { name: 'Semaglutide 5mg', slug: 'semaglutide', img: '/product-images/SEMAGLUTIDE 5mg-2.webp', desc: 'Selective GLP-1 receptor agonist.' },
      { name: 'BPC-157 5mg', slug: 'bpc-157', img: '/product-images/BPC-157 5mg-5.webp', desc: 'Pentadecapeptide for tissue recovery.' },
      { name: 'NAD+ 500mg', slug: 'nad', img: '/product-images/nad-plus-500mg-1.webp', desc: 'Nicotinamide Adenine Dinucleotide.' }
    );
    images.push(
      '/images/vial_kit_luxury.png',
      '/images/chromatography_lab.png',
      '/images/analytical_verification.png',
      '/product-images/bpc-157-tb-500-10-10mg.jpg'
    );
  }

  return { images, compounds };
}

// Custom components that style the MDX body in the light editorial theme. Several posts embed raw HTML
// tables wrapped in a dark-themed <div> (white/10 borders, #090C12 background); `div` and `table` are
// overridden so those legacy class names never reach the page and every table gets the same light frame.
const mdxComponents = {
  h1: (props: any) => (
    <h2 className="mb-4 mt-12 text-[clamp(1.5rem,2.6vw,2rem)] font-light leading-tight tracking-[-0.03em] text-[#0B0F14]" {...props} />
  ),
  h2: (props: any) => (
    <h2 className="mb-4 mt-12 text-[clamp(1.5rem,2.6vw,2rem)] font-light leading-tight tracking-[-0.03em] text-[#0B0F14]" {...props} />
  ),
  h3: (props: any) => (
    <h3 className="mb-3 mt-8 text-[1.15rem] font-medium leading-snug tracking-[-0.02em] text-[#0B0F14]" {...props} />
  ),
  h4: (props: any) => (
    <h4 className="mb-2 mt-6 text-[1rem] font-medium text-[#0B0F14]" {...props} />
  ),
  p: (props: any) => (
    <p className="mb-5 text-[15px] leading-[1.75] text-[#0B0F14]/70" {...props} />
  ),
  ul: (props: any) => (
    <ul className="mb-6 list-disc space-y-2 pl-5 text-[15px] leading-[1.7] text-[#0B0F14]/70 marker:text-[#4FC3D0]" {...props} />
  ),
  ol: (props: any) => (
    <ol className="mb-6 list-decimal space-y-2 pl-5 text-[15px] leading-[1.7] text-[#0B0F14]/70 marker:font-dm-mono marker:text-[#0B6F7B]" {...props} />
  ),
  li: (props: any) => <li {...props} />,
  strong: (props: any) => <strong className="font-medium text-[#0B0F14]" {...props} />,
  hr: () => <hr className="my-10 border-[#E6EAF1]" />,
  blockquote: (props: any) => (
    <blockquote className="my-8 rounded-[1.25rem] border border-[#E6EAF1] border-l-[3px] border-l-[#4FC3D0] bg-[#F3F5FA] p-6 text-[15px] leading-relaxed text-[#0B0F14]/75 [&>p]:mb-0" {...props} />
  ),
  a: (props: any) => (
    <a className="text-[#0B6F7B] underline underline-offset-2 transition-colors hover:text-[#0B0F14]" {...props} />
  ),
  code: (props: any) => (
    <code className="rounded bg-[#F3F5FA] px-1.5 py-0.5 font-dm-mono text-[0.85em] text-[#0B0F14]" {...props} />
  ),
  // Markdown images are parsed inside a paragraph, so this wrapper must be phrasing
  // content: a <figure> here would nest inside <p> and break hydration. Styled block.
  img: (props: any) => (
    <span className="relative mx-auto my-10 block aspect-[16/9] max-w-4xl overflow-hidden rounded-[1.25rem] border border-[#E6EAF1] bg-[#F3F5FA]">
      <img className="h-full w-full object-cover" alt={props.alt || 'Research image'} {...props} />
    </span>
  ),
  // Legacy dark wrapper divs are neutralised; the table component supplies the frame.
  div: ({ className, ...rest }: any) =>
    typeof className === 'string' && className.includes('overflow-x-auto') ? <div {...rest} /> : <div className={className} {...rest} />,
  table: ({ className: _legacy, ...props }: any) => (
    <div className="my-8 block max-w-full overflow-x-auto rounded-[1.25rem] border border-[#E6EAF1] bg-white">
      <table className="w-full min-w-[34rem] border-collapse text-left text-[13px] text-[#0B0F14]/70" {...props} />
    </div>
  ),
  thead: (props: any) => (
    <thead className="border-b border-[#E6EAF1] bg-[#F3F5FA] font-dm-mono text-[10px] uppercase tracking-[0.12em] text-[#0B0F14]" {...props} />
  ),
  tbody: (props: any) => <tbody className="divide-y divide-[#E6EAF1]" {...props} />,
  tr: (props: any) => <tr className="transition-colors hover:bg-[#F3F5FA]/60" {...props} />,
  th: (props: any) => <th className="px-4 py-3.5 font-medium text-[#0B0F14]" {...props} />,
  td: (props: any) => <td className="px-4 py-3.5 align-top leading-relaxed" {...props} />,
};

// Raw HTML tables inside MDX bypass the component map, so they are themed here (legacy dark classes overridden with !important).
const RAW_HTML_THEME = [
  "[&_div.overflow-x-auto]:!my-8 [&_div.overflow-x-auto]:!rounded-[1.25rem] [&_div.overflow-x-auto]:!border-[#E6EAF1] [&_div.overflow-x-auto]:!bg-white [&_div.overflow-x-auto]:!shadow-none",
  "[&_table]:w-full [&_table]:min-w-[34rem] [&_table]:border-collapse [&_table]:text-left [&_table]:!text-[13px] [&_table]:!text-[#0B0F14]/70",
  "[&_thead]:!border-[#E6EAF1] [&_thead]:!bg-[#F3F5FA] [&_thead]:!text-[#0B0F14]",
  "[&_th]:px-4 [&_th]:py-3.5 [&_th]:!font-medium [&_th]:!text-[#0B0F14]",
  "[&_td]:px-4 [&_td]:py-3.5 [&_td]:align-top [&_td]:!text-[#0B0F14]/70 [&_td]:!border-[#E6EAF1]",
  "[&_tbody]:!divide-[#E6EAF1] [&_tr]:!border-[#E6EAF1] [&_tr:hover]:!bg-[#F3F5FA]/60",
  "[&_table_strong]:!text-[#0B0F14] [&_table_a]:!text-[#0B6F7B]",
].join(" ");

function generateBlogKeywords(title: string, slug: string) {
  const normSlug = slug.toLowerCase();
  const keywords = [
    'wholesale research peptides',
    'peptide synthesis',
    'laboratory compliance',
  ];

  if (normSlug.includes('spps') || normSlug.includes('lpps') || normSlug.includes('synthesis')) {
    keywords.unshift('SPPS peptide synthesis', 'LPPS solution phase', 'hybrid peptide synthesis', 'peptide manufacturing', 'solid phase peptide synthesis');
  } else if (normSlug.includes('verify') || normSlug.includes('supplier')) {
    keywords.unshift('peptide supplier verification', 'verify peptide supplier', 'COA audit', 'HPLC purity test', 'LC-MS mass spec', 'RUO compliance');
  } else if (normSlug.includes('fluorescence') || normSlug.includes('luminescence')) {
    keywords.unshift('fluorescence spectroscopy', 'chemiluminescence assay', 'bioluminescence imaging', 'signal-to-noise ratio', 'spectrofluorometer');
  } else if (normSlug.includes('bpc')) {
    keywords.unshift('BPC-157 wholesale', 'BPC-157 supplier', 'tissue repair research', 'peptide recovery');
  } else if (normSlug.includes('glp') || normSlug.includes('semaglutide') || normSlug.includes('tirzepatide') || normSlug.includes('retatrutide')) {
    keywords.unshift('retatrutide vs tirzepatide vs semaglutide', 'triple agonist peptide', 'retatrutide research', 'GLP-1 wholesale', 'semaglutide research', 'tirzepatide supplier', 'metabolic peptides');
  } else if (normSlug.includes('nad')) {
    keywords.unshift('NAD+ wholesale', 'NAD+ longevity research', 'cellular health peptides');
  } else if (normSlug.includes('bioregulator') || normSlug.includes('epithalon')) {
    keywords.unshift('bioregulator peptides research', 'Khavinson bioregulator peptides', 'short chain peptide gene expression', 'Epithalon pineal research', 'histone acetylation peptide');
  } else if (normSlug.includes('kpv')) {
    keywords.unshift('KPV peptide research', 'PepT1 transporter uptake', 'NF-kB signalling inhibition', 'KPV free base vs acetate', '2026 FDA PCAC KPV vote', '503A bulks list KPV');
  }

  return keywords;
}

export async function generateMetadata(props: any) {
  const params = props?.params || {};
  const locale = params?.locale || 'en';
  try {
    const post = await getPostBySlug(params.slug, locale);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://99puritywholesale.com';
    const url = `${baseUrl}/${params.locale === 'en' ? '' : params.locale + '/'}blog/${params.slug}`;
    const metaDescription = post.meta.description || post.meta.desc || post.meta.title;
    // SERP <title> is capped around 60 chars before Google truncates or rewrites it.
    // `seoTitle` lets a post serve a short, keyword-front title to search while the
    // longer editorial `title` stays as the on-page H1 and the social/OG headline.
    const seoTitle = post.meta.seoTitle || post.meta.title;
    const ogUrlImage = `${baseUrl}/api/og?title=${encodeURIComponent(post.meta.title)}&desc=${encodeURIComponent(metaDescription)}&category=Clinical%20Research%20Blog`;
    const keywords = generateBlogKeywords(post.meta.title, params.slug);

    return {
      metadataBase: new URL(baseUrl),
      title: { absolute: seoTitle },
      description: metaDescription,
      keywords: keywords,
      alternates: {
        canonical: post.meta.canonical || url,
        languages: {
          'en-US': `${baseUrl}/blog/${params.slug}`,
          es: `${baseUrl}/es/blog/${params.slug}`,
          'x-default': `${baseUrl}/blog/${params.slug}`,
        },
      },
      openGraph: {
        title: post.meta.title,
        description: metaDescription,
        url: url,
        siteName: '99 Purity Wholesale',
        images: [
          {
            url: ogUrlImage,
            width: 1200,
            height: 630,
            alt: post.meta.title,
          },
        ],
        locale: params.locale,
        type: 'article',
      },
      twitter: {
        card: 'summary_large_image',
        title: post.meta.title,
        description: metaDescription,
        images: [ogUrlImage],
      },
    };
  } catch (e) {
    return {};
  }
}

export default async function BlogPost({ params }: { params: { locale: string, slug: string } }) {
  const t = await getTranslations({ locale: params.locale, namespace: 'Blog' });
  try {
    const post = await getPostBySlug(params.slug, params.locale);
    const { images, compounds } = getRelatedImages(params.slug, post.meta.title);
    const bodyImages = post.meta.coverImage && !images.includes(post.meta.coverImage)
      ? [post.meta.coverImage, ...images]
      : images;
    const normSlug = params.slug.toLowerCase();
    const hasEmbeddedImages = normSlug.includes('fluorescence') || normSlug.includes('chemiluminescence') || normSlug.includes('bioluminescence') || normSlug.includes('kpv') || normSlug.includes('503b');

    // Dynamic section splitting to inject multiple related images between post sections
    const sections = post.content
      .trim()
      .split(/(?=^## )/m)
      .map(s => s.trim())
      .filter(Boolean);

    const dateLabel = new Date(post.meta.date).toLocaleDateString(params.locale === 'es' ? 'es-ES' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    return (
      <PageShell>
        <ArticleSchema 
          title={post.meta.title}
          description={post.meta.desc || post.meta.description || post.meta.title}
          image={post.meta.coverImage ? `${process.env.NEXT_PUBLIC_BASE_URL || 'https://99puritywholesale.com'}${post.meta.coverImage}` : (images.length > 0 ? `${process.env.NEXT_PUBLIC_BASE_URL || 'https://99puritywholesale.com'}${images[0]}` : `${process.env.NEXT_PUBLIC_BASE_URL || 'https://99puritywholesale.com'}/og-image.png`)}
          datePublished={post.meta.date}
          url={`${process.env.NEXT_PUBLIC_BASE_URL || 'https://99puritywholesale.com'}/${params.locale === 'en' ? '' : params.locale + '/'}blog/${params.slug}`}
        />
        <BreadcrumbSchema items={[
          { name: 'Blog', item: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://99puritywholesale.com'}/${params.locale === 'en' ? '' : params.locale + '/'}blog` },
          { name: post.meta.title, item: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://99puritywholesale.com'}/${params.locale === 'en' ? '' : params.locale + '/'}blog/${params.slug}` }
        ]} />

        {/* Post header */}
        <section className="pb-10 pt-6 md:pb-14 md:pt-10">
          <div className={WRAP}>
            <Link
              href="/blog"
              className="mb-8 inline-flex items-center gap-2 font-dm-mono text-[10px] uppercase tracking-[0.2em] text-[#0B0F14]/50 transition-colors hover:text-[#0B0F14]"
            >
              <ArrowLeft className="h-3 w-3" aria-hidden="true" />
              {t('back')}
            </Link>
            <Eyebrow className="mb-6">
              <time dateTime={post.meta.date}>{dateLabel}</time>
            </Eyebrow>
            <SplitHeading
              as="h1"
              text={post.meta.title}
              className="max-w-5xl font-dm-sans text-[clamp(2rem,4.8vw,4rem)] font-light leading-[1.02] tracking-[-0.045em] text-[#0B0F14]"
            />
          </div>
        </section>

        {/* Article + sidebar */}
        <section className="pb-16 md:pb-24">
          <div className={`${WRAP} grid items-start gap-8 lg:grid-cols-12 lg:gap-10`}>
            <div className="min-w-0 lg:col-span-8">
              <article className={`${card} p-6 md:p-10 ${RAW_HTML_THEME}`}>
                {sections.map((section, index) => {
                  // Image 1 always appears right after Section 0.
                  // Secondary images (if present) appear spaced out in middle/latter sections.
                  let imageToShow: string | null = null;
                  if (bodyImages.length > 0) {
                    if (index === 0) {
                      imageToShow = bodyImages[0];
                    } else if (bodyImages.length === 2 && index === Math.max(2, Math.floor(sections.length / 2))) {
                      imageToShow = bodyImages[1];
                    } else if (bodyImages.length >= 3 && index === Math.max(2, Math.floor(sections.length / 2))) {
                      imageToShow = bodyImages[1];
                    } else if (bodyImages.length >= 3 && index === sections.length - 2 && sections.length > 4) {
                      imageToShow = bodyImages[2];
                    }
                  }

                  return (
                    <div key={index} className="min-w-0 [&>*:first-child]:mt-0">
                      <MDXRemote source={section} components={mdxComponents} />

                      {!hasEmbeddedImages && imageToShow && (
                        <figure className="relative my-10 h-[240px] overflow-hidden rounded-[1.25rem] border border-[#E6EAF1] md:h-[380px]">
                          <Image
                            src={imageToShow}
                            alt={`${humanizeImageAlt(imageToShow)} — Research Compound Reference Image`}
                            fill
                            sizes="(max-width: 1024px) 100vw, 800px"
                            className="object-cover"
                          />
                          <figcaption className="absolute bottom-4 left-4 rounded-full bg-white/90 px-3.5 py-1.5 font-dm-mono text-[10px] uppercase tracking-[0.14em] text-[#0B0F14]/70 backdrop-blur">
                            Analytical Reference {imageToShow === bodyImages[0] ? "Phase 01" : (imageToShow === bodyImages[1] ? "Phase 02" : "Phase 03")} · {humanizeImageAlt(imageToShow)}
                          </figcaption>
                        </figure>
                      )}
                    </div>
                  );
                })}
              </article>

              {/* Post FAQs (if present) */}
              {post.meta.faqs && (
                <div className="mt-6">
                  <BlogFAQ faqs={post.meta.faqs} />
                </div>
              )}
            </div>

            {/* Sidebar */}
            <aside className="space-y-4 lg:sticky lg:top-28 lg:col-span-4">
              <div className={`${card} p-6`}>
                <div className="mb-5 flex items-center gap-2 font-dm-mono text-[10px] uppercase tracking-[0.18em] text-[#0B6F7B]">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  {params.locale === 'es' ? 'Especificaciones Técnicas' : 'Clinical Specifications'}
                </div>
                <dl className="text-[13px]">
                  <div className="flex items-center justify-between gap-3 border-b border-[#E6EAF1] py-3">
                    <dt className="text-[#0B0F14]/50">Lot Status</dt>
                    <dd className="rounded-full border border-[#E6EAF1] bg-[#F3F5FA] px-2.5 py-0.5 font-dm-mono text-[10px] uppercase tracking-[0.1em]">cGMP Verified</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-b border-[#E6EAF1] py-3">
                    <dt className="text-[#0B0F14]/50">Target Group</dt>
                    <dd className="font-medium">Clinics &amp; Researchers</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-3">
                    <dt className="text-[#0B0F14]/50">Lot Purity</dt>
                    <dd className="font-medium text-[#0B6F7B]">≥99.0% Verified</dd>
                  </div>
                </dl>
              </div>

              {compounds.length > 0 && (
                <div className={`${card} p-6`}>
                  <div className="mb-5 flex items-center gap-2 font-dm-mono text-[10px] uppercase tracking-[0.18em] text-[#0B6F7B]">
                    <Beaker className="h-3.5 w-3.5" aria-hidden="true" />
                    Related Compounds
                  </div>
                  <div className="space-y-1">
                    {compounds.map((comp, idx) => (
                      <Link
                        key={idx}
                        href={`/products/${comp.slug}`}
                        className="group/comp flex items-center gap-4 rounded-2xl p-2 transition-colors hover:bg-[#F3F5FA]"
                      >
                        <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl border border-[#E6EAF1] bg-[#F3F5FA]">
                          <Image src={comp.img} alt={comp.name} fill sizes="56px" className="object-cover" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="flex items-center justify-between text-[13px] font-medium tracking-[-0.01em]">
                            <span>{comp.name}</span>
                            <ArrowRight className="h-3.5 w-3.5 text-[#0B0F14]/30 transition-all group-hover/comp:translate-x-1 group-hover/comp:text-[#0B6F7B]" aria-hidden="true" />
                          </h4>
                          <p className="mt-0.5 truncate text-[11px] text-[#0B0F14]/50">{comp.desc}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {!hasEmbeddedImages && images.length > 2 && (
                <div className={`${card} p-6`}>
                  <div className="mb-5 flex items-center gap-2 font-dm-mono text-[10px] uppercase tracking-[0.18em] text-[#0B6F7B]">
                    <Award className="h-3.5 w-3.5" aria-hidden="true" />
                    Laboratory Insights
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {images.slice(1, 5).map((img, idx) => (
                      <div key={idx} className="relative aspect-[4/3] overflow-hidden rounded-xl border border-[#E6EAF1] bg-[#F3F5FA]">
                        <Image
                          src={img}
                          alt={`${humanizeImageAlt(img)} — Laboratory Synthesis and Quality Verification`}
                          fill
                          sizes="(max-width: 1024px) 50vw, 200px"
                          className="object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          </div>
        </section>

        <CtaBand
          title={t('ctaTitle')}
          description={t('ctaSubtitle')}
          primary={{
            label: t('whatsapp'),
            href: `https://wa.me/18433307365?text=${encodeURIComponent(t('whatsapp'))}`,
            external: true,
          }}
        />
      </PageShell>
    );
  } catch (e) {
    return notFound();
  }
}
