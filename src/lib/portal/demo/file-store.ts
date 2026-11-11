import 'server-only';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildSeedState, DEMO_STATE_VERSION } from './seed';
import type { DemoState, DemoStore } from './types';

/**
 * File-backed demo store: .demo-data/portal-demo.json under the project directory (git-ignored). Survives page refreshes and server restarts.
 * The state is cached in memory per server process (kept on globalThis so hot reloads do not lose it) and written through atomically on every change.
 * A missing, unreadable or outdated file is replaced by a fresh seed. resetDemoState() restores the seed on demand.
 */
const FILE = join(process.cwd(), '.demo-data', 'portal-demo.json');
const g = globalThis as unknown as { __portalDemoState?: DemoState };

function load(): DemoState {
  try {
    if (existsSync(FILE)) {
      const parsed = JSON.parse(readFileSync(FILE, 'utf8')) as DemoState;
      if (parsed && parsed.version === DEMO_STATE_VERSION && Array.isArray(parsed.orders) && Array.isArray(parsed.products)) return parsed;
    }
  } catch {
    /* unreadable file: fall through to a fresh seed */
  }
  const fresh = buildSeedState(); write(fresh); return fresh;
}
function write(state: DemoState): void {
  mkdirSync(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`; writeFileSync(tmp, JSON.stringify(state)); renameSync(tmp, FILE);
}

export const fileDemoStore: DemoStore = {
  get() { if (!g.__portalDemoState) g.__portalDemoState = load(); return g.__portalDemoState; },
  save() { write(this.get()); },
};

export function resetDemoState(): void {
  g.__portalDemoState = buildSeedState(); write(g.__portalDemoState);
}
