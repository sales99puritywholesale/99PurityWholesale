'use client';

import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslations } from 'next-intl';
import { AppWindow, ArrowLeft, ArrowRight, CalendarClock, Check, Compass, CreditCard, FlaskConical, Hourglass, LayoutTemplate, MessageCircle, Mail, Package, RefreshCw, Rocket, TrendingUp, X, Code, Ban } from 'lucide-react';
import { registerGsap, MOTION_OK } from '../home/gsap-setup';
import { usePlan, type PlanAnswers } from './PlanContext';
import { BUILD_OPTIONS, EN_LABELS, PLAN_EMAIL, PLAN_PHONE_DISPLAY, PLAN_SERVICES, PLAN_STEPS, PLAN_WHATSAPP, SITE_OPTIONS, TIMELINE_OPTIONS, VOLUME_OPTIONS } from './plan-config';

type Icon = ComponentType<{ className?: string }>;
type OptionStep = 'build' | 'site' | 'volume' | 'timeline';

const OPTION_STEPS: Record<OptionStep, { options: readonly string[]; icons: Record<string, Icon> }> = {
  build: { options: BUILD_OPTIONS, icons: { launch: FlaskConical, scale: TrendingUp, other: AppWindow, payments: CreditCard } },
  site: { options: SITE_OPTIONS, icons: { none: Ban, platform: LayoutTemplate, custom: Code, redesign: RefreshCw } },
  volume: { options: VOLUME_OPTIONS, icons: { starter: Package, tier1: Package, tier2: Package, tier3: Package, unsure: Compass } },
  timeline: { options: TIMELINE_OPTIONS, icons: { asap: Rocket, weeks: CalendarClock, months: Hourglass, exploring: Compass } },
};

const emailOk = (v?: string) => !!v && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
const phoneOk = (v?: string) => !!v && v.replace(/\D/g, '').length >= 7;

/** Builds the plain-text summary the team receives (always in English). */
function buildMessage(a: PlanAnswers, services: string[], locale: string) {
  const L = EN_LABELS;
  const lines = [
    'New plan request - 99 Purity Wholesale',
    '',
    `Name: ${a.name?.trim() || '-'}`,
    a.business?.trim() ? `Business: ${a.business.trim()}` : null,
    a.email?.trim() ? `Email: ${a.email.trim()}` : null,
    a.phone?.trim() ? `WhatsApp / phone: ${a.phone.trim()}` : null,
    '',
    `Building: ${a.build ? L.build[a.build] : '-'}`,
    `Services: ${services.length ? services.map((s) => L.services[s]).join(', ') : '-'}`,
    `Store today: ${a.site ? L.site[a.site] : '-'}`,
    `Expected volume: ${a.volume ? L.volume[a.volume] : '-'}`,
    `Start: ${a.timeline ? L.timeline[a.timeline] : '-'}`,
    a.notes?.trim() ? `Notes: ${a.notes.trim()}` : null,
    '',
    `(Sent from the website, language: ${locale})`,
  ];
  return lines.filter((l) => l !== null).join('\n');
}

