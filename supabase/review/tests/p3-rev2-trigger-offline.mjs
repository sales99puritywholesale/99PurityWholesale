import { readFileSync } from 'node:fs';
const src = readFileSync('D:/99puritywholesale-platform/99puritywholesale/supabase/review/tests/p3-workflow-rollback.rev2.mjs', 'utf8');
const lines = src.split('\n');
const pick = (start) => lines.find((l) => l.startsWith(start));
const code = [pick('const EXPECTED_TRIGGERS'), pick('export const trigParse'), pick('export const trigMatches')].map((l) => l.replace(/^export /, '')).join('\n') + '\nreturn { trigParse, trigMatches };';
const { trigMatches } = new Function(code)();
const mk = (tbl, tgname, def) => ({ tbl, tgname, tgenabled: 'O', fn: 'x', def });
const A = 'CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION private.handle_new_user()';
const B = 'CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at()';
const cases = [
  ['actual rows A (tbl auth.users)', mk('auth.users', 'on_auth_user_created', A), true],
  ['actual rows B (tbl printed as "profiles")', mk('profiles', 'profiles_touch', B), true],
  ['unexpected extra trigger on profiles', mk('profiles', 'evil_trg', B.replace('profiles_touch', 'evil_trg')), false],
  ['unexpected trigger on mfa_factors', mk('auth.mfa_factors', 'x', 'CREATE TRIGGER x AFTER INSERT ON auth.mfa_factors FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at()'), false],
  ['wrong schema (other.profiles)', mk('profiles', 'profiles_touch', B.replace('public.profiles', 'other.profiles')), false],
  ['wrong table (public.profiles_x)', mk('profiles', 'profiles_touch', B.replace('public.profiles', 'public.profiles_x')), false],
  ['wrong trigger name', mk('profiles', 'profiles_touch2', B), false],
  ['wrong function name', mk('profiles', 'profiles_touch', B.replace('touch_updated_at', 'other_fn')), false],
  ['wrong function schema', mk('profiles', 'profiles_touch', B.replace('private.touch', 'public.touch')), false],
  ['function with args', mk('profiles', 'profiles_touch', B.replace('touch_updated_at()', 'touch_updated_at(\'a\')')), false],
  ['right names, swapped table', mk('auth.users', 'profiles_touch', B.replace('public.profiles', 'auth.users')), false],
  ['unparseable def (fail closed)', mk('profiles', 'profiles_touch', 'garbage'), false],
  ['missing def (fail closed)', { tbl: 'profiles', tgname: 'profiles_touch', fn: 'private.touch_updated_at()' }, false],
  ['quoted identifiers (fail closed)', mk('profiles', 'profiles_touch', B.replace('public.profiles', '"public"."profiles"')), false],
];
let bad = 0;
for (const [n, t, want] of cases) { const got = trigMatches(t); const ok = got === want; if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}  (matches=${got}, expected ${want})`); }
console.log(bad === 0 ? `all ${cases.length} trigger cases pass` : `${bad} FAILED`);
process.exit(bad ? 1 : 0);
