import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { ChartColumn, LibraryBig, PanelLeftOpen, Plus } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { useRouteAnnouncer } from './useRouteAnnouncer';
import { useScrollToTop } from './useScrollToTop';
import { directionOf, prefersReducedMotion } from './motion';
import { useWarmStats } from '../features/stats/StatisticsPage';
import { useFirstLaunchTour } from '../features/onboarding/useFirstLaunchTour';
import { CreateDrawer } from '../features/create/CreateDrawer';
import { useReminderSync } from '../features/reminders/useReminderSync';
import { useWidgetSync } from '../features/widgets/useWidgetSync';
import { AccountSwitchDialog } from '../features/account/AccountSwitchDialog';
import { IconButton } from '../components/ui';
import { Sidebar } from './Sidebar';
import { useSidebarOpen, useWide } from './useWide';
import { useKeyboardInset } from './useKeyboardInset';
import { useLicensedText } from '../features/bible/useLicensedText';

const tab = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium ${isActive ? 'text-foreground' : 'text-muted'}`;

/** Only the home screen has the bottom bar (as in the wireframes); every other screen has its own back arrow. */
export function AppShell() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const navType = useNavigationType();
  // Which way this navigation went (so the new screen can come in from that side). Worked out once per screen change; nothing on the first screen.
  const previous = useRef(pathname);
  const direction = useMemo(() => (previous.current === pathname ? null : directionOf(previous.current, pathname, navType)), [pathname, navType]);
  useEffect(() => { previous.current = pathname; }, [pathname]);
  const [creating, setCreating] = useState(false);
  const main = useRef<HTMLElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  useRouteAnnouncer(main);
  useScrollToTop();
  useWarmStats();
  useFirstLaunchTour();
  useReminderSync();
  useWidgetSync();
  useKeyboardInset();
  useLicensedText();
  const wide = useWide();
  const [open, setOpen] = useSidebarOpen();
  // Studying (and the welcome tour) has the whole screen to itself, so nothing pulls attention away from the verse.
  const focus = /^\/collections\/[^/]+\/study\//.test(pathname) || pathname === '/welcome';
  const sidebar = wide && !focus;
  // The screen's own animation, once per screen change: it slides in from the right going deeper, from the left going back, and fades in. Only the new
  // screen moves (nothing covers it, so every tap works at once), and it is never fully transparent, so it can be read from the first frame. A
  // study screen only fades, briefly.
  useLayoutEffect(() => {
    const el = screen.current;
    if (!direction || !el || prefersReducedMotion()) return;
    const animations = focus
      ? [el.animate({ opacity: [0.4, 1] }, { duration: 150, easing: 'ease-out' })]
      : [
          el.animate({ transform: [`translateX(${direction === 'forward' ? 24 : -24}px)`, 'none'] }, { duration: 300, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' }),
          el.animate({ opacity: [0.65, 1] }, { duration: 200, easing: 'ease-out' }),
        ];
    return () => animations.forEach((a) => a.cancel());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  // The bottom bar is for phones and tablets standing up; on a wide screen the sidebar replaces it.
  const showNav = pathname === '/' && !wide;
  // The collection list, the statistics, Discover, a collection's page and its card list use the room; everything else is a reading column.
  const roomy = pathname === '/' || pathname === '/stats' || pathname === '/discover' || /^\/collections\/(?!new$)[^/]+(\/cards)?$/.test(pathname);

  return (
    <div className={sidebar ? 'flex min-h-dvh' : 'mx-auto min-h-dvh max-w-2xl'}>
      {sidebar && open && <Sidebar onHide={() => setOpen(false)} onAdd={() => setCreating(true)} adding={creating} />}
      {sidebar && !open && (
        <div className="sticky top-0 h-dvh w-16 shrink-0 pl-3 pt-[calc(var(--safe-top)+0.75rem)]">
          <IconButton label={t('nav.showSidebar')} onClick={() => setOpen(true)}><PanelLeftOpen size={20} aria-hidden /></IconButton>
        </div>
      )}
      <main ref={main} className={`${sidebar ? 'min-w-0 flex-1' : ''} ${showNav ? 'pb-[calc(8rem+var(--safe-bottom))]' : ''}`}>
        <div className={sidebar ? `mx-auto ${roomy ? 'max-w-4xl' : 'max-w-2xl'}` : ''}>{/* The whole screen is one block that comes in once per navigation: it fades in and slides in from the right going deeper, from the left going back (a study screen only fades, briefly). */}
        <div ref={screen} className="screen-root"><Outlet /></div></div>
      </main>
      <AccountSwitchDialog />
      {sidebar && <CreateDrawer open={creating} onOpenChange={setCreating} />}

      {showNav && (
        <>
          <nav aria-label={t('nav.main')} className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[calc(0.75rem+var(--safe-bottom))]">
            <div className="mx-auto flex max-w-2xl items-center px-4">
              <NavLink to="/" end className={tab}><LibraryBig size={22} aria-hidden />{t('nav.decks')}</NavLink>
              <button
                type="button"
                aria-label={t('nav.add')}
                aria-haspopup="dialog"
                aria-expanded={creating}
                onClick={() => setCreating(true)}
                className="mx-3 -mt-5 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
              >
                <Plus size={26} aria-hidden />
              </button>
              <NavLink to="/stats" className={tab}><ChartColumn size={22} aria-hidden />{t('nav.statistics')}</NavLink>
            </div>
          </nav>
          <CreateDrawer open={creating} onOpenChange={setCreating} />
        </>
      )}
    </div>
  );
}
