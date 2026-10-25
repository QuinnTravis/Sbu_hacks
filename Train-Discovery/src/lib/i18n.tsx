"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_LOCALE, LOCALES, type LocaleInfo } from "@/locales";
import { LOCALE_STORAGE_KEY } from "./i18n-boot";
import {
  formatClock,
  formatDistance,
  formatDuration,
  formatList,
  formatNumber,
  localeInfo,
  matchLocale,
  translate,
  translatePlural,
  type Vars,
} from "./i18n-core";

export type I18n = {
  code: string;
  locale: LocaleInfo;
  locales: LocaleInfo[];
  setLocale: (code: string) => void;
  t: (key: string, vars?: Vars) => string;
  plural: (key: string, count: number, vars?: Vars) => string;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  distance: (meters: number) => string;
  duration: (seconds: number) => string;
  /** Long units for speech: "2 minutes", not "2 min". */
  spokenDuration: (seconds: number) => string;
  clock: (date: Date) => string;
  list: (items: string[]) => string;
};

function build(code: string, setLocale: (code: string) => void): I18n {
  const locale = localeInfo(code);
  return {
    code: locale.code,
    locale,
    locales: LOCALES,
    setLocale,
    t: (key, vars) => translate(locale.code, key, vars),
    plural: (key, count, vars) => translatePlural(locale.code, key, count, vars),
    number: (value, options) => formatNumber(locale.code, value, options),
    distance: (meters) => formatDistance(locale.code, meters),
    duration: (seconds) => formatDuration(locale.code, seconds),
    spokenDuration: (seconds) => {
      const minutes = Math.max(1, Math.round(seconds / 60));
      return new Intl.NumberFormat(locale.code, { style: "unit", unit: "minute", unitDisplay: "long" }).format(minutes);
    },
    clock: (date) => formatClock(locale.code, date),
    list: (items) => formatList(locale.code, items),
  };
}

const I18nContext = createContext<I18n>(build(DEFAULT_LOCALE, () => {}));

export function I18nProvider({ children }: { children: ReactNode }) {
  // Hydrate in English to match the server, then switch before the page is revealed.
  const [code, setCode] = useState(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    } catch {
      // Private browsing: fall back to the browser language.
    }
    const next = stored && LOCALES.some((l) => l.code === stored) ? stored : matchLocale(navigator.language);
    // A microtask still runs before the first paint, while the page is hidden.
    queueMicrotask(() => {
      setCode(next);
      setReady(true);
    });
  }, []);

  useLayoutEffect(() => {
    if (!ready) return;
    const info = localeInfo(code);
    const root = document.documentElement;
    root.lang = info.code;
    root.dir = info.dir;
    root.removeAttribute("data-locale-pending");
  }, [code, ready]);

  const setLocale = useCallback((next: string) => {
    const info = localeInfo(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, info.code);
    } catch {
      // The choice still applies for this visit.
    }
    setCode(info.code);
  }, []);

  const value = useMemo(() => build(code, setLocale), [code, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}
