/**
 * Screen transitions. A screen you go to slides in and fades in (Material motion's "shared axis", with only the new screen moving, so the screen
 * is never covered by a picture and every tap works at once): deeper, or to a later main tab, comes in from the right; back, or to an earlier tab,
 * from the left. The styles are in tokens.css (`.screen-root`); AppShell says which way a navigation goes. People who ask their phone for reduced
 * motion get none.
 */
export const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export type Direction = 'forward' | 'back';
/** The main tabs, in order: Collections, then Statistics. Switching between them goes the way the tabs lie (to the right going to Statistics). */
const TABS = ['/', '/stats'];
const depth = (p: string) => p.split('/').filter(Boolean).length;
/** Which way a navigation goes: deeper or to a later tab (forward), up or to an earlier tab (back). */
export function directionOf(from: string, to: string, action: 'PUSH' | 'POP' | 'REPLACE'): Direction {
  const a = TABS.indexOf(from);
  const b = TABS.indexOf(to);
  if (a >= 0 && b >= 0) return b > a ? 'forward' : 'back';
  if (action === 'POP') return 'back';
  return depth(to) < depth(from) ? 'back' : 'forward';
}
