/**
 * Pure models for the rev7 corrections of migration 0005 (review draft; NOT applied; NEVER parsed by PostgreSQL; rev6 and earlier are preserved unchanged, see owner-rev6.ts).
 * The database is authoritative; these models only document the intended rules and let tests/portal/owner-rev7.test.ts state them executably. No I/O, no service-role client, no environment access.
 * Nothing here proves PostgreSQL behavior.
 */

// ---------------------------------------------------------------------------------------------------------------- F1: the factor limit counts LIVE approved factors
export const MAX_LIVE_APPROVED_FACTORS = 3;

/** Approved rows whose factor the database reads as verified now. `verifiedIds === null` is UNKNOWN (never zero). */
export function liveApprovedFactorCount(approvedIds: readonly string[], verifiedIds: readonly string[] | null): number | null {
  if (verifiedIds === null) return null;
  const live = new Set(verifiedIds);
  return approvedIds.filter((id) => live.has(id)).length;
}

/** rev6 (defect): the lifetime count of every approval ever recorded. Kept only so the tests can demonstrate the dead end. */
export const lifetimeFactorLimitOkRev6 = (approvedIds: readonly string[]): boolean => approvedIds.length < MAX_LIVE_APPROVED_FACTORS;

/** rev7: another approval is allowed only while fewer than three approved factors are live; unknown refuses. */
export function factorLimitOk(approvedIds: readonly string[], verifiedIds: readonly string[] | null): boolean {
  const n = liveApprovedFactorCount(approvedIds, verifiedIds);
  return n !== null && n < MAX_LIVE_APPROVED_FACTORS;
}

// ---------------------------------------------------------------------------------------------------------------- F2: deparse-dependent assertions
/** Lower-case and collapse whitespace: the normalization every rev7 self-check assertion on catalog text is equivalent to (they use ~* / ilike). */
export const normalizeDeparse = (text: string): string => text.replace(/\s+/g, ' ').trim().toLowerCase();

/** The assertion of the rev7 self-check on the five-window constraint, applied to any plausible rendering of pg_get_constraintdef (UPPER or lower case, casts, spacing). */
export function windowsBoundedDefinitionOk(def: string): boolean {
  const n = normalizeDeparse(def);
  return /windows_issued\)?(::[a-z0-9 ]+)? <= 5/.test(n) && /greatest\s*\(/.test(n) && /extra_windows_granted/.test(n);
}

/** rev6 (defect): the case-sensitive assertion that rejects PostgreSQL's own output (GREATEST in upper case). */
export const windowsBoundedDefinitionOkRev6 = (def: string): boolean => def.includes('windows_issued <= 5') && def.includes('greatest');

// ---------------------------------------------------------------------------------------------------------------- F3: the stranded anchor
export interface RecoveryRequestFact {
  id: string;
  status: 'awaiting_approval' | 'pending' | 'cancelled' | 'completed' | 'expired';
  createdAt: number;
  factorsRemovedAt: number | null;
  completedAt: number | null;
  /** ordered_at of every removal order of this request (any status) */
  orderedAts: readonly number[];
}
export const STRANDED_LOOKBACK_MS = 30 * 24 * 3600 * 1000;

/**
 * The request with the LATEST database-observed removal evidence, or null. Only meaningful when the owner's factor state is 'recovery_required' (no verified factor exists, so every ordered removal
 * happened) and no request is open. A later request that ended without evidence never changes the anchor; a request completed after the evidence ends the stranded state.
 */
export function strandedAnchor(state: string, requests: readonly RecoveryRequestFact[], now: number): string | null {
  if (state !== 'recovery_required') return null;
  if (requests.some((r) => r.status === 'awaiting_approval' || r.status === 'pending')) return null;
  const cands = requests
    .filter((r) => r.status === 'cancelled' || r.status === 'expired')
    .map((r) => ({ r, ev: r.factorsRemovedAt ?? (r.orderedAts.length ? Math.max(...r.orderedAts) : null) }))
    .filter((x): x is { r: RecoveryRequestFact; ev: number } => x.ev !== null && x.ev > now - STRANDED_LOOKBACK_MS)
    .filter((x) => !requests.some((c) => c.status === 'completed' && c.completedAt !== null && c.completedAt > x.ev))
    .sort((a, b) => b.ev - a.ev || b.r.createdAt - a.r.createdAt || (a.r.id < b.r.id ? 1 : -1));
  return cands[0]?.r.id ?? null;
}

