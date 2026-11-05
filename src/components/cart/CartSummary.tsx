"use client";

import React from 'react';
import { Mail, ArrowRight, MessageSquare } from 'lucide-react';
import { CartItem } from '@/types/cart';
import { useCart } from '@/context/CartContext';
import { buildInquiryMessage } from '@/lib/cartUtils';
import { useTranslations } from 'next-intl';

interface CartSummaryProps {
  items: CartItem[];
}

export default function CartSummary({ items }: CartSummaryProps) {
  const { dispatch } = useCart();
  const t = useTranslations('Layout.cart');
  
  const handleWhatsAppInquiry = () => {
    const message = buildInquiryMessage(items);
    const phone = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '18433307365').replace(/\D/g, '');
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message.whatsapp)}`;
    window.open(url, '_blank');
  };

  const handleEmailInquiry = () => {
    const message = buildInquiryMessage(items);
    const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'sales@99puritywholesale.com';
    const mailtoURL = `mailto:${email}?subject=${encodeURIComponent(message.email.subject)}&body=${encodeURIComponent(message.email.body)}`;
    window.location.href = mailtoURL;
  };

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      {/* Top Row: Count and Clear */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[9px] font-bold text-black/40 uppercase tracking-[0.2em]">Procurement</span>
          <span className="text-xs font-archia font-bold text-black">
            {t('productCount', { count: items.length })}
          </span>
        </div>
        <button
          onClick={() => dispatch({ type: 'CLEAR_CART' })}
          className="text-black/40 hover:text-red-500 text-[9px] font-bold uppercase tracking-widest transition-colors"
        >
          {t('clear')}
        </button>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-3">
        {/* WhatsApp Button */}
        <button
          onClick={handleWhatsAppInquiry}
          className="group flex items-center justify-center gap-3 bg-black text-white font-absans font-bold text-[11px] w-full py-4 rounded-xl transition-all hover:bg-black/90 active:scale-95 shadow-lg"
        >
          <MessageSquare className="w-4 h-4" />
          <span className="uppercase tracking-widest">{t('whatsapp')}</span>
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
        </button>

        {/* Email Button */}
        <button
          onClick={handleEmailInquiry}
          className="group flex items-center justify-center gap-3 bg-white border border-black/10 text-black font-absans font-bold text-[11px] w-full py-4 rounded-xl transition-all hover:bg-black/5 hover:border-black/20"
        >
          <Mail className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity" />
          <span className="uppercase tracking-widest text-black/60 group-hover:text-black transition-colors">{t('email')}</span>
        </button>
      </div>

      {/* Disclaimer */}
      <p className="font-archia text-[9px] text-black/30 text-center leading-relaxed italic px-4">
        &ldquo;{t('disclaimer')}&rdquo;
      </p>
    </div>
  );
}
