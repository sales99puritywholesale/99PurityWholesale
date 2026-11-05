'use client';

import React, { useState, useEffect } from 'react';
import { Book, ChevronRight } from 'lucide-react';
import { FadeIn } from '@/components/shared/Motion';
import GlobalCTA from '@/components/layout/GlobalCTA';

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
    <main className="min-h-screen bg-[#F8F8F6] text-black -mt-24 md:-mt-32 relative overflow-hidden">
      {/* Grain overlay */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[url('/images/noise.svg')]" />

      {/* Hero Header */}
      <section className="relative overflow-hidden pt-44 pb-16 md:pt-56 md:pb-24 border-b border-black/5 bg-[#F8F8F6]">
        <div className="container mx-auto px-6 max-w-7xl relative z-10 text-center">
          <FadeIn>
            <div className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#13a7b7]/10 border border-[#13a7b7]/15 text-[#0b7f8c] rounded-full text-[10px] font-dm-mono font-bold uppercase tracking-widest mb-6">
              <Book className="w-3.5 h-3.5" />
              {badge}
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-absans font-bold text-black uppercase tracking-tighter leading-[0.95] mb-4">
              {title}
            </h1>

            <p className="text-[10px] font-dm-mono font-bold text-[#13a7b7] uppercase tracking-wider">
              {lastUpdated}
            </p>
          </FadeIn>
        </div>
      </section>

      {/* Main Content Layout */}
      <section className="py-16 md:py-24 bg-white">
        <div className="container mx-auto px-6 max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            
            {/* Left Column: Sticky Navigation Table of Contents */}
            <aside className="lg:col-span-4 sticky top-28 md:top-36 hidden lg:block">
              <div className="bg-[#F8F8F6] border border-black/5 rounded-[2.5rem] p-8 shadow-sm">
                <h3 className="text-xs font-dm-mono font-bold text-black/40 uppercase tracking-widest mb-6 border-b border-black/5 pb-4">
                  Table of Contents
                </h3>
                <nav className="flex flex-col gap-2">
                  {sections.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => scrollTo(section.id)}
                      className={`flex items-center justify-between text-left px-4 py-3 rounded-2xl text-[11px] font-dm-mono font-bold uppercase tracking-wider transition-all duration-300 ${
                        activeSection === section.id
                          ? 'bg-black text-white shadow-md'
                          : 'text-black/50 hover:bg-black/5 hover:text-black'
                      }`}
                    >
                      <span>{section.title}</span>
                      <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-300 ${
                        activeSection === section.id ? 'translate-x-0.5' : 'opacity-0'
                      }`} />
                    </button>
                  ))}
                </nav>
              </div>
            </aside>

            {/* Right Column: Detailed Clauses */}
            <article className="lg:col-span-8 space-y-12">
              {sections.map((section) => (
                <div
                  key={section.id}
                  id={section.id}
                  className="bg-[#F8F8F6] border border-black/[0.05] rounded-[2.5rem] p-8 md:p-12 hover:bg-white hover:border-[#13a7b7]/20 hover:shadow-[0_40px_100px_rgba(0,0,0,0.04)] transition-all duration-500"
                >
                  <h2 className="text-xl md:text-2xl font-absans font-bold text-black uppercase tracking-tight mb-6 pb-4 border-b border-black/5 flex items-center gap-3">
                    <span className="text-[#13a7b7] font-dm-mono text-xs font-bold">
                      // {sections.indexOf(section) + 1}
                    </span>
                    {section.title}
                  </h2>
                  <div className="text-black/60 font-archia font-semibold text-xs md:text-sm leading-relaxed space-y-4">
                    {section.content}
                  </div>
                </div>
              ))}
            </article>

          </div>
        </div>
      </section>

      {/* Global CTA Section */}
      <GlobalCTA
        badge="Regulatory Compliance"
        title="B2B Research Supply Partners"
        subtitle="Contact our procurement desk via WhatsApp or Email to discuss wholesale credentials and ordering accounts."
        primaryCtaText="Chat on WhatsApp"
        primaryCtaHref="https://wa.me/18433307365?text=Hi%2C%20I%27d%20like%20to%20apply%20for%20a%20wholesale%20peptide%20account."
        secondaryCtaText="Email Operations"
        secondaryCtaHref="mailto:sales@99puritywholesale.com"
      />
    </main>
  );
}
