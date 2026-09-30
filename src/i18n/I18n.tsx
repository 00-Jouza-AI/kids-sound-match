import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Lang } from '../content/types';
import { ar, en, type StringKey } from './strings';

const TABLES: Record<Lang, Record<StringKey, string>> = { en, ar };

export interface I18n {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
}

export function makeI18n(lang: Lang): I18n {
  const table = TABLES[lang];
  return {
    lang,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    t: (key, vars) => {
      const text = table[key] ?? en[key];
      return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text;
    },
  };
}

const I18nContext = createContext<I18n>(makeI18n('en'));

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo(() => makeI18n(lang), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}

export function formatDateTime(timestamp: number, lang: Lang): string {
  const locale = lang === 'ar' ? 'ar-JO-u-nu-latn' : 'en-GB';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
}