/** rev6 (defect): only the owner's single latest request, and only with a marker. */
export function strandedAnchorRev6(state: string, requests: readonly RecoveryRequestFact[], now: number): string | null {
  if (state !== 'recovery_required' || requests.some((r) => r.status === 'awaiting_approval' || r.status === 'pending')) return null;
  const latest = [...requests].sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!latest || !(latest.status === 'cancelled' || latest.status === 'expired') || latest.factorsRemovedAt === null || latest.factorsRemovedAt <= now - STRANDED_LOOKBACK_MS) return null;
  return latest.id;
}

// ---------------------------------------------------------------------------------------------------------------- F4: bounded extension paths
export type ExtensionPath = 'verified_removal' | 'no_show' | null;

/** The fifth window (and any extension after a verified removal) needs a verified removal; the fourth also has the no-show path. Never more than five windows in total. */
export function extensionPath(windowsIssued: number, extraGranted: number, anyVerifiedRemoval: boolean): ExtensionPath {
  if (windowsIssued < 3 || windowsIssued >= 5 || extraGranted >= 2) return null;
  if (anyVerifiedRemoval) return 'verified_removal';
  return windowsIssued === 3 && extraGranted === 0 ? 'no_show' : null;
}

// ---------------------------------------------------------------------------------------------------------------- F5: unrecognized factor rows
export type FactorRowClass = 'recognized' | 'unrecognized' | 'other_owner' | 'absent' | null;
export const RECOGNIZED_STATUSES = ['verified', 'unverified'] as const;
export const RECOGNIZED_TYPES = ['totp', 'phone', 'webauthn'] as const;

/** What the database reads for one factor row of one user. null = unknown (structure check absent or stale). */
export function classifyFactorRow(structureOk: boolean, row: { userId: string; status: string | null; type: string | null } | 'other_owner' | 'absent'): FactorRowClass {
  if (!structureOk) return null;
  if (row === 'absent' || row === 'other_owner') return row;
  return row.status !== null && row.type !== null && (RECOGNIZED_STATUSES as readonly string[]).includes(row.status) && (RECOGNIZED_TYPES as readonly string[]).includes(row.type) ? 'recognized' : 'unrecognized';
}
export type UnrecognizedBeginCode = 'order_created' | 'structure_check_required' | 'unknown_state' | 'factor_recognized' | 'factor_not_found';
/** Only an 'unrecognized' row of exactly this owner may be ordered; a recognized (verified) factor follows the window workflow; other owners' rows are not disclosed. */
export function unrecognizedBeginCode(structureOk: boolean, cls: FactorRowClass): UnrecognizedBeginCode {
  if (!structureOk) return 'structure_check_required';
  if (cls === null) return 'unknown_state';
  if (cls === 'unrecognized') return 'order_created';
  return cls === 'recognized' ? 'factor_recognized' : 'factor_not_found';
}
/** Completion only when the database reads the row as absent. */
export const unrecognizedCompletionOk = (cls: FactorRowClass): boolean => cls === 'absent';

// ---------------------------------------------------------------------------------------------------------------- F7: the structure-check refresh
export const STRUCTURE_REFRESH_PASSED_MIN_AGE_HOURS = 12;
export const STRUCTURE_REFRESH_ANY_MIN_AGE_MINUTES = 15;
export const STRUCTURE_REFRESH_PER_USER_PER_HOUR = 6;
export type RefreshCode = 'not_available' | 'rate_limited' | 'not_needed' | 'refreshed';
export interface RefreshInput {
  caller: 'active_staff' | 'active_owner' | 'other';
  userHitsThisHour: number;
  /** age of the newest PASSED check in hours, null if none */
  passedAgeHours: number | null;
  /** age of the newest check of ANY outcome in minutes, null if none */
  anyAgeMinutes: number | null;
}
/** The decision the RPC takes. The result of a run is computed from the catalogs by the database; nothing the caller sends can influence it (the RPC has no parameter). */
export function refreshDecision(i: RefreshInput): RefreshCode {
  if (i.caller === 'other') return 'not_available';
  if (i.userHitsThisHour >= STRUCTURE_REFRESH_PER_USER_PER_HOUR) return 'rate_limited';
  const fresh = (i.passedAgeHours !== null && i.passedAgeHours < STRUCTURE_REFRESH_PASSED_MIN_AGE_HOURS) || (i.anyAgeMinutes !== null && i.anyAgeMinutes < STRUCTURE_REFRESH_ANY_MIN_AGE_MINUTES);
  return fresh ? 'not_needed' : 'refreshed';
}
/** A refresh can never replace a passing check younger than 12 hours, so a fresh pass cannot be downgraded by a caller. */
export const refreshMayReplacePass = (passedAgeHours: number): boolean => passedAgeHours >= STRUCTURE_REFRESH_PASSED_MIN_AGE_HOURS;
