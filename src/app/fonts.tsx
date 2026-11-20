import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { SettingsRepository } from '../data/repositories/settingsRepository';
import { fontFamilyValue, type CatalogueFont } from '../lib/fonts/catalogue';
import { downloadFont, registerFont, removeFont, type StoredFont } from '../lib/fonts/fontStore';

/**
 * One font for the whole app. It replaces both of the app's typefaces (the serif for verses and headings, the sans for
 * buttons and labels). Only the font in use is kept on the device: choosing another replaces it.
 */
const FAMILY_KEY = 'font';
const STORED_KEY = 'font_stored';
const VARIABLES = ['--font-serif', '--font-sans'] as const;
const SCALE_KEY = 'text_scale';
const SCALE_CACHE = 'text-scale'; // flash-avoidance cache only (read by the script in index.html)
export const MIN_SCALE = 0.85;
export const MAX_SCALE = 2;
const clampScale = (n: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(n * 20) / 20));

interface FontContextValue {
  /** The chosen family, or null for the app's own fonts. */
  family: string | null;
  /** The chosen font's files on this device. */
  stored: StoredFont | null;
  /** Downloads and applies a font (replacing the current one), or null to go back to the app's own fonts. */
  apply: (font: CatalogueFont | null) => Promise<void>;
  /** The text size: 1 is normal, 1.25 makes every piece of text 25% bigger. */
  scale: number;
  setScale: (scale: number) => void;
}
const FontContext = createContext<FontContextValue | null>(null);

const isStoredFont = (v: unknown): v is StoredFont => !!v && typeof (v as StoredFont).family === 'string' && Array.isArray((v as StoredFont).faces);
const category = (f: StoredFont) => f.category ?? 'sans-serif'; // fonts saved before the category was kept

export function FontProvider({ settings, children }: { settings: SettingsRepository; children: ReactNode }) {
  const [stored, setStored] = useState<StoredFont | null>(null);
  const storedRef = useRef(stored);
  storedRef.current = stored;
  // Starts from the size remembered on this device (the same one index.html applied before the app drew), so the text does not drop to 100% until the database has answered.
  const [scale, setScaleState] = useState(() => { try { const cached = parseFloat(localStorage.getItem(SCALE_CACHE) ?? ''); return Number.isFinite(cached) ? clampScale(cached) : 1; } catch { return 1; } });
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    void settings.get<number>(SCALE_KEY).then((saved) => { if (typeof saved === 'number') setScaleState(clampScale(saved)); });
  }, [settings]);

  // The whole app follows as the slider moves; the database gets the last value a moment after you stop.
  useEffect(() => { document.documentElement.style.setProperty('--text-scale', String(scale)); }, [scale]);
  const setScale = useCallback((next: number) => {
    const value = clampScale(next);
    setScaleState(value);
    try { localStorage.setItem(SCALE_CACHE, String(value)); } catch { /* the cache is optional */ }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void settings.set(SCALE_KEY, value), 250);
  }, [settings]);

  // Load what was saved and register it. If its files have gone (site data cleared), quietly go back to the default.
  useEffect(() => {
    void (async () => {
      const saved = await settings.get<unknown>(STORED_KEY);
      if (isStoredFont(saved) && (await registerFont(saved).catch(() => false))) setStored(saved);
      else if (saved) { await settings.set(STORED_KEY, null); await settings.set(FAMILY_KEY, null); }
    })();
  }, [settings]);

  // Point both font variables at the chosen font (or back at the app's own).
  useEffect(() => {
    for (const name of VARIABLES) {
      if (stored) document.documentElement.style.setProperty(name, fontFamilyValue({ family: stored.family, category: category(stored) }));
      else document.documentElement.style.removeProperty(name);
    }
  }, [stored]);

  const apply = useCallback(async (font: CatalogueFont | null) => {
    const old = storedRef.current;
    if ((old?.family ?? null) === (font?.family ?? null)) return;
    let next: StoredFont | null = null;
    if (font) {
      next = await downloadFont(font);
      if (!(await registerFont(next))) throw new Error(`Could not use ${font.family}.`);
    }
    setStored(next);
    await settings.set(STORED_KEY, next);
    await settings.set(FAMILY_KEY, font?.family ?? null);
    if (old) await removeFont(old); // only the font in use is kept
  }, [settings]);

  return <FontContext value={{ family: stored?.family ?? null, stored, apply, scale, setScale }}>{children}</FontContext>;
}

export function useFont() {
  const ctx = useContext(FontContext);
  if (!ctx) throw new Error('useFont must be used inside FontProvider');
  return ctx;
}
