/**
 * HTML email templates for the "Get a plan" quiz. Table layout with inline styles only,
 * so they render in Gmail, Outlook and Apple Mail. All dynamic values must be passed through esc().
 */
const INK = '#0B0F14';
const TEAL = '#2BB0C0';
const MUTED = '#687582';
const LINE = '#E6EAF1';
const PAPER = '#F3F5FA';
const FONT = "'DM Sans',Arial,Helvetica,sans-serif";

export const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const shell = (preheader: string, inner: string, footer: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:${PAPER};font-family:${FONT};color:${INK}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="padding:0 4px 16px"><span style="font-size:20px;font-weight:600;letter-spacing:-0.04em;color:${INK}">99Purity <span style="font-weight:300;color:#6b7580">Wholesale</span></span></td></tr>
<tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:20px;padding:32px 30px">${inner}</td></tr>
<tr><td style="padding:16px 8px 0;font-size:11px;line-height:1.6;color:${MUTED};text-align:center">${footer}</td></tr>
</table></td></tr></table></body></html>`;

const rowsTable = (rows: Array<[string, string]>) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${LINE}">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:11px 14px 11px 0;border-bottom:1px solid ${LINE};width:140px;vertical-align:top;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED}">${esc(k)}</td><td style="padding:11px 0;border-bottom:1px solid ${LINE};font-size:14px;line-height:1.5">${esc(v).replace(/\n/g, '<br>')}</td></tr>`
    )
    .join('')}</table>`;

const button = (href: string, label: string, bg = INK, fg = '#ffffff') =>
  `<a href="${href}" style="display:inline-block;background:${bg};color:${fg};text-decoration:none;font-size:14px;font-weight:600;padding:13px 24px;border-radius:999px">${esc(label)}</a>`;

export interface PlanSummary {
  name: string;
  business: string;
  email: string;
  phone: string;
  building: string;
  services: string[];
  site: string;
  volume: string;
  timeline: string;
  notes: string;
  locale: 'en' | 'es';
}

/** To the team: who, what they want, and one-tap ways to reply. */
export function teamEmail(p: PlanSummary, whatsappNumber: string) {
  const wa = p.phone ? `https://wa.me/${p.phone.replace(/\D/g, '')}` : '';
  const inner = `
    <div style="display:inline-block;background:${TEAL}1f;color:#0B6F7B;border-radius:999px;padding:5px 12px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:600">New plan request</div>
    <h1 style="margin:16px 0 4px;font-size:26px;font-weight:400;letter-spacing:-0.035em;line-height:1.2">${esc(p.name)}${p.business ? ` <span style="color:${MUTED}">· ${esc(p.business)}</span>` : ''}</h1>
    <p style="margin:0 0 22px;font-size:13px;color:${MUTED}">Reply within one business day. ${p.email ? 'Replying to this email goes straight to the visitor.' : 'No email was given: contact them by phone or WhatsApp.'}</p>
    ${rowsTable([
      ['Email', p.email || '-'],
      ['WhatsApp / phone', p.phone || '-'],
      ['Building', p.building || '-'],
      ['Services', p.services.length ? p.services.join(', ') : '-'],
      ['Store today', p.site || '-'],
      ['Expected volume', p.volume || '-'],
      ['Start', p.timeline || '-'],
      ['Notes', p.notes || '-'],
      ['Language', p.locale === 'es' ? 'Spanish' : 'English'],
    ])}
    <div style="margin-top:26px">
      ${p.email ? button(`mailto:${esc(p.email)}`, 'Reply by email', INK) : ''}
      ${wa ? `&nbsp;&nbsp;${button(wa, 'Open WhatsApp', TEAL, INK)}` : ''}
    </div>`;
  return shell(`${p.name} sent a plan request`, inner, `Submitted via the "Get a plan" quiz on 99puritywholesale.com<br>Team WhatsApp: +${esc(whatsappNumber)}`);
}

const T = {
  en: {
    subject: 'We received your plan - 99 Purity Wholesale',
    pre: 'Thanks. Here is a copy of your plan.',
    hi: (n: string) => `Thanks, ${n}.`,
    lead: 'We have your plan. A member of our team will reply on the contact you gave us, usually within one business day.',
    copy: 'Your plan',
    next: 'What happens next',
    steps: ['We review what you selected.', 'We reply with options and, where relevant, wholesale tier details.', 'You decide what to start with. There is no obligation.'],
    cta: 'Message us on WhatsApp',
    foot: 'You are receiving this because you submitted a plan on 99puritywholesale.com. For laboratory research use only; supplied to licensed professionals.',
    labels: ['Building', 'Services', 'Store today', 'Expected volume', 'Start', 'Notes'],
    none: 'Not specified',
  },
  es: {
    subject: 'Recibimos su plan - 99 Purity Wholesale',
    pre: 'Gracias. Aquí tiene una copia de su plan.',
    hi: (n: string) => `Gracias, ${n}.`,
    lead: 'Recibimos su plan. Un miembro de nuestro equipo responderá al contacto que nos dio, normalmente en un día hábil.',
    copy: 'Su plan',
    next: 'Qué sigue',
    steps: ['Revisamos lo que seleccionó.', 'Respondemos con opciones y, si aplica, detalles de los niveles mayoristas.', 'Usted decide por dónde empezar. Sin compromiso.'],
    cta: 'Escríbanos por WhatsApp',
    foot: 'Recibe este mensaje porque envió un plan en 99puritywholesale.com. Solo para uso en investigación de laboratorio; suministrado a profesionales con licencia.',
    labels: ['Construyendo', 'Servicios', 'Tienda hoy', 'Volumen esperado', 'Inicio', 'Notas'],
    none: 'Sin especificar',
  },
} as const;

/** To the visitor: confirmation with a copy of their answers (in their language). */
export function visitorEmail(p: PlanSummary, localized: { building: string; services: string[]; site: string; volume: string; timeline: string }, whatsappNumber: string) {
  const t = T[p.locale];
  const v = (x: string) => x || t.none;
  const inner = `
    <h1 style="margin:0 0 10px;font-size:28px;font-weight:400;letter-spacing:-0.035em;line-height:1.2">${esc(t.hi(p.name))}</h1>
    <p style="margin:0 0 26px;font-size:15px;line-height:1.6;color:#3a4550">${esc(t.lead)}</p>
    <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED};margin-bottom:8px">${esc(t.copy)}</div>
    ${rowsTable([
      [t.labels[0], v(localized.building)],
      [t.labels[1], localized.services.length ? localized.services.join(', ') : t.none],
      [t.labels[2], v(localized.site)],
      [t.labels[3], v(localized.volume)],
      [t.labels[4], v(localized.timeline)],
      [t.labels[5], v(p.notes)],
    ])}
    <div style="margin:28px 0 8px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED}">${esc(t.next)}</div>
    ${t.steps.map((s, i) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:8px"><tr><td style="width:28px;vertical-align:top;font-size:12px;font-weight:600;color:#0B6F7B">0${i + 1}</td><td style="font-size:14px;line-height:1.5">${esc(s)}</td></tr></table>`).join('')}
    <div style="margin-top:26px">${button(`https://wa.me/${whatsappNumber}`, t.cta, TEAL, INK)}</div>`;
  return { subject: t.subject, html: shell(t.pre, inner, esc(t.foot)) };
}
