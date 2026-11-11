import { describe, expect, it, vi } from 'vitest';
import {
  buildInviteAcceptLink,
  isWellFormedInviteToken,
  redactInviteToken,
  INVITE_ACCEPT_PATH,
} from '@/lib/portal/invitations/token';
import {
  deliverInvitation,
  describeInvitationForLog,
  nullMailer,
  renderInvitationEmail,
  type InvitationMailer,
  type InvitationMessage,
} from '@/lib/portal/invitations/mailer';
import {
  ONBOARDING_STATUSES,
  acceptInviteSchema,
  billingAddressSchema,
  canTransitionOnboarding,
  createInviteSchema,
  onboardingProfileSchema,
  purchasingAllowed,
  type OnboardingStatus,
} from '@/lib/portal/invitations/schemas';

const TOKEN = 'A'.repeat(43);
const ORG = '11111111-1111-4111-8111-111111111111';
const message = (overrides: Partial<InvitationMessage> = {}): InvitationMessage => ({
  to: 'new.person@example.com',
  organizationName: 'Acme Wholesale',
  role: 'member',
  link: buildInviteAcceptLink('https://portal.example.com', TOKEN),
  expiresAt: new Date('2026-11-17T12:00:00Z'),
  ...overrides,
});

describe('invitation tokens and links', () => {
  it('accepts exactly 43 base64url characters', () => {
    expect(isWellFormedInviteToken(TOKEN)).toBe(true);
    expect(isWellFormedInviteToken('Ab-_'.repeat(10) + 'abc')).toBe(true);
    for (const bad of ['', 'A'.repeat(42), 'A'.repeat(44), 'A'.repeat(42) + '=', 'A'.repeat(42) + '+', 'A'.repeat(42) + '/', ' ' + 'A'.repeat(42), 'A'.repeat(42) + '\n', null, undefined, 1, {}]) {
      expect(isWellFormedInviteToken(bad)).toBe(false);
    }
  });
  it('builds an https link with the token as a query parameter', () => {
    const link = buildInviteAcceptLink('https://portal.example.com/ignored/path?x=1', TOKEN);
    expect(link).toBe(`https://portal.example.com${INVITE_ACCEPT_PATH}?token=${TOKEN}`);
  });
  it('allows http only for localhost development', () => {
    expect(buildInviteAcceptLink('http://localhost:3000', TOKEN)).toContain('http://localhost:3000/invite/accept');
    expect(() => buildInviteAcceptLink('http://portal.example.com', TOKEN)).toThrow();
    expect(() => buildInviteAcceptLink('javascript:alert(1)', TOKEN)).toThrow();
    expect(() => buildInviteAcceptLink('not a url', TOKEN)).toThrow();
    expect(() => buildInviteAcceptLink('https://user:pw@portal.example.com', TOKEN)).toThrow();
  });
  it('refuses to build a link from a malformed token', () => {
    expect(() => buildInviteAcceptLink('https://portal.example.com', 'short')).toThrow();
    expect(() => buildInviteAcceptLink('https://portal.example.com', TOKEN + '&admin=1')).toThrow();
  });
  it('redacts tokens from links and bare tokens', () => {
    const link = buildInviteAcceptLink('https://portal.example.com', TOKEN);
    expect(redactInviteToken(link)).not.toContain(TOKEN);
    expect(redactInviteToken(`failed for ${TOKEN} here`)).not.toContain(TOKEN);
    expect(redactInviteToken('nothing to hide')).toBe('nothing to hide');
  });
});

