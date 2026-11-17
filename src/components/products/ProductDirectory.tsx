'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Search, FlaskConical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import ProductCard from '@/components/products/ProductCard';
import { getSearchEngine } from '@/lib/search';
import { useSearchParams } from 'next/navigation';

interface Product {
  name: string;
  slug: string;
  category: string;
  specs: string[];
  description: string;
}

interface ProductDirectoryProps {
  products: Product[];
  categories: { id: string; name: string }[];
}


export default function ProductDirectory({ products, categories }: ProductDirectoryProps) {
  const t = useTranslations('ProductsIndex');
  const tDetail = useTranslations('ProductDetail');
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  useEffect(() => {
    if (!searchParams) return;
    const q = searchParams.get('q');
    const cat = searchParams.get('cat');
    if (q) setSearchQuery(q);
    if (cat) setActiveCategory(cat);
  }, [searchParams]);

  // Memoize search engine
  const searchEngine = useMemo(() => getSearchEngine(products), [products]);

  // Compute category counts dynamically
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: products.length };
    categories.forEach(cat => {
      counts[cat.id] = products.filter(p => p.category === cat.id).length;
    });
    return counts;
  }, [products, categories]);

  const filteredProducts = useMemo(() => {
    let result = products;

    // Apply fuzzy search if query exists
    if (searchQuery.trim().length >= 2) {
      result = searchEngine.search(searchQuery).map(res => res.item);
    } else if (searchQuery.trim().length > 0) {
      // Basic includes for very short queries
      result = products.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply category filter
    if (activeCategory !== 'all') {
      result = result.filter(product => product.category === activeCategory);
    }

    return result;
  }, [products, searchQuery, activeCategory, searchEngine]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window !== 'undefined') {
        (window as any).initScrollReveals?.();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [filteredProducts]);


  return (
    <div className="w-full">
      {/* Search and filter bar */}
      <div className="sticky top-[70px] md:top-[90px] z-30 mb-10 border-y border-[#E6EAF1] bg-[#F3F5FA]/90 py-4 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-[1440px] px-5 md:px-10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
            <div className="group relative w-full lg:max-w-md lg:shrink-0">
              <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0B0F14]/35 transition-colors group-focus-within:text-[#0B6F7B]" />
              <input
                type="search"
                aria-label={t('searchPlaceholder') || 'Search compounds...'}
                placeholder={t('searchPlaceholder') || 'Search compounds...'}
                className="w-full rounded-full border border-[#E6EAF1] bg-white py-3 pl-12 pr-5 font-dm-sans text-sm text-[#0B0F14] placeholder-[#0B0F14]/35 outline-none transition-shadow focus:border-[#4FC3D0] focus:shadow-[0_0_0_3px_rgba(79,195,208,0.2)]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="relative min-w-0 flex-1">
              <div
                className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                data-lenis-prevent
              >
                {[{ id: 'all', name: 'All' }, ...categories].map((cat) => {
                  const active = activeCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActiveCategory(cat.id)}
                      aria-pressed={active}
                      className={`flex flex-shrink-0 cursor-pointer items-center gap-2 rounded-full border px-4 py-2.5 font-dm-sans text-[13px] font-medium outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-[#4FC3D0] ${
                        active ? 'border-[#0B0F14] bg-[#0B0F14] text-white' : 'border-[#E6EAF1] bg-white text-[#0B0F14]/65 hover:border-[#0B0F14]/40 hover:text-[#0B0F14]'
                      }`}
                    >
                      <span>{cat.name}</span>
                      <span className={`rounded-full px-1.5 py-0.5 font-dm-mono text-[9px] leading-none ${active ? 'bg-[#4FC3D0] text-[#0B0F14]' : 'bg-[#F3F5FA] text-[#0B0F14]/50'}`}>
                        {categoryCounts[cat.id] || 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Product grid */}
      <div className="mx-auto w-full max-w-[1440px] px-5 pb-6 md:px-10">
        {filteredProducts.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.slug}
                product={product}
                reveal={false}
                description={tDetail.has(`descriptions.${product.slug}`) ? tDetail(`descriptions.${product.slug}`) : product.description}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[1.25rem] border border-[#E6EAF1] bg-white py-20 text-center">
            <FlaskConical className="mx-auto mb-5 h-12 w-12 text-[#0B0F14]/15" />
            <h3 className="mb-2 text-2xl font-light tracking-[-0.03em] text-[#0B0F14]">No compounds found</h3>
            <p className="font-dm-sans text-sm text-[#0B0F14]/55">Try adjusting your search or category filters</p>
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setActiveCategory('all'); }}
              className="mt-6 font-dm-mono text-sm text-[#0B6F7B] underline underline-offset-2 hover:text-[#0B0F14]"
            >
              Reset all filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
