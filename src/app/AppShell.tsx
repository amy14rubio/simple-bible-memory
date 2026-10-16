import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChartColumn, LibraryBig, Plus } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { CreateDrawer } from '../features/create/CreateDrawer';

const tab = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium ${isActive ? 'text-foreground' : 'text-muted'}`;

/** Only the home screen has the bottom bar (as in the wireframes); every other screen has its own back arrow. */
export function AppShell() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const [creating, setCreating] = useState(false);
  const showNav = pathname === '/';

  return (
    <div className="mx-auto min-h-dvh max-w-2xl sm:border-x sm:border-border">
      <main className={showNav ? 'pb-28' : ''}><Outlet /></main>

      {showNav && (
        <>
          <nav aria-label={t('nav.main')} className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
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