describe('invitation mailer (provider-independent, no live delivery)', () => {
  it('the default adapter delivers nothing and the outbox stays pending', async () => {
    expect(await nullMailer.send({ to: 'a@b.co', subject: 's', text: 't' })).toEqual({ status: 'not_configured' });
    expect(await deliverInvitation(nullMailer, message())).toEqual({ status: 'pending', errorCode: 'mailer_not_configured' });
  });
  it('records sent for a provider that accepts the message', async () => {
    const mailer: InvitationMailer = { name: 'fake', send: async () => ({ status: 'sent', providerMessageId: 'abc' }) };
    expect(await deliverInvitation(mailer, message())).toEqual({ status: 'sent', errorCode: null });
  });
  it('never throws and never leaks provider text or the token into the outcome', async () => {
    const boom: InvitationMailer = { name: 'boom', send: async () => { throw new Error(`smtp said ${TOKEN}`); } };
    const outcome = await deliverInvitation(boom, message());
    expect(outcome).toEqual({ status: 'failed', errorCode: 'mailer_exception' });
    expect(JSON.stringify(outcome)).not.toContain(TOKEN);
    const odd: InvitationMailer = { name: 'odd', send: async () => ({ status: 'failed', code: 'Some PROVIDER message with spaces and ' + TOKEN }) };
    expect(await deliverInvitation(odd, message())).toEqual({ status: 'failed', errorCode: 'mailer_error' });
    const good: InvitationMailer = { name: 'good', send: async () => ({ status: 'failed', code: 'rate_limited' }) };
    expect(await deliverInvitation(good, message())).toEqual({ status: 'failed', errorCode: 'rate_limited' });
  });
  it('renders plain text with the link and an expiry, and neutralizes control characters in the organization name', () => {
    const email = renderInvitationEmail(message({ organizationName: 'Evil\r\nBcc: attacker@example.com <b>x</b>' }));
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.text).toContain(`token=${TOKEN}`);
    expect(email.text).toContain('2026-11-17 12:00 UTC');
    expect(email.text).not.toContain('\r');
    expect(email.subject.length).toBeLessThan(200);
  });
  it('logs a description without the token or the full address', () => {
    const description = describeInvitationForLog(message());
    expect(description).not.toContain(TOKEN);
    expect(description).not.toContain('new.person');
    expect(description).toContain('@example.com');
  });
  it('passes the message to the provider exactly once', async () => {
    const send = vi.fn(async () => ({ status: 'sent' as const, providerMessageId: null }));
    await deliverInvitation({ name: 'spy', send }, message());
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('input schemas', () => {
  it('createInviteSchema normalizes the email and rejects bad input and extra keys', () => {
    const ok = createInviteSchema.parse({ organizationId: ORG, email: '  New.Person@Example.COM ', role: 'member' });
    expect(ok.email).toBe('new.person@example.com');
    for (const bad of [
      { organizationId: 'nope', email: 'a@b.co', role: 'member' },
      { organizationId: ORG, email: 'no-at-sign', role: 'member' },
      { organizationId: ORG, email: 'a b@c.co', role: 'member' },
      { organizationId: ORG, email: 'a@b.co', role: 'admin' },
      { organizationId: ORG, email: 'a@b.co', role: 'OWNER' },
      { organizationId: ORG, email: 'a@b.co', role: 'member', extra: 1 },
      { organizationId: ORG, email: 'a'.repeat(250) + '@b.co', role: 'member' },
    ]) expect(createInviteSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });
  it('acceptInviteSchema only accepts a well formed token', () => {
    expect(acceptInviteSchema.safeParse({ token: TOKEN }).success).toBe(true);
    expect(acceptInviteSchema.safeParse({ token: 'x' }).success).toBe(false);
    expect(acceptInviteSchema.safeParse({ token: TOKEN, role: 'owner' }).success).toBe(false);
  });
  const profile = {
    organizationName: 'Acme Wholesale',
    contactName: 'Pat Doe',
    phone: '+1 555 0100',
    country: 'us',
    website: 'https://acme.example.com',
    businessType: 'Retailer',
    billingAddress: { line1: '1 Main St', city: 'Springfield', postal_code: '12345', country: 'us' },
  };
  it('onboardingProfileSchema accepts the approved fields only', () => {
    const parsed = onboardingProfileSchema.parse(profile);
    expect(parsed.country).toBe('US');
    expect(parsed.billingAddress.country).toBe('US');
    expect(onboardingProfileSchema.safeParse({ ...profile, taxId: '12-3456789' }).success).toBe(false); // no invented legal fields
    expect(onboardingProfileSchema.safeParse({ ...profile, resaleCertificate: 'x' }).success).toBe(false);
    expect(onboardingProfileSchema.safeParse({ ...profile, billingAddress: { ...profile.billingAddress, vat: 'x' } }).success).toBe(false);
  });
  it('onboardingProfileSchema rejects invalid values', () => {
    for (const bad of [
      { ...profile, organizationName: '' }, { ...profile, organizationName: 'x'.repeat(201) }, { ...profile, contactName: '   ' },
      { ...profile, country: 'USA' }, { ...profile, country: '1A' }, { ...profile, website: 'javascript:alert(1)' }, { ...profile, website: 'ftp://x.y' },
      { ...profile, phone: '1'.repeat(41) }, { ...profile, businessType: '' },
      { ...profile, billingAddress: { ...profile.billingAddress, line1: '' } },
      { ...profile, billingAddress: { ...profile.billingAddress, postal_code: '1'.repeat(21) } },
    ]) expect(onboardingProfileSchema.safeParse(bad).success, JSON.stringify(bad).slice(0, 80)).toBe(false);
    expect(billingAddressSchema.safeParse({ line1: 'a', city: 'b', postal_code: 'c', country: 'ZZ', line2: 'x'.repeat(201) }).success).toBe(false);
  });
});

describe('onboarding status and purchasing access (admin approval required)', () => {
  it('allows only the defined transitions', () => {
    expect(canTransitionOnboarding('draft', 'submitted')).toBe(true);
    expect(canTransitionOnboarding('submitted', 'approved')).toBe(true);
    expect(canTransitionOnboarding('submitted', 'changes_requested')).toBe(true);
    expect(canTransitionOnboarding('changes_requested', 'submitted')).toBe(true);
    expect(canTransitionOnboarding('draft', 'approved')).toBe(false); // no self-approval shortcut
    expect(canTransitionOnboarding('changes_requested', 'approved')).toBe(false);
    for (const to of ONBOARDING_STATUSES) expect(canTransitionOnboarding('approved', to)).toBe(false);
  });
  it('wholesale purchasing is allowed only when approved (default deny)', () => {
    for (const s of ONBOARDING_STATUSES as readonly OnboardingStatus[]) expect(purchasingAllowed(s)).toBe(s === 'approved');
    expect(purchasingAllowed(null)).toBe(false);
    expect(purchasingAllowed(undefined)).toBe(false);
  });
});
