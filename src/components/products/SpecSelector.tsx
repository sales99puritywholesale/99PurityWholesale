"use client";

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import AddToInquiryButton from './AddToInquiryButton';

interface SpecSelectorProps {
  productId: string;
  productName: string;
  category: string;
  categoryPage: string;
  specs: string[];
  kitSizes: number[];
  defaultSpec?: string;
  defaultKitSize?: number;
}

export default function SpecSelector({
  productId,
  productName,
  category,
  categoryPage,
  specs,
  kitSizes,
  defaultSpec,
  defaultKitSize,
}: SpecSelectorProps) {
  const t = useTranslations('Components.SpecSelector');
  const [selectedSpec, setSelectedSpec] = useState(defaultSpec || specs[0]);
  const [selectedKitSize, setSelectedKitSize] = useState(defaultKitSize || kitSizes[0]);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('product-spec-change', { detail: { spec: selectedSpec } }));
    }
  }, [selectedSpec]);

  const pillBaseClasses = "border px-5 py-2.5 rounded-full text-[13px] font-dm-sans font-medium transition-colors duration-300 cursor-pointer flex-shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[#4FC3D0]";
  const defaultPillClasses = "border-[#0B0F14]/15 text-[#0B0F14]/65 bg-white hover:border-[#0B0F14]/40 hover:text-[#0B0F14]";
  const selectedPillClasses = "border-[#0B0F14] bg-[#0B0F14] text-white";

  return (
    <div className="flex flex-col w-full gap-7">
      {/* Top Section: Selectors */}
      <div className="flex flex-col md:flex-row gap-8 md:gap-12 w-full">
        {/* Spec Selector */}
        <div className="flex flex-col gap-3 flex-1">
          <span className="text-[#0B0F14]/50 font-dm-mono text-[10px] uppercase tracking-[0.2em]">{t('selectSpec')}</span>
          <div className="flex flex-wrap gap-2.5">
            {specs.map((spec) => (
              <button
                key={spec}
                onClick={() => setSelectedSpec(spec)}
                aria-pressed={selectedSpec === spec}
                className={`${pillBaseClasses} ${
                  selectedSpec === spec ? selectedPillClasses : defaultPillClasses
                }`}
              >
                {spec}
              </button>
            ))}
          </div>
        </div>

        {/* Kit Size Selector */}
        <div className="flex flex-col gap-3 flex-1">
          <span className="text-[#0B0F14]/50 font-dm-mono text-[10px] uppercase tracking-[0.2em]">{t('kitSize')}</span>
          <div className="flex flex-wrap gap-2.5">
            {kitSizes.map((size) => (
              <button
                key={size}
                onClick={() => setSelectedKitSize(size)}
                aria-pressed={selectedKitSize === size}
                className={`${pillBaseClasses} ${
                  selectedKitSize === size ? selectedPillClasses : defaultPillClasses
                }`}
              >
                ×{size} {t('vials')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Section: Action Panel */}
      <div className="bg-[#F3F5FA] rounded-[1.25rem] p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5 border border-[#E6EAF1]">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 bg-white rounded-full flex items-center justify-center border border-[#E6EAF1] flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#0B6F7B]"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          </div>
          <div>
            <p className="font-dm-sans text-[14px] font-medium text-[#0B0F14] mb-0.5">
              Commercial Order
            </p>
            <p className="font-dm-mono text-[10px] text-[#0B0F14]/50 uppercase tracking-[0.16em]">
              {t('moqLabel', { count: 10 })}
            </p>
          </div>
        </div>
        
        <div className="w-full md:w-auto md:min-w-[260px]">
          <AddToInquiryButton
            productId={productId}
            productName={productName}
            category={category}
            spec={selectedSpec}
            kitSize={selectedKitSize}
            categoryPage={categoryPage}
            moq={10}
          />
        </div>
      </div>
    </div>
  );
}
