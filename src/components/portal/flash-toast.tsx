'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { cn } from '@/lib/portal/utils';

/**
 * The result message of an action, shown as a toast in the bottom-right corner. It dismisses itself (4 seconds for a success, 9 for a problem), can be closed by hand, and removes the
 * result flag from the address bar, so a refresh or the Back button never shows an old result again. `stamp` changes on every server render, so two identical results in a row both show.
 */
export function FlashToast({ kind, message, verifyHref, stamp }: { kind: 'ok' | 'error'; message: string; verifyHref?: string; stamp: number }) {
  const [state, setState] = useState<'open' | 'leaving' | 'gone'>('open');

  useEffect(() => {
    setState('open');
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('ok') || url.searchParams.has('e')) {
        url.searchParams.delete('ok');
        url.searchParams.delete('e');
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
      }
    } catch {
      /* the address bar is cosmetic here */
    }
    // A toast that asks for an action ("Verify now") stays until it is used or closed; the others dismiss themselves.
    if (verifyHref) return undefined;
    const leave = setTimeout(() => setState('leaving'), kind === 'ok' ? 4000 : 9000);
    return () => clearTimeout(leave);
  }, [stamp, kind, verifyHref]);

  useEffect(() => {
    if (state !== 'leaving') return;
    const gone = setTimeout(() => setState('gone'), 180);
    return () => clearTimeout(gone);
  }, [state]);

  if (state === 'gone') return null;
  const ok = kind === 'ok';
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70] w-[min(24rem,calc(100vw-2rem))] sm:bottom-6 sm:right-6">
      <div
        role={ok ? 'status' : 'alert'}
        className={cn(
          'pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-4 shadow-[0_12px_32px_rgba(16,24,40,0.16)]',
          ok ? 'border-[#ABEFC6]' : 'border-[#FECDCA]',
          state === 'leaving' ? 'animate-[portal-toast-out_180ms_ease-in_forwards]' : 'animate-[portal-toast-in_260ms_cubic-bezier(0.16,1,0.3,1)]',
        )}
      >
        {ok ? <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-portal-success" /> : <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-portal-danger" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-portal-text">{ok ? 'Saved' : 'Could not complete'}</p>
          {!ok && <p className="mt-0.5 text-sm text-portal-muted">{message}</p>}
          {verifyHref && (
            <Link href={verifyHref} className="mt-2 inline-block rounded-full bg-portal-accent px-3 py-1 text-xs font-semibold text-portal-sidebar transition-colors hover:bg-[#6ad0db]">
              Verify now
            </Link>
          )}
        </div>
        <button type="button" onClick={() => setState('leaving')} aria-label="Dismiss" className="-mr-1 -mt-1 rounded-full p-1.5 text-portal-muted transition-colors hover:bg-portal-canvas hover:text-portal-text">
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
