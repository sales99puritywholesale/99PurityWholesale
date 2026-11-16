'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PLAN_STEPS } from './plan-config';

export interface PlanAnswers {
  build?: string;
  site?: string;
  volume?: string;
  timeline?: string;
  notes?: string;
  name?: string;
  business?: string;
  email?: string;
  phone?: string;
}

interface PlanCtx {
  open: boolean;
  step: number;
  done: boolean;
  services: string[];
  answers: PlanAnswers;
  openPlan: (at?: 'start' | 'contact') => void;
  closePlan: () => void;
  setStep: (n: number) => void;
  setDone: (v: boolean) => void;
  toggleService: (key: string) => void;
  setServices: (keys: string[]) => void;
  hasService: (key: string) => boolean;
  setAnswer: (key: keyof PlanAnswers, value: string) => void;
  reset: () => void;
}

const Ctx = createContext<PlanCtx | null>(null);
const STORAGE_KEY = 'pw99-plan-v1';

/** Contact details are never written to storage; only the plan choices are. */
const PERSISTED: Array<keyof PlanAnswers> = ['build', 'site', 'volume', 'timeline', 'notes'];

export function PlanProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [services, setServicesState] = useState<string[]>([]);
  const [answers, setAnswers] = useState<PlanAnswers>({});
  const [loaded, setLoaded] = useState(false);

  // restore after mount (avoids hydration mismatches)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { services?: string[]; answers?: PlanAnswers };
        if (Array.isArray(saved.services)) setServicesState(saved.services.filter((s) => typeof s === 'string'));
        if (saved.answers && typeof saved.answers === 'object') setAnswers(saved.answers);
      }
    } catch {
      /* storage unavailable: the plan simply lives for this visit */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      const keep: PlanAnswers = {};
      PERSISTED.forEach((k) => {
        if (answers[k]) keep[k] = answers[k];
      });
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ services, answers: keep }));
    } catch {
      /* ignore */
    }
  }, [services, answers, loaded]);

  const openPlan = useCallback((at: 'start' | 'contact' = 'start') => {
    setDone(false);
    setStep(at === 'contact' ? PLAN_STEPS.indexOf('contact') : 0);
    setOpen(true);
  }, []);

  const value = useMemo<PlanCtx>(
    () => ({
      open,
      step,
      done,
      services,
      answers,
      openPlan,
      closePlan: () => setOpen(false),
      setStep,
      setDone,
      toggleService: (key) => setServicesState((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key])),
      setServices: (keys) => setServicesState(keys),
      hasService: (key) => services.includes(key),
      setAnswer: (key, v) => setAnswers((cur) => ({ ...cur, [key]: v })),
      reset: () => {
        setServicesState([]);
        setAnswers({});
        setStep(0);
        setDone(false);
      },
    }),
    [open, step, done, services, answers, openPlan]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlan(): PlanCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePlan must be used inside <PlanProvider>');
  return ctx;
}
