import { useEffect, useSyncExternalStore } from 'react';
import { hasDetails, registerCatalogue, registerDetails, sourceFor, type SourceDetails } from '../../domain/bible/sources';
import { getPassageSource } from '../../platform/youversion';

/**
 * The list of translations the platform offers (about 1,400, in about 1,200 languages) is part of the app
 * (src/domain/bible/catalogue.json, made by scripts/make-translation-data.mjs; it is not in git), so no device ever asks YouVersion for it: the platform
 * allows this app only a few hundred requests an hour IN ALL, whoever makes them. It is loaded from the app's own files the first
 * time something needs it. What is still asked for is small: the text of each verse once (kept on the device afterwards), and a
 * translation's own copyright notice once per device (kept too).
 */
const DETAILS_KEY = 'sbm-yv-details';

type CatalogueRow = [number, string, string, string];
/** The list made by scripts/make-translation-data.mjs, when this copy has it (a glob, so a missing file is not a build error). */
const bundled = import.meta.glob<{ default: CatalogueRow[] }>('../../domain/bible/catalogue.json');

let version = 0;
const listeners = new Set<() => void>();
const changed = () => { version++; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

function readDetails(): Record<string, SourceDetails> {
  try { return JSON.parse(localStorage.getItem(DETAILS_KEY) ?? '{}') as Record<string, SourceDetails>; } catch { return {}; }
}
for (const [id, d] of Object.entries(readDetails())) registerDetails(Number(id), d); // the notices kept on this device

let status: 'idle' | 'ready' = 'idle';
let inFlight: Promise<void> | null = null;
/** Makes the bundled list known (once). */
export function loadCatalogue(): Promise<void> {
  // The file is not in the public repository (it comes from the YouVersion API; see docs/youversion.md). Without it the picker lists the hand-written texts only.
  const [load] = Object.values(bundled);
  inFlight ??= (load ? load().then((m) => m.default) : Promise.resolve([] as CatalogueRow[])).then((rows) => {
    registerCatalogue(rows.map(([id, abbreviation, title, language]) => ({ id, abbreviation, title, language, organization: null })));
    status = 'ready';
    changed();
  });
  return inFlight;
}

/** For the picker: loads the list and re-renders when it is there. */
export function useCatalogue(): 'idle' | 'ready' {
  useEffect(() => { void loadCatalogue(); }, []);
  useSyncExternalStore(subscribe, () => version);
  return status;
}

/** Changes whenever the list or a notice arrives, for effects that must look again. */
export const useCatalogueVersion = () => useSyncExternalStore(subscribe, () => version);

/** Asks for one version's notice if it is not known yet (a hand-listed text has its own). */
export function ensureDetails(code: string | null | undefined): void {
  const source = sourceFor(code);
  if (!source || source.kind !== 'licensed' || !/^YV\d+$/.test(source.code) || hasDetails(source.yvId)) return;
  const platform = getPassageSource();
  if (!platform.available()) return;
  void platform.details(source.yvId).then((d) => {
    registerDetails(source.yvId, d);
    try {
      const all = readDetails();
      all[source.yvId] = d;
      const keys = Object.keys(all);
      if (keys.length > 200) delete all[keys[0]!]; // a few hundred at most
      localStorage.setItem(DETAILS_KEY, JSON.stringify(all));
    } catch { /* not kept */ }
    changed();
  }).catch(() => undefined);
}
