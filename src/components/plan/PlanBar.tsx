'use client';

import { useTranslations } from 'next-intl';
import { ArrowRight, X } from 'lucide-react';
import { usePlan } from './PlanContext';

/** "Your plan" summary strip shown under the services list. */
export default function PlanBar() {
  const tp = useTranslations('Plan');
  const ta = useTranslations('Index.ServicesAtlas');
  const { services, toggleService, setServices, openPlan } = usePlan();
  const name = (k: string) => (k === 'supply' ? tp('services.supply') : ta(`items.${k}.name`));

  return (
    <div className="mt-8 flex flex-col gap-5 rounded-[1.25rem] border border-[#2BB0C0]/40 bg-[#2BB0C0]/[0.07] p-5 md:flex-row md:items-center md:justify-between md:p-6 lg:mt-12">
      <div className="min-w-0">
        <div className="mb-2 font-dm-mono text-[10px] uppercase tracking-[0.2em] text-[#0B6F7B]">
          {tp('bar.label')}
          {services.length > 0 && <span className="ml-2 text-[#0B0F14]/45">· {tp('bar.count', { count: services.length })}</span>}
        </div>
        {services.length === 0 ? (
          <>
            <div className="text-lg font-normal tracking-[-0.02em]">{tp('bar.empty')}</div>
            <p className="mt-1 text-[13px] text-[#0B0F14]/55">{tp('bar.hint')}</p>
          </>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {services.map((s) => (
              <li key={s}>
                <button type="button" onClick={() => toggleService(s)} aria-label={`${tp('remove')} ${name(s)}`} className="group flex items-center gap-2 rounded-full border border-[#2BB0C0]/50 bg-white py-1.5 pl-3.5 pr-2 text-[12.5px] transition-colors hover:border-[#0B0F14]">
                  {name(s)}
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0B0F14]/8 text-[#0B0F14]/60 transition-colors group-hover:bg-[#0B0F14] group-hover:text-white">
                    <X className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {services.length > 0 && (
          <button type="button" onClick={() => setServices([])} className="rounded-full px-3 py-2 text-[12px] text-[#0B0F14]/55 underline-offset-4 hover:text-[#0B0F14] hover:underline">
            {tp('bar.clear')}
          </button>
        )}
        <button type="button" onClick={() => openPlan(services.length > 0 ? 'contact' : 'start')} className="group inline-flex items-center gap-3 rounded-full bg-[#0B0F14] py-2 pl-5 pr-2 text-[13px] font-medium text-white transition-colors hover:bg-[#1b232d]">
          {tp('bar.send')}
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4FC3D0] text-[#0B0F14] transition-transform duration-300 group-hover:-rotate-45">
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </button>
      </div>
    </div>
  );
}
