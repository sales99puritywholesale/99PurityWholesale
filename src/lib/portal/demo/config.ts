/**
 * Demo mode (localhost demonstration only). Pure module (no Node APIs): imported by the edge middleware, server code and tests.
 *
 * Demo mode replaces the database with a local JSON file and replaces sign-in with a persona picker. It can NEVER be active in a production build:
 * isDemoMode() requires NODE_ENV !== 'production' in addition to PORTAL_DEMO_MODE=true. Nothing in demo mode is a real transaction, payment, shipment or integration.
 */
export const DEMO_COOKIE = 'portal_demo_persona';

export function isDemoMode(): boolean {
  return process.env.PORTAL_DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';
}

export type DemoPersonaKind = 'customer' | 'admin';
export type DemoPersona = { readonly id: string; readonly kind: DemoPersonaKind; readonly email: string; readonly name: string; readonly title: string; readonly organization: string | null };

/** Fixed ids so that the persisted demo file and the session cookie stay valid across restarts. */
export const DEMO_PERSONAS: readonly DemoPersona[] = [
  { id: 'd0000000-0000-4000-8000-000000000001', kind: 'admin', email: 'admin@99purity.demo', name: 'Morgan Reyes', title: 'Platform administrator', organization: null },
  { id: 'd0000000-0000-4000-8000-000000000011', kind: 'customer', email: 'alex@northwind.demo', name: 'Alex Carter', title: 'Owner, Northwind Wellness Distributors', organization: 'Northwind Wellness Distributors' },
  { id: 'd0000000-0000-4000-8000-000000000012', kind: 'customer', email: 'sam@northwind.demo', name: 'Sam Patel', title: 'Purchasing, Northwind Wellness Distributors', organization: 'Northwind Wellness Distributors' },
  { id: 'd0000000-0000-4000-8000-000000000021', kind: 'customer', email: 'jordan@summit.demo', name: 'Jordan Lee', title: 'Owner, Summit Lab Supply', organization: 'Summit Lab Supply' },
  { id: 'd0000000-0000-4000-8000-000000000031', kind: 'customer', email: 'riley@coastal.demo', name: 'Riley Nguyen', title: 'Owner, Coastal Research Partners', organization: 'Coastal Research Partners' },
];

export const personaById = (id: string | undefined | null): DemoPersona | null => DEMO_PERSONAS.find((p) => p.id === id) ?? null;
