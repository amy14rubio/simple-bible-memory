import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { SettingsRepository } from '../data/repositories/settingsRepository';

export type ThemePreference = 'system' | 'light' | 'dark';
const CACHE_KEY = 'theme-pref'; // flash-avoidance cache only; the settings table is the source of truth

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

export function applyTheme(pref: ThemePreference) {
  const dark = pref === 'dark' || (pref === 'system' && systemDark());
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => Promise<void>;
}
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ settings, children }: { settings: SettingsRepository; children: ReactNode }) {
  const [preference, setPref] = useState<ThemePreference>('system');

  useEffect(() => {
    settings.get<ThemePreference>('theme').then((saved) => {
      if (saved) setPref(saved);
    });
  }, [settings]);

  useEffect(() => {
    applyTheme(preference);
    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = useCallback(
    async (p: ThemePreference) => {
      setPref(p);
      await settings.set('theme', p);
      try { localStorage.setItem(CACHE_KEY, p); } catch { /* cache is optional */ }
    },
    [settings],
  );

  return <ThemeContext value={{ preference, setPreference }}>{children}</ThemeContext>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
