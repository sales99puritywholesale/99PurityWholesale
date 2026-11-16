/** Shared constants for the "Get a plan" quiz. */

export const PLAN_WHATSAPP = '18433307365';
export const PLAN_EMAIL = 'sales@99puritywholesale.com';

/** Display form of the WhatsApp number. */
export const PLAN_PHONE_DISPLAY = '(843) 330-7365';

/** The 7 quiz steps, in order. */
export const PLAN_STEPS = ['build', 'services', 'site', 'volume', 'timeline', 'notes', 'contact'] as const;
export type PlanStep = (typeof PLAN_STEPS)[number];

/** Services a visitor can add (keys match the services list on the homepage, plus wholesale supply). */
export const PLAN_SERVICES = ['supply', 'metaAds', 'seo', 'email', 'brand', 'fulfillment', 'dropshipping', 'support', 'payments', 'web', 'redesign', 'privateLabel', 'compliance'] as const;

export const BUILD_OPTIONS = ['launch', 'scale', 'other', 'payments'] as const;
export const SITE_OPTIONS = ['none', 'platform', 'custom', 'redesign'] as const;
export const VOLUME_OPTIONS = ['starter', 'tier1', 'tier2', 'tier3', 'unsure'] as const;
export const TIMELINE_OPTIONS = ['asap', 'weeks', 'months', 'exploring'] as const;

/**
 * English labels used in the message the team receives (kept in English regardless of the visitor's
 * language so the summary is easy to read on our side).
 */
export const EN_LABELS: Record<string, Record<string, string>> = {
  build: {
    launch: 'Launch a new peptide brand',
    scale: 'Scale a peptide brand they already run',
    other: 'A brand in another industry',
    payments: 'Just payment processing',
  },
  site: {
    none: 'No website yet',
    platform: 'Template or marketplace store',
    custom: 'Custom site that works',
    redesign: 'Site that needs a redesign',
  },
  volume: {
    starter: '1 to 9 kits (Start)',
    tier1: '10 to 19 kits (Tier 1)',
    tier2: '20 to 39 kits (Tier 2)',
    tier3: '40+ kits (Tier 3)',
    unsure: 'Not sure yet',
  },
  timeline: {
    asap: 'As soon as possible',
    weeks: 'In 2 to 4 weeks',
    months: 'In 1 to 3 months',
    exploring: 'Just exploring',
  },
  services: {
    supply: 'Wholesale supply',
    metaAds: 'Meta Ads',
    seo: 'SEO / GEO / AEO',
    email: 'Email & SMS Marketing',
    brand: 'Brand & Packaging Design',
    fulfillment: 'Fulfillment',
    dropshipping: 'Dropshipping',
    support: 'Customer Support',
    payments: 'Payment Processing',
    web: 'Website Development',
    redesign: 'Website Redesign',
    privateLabel: 'Private Label',
    compliance: 'Compliance Consulting',
  },
};
