'use server';

import { headers } from 'next/headers';
import { Resend } from 'resend';
import { BUILD_OPTIONS, EN_LABELS, PLAN_SERVICES, PLAN_WHATSAPP, SITE_OPTIONS, TIMELINE_OPTIONS, VOLUME_OPTIONS } from '@/components/plan/plan-config';
import { teamEmail, visitorEmail } from '@/lib/emails/plan-email';
import { ES_LABELS } from '@/components/plan/plan-labels-es';

const resend = new Resend(process.env.RESEND_API_KEY);
const notificationEmails = (process.env.NOTIFICATION_EMAIL || 'sales@99puritywholesale.com,kylefbelk@gmail.com')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);
const senderEmail = process.env.SENDER_EMAIL || 'onboarding@resend.dev';

export interface PlanPayload {
  build?: string;
  services?: string[];
  site?: string;
  volume?: string;
  timeline?: string;
  notes?: string;
  name?: string;
  business?: string;
  email?: string;
  phone?: string;
  locale?: string;
  /** honeypot: real visitors never fill this */
  website?: string;
}

export type PlanResult = { success: true } | { success: false; error: 'invalid' | 'rate' | 'config' | 'send' };

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const oneOf = (v: unknown, list: readonly string[]) => (typeof v === 'string' && list.includes(v) ? v : '');
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const phoneOk = (v: string) => v.replace(/\D/g, '').length >= 7;

// best-effort limiter (per server instance): 5 plans per IP per 10 minutes
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (recent.length >= 5) return true;
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 500) hits.clear();
  return false;
}

export async function submitPlan(input: PlanPayload): Promise<PlanResult> {
  try {
    if (input?.website) return { success: true }; // honeypot: pretend it worked

    const name = clip(input?.name, 120);
    const email = clip(input?.email, 160);
    const phone = clip(input?.phone, 40);
    const business = clip(input?.business, 160);
    const notes = clip(input?.notes, 600);
    const services = Array.isArray(input?.services) ? input.services.filter((s) => PLAN_SERVICES.includes(s as never)).slice(0, 20) : [];
    const build = oneOf(input?.build, BUILD_OPTIONS);
    const site = oneOf(input?.site, SITE_OPTIONS);
    const volume = oneOf(input?.volume, VOLUME_OPTIONS);
    const timeline = oneOf(input?.timeline, TIMELINE_OPTIONS);
    const locale = input?.locale === 'es' ? 'es' : 'en';

    if (!name || (!emailOk(email) && !phoneOk(phone))) return { success: false, error: 'invalid' };

    const h = await headers();
    const ip = (h.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    if (limited(ip)) return { success: false, error: 'rate' };

    if (!process.env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY environment variable is not defined.');
      return { success: false, error: 'config' };
    }

    const L = EN_LABELS;
    const summary = {
      name, business, email, phone, notes, locale: locale as 'en' | 'es',
      building: build ? L.build[build] : '',
      services: services.map((x) => L.services[x]),
      site: site ? L.site[site] : '',
      volume: volume ? L.volume[volume] : '',
      timeline: timeline ? L.timeline[timeline] : '',
    };

    const res = await resend.emails.send({
      from: `99 Purity Wholesale Leads <${senderEmail}>`,
      to: notificationEmails,
      ...(emailOk(email) ? { replyTo: email } : {}),
      subject: `New plan request - ${name}${services.length ? ` (${services.length} services)` : ''}`,
      html: teamEmail(summary, PLAN_WHATSAPP),
    });
    if (res.error) {
      console.error('Resend plan email error:', res.error);
      return { success: false, error: 'send' };
    }
    // Confirmation to the visitor. Best effort: a failure here never fails the request.
    if (emailOk(email)) {
      try {
        const X = locale === 'es' ? ES_LABELS : L;
        const c = visitorEmail(summary, { building: build ? X.build[build] : '', services: services.map((x) => X.services[x]), site: site ? X.site[site] : '', volume: volume ? X.volume[volume] : '', timeline: timeline ? X.timeline[timeline] : '' }, PLAN_WHATSAPP);
        const r2 = await resend.emails.send({ from: `99 Purity Wholesale <${senderEmail}>`, to: [email], replyTo: notificationEmails[0], subject: c.subject, html: c.html });
        if (r2.error) console.error('Resend visitor confirmation error:', r2.error);
      } catch (err) {
        console.error('Visitor confirmation failed:', err);
      }
    }
    return { success: true };
  } catch (e) {
    console.error('Plan submission error:', e);
    return { success: false, error: 'send' };
  }
}