export default function PlanModal({ locale }: { locale: string }) {
  const tp = useTranslations('Plan');
  const ta = useTranslations('Index.ServicesAtlas');
  const { open, step, done, services, answers, closePlan, setStep, setDone, toggleService, setAnswer, reset } = usePlan();
  const content = useRef<HTMLDivElement>(null);
  const [errors, setErrors] = useState<{ name?: boolean; contact?: boolean }>({});

  const total = PLAN_STEPS.length;
  const key = PLAN_STEPS[step];

  // keep the page (and smooth scroller) still while the dialog is open
  useEffect(() => {
    if (!open) return;
    const lenis = (window as unknown as { lenis?: { stop: () => void; start: () => void } }).lenis;
    lenis?.stop();
    return () => lenis?.start();
  }, [open]);

  // stagger the cards in on every step
  useEffect(() => {
    if (!open) return;
    const el = content.current;
    if (!el) return;
    const { gsap } = registerGsap();
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      gsap.fromTo(el.querySelectorAll('[data-opt]'), { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.06, ease: 'power3.out', clearProps: 'transform,opacity,visibility' });
    });
    return () => mm.revert();
  }, [open, step, done]);

  const message = useMemo(() => buildMessage(answers, services, locale), [answers, services, locale]);
  const serviceLabel = (k: string) => (k === 'supply' ? tp('services.supply') : ta(`items.${k}.name`));

  const advance = () => setStep(Math.min(total - 1, step + 1));
  const pick = (stepKey: OptionStep, value: string) => {
    setAnswer(stepKey, value);
    window.setTimeout(advance, 220);
  };

  const submit = () => {
    const nameBad = !answers.name?.trim();
    const contactBad = !emailOk(answers.email) && !phoneOk(answers.phone);
    setErrors({ name: nameBad, contact: contactBad });
    if (!nameBad && !contactBad) setDone(true);
  };

  const card = 'group flex flex-col items-start gap-3 rounded-2xl border border-[#0B0F14]/10 bg-gradient-to-b from-white to-[#F6F8FB] p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-[#2BB0C0]/60 hover:shadow-[0_14px_34px_rgba(11,15,20,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2BB0C0]';
  const input = 'w-full rounded-xl border border-[#0B0F14]/15 bg-white px-4 py-3 text-[14px] outline-none transition-colors placeholder:text-[#0B0F14]/35 focus:border-[#2BB0C0] focus:ring-2 focus:ring-[#2BB0C0]/25';

  const renderOptionStep = (stepKey: OptionStep) => {
    const cfg = OPTION_STEPS[stepKey];
    return (
      <div className={`grid gap-3 sm:grid-cols-2 ${cfg.options.length === 5 ? '[&>*:last-child]:sm:col-span-2' : ''}`}>
        {cfg.options.map((o) => {
          const I = cfg.icons[o];
          const on = answers[stepKey] === o;
          return (
            <button key={o} type="button" data-opt="" onClick={() => pick(stepKey, o)} aria-pressed={on} className={`${card} ${on ? '!border-[#2BB0C0] !bg-[#2BB0C0]/10' : ''}`}>
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg border ${on ? 'border-[#2BB0C0] bg-[#2BB0C0] text-white' : 'border-[#2BB0C0]/30 bg-[#2BB0C0]/10 text-[#0B6F7B]'}`}>
                <I className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-[14px] font-medium leading-snug tracking-[-0.01em]">{tp(`steps.${stepKey}.options.${o}.t`)}</span>
                <span className="mt-1 block text-[12px] leading-snug text-[#0B0F14]/55">{tp(`steps.${stepKey}.options.${o}.d`)}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  const wa = `https://wa.me/${PLAN_WHATSAPP}?text=${encodeURIComponent(message)}`;
  const mail = `mailto:${PLAN_EMAIL}?subject=${encodeURIComponent('Plan request - 99 Purity Wholesale')}&body=${encodeURIComponent(message)}`;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && closePlan()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-[#0B0F14]/45 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <Dialog.Content
          ref={content}
          data-lenis-prevent
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[91] max-h-[calc(100svh-24px)] w-[calc(100vw-24px)] max-w-[600px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[1.75rem] border border-[#0B0F14]/8 bg-white p-6 font-dm-sans text-[#0B0F14] shadow-[0_40px_120px_rgba(11,15,20,0.35)] focus:outline-none md:p-8"
        >
          {/* header */}
          <div className="flex items-center justify-between gap-4">
            <Dialog.Title className="text-[13px]">
              <span className="font-medium">{tp('title')}</span>
              <span className="text-[#0B0F14]/50"> · {tp('aboutMinute')}</span>
            </Dialog.Title>
            <div className="flex items-center gap-3">
              {!done && (
                <span className="font-dm-mono text-[11px] tracking-[0.18em] text-[#0B6F7B]">
                  {String(step + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
                </span>
              )}
              <Dialog.Close aria-label={tp('close')} className="flex h-8 w-8 items-center justify-center rounded-full text-[#0B0F14]/55 transition-colors hover:bg-[#0B0F14]/8 hover:text-[#0B0F14]">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
          </div>
          <div className="mt-3 h-[2px] w-full rounded-full bg-[#0B0F14]/10">
            <div className="h-full rounded-full bg-[#2BB0C0] transition-[width] duration-500 ease-out" style={{ width: `${done ? 100 : ((step + 1) / total) * 100}%` }} />
          </div>

          {/* body */}
          {done ? (
            <div className="pt-8">
              <h3 className="text-[1.6rem] font-light leading-tight tracking-[-0.035em] md:text-[1.9rem]">{tp('result.title')}</h3>
              <p className="mt-1.5 text-[13px] text-[#0B0F14]/55">{tp('result.sub')}</p>

              <dl data-opt="" className="mt-6 space-y-2.5 rounded-2xl border border-[#0B0F14]/10 bg-[#F6F8FB] p-4 text-[13px]">
                {[
                  [tp('result.building'), answers.build ? tp(`steps.build.options.${answers.build}.t`) : null],
                  [tp('result.services'), services.length ? services.map(serviceLabel).join(', ') : tp('result.noServices')],
                  [tp('result.site'), answers.site ? tp(`steps.site.options.${answers.site}.t`) : null],
                  [tp('result.volume'), answers.volume ? tp(`steps.volume.options.${answers.volume}.t`) : null],
                  [tp('result.timeline'), answers.timeline ? tp(`steps.timeline.options.${answers.timeline}.t`) : null],
                  [tp('result.notes'), answers.notes?.trim() || null],
                ]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k as string} className="grid grid-cols-[110px_1fr] gap-3">
                      <dt className="font-dm-mono text-[10px] uppercase tracking-[0.14em] text-[#0B0F14]/45">{k}</dt>
                      <dd className="leading-snug">{v}</dd>
                    </div>
                  ))}
              </dl>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <a data-opt="" href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-full bg-[#2BB0C0] px-5 py-3.5 text-[13px] font-medium text-[#0B0F14] transition-colors hover:bg-[#4FC3D0]">
                  <MessageCircle className="h-4 w-4" />
                  {tp('result.whatsapp')}
                </a>
                <a data-opt="" href={mail} className="flex items-center justify-center gap-2 rounded-full bg-[#0B0F14] px-5 py-3.5 text-[13px] font-medium text-white transition-colors hover:bg-[#1b232d]">
                  <Mail className="h-4 w-4" />
                  {tp('result.email')}
                </a>
              </div>
              <button type="button" onClick={reset} className="mt-4 text-[12px] text-[#0B0F14]/55 underline underline-offset-4 hover:text-[#0B0F14]">
                {tp('result.again')}
              </button>
            </div>
          ) : (
            <div key={key} className="pt-8">
              <h3 className="text-[1.6rem] font-light leading-tight tracking-[-0.035em] md:text-[1.9rem]">{tp(`steps.${key}.title`)}</h3>
              {key !== 'contact' && <p className="mb-6 mt-1.5 text-[13px] text-[#0B0F14]/55">{tp(`steps.${key}.sub`)}</p>}

              {(key === 'build' || key === 'site' || key === 'volume' || key === 'timeline') && renderOptionStep(key)}

              {key === 'services' && (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {PLAN_SERVICES.map((s) => {
                    const on = services.includes(s);
                    return (
                      <button key={s} type="button" data-opt="" aria-pressed={on} onClick={() => toggleService(s)} className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-[13px] transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2BB0C0] ${on ? 'border-[#2BB0C0] bg-[#2BB0C0]/10' : 'border-[#0B0F14]/10 bg-white hover:border-[#2BB0C0]/60'}`}>
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${on ? 'border-[#2BB0C0] bg-[#2BB0C0] text-white' : 'border-[#0B0F14]/20'}`}>{on && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                        {serviceLabel(s)}
                      </button>
                    );
                  })}
                </div>
              )}

              {key === 'notes' && <textarea value={answers.notes ?? ''} onChange={(e) => setAnswer('notes', e.target.value)} rows={5} maxLength={600} placeholder={tp('steps.notes.placeholder')} className={`${input} resize-none`} />}

              {key === 'contact' && (
                <>
                  <p className="mb-5 mt-1.5 text-[13px] text-[#0B0F14]/55">{tp('steps.contact.sub')}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-1">
                      <input value={answers.name ?? ''} onChange={(e) => setAnswer('name', e.target.value)} autoComplete="name" placeholder={tp('steps.contact.name')} aria-invalid={errors.name} className={`${input} ${errors.name ? '!border-[#d92d20]' : ''}`} />
                      {errors.name && <p className="mt-1.5 text-[11.5px] text-[#d92d20]">{tp('steps.contact.errName')}</p>}
                    </div>
                    <input value={answers.business ?? ''} onChange={(e) => setAnswer('business', e.target.value)} autoComplete="organization" placeholder={tp('steps.contact.business')} className={input} />
                    <input value={answers.email ?? ''} onChange={(e) => setAnswer('email', e.target.value)} type="email" autoComplete="email" placeholder={tp('steps.contact.email')} aria-invalid={errors.contact} className={`${input} ${errors.contact ? '!border-[#d92d20]' : ''}`} />
                    <input value={answers.phone ?? ''} onChange={(e) => setAnswer('phone', e.target.value)} type="tel" autoComplete="tel" placeholder={tp('steps.contact.phone')} aria-invalid={errors.contact} className={`${input} ${errors.contact ? '!border-[#d92d20]' : ''}`} />
                  </div>
                  {errors.contact && <p className="mt-2 text-[11.5px] text-[#d92d20]">{tp('steps.contact.errContact')}</p>}
                </>
              )}

              {/* actions */}
              {(key === 'services' || key === 'notes' || key === 'contact' || step > 0) && (
                <div className="mt-7 flex items-center justify-between gap-3">
                  {step > 0 ? (
                    <button type="button" onClick={() => setStep(step - 1)} className="flex items-center gap-2 rounded-full px-3 py-2 text-[13px] text-[#0B0F14]/60 transition-colors hover:bg-[#0B0F14]/6 hover:text-[#0B0F14]">
                      <ArrowLeft className="h-3.5 w-3.5" />
                      {tp('back')}
                    </button>
                  ) : (
                    <span />
                  )}
                  <div className="flex items-center gap-2">
                    {key === 'notes' && !answers.notes?.trim() && (
                      <button type="button" onClick={advance} className="rounded-full px-4 py-2.5 text-[13px] text-[#0B0F14]/60 transition-colors hover:text-[#0B0F14]">
                        {tp('skip')}
                      </button>
                    )}
                    {(key === 'services' || key === 'notes') && (
                      <button type="button" onClick={advance} className="flex items-center gap-2 rounded-full bg-[#0B0F14] px-6 py-3 text-[13px] font-medium text-white transition-colors hover:bg-[#1b232d]">
                        {tp('next')}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {key === 'contact' && (
                      <button type="button" onClick={submit} className="flex items-center gap-2 rounded-full bg-[#2BB0C0] px-6 py-3 text-[13px] font-medium text-[#0B0F14] transition-colors hover:bg-[#4FC3D0]">
                        {tp('send')}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* footer */}
          <div className="mt-7 flex flex-wrap items-center justify-between gap-2 border-t border-[#0B0F14]/10 pt-4 text-[12px] text-[#0B0F14]/55">
            <span>{tp('questions')}</span>
            <a href={`https://wa.me/${PLAN_WHATSAPP}`} target="_blank" rel="noopener noreferrer" className="text-[#0B0F14] hover:text-[#0B6F7B]">
              {tp('whatsappUs')} <span className="font-medium">{PLAN_PHONE_DISPLAY}</span>
            </a>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
