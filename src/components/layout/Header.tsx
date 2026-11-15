'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter, usePathname } from '@/i18n/routing';
import { Menu, X, Search, Globe, ChevronDown, Check, Command, FlaskConical, ShieldCheck, Newspaper, Info, Phone, LayoutGrid, ArrowRight } from 'lucide-react';
import GlobalSearch from '@/components/search/GlobalSearch';
import CartIcon from '@/components/cart/CartIcon';
import { useNestedSmoothScroll } from '@/hooks/useNestedSmoothScroll';

export default function Header() {
  const t = useTranslations('Layout');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const mobileMenuScrollRef = useNestedSmoothScroll<HTMLDivElement>({ enabled: isMobileMenuOpen });

  useEffect(() => {
    let lastScrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY && currentScrollY > 60) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }
      lastScrollY = currentScrollY;
    };
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
    };

    window.addEventListener('scroll', handleScroll);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleLanguageSwitch = (newLocale: string) => {
    router.replace(pathname, { locale: newLocale as any });
  };

  const categories = [
    { id: 'metabolic-research', name: 'Metabolic Research' },
    { id: 'cognitive-function', name: 'Cognitive Function' },
    { id: 'sleep-cycle-investigation', name: 'Sleep Cycle Investigation' },
    { id: 'growth-factor-research', name: 'Growth Factor Research' },
    { id: 'recovery-research', name: 'Recovery Research' },
    { id: 'cellular-health-research', name: 'Cellular Health Research' },
    { id: 'aminos', name: 'Aminos' },
    { id: 'essentials', name: 'Essentials' },
  ];

  return (
    <>
      <header 
        className={`fixed top-0 left-0 w-full z-[60] px-3 md:px-6 py-4 md:py-5 print:hidden transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${isVisible ? 'translate-y-0' : '-translate-y-[120%]'}`}
      >
        <div className="max-w-[1650px] mx-auto bg-white rounded-full shadow-[0_20px_60px_rgba(0,0,0,0.1)] border border-black/5 p-1.5 md:p-2 flex justify-between items-center min-h-[60px] md:min-h-[78px]">
          {/* Logo Section */}
          <div className="flex-1 flex justify-start items-center pl-4 md:pl-8">
            <Link 
              href="/" 
              className="relative z-[70] flex items-center gap-4 transition-all hover:scale-[1.02] group/logo"
            >
              <span className="font-dm-sans text-base md:text-[1.3rem] font-medium tracking-[-0.045em] text-[#0B0F14] whitespace-nowrap">
                99Purity <span className="font-light text-black/50">Wholesale</span>
              </span>
            </Link>
          </div>

          {/* Desktop Nav - Centered */}
          <nav className="hidden xl:flex items-center gap-6 2xl:gap-8 flex-auto justify-center px-6">
            <Link 
              href="/products" 
              className="text-[11px] font-bold text-black/70 hover:text-black transition-colors relative group py-1 uppercase tracking-widest whitespace-nowrap"
            >
              {t('nav.products')}
              <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-black transition-all duration-300 group-hover:w-full"></span>
            </Link>

            <div className="relative group/cat">
              <button className="flex items-center gap-1.5 text-[11px] font-bold text-black/70 hover:text-black transition-colors py-1 uppercase tracking-widest">
                {t('nav.categories')}
                <ChevronDown className="w-3.5 h-3.5 text-black/20 group-hover/cat:text-black transition-all group-hover/cat:rotate-180" />
              </button>
              
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-6 w-[480px] bg-[#0F0F0F] border border-white/10 shadow-[0_30px_100px_rgba(0,0,0,0.5)] rounded-[2.5rem] p-8 opacity-0 invisible group-hover/cat:opacity-100 group-hover/cat:visible transition-all duration-500 translate-y-2 group-hover/cat:translate-y-0 z-[100] overflow-hidden">
                {/* Subtle Background Pattern */}
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('/images/noise.svg')]" />
                
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-8 px-2">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/60">
                      <LayoutGrid className="w-4 h-4" />
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-white/50">Research Modules</div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                    {categories.map((cat) => (
                      <Link 
                        key={cat.id}
                        href={`/products/${cat.id}`}
                        className="group/item flex items-center gap-4 px-4 py-4 rounded-2xl text-[13px] font-bold text-white/90 hover:text-white hover:bg-white/5 transition-all"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-white/20 group-hover/item:bg-white transition-colors" />
                        <span className="font-absans tracking-tight">{cat.name}</span>
                      </Link>
                    ))}
                  </div>

                  <div className="mt-8 pt-8 border-t border-white/5 flex items-center justify-end px-2">
                     <Link href="/products" className="text-[9px] font-bold uppercase tracking-widest text-white/60 hover:text-white transition-colors flex items-center gap-2 group/all">
                        View All <ArrowRight className="w-3 h-3 group-hover/all:translate-x-1 transition-transform" />
                     </Link>
                  </div>
                </div>

                {/* Aesthetic Arrow */}
                <div className="absolute -top-[6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-[#0F0F0F] border-l border-t border-white/10 rotate-45"></div>
              </div>
            </div>

            <Link 
              href="/about" 
              className="text-[11px] font-bold text-black/70 hover:text-black transition-colors relative group py-1 uppercase tracking-widest whitespace-nowrap"
            >
              {t('nav.about')}
              <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-black transition-all duration-300 group-hover:w-full"></span>
            </Link>

            <Link 
              href="/services" 
              className="text-[11px] font-bold text-black/70 hover:text-black transition-colors relative group py-1 uppercase tracking-widest whitespace-nowrap"
            >
              {t('nav.services')}
              <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-black transition-all duration-300 group-hover:w-full"></span>
            </Link>

            <Link 
              href="/certificates-of-analysis" 
              className="text-[11px] font-bold text-black/70 hover:text-black transition-colors relative group py-1 uppercase tracking-widest whitespace-nowrap"
            >
              {t('nav.coa')}
              <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-black transition-all duration-300 group-hover:w-full"></span>
            </Link>

            <Link 
              href="/peptide-calculator" 
              className="text-[11px] font-bold text-black/70 hover:text-black transition-colors relative group py-1 uppercase tracking-widest whitespace-nowrap"
            >
              {t('nav.calculator')}
              <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-black transition-all duration-300 group-hover:w-full"></span>
            </Link>

            <Link 
              href="/blog" 
              className="text-[11px] font-bold text-black/70 hover:text-black transition-colors relative group py-1 uppercase tracking-widest whitespace-nowrap"
            >
              {t('nav.blog')}
              <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-black transition-all duration-300 group-hover:w-full"></span>
            </Link>
          </nav>

          {/* Right Actions Section */}
          <div className="flex-1 flex justify-end items-center gap-1 md:gap-5 self-stretch pr-1">
            <div className="relative group/lang hidden sm:block">
              <button 
                aria-label="Select Language"
                className="flex items-center gap-2 px-4 py-2 rounded-full hover:bg-black/[0.03] transition-colors text-black/60 hover:text-black text-[13px] font-bold uppercase"
              >
                <Globe className="w-4 h-4" />
                {locale}
                <ChevronDown className="w-3 h-3 opacity-30 group-hover/lang:rotate-180 transition-transform" />
                <span className="sr-only">Select Language</span>
              </button>
              
              <div className="absolute top-full right-0 mt-6 w-44 bg-[#0F0F0F] border border-white/10 shadow-[0_30px_100px_rgba(0,0,0,0.5)] rounded-[2rem] p-3 opacity-0 invisible group-hover/lang:opacity-100 group-hover/lang:visible transition-all duration-500 translate-y-2 group-hover/lang:translate-y-0 z-[100] overflow-hidden">
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('/images/noise.svg')]" />
                
                <div className="relative z-10 space-y-1">
                  {[
                    { code: 'en', label: 'English', desc: 'Institutional' },
                    { code: 'es', label: 'Español', desc: 'Regional' }
                  ].map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageSwitch(lang.code)}
                      className="flex items-center justify-between w-full p-4 rounded-2xl transition-all hover:bg-white/5 group/item"
                    >
                      <div className="flex flex-col items-start gap-0.5">
                        <span className={`text-[12px] font-bold tracking-tight ${locale === lang.code ? 'text-white' : 'text-white/70 group-hover/item:text-white'}`}>{lang.label}</span>
                        <span className="text-[8px] font-bold uppercase tracking-widest text-white/30 group-hover/item:text-white/50">{lang.desc}</span>
                      </div>
                      {locale === lang.code && (
                        <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-black">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                {/* Aesthetic Arrow */}
                <div className="absolute -top-[6px] right-6 w-3 h-3 bg-[#0F0F0F] border-l border-t border-white/10 rotate-45"></div>
              </div>
            </div>

            <div className="relative group/search">
              <button 
                onClick={() => setIsSearchOpen(true)}
                aria-label="Search Catalog"
                title="Search Catalog"
                className="p-2 md:p-3.5 rounded-full bg-black/[0.03] hover:bg-black/[0.08] transition-colors text-black/70 active:scale-95"
              >
                <Search className="w-5 md:w-5.5 h-5 md:h-5.5" aria-hidden="true" />
                <span className="sr-only">Search Catalog</span>
              </button>

              {/* Enhanced Stealth Luxury Search Tooltip */}
              <div className="absolute top-full right-0 mt-6 w-72 bg-[#0F0F0F] text-white border border-white/10 shadow-[0_30px_100px_rgba(0,0,0,0.4)] rounded-[2rem] p-8 opacity-0 invisible group-hover/search:opacity-100 group-hover/search:visible transition-all duration-500 scale-95 group-hover/search:scale-100 translate-y-2 group-hover/search:translate-y-0 z-[100] pointer-events-none overflow-hidden">
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('/images/noise.svg')]" />
                
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                      <Command className="w-4 h-4" />
                    </div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/90">{t('nav.search')}</div>
                  </div>

                  <h5 className="font-absans text-lg font-bold mb-4 leading-tight">{t('tooltips.search.title')}</h5>
                  <p className="font-archia text-[11px] leading-relaxed text-white/40 mb-8 font-medium">
                    {t('tooltips.search.desc')}
                  </p>

                  <div className="flex items-center justify-between pt-6 border-t border-white/5">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/20"></div>
                      <span className="text-[9px] font-bold text-white/30 uppercase tracking-[0.2em]">{t('search.shortcut')}</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/10 text-[9px] font-bold text-white/60">
                      <Command className="w-2.5 h-2.5" />
                      <span>K</span>
                    </div>
                  </div>
                </div>

                <div className="absolute -top-[6px] right-6 w-3 h-3 bg-[#0F0F0F] border-l border-t border-white/10 rotate-45"></div>
              </div>
            </div>

            <CartIcon />

            <Link 
              href="/contact" 
              className="hidden xl:flex items-center justify-center px-12 self-stretch bg-[#090C11] text-white rounded-full text-[14px] font-bold hover:bg-black transition-all shadow-xl active:scale-95 uppercase tracking-[0.2em]"
            >
              Contact
            </Link>

            {/* Mobile Toggle */}
            <button 
              className="xl:hidden p-2 md:p-3 rounded-full bg-black/5 text-black transition-transform active:scale-90"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle Navigation Menu"
              title="Toggle Navigation Menu"
            >
              {isMobileMenuOpen ? <X className="w-6 md:w-7 h-6 md:h-7" aria-hidden="true" /> : <Menu className="w-6 md:w-7 h-6 md:h-7" aria-hidden="true" />}
              <span className="sr-only">Toggle Navigation Menu</span>
            </button>
          </div>
        </div>
      </header>

      {/* Global Search Modal */}
      <GlobalSearch 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)} 
      />

      {/* Modern Light Mode Mobile Menu Overlay */}
      <div className={`fixed inset-0 z-[55] bg-white transition-all duration-700 ease-in-out ${
        isMobileMenuOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}>
        <div ref={mobileMenuScrollRef} className="h-full flex flex-col pt-24 pb-10 px-6 md:px-12 overflow-y-auto bg-[radial-gradient(circle_at_top_right,rgba(0,0,0,0.02),transparent_40%)]" data-lenis-prevent>
          {/* Section 1: Research Products */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-6 px-2">
              <FlaskConical className="w-4 h-4 text-black/20" />
              <span className="text-[10px] font-bold text-black/40 uppercase tracking-[0.3em]">Laboratory Catalog</span>
            </div>
            
            <div className="grid grid-cols-1 gap-2">
              <Link 
                href="/products" 
                className="flex items-center justify-between p-4 bg-black/[0.02] rounded-2xl hover:bg-black/[0.05] transition-all group"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-white border border-black/5 flex items-center justify-center shadow-sm">
                    <LayoutGrid className="w-5 h-5 text-black/60" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-black uppercase tracking-widest">{t('nav.products')}</span>
                    <span className="text-[10px] text-black/40 uppercase font-medium">Browse All Compounds</span>
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 -rotate-90 text-black/20 group-hover:text-black/40 transition-colors" />
              </Link>

              <div className="mt-4 px-2">
                <span className="text-[10px] font-bold text-black/20 uppercase tracking-[0.2em] mb-4 block">Categories</span>
                <div className="grid grid-cols-2 gap-2">
                  {categories.map(cat => (
                    <Link 
                      key={cat.id} 
                      href={`/products/${cat.id}`}
                      className="text-[11px] font-bold text-black/60 hover:text-black bg-black/[0.02] px-4 py-3 rounded-xl border border-black/[0.03] transition-all"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      {cat.name}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="w-full h-px bg-black/[0.05] mb-8" />

          {/* Section 2: Standards & Insights */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-6 px-2">
              <ShieldCheck className="w-4 h-4 text-black/20" />
              <span className="text-[10px] font-bold text-black/40 uppercase tracking-[0.3em]">Standards & Services</span>
            </div>
            
            <div className="flex flex-col gap-1">
              {[
                { href: '/certificates-of-analysis', label: t('nav.coa'), icon: ShieldCheck, desc: 'Purity & Testing Standards' },
                { href: '/peptide-calculator', label: t('nav.calculator'), icon: FlaskConical, desc: 'Reconstitution Utility' },
                { href: '/services', label: t('nav.services'), icon: LayoutGrid, desc: 'Wholesale Solutions' },
                { href: '/blog', label: t('nav.blog'), icon: Newspaper, desc: 'Research Updates & Insights' },
                { href: '/about', label: t('nav.about'), icon: Info, desc: 'Our Laboratory Mission' }
              ].map((link) => (
                <Link 
                  key={link.href}
                  href={link.href} 
                  className="flex items-center gap-4 p-4 rounded-2xl hover:bg-black/[0.03] transition-all group"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <div className="w-10 h-10 rounded-xl bg-black/[0.02] flex items-center justify-center group-hover:bg-black group-hover:text-white transition-all">
                    <link.icon className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-black/80 uppercase tracking-widest">{link.label}</span>
                    <span className="text-[10px] text-black/30 font-medium">{link.desc}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Section 3: Contact & Locale */}
          <div className="mt-auto pt-8 border-t border-black/[0.05]">
            <Link 
              href="/contact"
              className="flex items-center justify-center gap-3 w-full p-5 bg-black text-white rounded-2xl font-bold text-sm uppercase tracking-widest shadow-xl active:scale-95 transition-all mb-8"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <Phone className="w-4 h-4" />
              {t('nav.contact')}
            </Link>

            <div className="flex flex-col items-center gap-4 py-4 bg-black/[0.02] rounded-2xl">
              <span className="text-[10px] text-black/30 uppercase tracking-[0.4em] font-bold">{t('selectLanguage')}</span>
              <div className="flex items-center gap-8">
                <button 
                  onClick={() => handleLanguageSwitch('en')}
                  className={`text-sm font-bold transition-all ${locale === 'en' ? 'text-black scale-110' : 'text-black/20 hover:text-black/40'}`}
                >
                  ENGLISH
                </button>
                <div className="w-[1px] h-3 bg-black/10"></div>
                <button 
                  onClick={() => handleLanguageSwitch('es')}
                  className={`text-sm font-bold transition-all ${locale === 'es' ? 'text-black scale-110' : 'text-black/20 hover:text-black/40'}`}
                >
                  ESPAÑOL
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
