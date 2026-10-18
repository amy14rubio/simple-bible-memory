import { useEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';

const WAIT_FOR_HEADING_MS = 3000;

/**
 * Tells people who cannot see the screen that it changed. A web app swaps its content without loading a new page, so
 * nothing happens by itself: the browser tab keeps one title, and keyboard focus is left behind on something that is
 * gone. After each navigation this gives the tab the screen's name (its main heading), and, if nothing on the new screen
 * took focus already (a form field, say), moves focus to that heading so a screen reader reads it out. Screens fill in
 * after their data loads, so it waits for the heading to appear.
 */
export function useRouteAnnouncer(main: RefObject<HTMLElement | null>) {
  const { pathname } = useLocation();
  const { t } = useI18n();
  const first = useRef(true); // the first screen is not announced: the page itself is loading
  const appName = t('app.name');

  useEffect(() => {
    const root = main.current;
    if (!root) return;
    const announce = first.current === false;
    first.current = false;
    let finished = false;

    const apply = () => {
      const heading = root.querySelector('h1');
      const name = heading?.textContent?.trim();
      if (!heading || !name) return false;
      document.title = name === appName ? appName : `${name} · ${appName}`;
      const focused = document.activeElement;
      if (announce && (!focused || focused === document.body)) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
      return true;
    };

    if (apply()) return;
    const observer = new MutationObserver(() => { if (!finished && apply()) { finished = true; observer.disconnect(); } });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    const giveUp = setTimeout(() => { finished = true; observer.disconnect(); document.title = appName; }, WAIT_FOR_HEADING_MS);
    return () => { finished = true; observer.disconnect(); clearTimeout(giveUp); };
  }, [pathname, main, appName]);
}
