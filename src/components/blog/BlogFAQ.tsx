'use client';

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import FaqSchema from '@/components/seo/FaqSchema';

interface FAQItem {
  question: string;
  answer: string;
}

interface BlogFAQProps {
  faqs: FAQItem[];
}

export default function BlogFAQ({ faqs }: BlogFAQProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!faqs || faqs.length === 0) return null;

  return (
    <div className="rounded-[1.25rem] border border-[#E6EAF1] bg-white p-6 md:p-10">
      <FaqSchema items={faqs.map(faq => ({ q: faq.question, a: faq.answer }))} />

      <h2 className="mb-8 font-dm-sans text-[clamp(1.5rem,2.6vw,2rem)] font-light leading-tight tracking-[-0.03em] text-[#0B0F14]">
        Frequently Asked Questions
      </h2>

      <div className="space-y-2">
        {faqs.map((faq, index) => {
          const open = openIndex === index;
          return (
            <div key={index} className="overflow-hidden rounded-[1rem] border border-[#E6EAF1] bg-[#F3F5FA]/50">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`blog-faq-${index}`}
                onClick={() => setOpenIndex(open ? null : index)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-dm-sans text-[15px] tracking-[-0.01em] text-[#0B0F14] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4FC3D0]"
              >
                <span>{faq.question}</span>
                <Plus className={`h-4 w-4 shrink-0 transition-transform duration-300 ${open ? 'rotate-45' : ''}`} aria-hidden="true" />
              </button>
              <div id={`blog-faq-${index}`} className={`grid transition-all duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                  <p className="px-5 pb-5 text-[14px] leading-relaxed text-[#0B0F14]/65">{faq.answer}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
