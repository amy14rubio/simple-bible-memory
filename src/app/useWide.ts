import { useEffect, useState } from 'react';

/** Keep in step with the `wide` variant in src/styles/tokens.css. */
const WIDE = '(min-width: 1000px) and (min-height: 700px)';
const matches = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(WIDE).matches;

/** Is the screen wide enough for the sidebar (a tablet lying down, a computer)? */
export function useWide(): boolean {
  const [wide, setWide] = useState(matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

const KEY = 'sbm-sidebar';
/** Whether the sidebar is shown: remembered on this device (a convenience only: if storage is unavailable it is simply shown). */
export function useSidebarOpen(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(KEY) !== 'closed'; } catch { return true; } });
  return [open, (next) => { setOpen(next); try { localStorage.setItem(KEY, next ? 'open' : 'closed'); } catch { /* not remembered */ } }];
}
