import { useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChartColumn, LibraryBig, PanelLeftOpen, Plus } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { useRouteAnnouncer } from './useRouteAnnouncer';
import { useScrollToTop } from './useScrollToTop';
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
  const [creating, setCreating] = useState(false);
  const main = useRef<HTMLElement>(null);
  useRouteAnnouncer(main);
  useScrollToTop();
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
  // The bottom bar is for phones and tablets standing up; on a wide screen the sidebar replaces it.
  const showNav = pathname === '/' && !wide;
  // The deck list, the statistics and Discover use the room; everything else is a reading column.
  const roomy = pathname === '/' || pathname === '/stats' || pathname === '/discover';

  return (
    <div className={sidebar ? 'flex min-h-dvh' : 'mx-auto min-h-dvh max-w-2xl sm:border-x sm:border-border'}>
      {sidebar && open && <Sidebar onHide={() => setOpen(false)} onAdd={() => setCreating(true)} adding={creating} />}
      {sidebar && !open && (
        <div className="sticky top-0 h-dvh w-16 shrink-0 pl-3 pt-[calc(var(--safe-top)+0.75rem)]">
          <IconButton label={t('nav.showSidebar')} onClick={() => setOpen(true)}><PanelLeftOpen size={20} aria-hidden /></IconButton>
        </div>
      )}
      <main ref={main} className={`${sidebar ? 'min-w-0 flex-1' : ''} ${showNav ? 'pb-[calc(8rem+var(--safe-bottom))]' : ''}`}>
        <div className={sidebar ? `mx-auto ${roomy ? 'max-w-4xl' : 'max-w-2xl'}` : ''}><Outlet /></div>
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
