// Pure module (no server imports): the e-mail dispatch loop and the provider interface. NO provider is wired: getEmailAdapter() returns null until a provider is configured
// (a later task; the sender itself is only an interface here). The loop never throws and never leaves a message claimed without trying to record what happened.
export type OutboundEmail = { readonly id: string; readonly to: string; readonly subject: string; readonly body: string };
export type SendResult = { readonly ok: true; readonly providerRef?: string } | { readonly ok: false; readonly error: string };
export interface EmailAdapter {
  readonly name: string;
  send(message: OutboundEmail): Promise<SendResult>;
}

/** The provider is chosen by configuration. None is wired yet, so this is always null and dispatching is a no-op that says so. */
export function getEmailAdapter(): EmailAdapter | null {
  return null;
}

/** unsent = failed attempts (the database decides between a retry and a final failure from the attempt count). recordFailures = results that could not be written back. */
export type DispatchSummary = { readonly claimed: number; readonly sent: number; readonly unsent: number; readonly recordFailures: number };

export async function dispatchOutbox(
  adapter: EmailAdapter,
  claim: () => Promise<readonly OutboundEmail[] | null>,
  record: (id: string, result: SendResult) => Promise<boolean>,
): Promise<DispatchSummary> {
  const batch = await claim();
  const out = { claimed: batch?.length ?? 0, sent: 0, unsent: 0, recordFailures: 0 };
  for (const msg of batch ?? []) {
    let result: SendResult;
    try {
      result = await adapter.send(msg);
    } catch {
      result = { ok: false, error: 'send failed' };
    }
    if (!(await record(msg.id, result))) out.recordFailures += 1;
    else if (result.ok) out.sent += 1;
    else out.unsent += 1;
  }
  return out;
}
