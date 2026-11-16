'use client';

import { useTranslations } from 'next-intl';
import { Check, Plus } from 'lucide-react';
import { usePlan } from './PlanContext';

/** Toggles a service in the visitor's plan. */
export default function AddToPlanButton({ serviceKey, size = 'md', className = '' }: { serviceKey: string; size?: 'sm' | 'md'; className?: string }) {
  const tp = useTranslations('Plan');
  const { hasService, toggleService } = usePlan();
  const on = hasService(serviceKey);
  return (
    <button
      type="button"
      onClick={() => toggleService(serviceKey)}
      aria-pressed={on}
      className={`group inline-flex items-center gap-2 rounded-full border font-dm-sans font-medium transition-all duration-300 ${size === 'sm' ? 'px-3.5 py-2 text-[12px]' : 'px-5 py-[0.8rem] text-[13px]'} ${
        on ? 'border-[#2BB0C0] bg-[#2BB0C0] text-[#0B0F14]' : 'border-[#0B0F14]/20 bg-white text-[#0B0F14] hover:border-[#0B0F14] hover:bg-[#0B0F14] hover:text-white'
      } ${className}`}
    >
      {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Plus className="h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-90" />}
      {on ? tp('added') : tp('add')}
    </button>
  );
}
