'use client';

import { useState, useEffect } from 'react';
import { Share2, Link2, Check, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ShareProductProps {
  title: string;
  url?: string;
}

export default function ShareProduct({ title, url: propUrl }: ShareProductProps) {
  const t = useTranslations('ProductDetail.share');
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Client-side only URL detection
  const url = propUrl || (mounted ? window.location.href : '');

  if (!mounted) return <div className="h-24 animate-pulse bg-[#E6EAF1]/60 rounded-2xl my-8"></div>;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  const shareLinks = [
    {
      name: 'WhatsApp',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      ),
      url: `https://wa.me/?text=${encodeURIComponent(title + ': ' + url)}`,
      color: 'hover:text-emerald-500 hover:border-emerald-500/20'
    },
    {
      name: 'LinkedIn',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.454c.98 0 1.775-.773 1.775-1.729V1.729C24 .774 23.205 0 22.225 0z" />
        </svg>
      ),
      url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
      color: 'hover:text-blue-600 hover:border-blue-600/20'
    },
    {
      name: 'Twitter',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.84 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
        </svg>
      ),
      url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
      color: 'hover:text-black hover:border-black/35'
    },
    {
      name: 'Email',
      icon: <Mail className="w-4 h-4" />,
      url: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(t('emailBody', { title, url }))}`,
      color: 'hover:text-black hover:border-black/35'
    }
  ];

  return (
    <div className="flex flex-col gap-3.5 py-6 border-t border-[#E6EAF1] mt-8">
      <div className="flex items-center gap-2">
        <Share2 className="w-3.5 h-3.5 text-[#0B0F14]/40" />
        <span className="font-dm-mono text-[10px] uppercase tracking-[0.2em] text-[#0B0F14]/50">{t('title')}</span>
      </div>
      
      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 bg-white hover:bg-[#F3F5FA] border border-[#E6EAF1] rounded-full px-5 py-2 text-xs transition-all group"
          title={t('copy')}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600 animate-scale" />
              <span className="text-emerald-600 font-dm-sans text-[11px] font-medium">{t('copied')}</span>
            </>
          ) : (
            <>
              <Link2 className="w-3.5 h-3.5 text-black/40 group-hover:text-black transition-colors" />
              <span className="text-black/50 group-hover:text-black font-dm-sans text-[11px] font-medium transition-colors">{t('copy')}</span>
            </>
          )}
        </button>

        <div className="flex items-center gap-2.5">
          {shareLinks.map((link) => (
            <a
              key={link.name}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`w-9 h-9 flex items-center justify-center rounded-full bg-white border border-[#E6EAF1] text-[#0B0F14]/50 transition-all ${link.color} hover:bg-[#F3F5FA]`}
              title={`Share on ${link.name}`}
              aria-label={`Share on ${link.name}`}
            >
              {link.icon}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
