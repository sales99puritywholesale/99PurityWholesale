import { getTranslations } from 'next-intl/server';
import { PageShell, PageHero, CtaBand } from '@/components/home/page-kit';
import FaqLight from '@/components/shared/FaqLight';
import GlossaryClient, { GlossaryTerm, ValueBox } from '@/components/glossary/GlossaryClient';

export async function generateMetadata(props: any) {
  const params = props?.params || {};
  const locale = params?.locale || 'en';
  const t = await getTranslations({ locale, namespace: 'Glossary' });
  return {
    title: t('Hero.title'),
    description: t('Hero.subtitle'),
  
    alternates: {
      canonical: `https://99puritywholesale.com${locale === 'en' ? '/glossary' : `/${locale}/glossary`}`,
      languages: { 'en-US': '/glossary', es: '/es/glossary', 'x-default': '/glossary' },
    },
  };
}

export default async function GlossaryPage({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'Glossary' });
  const indexT = await getTranslations({ locale, namespace: 'Index' });

  // Load and map terms dictionary into a list
  const termsRaw = await t.raw('Terms');
  const terms: GlossaryTerm[] = Object.keys(termsRaw).map((key) => ({
    key,
    title: termsRaw[key].title,
    definition: termsRaw[key].definition,
  }));

  // Load value boxes
  const valueBoxes: ValueBox[] = await t.raw('ValueBoxes');

  const rawTitle = t('Hero.title');

  const definedTermSetSchema = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    '@id': `${process.env.NEXT_PUBLIC_BASE_URL || 'https://99puritywholesale.com'}/${locale === 'en' ? '' : locale + '/'}glossary`,
    'name': rawTitle,
    'hasDefinedTerm': terms.map(term => ({
      '@type': 'DefinedTerm',
      'name': term.title,
      'description': term.definition
    }))
  };

  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(definedTermSetSchema) }}
      />

      <PageHero eyebrow={t('Hero.badge')} title={rawTitle} intro={t('Hero.subtitle')} />

      {/* Glossary Interactive Client: search, filters, cards grid, values boxes */}
      <GlossaryClient terms={terms} valueBoxes={valueBoxes} />

      <FaqLight
        id="glossary-faq"
        title={indexT('FAQ.title')}
        subtitle={indexT('FAQ.subtitle')}
        items={indexT.raw('FAQ.items') as any[]}
      />

      <CtaBand
        eyebrow="Science & Research"
        title={t('Cta.title')}
        description={t('Cta.subtitle')}
        primary={{ label: t('Cta.button'), href: '/products' }}
      />
    </PageShell>
  );
}
