import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { directionOf } from './motion';

/**
 * Where each screen is scrolled to. A screen you go to starts at the top (the app is one page whose content is swapped, so the browser would
 * otherwise keep the old screen's position: Privacy opened from the bottom of Settings opened scrolled to the bottom). Going back puts the screen
 * you return to where you left it. Changes that keep the same screen (a popup, a search, a filter) are left alone.
 */
export function useScrollToTop() {
  const { pathname } = useLocation();
  const type = useNavigationType();
  const last = useRef(pathname);
  const positions = useRef(new Map<string, number>());
  const current = useRef(pathname);
  const cancel = useRef<(() => void) | null>(null);

  // remember how far the screen on view is scrolled
  useEffect(() => {
    const onScroll = () => { positions.current.set(current.current, window.scrollY); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useLayoutEffect(() => {
    if (pathname === last.current) return;
    const going = directionOf(last.current, pathname, type);
    last.current = pathname;
    current.current = pathname;
    cancel.current?.();
    const target = going === 'back' ? positions.current.get(pathname) ?? 0 : 0;
    window.scrollTo(0, 0);
    if (target <= 0) return;
    // A screen fills in after its data loads, so it may not be tall enough yet: try again for a moment, until it is (or the person scrolls).
    let frames = 0;
    let stopped = false;
    const stop = () => { stopped = true; window.removeEventListener('wheel', stop); window.removeEventListener('touchstart', stop); };
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchstart', stop, { passive: true });
    const step = () => {
      if (stopped) return;
      const room = document.documentElement.scrollHeight - window.innerHeight;
      if (room >= target - 1) { window.scrollTo(0, target); stop(); return; }
      if (++frames < 45) requestAnimationFrame(step); else stop();
    };
    requestAnimationFrame(step);
    cancel.current = stop;
  }, [pathname, type]);
}
