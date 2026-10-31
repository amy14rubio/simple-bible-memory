import { useEffect, useSyncExternalStore } from 'react';
import { EVERYTHING_ON, parseSwitch, type SwitchState } from '../../domain/bible/switch';
import { loadBackends, sharingAvailable } from '../sharing/backend';

/**
 * Reads the off switch for licensed translations (src/domain/bible/switch.ts) from the cloud, and keeps the last answer on the device:
 * with no connection the app goes on with what it last knew. It is read when the app opens, when the connection comes back, and
 * every half hour while the app is open.
 */
const KEY = 'sbm-licensed-switch';
const EVERY_MS = 30 * 60 * 1000;

function readCache(): SwitchState {
  try { return parseSwitch(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return EVERYTHING_ON; }
}

let state: SwitchState = readCache();
let version = 0;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const currentSwitch = (): SwitchState => state;

/** Asks the cloud. Resolves to the new state, or null if it could not be reached (the last known state stays). */
export async function refreshSwitch(): Promise<SwitchState | null> {
  if (!sharingAvailable()) return null;
  try {
    const { config } = await loadBackends();
    const next = parseSwitch(await config.licensedSwitch());
    const same = next.all === state.all && next.off.length === state.off.length && next.off.every((c) => state.off.includes(c));
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* not kept */ }
    if (!same) { state = next; version++; listeners.forEach((l) => l()); }
    return next;
  } catch {
    return null;
  }
}

/** Keeps the switch up to date while the app is open, and re-renders when it changes. */
export function useLicensedSwitch(): SwitchState {
  useEffect(() => {
    void refreshSwitch();
    const again = () => void refreshSwitch();
    window.addEventListener('online', again);
    const timer = setInterval(again, EVERY_MS);
    return () => { window.removeEventListener('online', again); clearInterval(timer); };
  }, []);
  useSyncExternalStore(subscribe, () => version);
  return state;
}
