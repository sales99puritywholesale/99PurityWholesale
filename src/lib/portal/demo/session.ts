import 'server-only';
import { cookies } from 'next/headers';
import { DEMO_COOKIE, isDemoMode, personaById, type DemoPersona } from './config';

/** The demo persona of this request (from the demo cookie), or null. Only ever non-null when demo mode is on, which can never be the case in a production build. */
export function getDemoPersona(): DemoPersona | null {
  if (!isDemoMode()) return null;
  return personaById(cookies().get(DEMO_COOKIE)?.value);
}
