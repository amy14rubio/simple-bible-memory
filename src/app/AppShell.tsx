import { useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChartColumn, LibraryBig, Plus } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { useRouteAnnouncer } from './useRouteAnnouncer';
import { useFirstLaunchTour } from '../features/onboarding/useFirstLaunchTour';
import { CreateDrawer } from '../features/create/CreateDrawer';
import { useReminderSync } from '../features/reminders/useReminderSync';
import { AccountSwitchDialog } from '../features/account/AccountSwitchDialog';

const tab = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium ${isActive ? 'text-foreground' : 'text-muted'}`;

/** Only the home screen has the bottom bar (as in the wireframes); every other screen has its own back arrow. */
export function AppShell() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const [creating, setCreating] = useState(false);
  const main = useRef<HTMLElement>(null);
  useRouteAnnouncer(main);
  useFirstLaunchTour();
  useReminderSync();
  const showNav = pathname === '/';

  return (
    <div className="mx-auto min-h-dvh max-w-2xl sm:border-x sm:border-border">
      <main ref={main} className={showNav ? 'pb-[calc(8rem+var(--safe-bottom))]' : ''}><Outlet /></main>
      <AccountSwitchDialog />

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
