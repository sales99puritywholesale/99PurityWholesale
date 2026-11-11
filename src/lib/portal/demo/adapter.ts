import 'server-only';
import { DemoCommerce } from './engine';
import { fileDemoStore } from './file-store';
import { getDemoPersona } from './session';

/** The demo repository for the CURRENT request: the engine bound to the file store and to the signed-in demo persona (no persona: every operation answers as an unauthenticated caller). */
export function demoRepo(): DemoCommerce {
  const p = getDemoPersona();
  return new DemoCommerce(fileDemoStore, { userId: p?.id ?? '00000000-0000-4000-8000-000000000000', kind: p?.kind ?? 'customer' });
}
