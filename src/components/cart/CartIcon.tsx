"use client";
import React, { useEffect, useState } from 'react';
import { useCart } from '@/context/CartContext';
import { getTotalItemCount } from '@/lib/cartUtils';
import { useTranslations } from 'next-intl';

export default function CartIcon() {
  const t = useTranslations('Layout');
  const { state, dispatch } = useCart();
  const itemCount = getTotalItemCount(state.items);
  const [isAnimating, setIsAnimating] = useState(false);

  // Trigger badge animation when count changes from 0 to something
  useEffect(() => {
    if (itemCount > 0) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 300);
      return () => clearTimeout(timer);
    }
  }, [itemCount]);

  return (
    <div className="group relative flex items-center">
      <button
        onClick={() => dispatch({ type: 'OPEN_DRAWER' })}
        aria-label="View Inquiry Cart"
        title="View Inquiry Cart"
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-full hover:bg-black/[0.03] transition-all duration-300 active:scale-95"
      >
        <span className="sr-only">View Inquiry Cart</span>
        <div className="relative">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="black"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="group-hover:opacity-70 transition-opacity"
          >
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
            <path d="M3 6h18" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>

          {itemCount > 0 && (
            <span 
              className={`absolute -top-1.5 -right-1.5 bg-black text-white text-[8px] font-bold min-w-[14px] h-3.5 rounded-full flex items-center justify-center px-1 transition-transform duration-300 ${
                isAnimating ? 'scale-110' : 'scale-100'
              }`}
            >
              {itemCount > 9 ? '9+' : itemCount}
            </span>
          )}
        </div>
        
        <div className="hidden sm:flex xl:hidden min-[1700px]:flex flex-col items-start leading-tight whitespace-nowrap">
          <span className="text-[12px] font-bold uppercase tracking-tight text-black/80">{t('cart.title')}</span>
          <span className="text-[8px] text-black/30 font-medium uppercase tracking-[0.15em]">{t('cart.registered')}</span>
        </div>
      </button>

      {/* Enhanced Stealth Luxury Tooltip */}
      <div className="absolute top-full right-0 mt-6 w-72 bg-[#0F0F0F] text-white border border-white/10 shadow-[0_30px_100px_rgba(0,0,0,0.4)] rounded-[2rem] p-8 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-500 scale-95 group-hover:scale-100 translate-y-2 group-hover:translate-y-0 z-[100] pointer-events-none overflow-hidden">
        {/* Subtle Background Pattern */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('/images/noise.svg')]" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                <path d="M3 6h18" />
              </svg>
            </div>
            <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/90">{t('tooltips.cart.title')}</div>
          </div>

          <h5 className="font-absans text-lg font-bold mb-4 leading-tight">{t('tooltips.cart.title')}</h5>
          <p className="font-archia text-[11px] leading-relaxed text-white/40 mb-8 font-medium">
            {t('tooltips.cart.desc')}
          </p>

          <div className="flex items-center justify-between pt-6 border-t border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-pulse shadow-[0_0_8px_rgba(79,195,208,0.5)]"></div>
              <span className="text-[9px] font-bold text-white/30 uppercase tracking-[0.2em]">Ready to Process</span>
            </div>
            <div className="text-[10px] font-bold text-white/60">
              {itemCount} <span className="opacity-30">ITEMS</span>
            </div>
          </div>
        </div>

        {/* Precise Arrow */}
        <div className="absolute -top-[6px] right-12 w-3 h-3 bg-[#0F0F0F] border-l border-t border-white/10 rotate-45"></div>
      </div>
    </div>
  );
}
