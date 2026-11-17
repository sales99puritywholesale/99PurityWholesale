import { getTranslations } from 'next-intl/server';
import { getMessages } from 'next-intl/server';
import { NextIntlClientProvider } from 'next-intl';
import CalculatorClient from '@/components/calculator/CalculatorClient';
import CalculatorContent from '@/components/calculator/CalculatorContent';
import CalculatorFaq from '@/components/calculator/CalculatorFaq';
import { PageShell, PageHero, WRAP } from '@/components/home/page-kit';

export async function generateMetadata(props: any) {
  const params = props?.params || {};
  const locale = params?.locale || 'en';
  const t = await getTranslations({ locale, namespace: 'Meta' });
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://99puritywholesale.com';
  const path = '/peptide-calculator';
  const url = locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  const ogTitle = t('calculatorTitle');
  const ogDesc = t('calculatorDesc');
  const ogUrlImage = `${baseUrl}/api/og?title=${encodeURIComponent('Peptide Reconstitution Calculator')}&desc=${encodeURIComponent(ogDesc)}&category=Research%20Tools`;

  return {
    metadataBase: new URL(baseUrl),
    title: ogTitle,
    description: ogDesc,
    keywords: [
      'peptide reconstitution calculator',
      'BAC water calculator',
      'peptide dosage calculator',
      'syringe units calculator',
      'peptide mixing calculator',
      'U-100 syringe calculator',
    ],
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
          alt: '99 Purity Wholesale Peptide Reconstitution Calculator',
        },
      ],
      locale: locale,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: ogDesc,
      images: [ogUrlImage],
    },
    robots: 'index, follow',
  };
}

export default async function CalculatorPage({ params }: { params: { locale: string } }) {
  const t = await getTranslations({ locale: params.locale, namespace: 'Calculator' });
  const messages = await getMessages({ locale: params.locale });
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://99puritywholesale.com';
  const path = '/peptide-calculator';
  const url = params.locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${params.locale}${path}`;

  const webApplicationSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Peptide Reconstitution Calculator',
    url,
    applicationCategory: 'HealthApplication',
    operatingSystem: 'Any (Web Browser)',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    provider: { '@type': 'Organization', name: '99 Purity Wholesale', url: baseUrl },
    description: t('subtitle'),
  };

  const howToSchema = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'How to Reconstitute a Research Peptide Vial',
    description: 'Step-by-step procedure for reconstituting a lyophilized research peptide with bacteriostatic water, from calculating concentration through cold-chain storage.',
    supply: [
      { '@type': 'HowToSupply', name: 'Lyophilized research peptide vial' },
      { '@type': 'HowToSupply', name: 'Bacteriostatic water (BAC water)' },
      { '@type': 'HowToSupply', name: 'Insulin syringe (U-100, U-50, or U-30)' },
    ],
    step: [
      {
        '@type': 'HowToStep',
        name: 'Calculate your concentration',
        text: 'Divide the vial mass in milligrams by the intended bacteriostatic water volume in milliliters to get the concentration in mg/mL. For example, a 10mg vial reconstituted with 2mL of BAC water yields a 5mg/mL concentration.',
      },
      {
        '@type': 'HowToStep',
        name: 'Add bacteriostatic water',
        text: 'Lyophilized peptide vials are packaged under negative pressure. Angle the needle so the water runs slowly down the inside of the glass rather than blasting it directly onto the peptide puck, which can shear the amino acid bonds.',
      },
      {
        '@type': 'HowToStep',
        name: 'Swirl, never shake',
        text: 'Gently swirl the vial in a circular motion until the lyophilized powder is completely dissolved and the solution is clear. Never shake the vial, as mechanical stress can degrade the compound.',
      },
      {
        '@type': 'HowToStep',
        name: 'Store in cold-chain',
        text: 'Immediately place the reconstituted vial in a medical-grade refrigerator between 2°C and 8°C (36°F–46°F), away from direct light. Most reconstituted research peptides remain stable for 28 to 30 days when stored this way.',
      },
      {
        '@type': 'HowToStep',
        name: 'Verify clarity before use',
        text: 'A properly reconstituted peptide should be completely clear and free of particulates. If the solution is cloudy, milky, or contains visible floating matter, the compound has degraded and the vial must be discarded.',
      },
    ],
  };

  return (
    <NextIntlClientProvider messages={messages}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webApplicationSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }} />
      <PageShell>
        <PageHero title={t('title')} intro={t('subtitle')} />

        <section className="pb-8 md:pb-12">
          <div className={WRAP}>
            {/* Calculator Interactive Body */}
            <CalculatorClient />

            {/* Pillar SEO Content */}
            <CalculatorContent />
          </div>
        </section>

        <CalculatorFaq />
      </PageShell>
    </NextIntlClientProvider>
  );
}
