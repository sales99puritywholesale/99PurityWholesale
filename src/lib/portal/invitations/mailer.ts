import { redactInviteToken } from './token';

/**
 * Provider-independent invitation mailer (P2.3, approved defaults: adapter + transactional outbox, no live delivery until a
 * provider is selected). A concrete provider is added later as another implementation of InvitationMailer; nothing else
 * changes. The default adapter delivers nothing.
 *
 * Invariants:
 *  - the raw token exists only inside `InvitationMessage.link` for the duration of the call; it is never returned in a result,
 *    never logged, and never written to the outbox (the outbox holds status and an error CODE only);
 *  - delivery never throws into the caller: every failure becomes a `failed` result with a short code;
 *  - a message is rendered as plain text (no HTML), so recipient-controlled strings cannot inject markup.
 */
export type InvitationMessage = {
  readonly to: string;
  readonly organizationName: string;
  readonly role: 'owner' | 'member';
  readonly link: string; // contains the one-time token
  readonly expiresAt: Date;
};

export type MailResult =
  | { readonly status: 'sent'; readonly providerMessageId: string | null }
  | { readonly status: 'not_configured' }
  | { readonly status: 'failed'; readonly code: string };

export interface InvitationMailer {
  readonly name: string;
  send(message: RenderedEmail & { readonly to: string }): Promise<MailResult>;
}

export type RenderedEmail = { readonly subject: string; readonly text: string };

/** The default adapter: no provider is configured, so nothing is sent. */
export const nullMailer: InvitationMailer = {
  name: 'null',
  async send() {
    return { status: 'not_configured' };
  },
};

const clean = (value: string, max: number): string => value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);

export function renderInvitationEmail(message: InvitationMessage): RenderedEmail {
  const org = clean(message.organizationName, 120) || 'an organization';
  const roleLabel = message.role === 'owner' ? 'an owner' : 'a member';
  const expires = message.expiresAt.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  return {
    subject: `You have been invited to ${org} on 99 Purity Wholesale`,
    text: [
      `You have been invited to join ${org} as ${roleLabel}.`,
      '',
      'Accept the invitation (sign in with the invited email address):',
      message.link,
      '',
      `This link works once and expires on ${expires}.`,
      'If you did not expect this invitation, ignore this message.',
    ].join('\n'),
  };
}

export type OutboxOutcome = { readonly status: 'sent' | 'pending' | 'failed'; readonly errorCode: string | null };

/**
 * Sends one invitation and returns what the outbox row must record. Never throws; the result carries no token and no provider
 * response body.
 */
export async function deliverInvitation(mailer: InvitationMailer, message: InvitationMessage): Promise<OutboxOutcome> {
  try {
    const result = await mailer.send({ to: message.to, ...renderInvitationEmail(message) });
    if (result.status === 'sent') return { status: 'sent', errorCode: null };
    if (result.status === 'not_configured') return { status: 'pending', errorCode: 'mailer_not_configured' };
    return { status: 'failed', errorCode: /^[a-z0-9_]{1,40}$/.test(result.code) ? result.code : 'mailer_error' };
  } catch {
    return { status: 'failed', errorCode: 'mailer_exception' };
  }
}

/** Safe description of a message for logs: no token, no full address. */
export function describeInvitationForLog(message: InvitationMessage): string {
  const [local = '', domain = ''] = message.to.split('@');
  return redactInviteToken(`invitation to ${local.slice(0, 1)}***@${domain} (${message.role}) for ${clean(message.organizationName, 60)}`);
}
