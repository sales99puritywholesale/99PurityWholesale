'use server';

import { headers } from 'next/headers';
import { Resend } from 'resend';
import { BUILD_OPTIONS, EN_LABELS, PLAN_SERVICES, SITE_OPTIONS, TIMELINE_OPTIONS, VOLUME_OPTIONS } from '@/components/plan/plan-config';

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
    const rows: Array<[string, string]> = [
      ['Name', name],
      ['Business', business || '-'],
      ['Email', email || '-'],
      ['WhatsApp / phone', phone || '-'],
      ['Building', build ? L.build[build] : '-'],
      ['Services', services.length ? services.map((s) => L.services[s]).join(', ') : '-'],
      ['Store today', site ? L.site[site] : '-'],
      ['Expected volume', volume ? L.volume[volume] : '-'],
      ['Start', timeline ? L.timeline[timeline] : '-'],
      ['Notes', notes || '-'],
      ['Language', locale],
    ];

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0B0F14">
      <h2 style="margin:0 0 16px">New plan request</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${rows.map(([k, v]) => `<tr><td style="padding:8px 12px 8px 0;border-bottom:1px solid #e6eaf1;color:#687582;width:150px;vertical-align:top">${k}</td><td style="padding:8px 0;border-bottom:1px solid #e6eaf1">${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('')}
      </table>
      <p style="font-size:12px;color:#687582;margin-top:16px">Submitted via the "Get a plan" quiz on 99puritywholesale.com</p></div>`;

    const res = await resend.emails.send({
      from: `99 Purity Wholesale Leads <${senderEmail}>`,
      to: notificationEmails,
      ...(emailOk(email) ? { replyTo: email } : {}),
      subject: `New plan request - ${name}${services.length ? ` (${services.length} services)` : ''}`,
      html,
    });
    if (res.error) {
      console.error('Resend plan email error:', res.error);
      return { success: false, error: 'send' };
    }
    return { success: true };
  } catch (e) {
    console.error('Plan submission error:', e);
    return { success: false, error: 'send' };
  }
}
