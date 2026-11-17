'use client';

import { usePathname } from '@/i18n/routing';
import React from 'react';

export default function MainContentWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHomePage = pathname === '/' || pathname === '';

  return (
    <main className={`flex-grow ${isHomePage ? '' : 'bg-[#F3F5FA] pt-[4.75rem] md:pt-24'}`}>
      {children}
    </main>
  );
}
