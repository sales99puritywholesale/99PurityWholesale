'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, MapPin } from 'lucide-react';
import { Link } from '@/i18n/routing';

import { useLocale } from 'next-intl';

interface City {
  slug: string;
  city: string;
  stateSlug: string;
  region: string;
}

interface CityDropdownProps {
  cities: City[];
  stateLink: string;
  isCountryCard: boolean;
  viewRegionalHubText: string;
}

export default function CityDropdown({ cities, stateLink, isCountryCard, viewRegionalHubText }: CityDropdownProps) {
  const locale = useLocale();
  const isEs = locale === 'es';
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // If there are no cities for this state, just render the standard text link
  if (cities.length === 0) {
    return (
      <span className={`font-dm-sans font-medium tracking-[-0.01em] text-[10px] transition-colors duration-300 ${
        isCountryCard ? 'text-white/50 group-hover:text-[#1ed4e8]' : 'text-black/45 group-hover:text-[#0B6F7B]'
      }`}>
        {viewRegionalHubText}
      </span>
    );
  }

  return (
    <div className="relative z-50" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`flex items-center gap-2 font-dm-sans font-medium tracking-[-0.01em] text-[10px] outline-none transition-colors duration-300 ${
          isCountryCard 
            ? isOpen ? 'text-[#1ed4e8]' : 'text-white/50 hover:text-[#1ed4e8]' 
            : isOpen ? 'text-[#0B6F7B]' : 'text-black/45 hover:text-[#0B6F7B]'
        }`}
      >
        {isEs ? 'VER CIUDADES' : 'VIEW CITIES'}
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </motion.div>
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={`absolute left-0 bottom-full mb-3 min-w-[220px] rounded-2xl border backdrop-blur-xl shadow-2xl overflow-hidden ${
              isCountryCard 
                ? 'bg-[#0B0D10]/90 border-white/10 shadow-black/50' 
                : 'bg-white/95 border-black/10 shadow-[0_20px_60px_rgba(0,0,0,0.08)]'
            }`}
          >
            {/* Header / State Link */}
            <Link
              href={`/locations/${stateLink}`}
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
              className={`px-4 py-3 border-b transition-colors flex items-center justify-between group ${
                isCountryCard
                  ? 'border-white/10 hover:bg-white/5'
                  : 'border-black/5 hover:bg-black/5'
              }`}
            >
              <span className={`font-dm-sans font-medium tracking-[-0.01em] text-[10px] ${
                isCountryCard ? 'text-white/60 group-hover:text-white' : 'text-black/50 group-hover:text-black'
              }`}>
                {viewRegionalHubText}
              </span>
              <MapPin className={`w-3.5 h-3.5 ${isCountryCard ? 'text-white/30' : 'text-black/30'}`} />
            </Link>

            {/* Scrollable Cities List */}
            <div
              className="max-h-[240px] overflow-y-auto overscroll-contain custom-scrollbar"
              data-lenis-prevent="true"
            >
              {cities.map((city) => {
                const cityPath = `/locations/${city.region.toLowerCase().replace(/ /g, '-')}/${city.stateSlug}/${city.slug}`;
                return (
                  <Link
                    key={city.slug}
                    href={cityPath}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsOpen(false);
                    }}
                    className={`px-4 py-3 transition-colors flex items-center gap-3 ${
                      isCountryCard
                        ? 'hover:bg-[#0B6F7B]/10 text-white/80 hover:text-white'
                        : 'hover:bg-[#0B6F7B]/5 text-black/70 hover:text-[#0B6F7B]'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0B6F7B] opacity-50" />
                    <span className="font-semibold text-sm tracking-wide">
                      {city.city}
                    </span>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
