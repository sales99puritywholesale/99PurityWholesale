import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = fileURLToPath(new URL('./src', import.meta.url));
const serverOnlyStub = fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url));

// Fixture RENDER tests (tests/render): server-render portal pages to static HTML with mocked data. No browser, no database, no network.
// A separate config because these files contain JSX (the main unit-test config does not transform it).
export default defineConfig({
  // Vite 8 transforms TypeScript with oxc; tsconfig has jsx: preserve (Next.js), so the automatic runtime is selected here
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: [
      { find: '@', replacement: src },
      { find: 'server-only', replacement: serverOnlyStub },
    ],
  },
  test: { environment: 'node', include: ['tests/render/**/*.test.tsx'], clearMocks: true, restoreMocks: true },
});
