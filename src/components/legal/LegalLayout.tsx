'use client';

import React, { useState, useEffect } from 'react';
import { PageShell, PageHero, CtaBand, WRAP } from '@/components/home/page-kit';

export interface LegalSection {
  id: string;
  title: string;
  content: React.ReactNode;
}

interface LegalLayoutProps {
  title: string;
  badge: string;
  lastUpdated: string;
  sections: LegalSection[];
}

export default function LegalLayout({ title, badge, lastUpdated, sections }: LegalLayoutProps) {
  const [activeSection, setActiveSection] = useState(sections[0]?.id || '');

  // Smooth scroll helper
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const offset = 120; // accounting for sticky header height
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = el.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
      setActiveSection(id);
    }
  };

  // Scroll spy to highlight active section in sidebar
  useEffect(() => {
    const handleScroll = () => {
      const scrollPos = window.scrollY + 160; // offset for active check

      for (let i = 0; i < sections.length; i++) {
        const el = document.getElementById(sections[i].id);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPos >= top && scrollPos < top + height) {
            setActiveSection(sections[i].id);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [sections]);

  return (
    <PageShell>
      <PageHero eyebrow={badge} title={title} intro={<span className="font-dm-mono text-[11px] uppercase tracking-[0.16em] text-[#0B0F14]/50">{lastUpdated}</span>} />

      <section className="pb-16 md:pb-24">
        <div className={WRAP}>
          <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-14">
            {/* Sticky table of contents */}
            <aside className="sticky top-28 hidden lg:col-span-4 lg:block">
              <nav aria-label="Table of contents" className="rounded-[1.25rem] border border-[#E6EAF1] bg-white p-5">
                <div className="mb-3 px-3 font-dm-mono text-[10px] uppercase tracking-[0.2em] text-[#0B0F14]/45">Table of Contents</div>
                <ul className="flex flex-col gap-1">
                  {sections.map((section) => (
                    <li key={section.id}>
                      <button
                        type="button"
                        onClick={() => scrollTo(section.id)}
                        aria-current={activeSection === section.id ? 'true' : undefined}
                        className={`w-full rounded-xl px-3 py-2.5 text-left text-[13px] leading-snug transition-colors ${
                          activeSection === section.id ? 'bg-[#0B0F14] text-white' : 'text-[#0B0F14]/60 hover:bg-[#F3F5FA] hover:text-[#0B0F14]'
                        }`}
                      >
                        {section.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>

            {/* Clauses */}
            <article className="space-y-4 lg:col-span-8">
              {sections.map((section) => (
                <div key={section.id} id={section.id} className="scroll-mt-28 rounded-[1.25rem] border border-[#E6EAF1] bg-white p-6 md:p-10">
                  <h2 className="mb-5 border-b border-[#E6EAF1] pb-4 text-[clamp(1.25rem,2.2vw,1.65rem)] font-light leading-tight tracking-[-0.03em] text-[#0B0F14]">
                    {section.title}
                  </h2>
                  <div className="space-y-4 text-[14.5px] leading-[1.75] text-[#0B0F14]/65 [&_strong]:font-medium [&_strong]:text-[#0B0F14] [&_ul]:list-disc [&_ul]:pl-5">
                    {section.content}
                  </div>
                </div>
              ))}
            </article>
          </div>
        </div>
      </section>

      <CtaBand
        eyebrow="Regulatory Compliance"
        title="B2B Research Supply Partners"
        description="Contact our procurement desk via WhatsApp or Email to discuss wholesale credentials and ordering accounts."
        primary={{ label: 'Chat on WhatsApp', href: 'https://wa.me/18433307365?text=Hi%2C%20I%27d%20like%20to%20apply%20for%20a%20wholesale%20peptide%20account.', external: true }}
        secondary={{ label: 'Email Operations', href: 'mailto:sales@99puritywholesale.com' }}
      />
    </PageShell>
  );
}
