import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = fileURLToPath(new URL('./src', import.meta.url));
const serverOnlyStub = fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url));

// Unit tests only (no browser, no database, no network). Kept isolated from the Next.js build.
export default defineConfig({
  resolve: {
    alias: [
      { find: '@', replacement: src },
      // The real "server-only" package throws outside the React server condition; tests import server modules directly.
      { find: 'server-only', replacement: serverOnlyStub },
    ],
  },
  test: {
    // next-intl's ESM build imports "next/navigation" without a file extension, which plain Node ESM cannot resolve.
    // Inlining lets Vite resolve it (the middleware test imports the real routing module).
    server: { deps: { inline: [/next-intl/] } },
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
});
