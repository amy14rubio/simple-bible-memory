import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * A new screen starts at the top. The app is one page whose content is swapped, so the browser keeps the old screen's scroll position (open
 * Privacy from the bottom of Settings and it opened scrolled to the bottom). This puts a screen you go to at the top. Going Back is left
 * alone, and so are changes that keep the same screen (a popup, a search, a filter).
 */
export function useScrollToTop() {
  const { pathname } = useLocation();
  const type = useNavigationType();
  const last = useRef(pathname);
  useLayoutEffect(() => {
    if (pathname === last.current) return;
    last.current = pathname;
    if (type !== 'POP') window.scrollTo(0, 0);
  }, [pathname, type]);
}
