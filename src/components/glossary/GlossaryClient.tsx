'use client';

import React, { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Search, Book, ArrowRight, Microscope, ShieldCheck, FlaskConical, Zap, X } from 'lucide-react';
import { FadeIn, StaggerContainer, StaggerItem } from '@/components/shared/Motion';
import { motion, AnimatePresence } from 'framer-motion';

export interface GlossaryTerm {
  key: string;
  title: string;
  definition: string;
}

export interface ValueBox {
  title: string;
  desc: string;
}

interface GlossaryClientProps {
  terms: GlossaryTerm[];
  valueBoxes: ValueBox[];
}

export default function GlossaryClient({ terms, valueBoxes }: GlossaryClientProps) {
  const t = useTranslations('Glossary');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLetter, setSelectedLetter] = useState('All');

  // List of all letters A-Z
  const alphabet = useMemo(() => {
    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  }, []);

  // Check which letters actually have terms (so we can highlight/dim them)
  const lettersWithTerms = useMemo(() => {
    const letters = new Set<string>();
    terms.forEach((term) => {
      const firstLetter = term.title.charAt(0).toUpperCase();
      if (firstLetter >= 'A' && firstLetter <= 'Z') {
        letters.add(firstLetter);
      }
    });
    return letters;
  }, [terms]);

  // Filtered terms based on search query and selected letter
  const filteredTerms = useMemo(() => {
    return terms.filter((term) => {
      const matchesLetter = 
        selectedLetter === 'All' || 
        term.title.charAt(0).toUpperCase() === selectedLetter;
      
      const matchesSearch = 
        !searchQuery || 
        term.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        term.definition.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesLetter && matchesSearch;
    });
  }, [terms, selectedLetter, searchQuery]);

  return (
    <>
      {/* Search & Filter Controls Section */}
      <section className="pb-8 pt-2 md:pb-10">
        <div className="mx-auto w-full max-w-[1440px] px-5 md:px-10">
          
          {/* Text Search */}
          <FadeIn className="mb-10 max-w-lg mx-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
              <input
                type="text"
                aria-label={t('Search.placeholder') || "Search scientific terms..."}
                placeholder={t('Search.placeholder') || "Search scientific terms..."}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedLetter('All'); // Clear letter selection when searching
                }}
                className="w-full bg-white border border-[#E6EAF1] text-[#0B0F14] rounded-full pl-12 pr-10 py-3.5 outline-none focus:border-[#4FC3D0] focus:ring-2 focus:ring-[#4FC3D0]/30 text-[14px] transition-all placeholder:text-black/35"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-black/45 hover:text-black transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </FadeIn>

          {/* Alphabet Tabs */}
          <FadeIn className="flex flex-wrap justify-center gap-1.5 border-b border-[#E6EAF1] pb-8">
            <button
              onClick={() => {
                setSelectedLetter('All');
                setSearchQuery('');
              }}
              className={`px-4 py-2 rounded-xl text-xs font-dm-mono font-medium tracking-wider uppercase transition-all duration-300 ${
                selectedLetter === 'All'
                  ? 'bg-[#0B0F14] text-white'
                  : 'bg-white border border-[#E6EAF1] text-black/50 hover:bg-black/5 hover:text-black'
              }`}
            >
              All
            </button>
            {alphabet.map((letter) => {
              const hasTerms = lettersWithTerms.has(letter);
              return (
                <button
                  key={letter}
                  disabled={!hasTerms}
                  onClick={() => {
                    setSelectedLetter(letter);
                    setSearchQuery('');
                  }}
                  className={`w-10 h-10 rounded-xl text-xs font-dm-mono font-medium transition-all duration-300 ${
                    selectedLetter === letter
                      ? 'bg-[#0B0F14] text-white'
                      : hasTerms
                      ? 'bg-white border border-[#E6EAF1] text-black/70 hover:bg-black/5 hover:text-black'
                      : 'bg-black/[0.02] text-black/20 cursor-not-allowed border border-[#E6EAF1]'
                  }`}
                >
                  {letter}
                </button>
              );
            })}
          </FadeIn>

        </div>
      </section>

      {/* Grid of definitions */}
      <section className="pb-16 md:pb-24">
        <div className="mx-auto w-full max-w-[1440px] px-5 md:px-10">
          
          {/* Results Info */}
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-[#E6EAF1]">
            <span className="text-[10px] font-dm-mono font-medium text-black/40 uppercase tracking-widest">
              {filteredTerms.length} {filteredTerms.length === 1 ? 'Term' : 'Terms'} Found
            </span>
            {selectedLetter !== 'All' && (
              <span className="text-[10px] font-dm-mono font-medium text-[#0B6F7B] uppercase tracking-widest">
                Filtered by Letter: {selectedLetter}
              </span>
            )}
          </div>

          <motion.div 
            layout 
            className="grid grid-cols-1 md:grid-cols-2 gap-4 min-h-[300px]"
          >
            <AnimatePresence mode="popLayout">
              {filteredTerms.length > 0 ? (
                filteredTerms.map((term) => (
                  <motion.div
                    layout
                    key={term.key}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="group bg-white border border-[#E6EAF1] rounded-[1.25rem] p-6 md:p-8 transition-all duration-500 hover:-translate-y-1 hover:border-[#4FC3D0]/50 flex flex-col justify-between h-full">
                      <div>
                        <div className="flex items-start justify-between mb-6">
                          <h3 className="text-[1.5rem] font-dm-sans font-light tracking-[-0.03em] text-[#0B0F14] group-hover:text-[#0B6F7B] transition-colors duration-300">
                            {term.title}
                          </h3>
                          <div className="w-10 h-10 rounded-xl bg-white border border-[#E6EAF1] flex items-center justify-center text-black/35 group-hover:text-[#0B6F7B]/60 group-hover:border-[#0B6F7B]/25 transition-all">
                            <Microscope className="w-4 h-4" />
                          </div>
                        </div>
                        <p className="text-[#0B0F14]/60 text-[14px] leading-relaxed mb-8 group-hover:text-[#0B0F14]/75 transition-colors duration-300">
                          {term.definition}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="h-px flex-grow bg-black/5" />
                        <Link href="/products" className="text-[9px] font-dm-mono font-medium text-black/40 group-hover:text-[#0B6F7B] uppercase tracking-widest transition-colors flex items-center gap-2">
                          {t('relatedProducts') || "Related Products"} <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                ))
              ) : (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="col-span-full py-20 flex flex-col items-center justify-center text-center bg-[#F3F5FA] border border-[#E6EAF1] rounded-[1.25rem]"
                >
                  <Book className="w-12 h-12 text-black/25 mb-4" />
                  <h4 className="text-lg font-dm-sans font-light tracking-[-0.03em] text-[#0B0F14] mb-2">No Matching Terms</h4>
                  <p className="text-black/55 text-xs max-w-sm leading-relaxed">
                    Try adjusting your search keywords or select a different alphabetical character.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

        </div>
      </section>

      {/* Value Boxes / Teaser Section */}
      <section className="pb-16 md:pb-24">
        <div className="mx-auto w-full max-w-[1440px] px-5 md:px-10">
          <StaggerContainer className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {valueBoxes.map((box, i) => {
              const Icon = [ShieldCheck, FlaskConical, Zap][i] || FlaskConical;
              return (
                <StaggerItem key={i}>
                  <div className="bg-white border border-[#E6EAF1] rounded-[1.25rem] p-7 md:p-8 transition-all h-full">
                    <div className="w-12 h-12 rounded-2xl bg-[#F3F5FA] border border-[#E6EAF1] flex items-center justify-center text-black/50 transition-all mb-6">
                      <Icon className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-dm-sans font-light tracking-[-0.03em] text-[#0B0F14] mb-3">
                      {box.title}
                    </h3>
                    <p className="text-[#0B0F14]/60 text-[14px] leading-relaxed">
                      {box.desc}
                    </p>
                  </div>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </div>
      </section>
    </>
  );
}
