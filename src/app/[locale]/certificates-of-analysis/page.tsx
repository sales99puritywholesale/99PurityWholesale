'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ShieldCheck, FileText, Check, X, Search, Beaker, FlaskConical, Microscope, Award, Globe, HelpCircle } from 'lucide-react';
import productsData from '@/data/products.json';
import GlobalCTA from '@/components/layout/GlobalCTA';
import FaqSection from '@/components/shared/FaqSection';
import { useNestedSmoothScroll } from '@/hooks/useNestedSmoothScroll';

export default function COAPage() {
  const t = useTranslations('COAPage');
  const [searchTerm, setSearchTerm] = useState('');

  const comparisonTableRef = useNestedSmoothScroll<HTMLDivElement>({ orientation: 'horizontal' });
  const desktopLibraryRef = useNestedSmoothScroll<HTMLDivElement>();
  const mobileLibraryRef = useNestedSmoothScroll<HTMLDivElement>();

  const filteredProducts = productsData.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const comparisonRows = [
    { 
      id: 'purity', 
      crit: t('comparison.rows.purity.crit'), 
      ours: t('comparison.rows.purity.ours'), 
      theirs: t('comparison.rows.purity.theirs') 
    },
    { 
      id: 'testing', 
      crit: t('comparison.rows.testing.crit'), 
      ours: t('comparison.rows.testing.ours'), 
      theirs: t('comparison.rows.testing.theirs') 
    },
    { 
      id: 'coa', 
      crit: t('comparison.rows.coa.crit'), 
      ours: t('comparison.rows.coa.ours'), 
      theirs: t('comparison.rows.coa.theirs') 
    },
    { 
      id: 'support', 
      crit: t('comparison.rows.support.crit'), 
      ours: t('comparison.rows.support.ours'), 
      theirs: t('comparison.rows.support.theirs') 
    },
    { 
      id: 'shipping', 
      crit: t('comparison.rows.shipping.crit'), 
      ours: t('comparison.rows.shipping.ours'), 
      theirs: t('comparison.rows.shipping.theirs') 
    }
  ];

  return (
    <main className="min-h-screen bg-[#F8F8F6] text-black -mt-24 md:-mt-32">
      
      {/* Hero Section - Elegant Light Off-White Linen */}
      <section className="relative overflow-hidden pt-52 pb-24 md:pt-64 md:pb-32 border-b border-black/5 bg-[#F8F8F6]">
        {/* Light Noise Texture */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[url('/images/noise.svg')]" />
        
        <div className="container mx-auto px-6 max-w-5xl relative z-10 text-center">
          <div>
            <div className="inline-block bg-black/5 border border-black/5 px-5 py-2 rounded-full text-[10px] font-bold font-dm-sans uppercase tracking-widest text-black/60 mb-6">
              {t('badge')}
            </div>
            
            <h1 className="reveal-text text-4xl sm:text-6xl md:text-7xl font-bold font-absans text-black uppercase tracking-tight leading-none mb-6 break-words w-full">
              {t('title')}
            </h1>
            
            <p className="reveal-text text-lg md:text-xl font-archia font-semibold text-black/75 max-w-3xl mx-auto leading-relaxed">
              {t('subtitle')}
            </p>
          </div>
        </div>
      </section>

      {/* Standalone Widescreen Clinical Laboratory Showcase Banner */}
      <section className="bg-[#F8F8F6] py-12 relative overflow-hidden">
        <div className="container mx-auto px-6 max-w-7xl">
          <div className="reveal-card-3d relative overflow-hidden rounded-[2.5rem] h-[320px] md:h-[480px] border border-black/5 shadow-sm group">
            {/* Pristine Full-Color Clinical Laboratory v2 Visual */}
            <Image 
              src="/lab_quality_bg_1778896760027.png"
              alt="99 Purity Wholesale Certified Quality Control Laboratory"
              fill
              sizes="(max-width: 1200px) 100vw, 1200px"
              className="object-cover transition-transform duration-[1.5s] ease-out group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent pointer-events-none" />
          </div>
        </div>
      </section>

      {/* COA Document Library - Interactive Reflowable Section */}
      <section className="py-24 md:py-32 bg-[#FAF9F5] border-b border-black/5 relative overflow-hidden">
        <div className="reveal-grid container mx-auto px-6 max-w-6xl relative z-10">
          
          {/* Header & Search Bar split row */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 mb-16">
            <div className="max-w-xl">
              <div className="inline-block bg-black/5 border border-black/5 px-5 py-2 rounded-full text-[10px] font-bold font-dm-sans uppercase tracking-widest text-black/60 mb-6">
                ANALYTICAL DATABASE
              </div>
              <h2 className="reveal-text text-3xl md:text-5xl font-bold font-absans text-black uppercase tracking-tight mb-4">
                {t('library.title')}
              </h2>
              <p className="reveal-text text-sm md:text-base font-archia font-medium text-black/55">
                {t('library.subtitle')}
              </p>
            </div>

            {/* Glassmorphic Search Bar */}
            <div className="w-full lg:w-auto min-w-[320px]">
              <div className="relative w-full">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-black/40" />
                </div>
                <input
                  type="text"
                  className="w-full bg-white border border-black/10 text-black rounded-xl pl-11 pr-4 py-4 focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-all font-archia font-medium text-sm shadow-sm"
                  placeholder={t('library.placeholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Table / Cards Container - Dynamic Reveal */}
          <div className="reveal-card bg-white border border-black/5 rounded-[2.5rem] overflow-hidden shadow-sm">
            
            {/* Desktop Table View */}
            <div ref={desktopLibraryRef} className="hidden md:block overflow-y-auto max-h-[600px]" data-lenis-prevent>
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[#FAF9F5] shadow-sm z-10">
                  <tr className="border-b border-black/5">
                    <th className="p-6 text-black/40 font-dm-mono uppercase tracking-widest text-[10px] font-bold">
                      {t('library.headers.name')}
                    </th>
                    <th className="p-6 text-black/40 font-dm-mono uppercase tracking-widest text-[10px] font-bold">
                      {t('library.headers.category')}
                    </th>
                    <th className="p-6 text-black/40 font-dm-mono uppercase tracking-widest text-[10px] font-bold">
                      {t('library.headers.batch')}
                    </th>
                    <th className="p-6 text-right text-black/40 font-dm-mono uppercase tracking-widest text-[10px] font-bold">
                      {t('library.headers.action')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 font-archia font-medium text-sm">
                  {filteredProducts.length > 0 ? (
                    filteredProducts.map((product, idx) => (
                      <tr key={idx} className="hover:bg-black/[0.01] transition-colors">
                        <td className="p-6">
                          <div className="font-bold text-black text-base">{product.name}</div>
                          {product.cas !== 'N/A' && (
                            <div className="text-[10px] text-black/40 font-dm-mono mt-1 tracking-widest uppercase">
                              CAS: {product.cas}
                            </div>
                          )}
                        </td>
                        <td className="p-6 text-black/55 capitalize">
                          {product.category.replace(/-/g, ' ')}
                        </td>
                        <td className="p-6">
                          <span className="bg-black/5 text-black border border-black/5 px-3 py-1 rounded-full text-[10px] font-bold font-dm-mono uppercase tracking-wider">
                            {t('library.verified')}
                          </span>
                        </td>
                        <td className="p-6 text-right">
                          <a 
                            href="/placeholder-coa.pdf" 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="inline-flex items-center justify-center gap-2 border border-black/15 hover:border-black hover:bg-black hover:text-white px-5 py-3 rounded-xl font-bold font-dm-sans text-[10px] uppercase tracking-[0.2em] transition-all cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" /> 
                            {t('library.download')}
                          </a>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="p-12 text-center text-black/40 font-archia">
                        {t('library.empty', { searchTerm })}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Mobile Reflowed Card View */}
            <div ref={mobileLibraryRef} className="md:hidden divide-y divide-black/5 max-h-[600px] overflow-y-auto" data-lenis-prevent>
              {filteredProducts.length > 0 ? (
                filteredProducts.map((product, idx) => (
                  <div key={idx} className="p-6 flex flex-col gap-4">
                    <div>
                      <div className="font-bold text-black text-base">{product.name}</div>
                      {product.cas !== 'N/A' && (
                        <div className="text-[9px] text-black/45 font-dm-mono mt-1 tracking-wider uppercase">
                          CAS: {product.cas}
                        </div>
                      )}
                      <div className="text-xs text-black/55 capitalize mt-1">
                        Category: {product.category.replace(/-/g, ' ')}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 mt-2">
                      <span className="bg-black/5 text-black border border-black/5 px-2.5 py-1 rounded-full text-[9px] font-bold font-dm-mono uppercase tracking-wider">
                        {t('library.verified')}
                      </span>
                      
                      <a 
                        href="/placeholder-coa.pdf" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="inline-flex items-center justify-center gap-2 border border-black/15 hover:border-black hover:bg-black hover:text-white px-4 py-2.5 rounded-lg font-bold font-dm-sans text-[9px] uppercase tracking-[0.2em] transition-all cursor-pointer"
                      >
                        <FileText className="w-3 h-3" /> 
                        {t('library.download')}
                      </a>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-12 text-center text-black/40 font-archia text-sm">
                  {t('library.empty', { searchTerm })}
                </div>
              )}
            </div>

          </div>
        </div>
      </section>

      
      {/* How to Read a COA - Sleek Split Section */}
      <section className="py-24 md:py-32 bg-white relative overflow-hidden">
        <div className="container mx-auto px-6 max-w-7xl">
          <div className="flex flex-col lg:flex-row gap-16 lg:gap-24 items-center">
            
            {/* Visual Side */}
            <div className="w-full lg:w-1/2 relative">
              <div className="absolute -inset-4 bg-black/5 rounded-[3rem] -rotate-3"></div>
              <div className="reveal-card-3d relative bg-[#F8F8F6] border border-black/10 rounded-[2.5rem] p-8 md:p-12 shadow-2xl">
                <div className="w-full h-[400px] bg-white border border-black/5 rounded-2xl shadow-sm relative overflow-hidden flex flex-col">
                  {/* Faux COA Header */}
                  <div className="border-b border-black/5 p-6 flex justify-between items-start">
                    <div>
                      <div className="w-24 h-4 bg-black/10 rounded mb-2"></div>
                      <div className="w-32 h-3 bg-black/5 rounded"></div>
                    </div>
                    <div className="w-12 h-12 bg-black/5 rounded-full"></div>
                  </div>
                  {/* Faux Chart */}
                  <div className="flex-1 p-6 relative">
                    <div className="absolute bottom-6 left-6 right-6 h-32 border-l border-b border-black/10 flex items-end gap-2">
                      <div className="w-1/6 h-1/6 bg-brand-accent/20 rounded-t"></div>
                      <div className="w-1/6 h-full bg-brand-accent rounded-t relative group">
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] font-bold py-1 px-2 rounded opacity-100">99.8%</div>
                      </div>
                      <div className="w-1/6 h-1/4 bg-brand-accent/40 rounded-t"></div>
                      <div className="w-1/6 h-1/5 bg-brand-accent/30 rounded-t"></div>
                    </div>
                  </div>
                  {/* Faux Signature */}
                  <div className="p-6 border-t border-black/5 flex justify-end">
                    <div className="w-32 h-8 bg-[url('https://upload.wikimedia.org/wikipedia/commons/f/f6/Signature_placeholder.svg')] bg-contain bg-no-repeat bg-right opacity-40"></div>
                  </div>

                  {/* Hotspots */}
                  <div className="absolute top-[80px] left-[30px] w-6 h-6 bg-black text-white rounded-full flex items-center justify-center text-[10px] font-bold font-dm-mono shadow-xl z-20">01</div>
                  <div className="absolute top-[200px] left-[150px] w-6 h-6 bg-black text-white rounded-full flex items-center justify-center text-[10px] font-bold font-dm-mono shadow-xl z-20">02</div>
                  <div className="absolute top-[280px] left-[260px] w-6 h-6 bg-black text-white rounded-full flex items-center justify-center text-[10px] font-bold font-dm-mono shadow-xl z-20">03</div>
                  <div className="absolute bottom-[30px] right-[40px] w-6 h-6 bg-black text-white rounded-full flex items-center justify-center text-[10px] font-bold font-dm-mono shadow-xl z-20">04</div>
                </div>
              </div>
            </div>

            {/* Content Side */}
            <div className="w-full lg:w-1/2">
              <div className="inline-block bg-black/5 border border-black/5 px-5 py-2 rounded-full text-[10px] font-bold font-dm-sans uppercase tracking-widest text-black/60 mb-6">
                DOCUMENT ANATOMY
              </div>
              
              <h2 className="reveal-text text-3xl md:text-5xl font-bold font-absans text-black uppercase tracking-tight mb-6">
                {t('howToRead.title')}
              </h2>
              
              <p className="reveal-text text-base font-archia font-medium text-black/60 mb-12">
                {t('howToRead.subtitle')}
              </p>

              <div className="space-y-8">
                {t.raw('howToRead.steps').map((step: any, i: number) => (
                  <div key={i} className="reveal-card flex gap-6 group">
                    <div className="w-12 h-12 bg-black/[0.03] border border-black/5 rounded-full flex items-center justify-center font-bold font-dm-mono text-black text-sm group-hover:bg-black group-hover:text-white transition-all shrink-0">
                      {step.id}
                    </div>
                    <div>
                      <h4 className="font-bold font-absans text-black text-lg mb-2 uppercase tracking-wide">{step.title}</h4>
                      <p className="font-archia text-sm text-black/60 leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Our Testing Parameters - Modern Grid */}
      <section className="py-24 md:py-32 bg-[#F8F8F6] border-b border-black/5 relative overflow-hidden">
        <div className="container mx-auto px-6 max-w-7xl">
          <div className="text-center mb-16">
            <div className="max-w-xl mx-auto">
              <div className="inline-block bg-black/5 border border-black/5 px-5 py-2 rounded-full text-[10px] font-bold font-dm-sans uppercase tracking-widest text-black/60 mb-6">
                BEYOND PURITY
              </div>
              <h2 className="reveal-text text-3xl md:text-5xl font-bold font-absans text-black uppercase tracking-tight mb-4">
                {t('parameters.title')}
              </h2>
              <p className="reveal-text text-sm md:text-base font-archia font-medium text-black/55">
                {t('parameters.subtitle')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {t.raw('parameters.cards').map((card: any, idx: number) => (
              <div key={idx} className="reveal-card bg-white border border-black/5 rounded-[2rem] p-8 md:p-10 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
                <div className="w-14 h-14 bg-[#F8F8F6] rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform">
                  {idx === 0 && <Microscope className="w-6 h-6 text-black/80" />}
                  {idx === 1 && <FlaskConical className="w-6 h-6 text-black/80" />}
                  {idx === 2 && <Beaker className="w-6 h-6 text-black/80" />}
                </div>
                <div className="text-black/40 font-dm-mono font-bold text-[10px] uppercase tracking-widest mb-2">{card.subtitle}</div>
                <h3 className="text-xl font-bold font-absans text-black mb-4 uppercase tracking-wide">{card.title}</h3>
                <p className="text-black/60 font-archia font-medium text-sm leading-relaxed">
                  {card.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3-Step Testing Process - Stealth Luxury Dark Section */}
      <section className="py-24 md:py-32 bg-[#05080C] text-white border-b border-white/5 relative overflow-hidden">
        {/* Dark Noise Texture */}
        <div className="absolute inset-0 opacity-[0.015] pointer-events-none bg-[url('/images/noise.svg')]" />
        
        <div className="container mx-auto px-6 max-w-7xl relative z-20">
          
          {/* Section Header */}
          <div className="text-center mb-20">
            <div>
              <div className="inline-block bg-white/5 border border-white/5 px-5 py-2 rounded-full text-[10px] font-bold font-dm-sans uppercase tracking-widest text-white/60 mb-6">
                QUALITY ASSURANCE LOOP
              </div>
              
              <h2 className="reveal-text text-3xl md:text-5xl lg:text-6xl font-bold font-absans text-white uppercase tracking-tight leading-none mb-6 max-w-4xl mx-auto">
                {t('pipeline.title')}
              </h2>
              
              <p className="reveal-text text-sm md:text-base font-archia font-medium text-white/55 max-w-3xl mx-auto leading-relaxed">
                {t('pipeline.subtitle')}
              </p>
            </div>
          </div>

          {/* Cards Pipeline Grid */}
          <div className="reveal-grid grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Desktop connecting line */}
            <div className="hidden md:block absolute top-1/2 left-[15%] right-[15%] h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-y-1/2 z-0 pointer-events-none"></div>
            
            {/* Step 1 */}
            <div className="reveal-card bg-[#090C12] border border-white/5 rounded-[2.5rem] p-8 md:p-10 text-center relative z-10 hover:border-brand-accent/30 hover:bg-[#0E131C] transition-all duration-500 shadow-2xl flex flex-col items-center">
              <div className="w-16 h-16 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-center mb-6">
                <FlaskConical className="w-6 h-6 text-white" />
              </div>
              <div className="text-white/40 font-dm-mono font-bold text-[10px] uppercase tracking-widest mb-2">Step 01</div>
              <h3 className="text-xl font-bold font-absans text-white mb-4 uppercase tracking-wide">{t('pipeline.step1.title')}</h3>
              <p className="text-white/60 font-archia font-medium text-xs leading-relaxed">
                {t('pipeline.step1.desc')}
              </p>
            </div>

            {/* Step 2 */}
            <div className="reveal-card bg-[#090C12] border border-white/10 rounded-[2.5rem] p-8 md:p-10 text-center relative z-10 hover:border-brand-accent/40 hover:bg-[#0E131C] transition-all duration-500 shadow-2xl flex flex-col items-center">
              <div className="w-16 h-16 bg-brand-accent/10 border border-brand-accent/20 rounded-2xl flex items-center justify-center mb-6">
                <Microscope className="w-6 h-6 text-brand-accent" />
              </div>
              <div className="text-white/40 font-dm-mono font-bold text-[10px] uppercase tracking-widest mb-2">Step 02</div>
              <h3 className="text-xl font-bold font-absans text-white mb-4 uppercase tracking-wide">{t('pipeline.step2.title')}</h3>
              <p className="text-white/60 font-archia font-medium text-xs leading-relaxed">
                {t('pipeline.step2.desc')}
              </p>
            </div>

            {/* Step 3 */}
            <div className="reveal-card bg-[#090C12] border border-white/5 rounded-[2.5rem] p-8 md:p-10 text-center relative z-10 hover:border-brand-accent/30 hover:bg-[#0E131C] transition-all duration-500 shadow-2xl flex flex-col items-center">
              <div className="w-16 h-16 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-center mb-6">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div className="text-white/40 font-dm-mono font-bold text-[10px] uppercase tracking-widest mb-2">Step 03</div>
              <h3 className="text-xl font-bold font-absans text-white mb-4 uppercase tracking-wide">{t('pipeline.step3.title')}</h3>
              <p className="text-white/60 font-archia font-medium text-xs leading-relaxed">
                {t('pipeline.step3.desc')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Competitor Comparison Section - Sleek Off-White Linen */}
      <section className="py-24 md:py-32 bg-[#F8F8F6] border-b border-black/5 relative overflow-hidden">
        <div className="reveal-grid container mx-auto px-6 max-w-6xl">
          <div className="text-center mb-16">
            <div className="max-w-xl mx-auto">
              <div className="inline-block bg-black/5 border border-black/5 px-5 py-2 rounded-full text-[10px] font-bold font-dm-sans uppercase tracking-widest text-black/60 mb-6">
                COMPARATIVE STANDARDS
              </div>
              
              <h2 className="reveal-text text-3xl md:text-5xl font-bold font-absans text-black uppercase tracking-tight mb-4">
                {t('comparison.title')}
              </h2>
              
              <p className="reveal-text text-sm md:text-base font-archia font-medium text-black/55 max-w-2xl mx-auto leading-relaxed">
                {t('comparison.subtitle')}
              </p>
            </div>
          </div>

          {/* Table Container - Interactive Card */}
          <div className="reveal-card bg-white border border-black/5 rounded-[2.5rem] overflow-hidden shadow-sm">
            <div ref={comparisonTableRef} className="overflow-x-auto" data-lenis-prevent>
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b border-black/5 bg-[#FAF9F5]">
                    <th className="p-6 text-black/40 font-dm-mono uppercase tracking-widest text-[10px] font-bold w-1/3">
                      {t('comparison.headers.criteria')}
                    </th>
                    <th className="p-6 text-black font-absans font-bold text-sm uppercase tracking-wider w-1/3 bg-black/5">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-black" />
                        {t('comparison.headers.ours')}
                      </div>
                    </th>
                    <th className="p-6 text-black/55 font-absans font-bold text-sm uppercase tracking-wider w-1/3">
                      {t('comparison.headers.theirs')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 font-archia font-medium text-sm">
                  {comparisonRows.map((row) => (
                    <tr key={row.id} className="hover:bg-black/[0.01] transition-colors">
                      <td className="p-6 text-black font-bold uppercase tracking-wide text-xs">
                        {row.crit}
                      </td>
                      <td className="p-6 bg-black/[0.02] text-black">
                        <div className="flex items-start gap-2.5">
                          <Check className="w-4 h-4 text-black flex-shrink-0 mt-0.5" />
                          <span>{row.ours}</span>
                        </div>
                      </td>
                      <td className="p-6 text-black/45">
                        <div className="flex items-start gap-2.5">
                          <X className="w-4 h-4 text-black/35 flex-shrink-0 mt-0.5" />
                          <span>{row.theirs}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Lab Credentials & Trust Section - Stealth Luxury Dark Section */}
      <section className="py-24 md:py-32 bg-[#05080C] text-white relative overflow-hidden">
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-brand-accent/5 rounded-full blur-3xl translate-y-1/2 translate-x-1/2"></div>
        <div className="container mx-auto px-6 max-w-5xl relative z-10 text-center">
          
          <div>
            <ShieldCheck className="w-16 h-16 text-white/60 mx-auto mb-8 animate-pulse" />
            
            <h2 className="reveal-text text-3xl md:text-5xl font-bold font-absans text-white uppercase tracking-tight mb-6">
              {t('trust.title')}
            </h2>
            
            <p className="reveal-text text-base md:text-lg font-archia font-medium text-white/55 max-w-3xl mx-auto leading-relaxed mb-16">
              {t('trust.desc')}
            </p>
            
            <div className="reveal-grid grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
              {/* Badge 1 */}
              <div className="reveal-card bg-white/5 border border-white/5 px-8 py-5 rounded-2xl flex items-center justify-center gap-3 hover:border-white/10 transition-colors">
                <Globe className="w-5 h-5 text-white/70" />
                <span className="font-absans font-bold text-white text-sm tracking-wider uppercase">
                  {t('trust.badges.us')}
                </span>
              </div>
              
              {/* Badge 2 */}
              <div className="reveal-card bg-white/5 border border-white/5 px-8 py-5 rounded-2xl flex items-center justify-center gap-3 hover:border-white/10 transition-colors">
                <Award className="w-5 h-5 text-white/70" />
                <span className="font-absans font-bold text-white text-sm tracking-wider uppercase">
                  {t('trust.badges.cgmp')}
                </span>
              </div>
              
              {/* Badge 3 */}
              <div className="reveal-card bg-white/5 border border-white/5 px-8 py-5 rounded-2xl flex items-center justify-center gap-3 hover:border-white/10 transition-colors">
                <Beaker className="w-5 h-5 text-white/70" />
                <span className="font-absans font-bold text-white text-sm tracking-wider uppercase">
                  {t('trust.badges.qa')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quality & Testing FAQ */}
      <FaqSection
        id="quality-faq"
        eyebrow="(FAQ)"
        title={t('FAQ.title')}
        subtitle={t('FAQ.subtitle')}
        items={t.raw('FAQ.items') as any[]}
        theme="light"
      />

      {/* Global B2B Call-To-Action Segment (Sleek Contrast) */}
      <GlobalCTA
        badge={t('cta.badge')}
        title={t('cta.title')}
        subtitle={t('cta.subtitle')}
        primaryCtaText="WhatsApp Sales"
        primaryCtaHref="https://wa.me/18433307365?text=Hi,%20I'm%20interested%20in%20learning%20more%20about%20your%20verified%20batch%20quality%20and%20receiving%20the%20wholesale%20price%20list."
        secondaryCtaText="Email Laboratory"
        secondaryCtaHref="mailto:sales@99puritywholesale.com"
      />

    </main>
  );
}
