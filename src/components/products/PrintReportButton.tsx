'use client';

import { Printer } from 'lucide-react';

interface PrintReportButtonProps {
  label: string;
}

export default function PrintReportButton({ label }: PrintReportButtonProps) {
  return (
    <button 
      onClick={() => typeof window !== 'undefined' && window.print()}
      className="inline-flex items-center gap-1.5 rounded-full border border-[#0B0F14]/15 bg-white px-4 py-2 font-dm-sans text-xs font-medium text-[#0B0F14] transition-colors hover:bg-[#0B0F14] hover:text-white"
    >
      <Printer className="w-3.5 h-3.5" />
      <span>{label}</span>
    </button>
  );
}
