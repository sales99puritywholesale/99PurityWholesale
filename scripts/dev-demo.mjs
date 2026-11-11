// Starts the Next.js dev server in PORTAL DEMO MODE: sample data in .demo-data/ (git-ignored) and a persona picker instead of the database sign-in.
// Localhost demonstration only: demo mode is refused by the application in any production build (NODE_ENV=production). Nothing here touches Supabase or any external service.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const next = require.resolve('next/dist/bin/next');
const child = spawn(process.execPath, [next, 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, PORTAL_ENABLED: 'true', PORTAL_DEMO_MODE: 'true', NODE_ENV: 'development' },
});
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
