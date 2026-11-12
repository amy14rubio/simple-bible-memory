import { useMemo, type ComponentProps, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { unstable_HistoryRouter as HistoryRouter } from 'react-router-dom';
import { createHashHistory } from 'history';
import { directionOf, getMotion, prefersReducedMotion, supportsViewTransitions } from './motion';

/**
 * The app's router: a HashRouter (addresses like /#/collections/1 work from Capacitor's local files with no server), with one addition. When the
 * 'material' screen transitions are on, every change of screen (a tap, the Back arrow, the phone's Back) runs inside the browser's view transition,
 * so the old screen slides out as the new one slides in.
 */
export function MotionRouter({ children }: { children: ReactNode }) {
  const history = useMemo(() => {
    const h = createHashHistory({ window });
    const listen = h.listen.bind(h);
    let from = h.location.pathname;
    h.listen = (fn) => listen((update) => {
      const direction = directionOf(from, update.location.pathname, update.action);
      const animated = getMotion() === 'material' && from !== update.location.pathname && supportsViewTransitions() && !prefersReducedMotion();
      from = update.location.pathname;
      if (!animated) { fn(update); return; }
      document.documentElement.dataset.nav = direction;
      // Inside the callback the new screen is drawn at once (flushSync), so the browser can take its picture and slide the two.
      (document as Document & { startViewTransition: (cb: () => void) => unknown }).startViewTransition(() => { flushSync(() => fn(update)); });
    });
    return h;
  }, []);
  // (the router's own History type asks for two more methods than the `history` library's; it never calls them for a hash router)
  return <HistoryRouter history={history as unknown as ComponentProps<typeof HistoryRouter>['history']}>{children}</HistoryRouter>;
}
