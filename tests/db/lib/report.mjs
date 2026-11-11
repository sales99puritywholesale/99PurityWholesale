// Evidence notes (versions, observed behavior) written to tests/db/reports/notes.jsonl (git-ignored). Everything is redacted first.
// redact() is also used by the fail-closed scrub step before any report is uploaded.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*\b/g;
const KEY = /\bsb_(secret|publishable)_[A-Za-z0-9_-]+\b/g;
const B32 = /\b[A-Z2-7]{26,}\b/g;
const CONN = /\bpostgres(?:ql)?:\/\/[^\s:/@]+:[^\s@]+@/gi;
const BEARER = /\b(Bearer|apikey:?)\s+[A-Za-z0-9._~+/=-]{20,}/gi;

export function redact(s) {
  return String(s).replace(JWT, '<jwt>').replace(KEY, '<key>').replace(CONN, 'postgresql://<redacted>@')
    .replace(BEARER, '$1 <redacted>').replace(UUID, '<uuid>').replace(B32, '<b32>');
}

/** Patterns that must not survive scrubbing. Used as a post-condition check (fail closed). */
export const FORBIDDEN_AFTER_SCRUB = [
  /\beyJ[A-Za-z0-9_-]{10,}/, /\bsb_(secret|publishable)_/, /postgres(ql)?:\/\/[^\s<]+:[^\s@<]+@/i,
  /\bBearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]{20,}/i,
];

const dir = () => process.env.P2_DB_REPORT_DIR || join(process.cwd(), 'tests', 'db', 'reports');

export function note(key, value) {
  try {
    mkdirSync(dir(), { recursive: true });
    const v = typeof value === 'string' ? redact(value) : JSON.parse(redact(JSON.stringify(value)));
    appendFileSync(join(dir(), 'notes.jsonl'), JSON.stringify({ key, value: v }) + '\n');
  } catch { /* notes are best-effort evidence; never fail a test because of them */ }
}
