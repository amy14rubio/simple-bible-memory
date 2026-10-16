import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { SettingsRepository } from '../data/repositories/settingsRepository';
import { CUSTOM_VAR_NAMES, DARK_START, LIGHT_START, customThemeVars, isCustomTheme, type CustomTheme } from '../lib/customTheme';

export type ThemePreference = 'system' | 'light' | 'dark' | 'custom';
const CACHE_KEY = 'theme-pref'; // flash-avoidance caches only; the settings table is the source of truth
const CUSTOM_CACHE_KEY = 'theme-custom'; // the custom theme's computed variables (read by the script in index.html)

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

export function applyTheme(pref: ThemePreference, custom?: CustomTheme) {
  const root = document.documentElement;
  if (pref === 'custom') {
    const { dark, vars } = customThemeVars(custom ?? (systemDark() ? DARK_START : LIGHT_START));
    root.dataset.theme = dark ? 'dark' : 'light'; // the built-in palette that suits this background (rating colours etc.)
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
    return;
  }
  for (const name of CUSTOM_VAR_NAMES) root.style.removeProperty(name);
  const dark = pref === 'dark' || (pref === 'system' && systemDark());
  root.dataset.theme = dark ? 'dark' : 'light';
}

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => Promise<void>;
  /** The saved custom colours, once there are any. */
  custom: CustomTheme | undefined;
  /** Saves new custom colours and switches to the custom theme. */
  setCustom: (c: CustomTheme) => Promise<void>;
}
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ settings, children }: { settings: SettingsRepository; children: ReactNode }) {
  const [preference, setPref] = useState<ThemePreference>('system');
  const [custom, setCustomState] = useState<CustomTheme>();

  useEffect(() => {
    settings.get<ThemePreference>('theme').then((saved) => {
      if (saved) setPref(saved);
    });
    settings.get<unknown>('custom_theme').then((saved) => {
      if (isCustomTheme(saved)) setCustomState(saved);
    });
  }, [settings]);

  useEffect(() => {
    applyTheme(preference, custom);
    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference, custom]);

  const remember = (pref: ThemePreference, c?: CustomTheme) => {
    try {
      localStorage.setItem(CACHE_KEY, pref);
      if (pref === 'custom' && c) localStorage.setItem(CUSTOM_CACHE_KEY, JSON.stringify(customThemeVars(c)));
      else localStorage.removeItem(CUSTOM_CACHE_KEY);
    } catch { /* the caches are optional */ }
  };

  // Dragging a colour picker produces many changes a second: the screen follows every one, the database gets the last.
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const setCustom = useCallback(
    async (c: CustomTheme) => {
      setCustomState(c);
      setPref('custom');
      remember('custom', c);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void settings.set('custom_theme', c);
        void settings.set('theme', 'custom');
      }, 250);
    },
    [settings],
  );

  const setPreference = useCallback(
    async (p: ThemePreference) => {
      if (p === 'custom' && !custom) {
        // First time: start from the palette you are looking at now, so nothing jumps.
        await setCustom(document.documentElement.dataset.theme === 'dark' ? DARK_START : LIGHT_START);
        return;
      }
      setPref(p);
      remember(p, custom);
      await settings.set('theme', p);
    },
    [settings, custom, setCustom],
  );

  return <ThemeContext value={{ preference, setPreference, custom, setCustom }}>{children}</ThemeContext>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
