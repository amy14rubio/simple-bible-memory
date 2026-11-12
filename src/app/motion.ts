import { useSyncExternalStore } from 'react';

/**
 * Screen transitions (a prototype, to feel the options). 'off' is how the app has always behaved: one screen replaces the other at once.
 * 'fade' is a quiet 200ms fade-in with a small rise on the new screen. 'material' follows Google's Material motion: going deeper slides the
 * old screen out and the new one in from the right, going back reverses it, and switching between the main tabs fades through.
 * The switch (Settings, bottom) is shown only in a build made with VITE_MOTION_PROTOTYPE=1; every other build is 'off'.
 */
export type Motion = 'off' | 'fade' | 'material';
export const MOTION_PROTOTYPE = import.meta.env.VITE_MOTION_PROTOTYPE === '1';

const KEY = 'sbm-motion';
const read = (): Motion => {
  if (!MOTION_PROTOTYPE) return 'off';
  try {
    const v = localStorage.getItem(KEY);
    return v === 'off' || v === 'fade' || v === 'material' ? v : 'fade';
  } catch {
    return 'fade';
  }
};

let current: Motion = read();
const listeners = new Set<() => void>();

export const getMotion = () => current;
export function setMotion(next: Motion) {
  current = next;
  try { localStorage.setItem(KEY, next); } catch { /* the choice is just not remembered */ }
  document.documentElement.dataset.motion = next;
  listeners.forEach((l) => l());
}
export const useMotion = () => useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getMotion, getMotion);
if (typeof document !== 'undefined') document.documentElement.dataset.motion = current;

/** The browser's own cross-fade between two states of the page (Chrome and Android WebView 111+, Safari 18+). */
export const supportsViewTransitions = () => typeof document !== 'undefined' && 'startViewTransition' in document;
export const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export type Direction = 'forward' | 'back' | 'tab';
const TABS = new Set(['/', '/stats']);
const depth = (p: string) => p.split('/').filter(Boolean).length;
/** Which way a navigation goes: deeper (forward), up (back), or sideways between the main tabs. */
export function directionOf(from: string, to: string, action: 'PUSH' | 'POP' | 'REPLACE'): Direction {
  if (TABS.has(from) && TABS.has(to)) return 'tab';
  if (action === 'POP') return 'back';
  return depth(to) < depth(from) ? 'back' : 'forward';
}
