import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SettingsRepository } from '../data/repositories/settingsRepository';
import {
  bookName, cacheLanguagePreference, cachedLanguagePreference, describeError, formatIntervalIn, parseLanguagePreference,
  resolveLanguage, translate, type Language, type LanguagePreference, type MessageKey, type Params,
} from '.';

interface I18nValue {
  /** The language actually in use (a "System" preference is resolved to one). */
  language: Language;
  preference: LanguagePreference;
  setPreference: (p: LanguagePreference) => Promise<void>;
  t: (key: MessageKey, params?: Params) => string;
  /** "10m" in English, "10 min" in Spanish. */
  formatInterval: (ms: number) => string;
  /** A book's name in the interface language ("Psalm" / "Salmos"). */
  bookName: (canonical: string) => string;
  /** Text for an error, in the interface language. */
  describeError: (error: unknown) => string;
}

const I18nContext = createContext<I18nValue | null>(null);
const browserLanguages = () => (typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]);

export function I18nProvider({ settings, children }: { settings: SettingsRepository; children: ReactNode }) {
  // Start from the cached choice so the first screen is already in the right language; the settings table confirms it.
  const [preference, setPref] = useState<LanguagePreference>(cachedLanguagePreference);

  useEffect(() => {
    settings.get<unknown>('language').then((saved) => {
      if (saved !== undefined) setPref(parseLanguagePreference(saved));
    });
  }, [settings]);

  const language = resolveLanguage(preference, browserLanguages());

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = translate(language, 'app.name');
  }, [language]);

  const setPreference = useCallback(
    async (p: LanguagePreference) => {
      setPref(p);
      cacheLanguagePreference(p);
      await settings.set('language', p);
    },
    [settings],
  );

  const value = useMemo<I18nValue>(
    () => ({
      language,
      preference,
      setPreference,
      t: (key, params) => translate(language, key, params),
      formatInterval: (ms) => formatIntervalIn(language, ms),
      bookName: (canonical) => bookName(language, canonical),
      describeError: (error) => describeError(language, error),
    }),
    [language, preference, setPreference],
  );

  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
