import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChartColumn, Copy, LibraryBig, Plus } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

const tab = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium ${isActive ? 'text-foreground' : 'text-muted'}`;

const pill = 'flex min-h-12 items-center gap-2.5 rounded-lg bg-primary px-5 text-[0.9375rem] font-medium text-primary-foreground shadow-lg';

/** Only the home screen has the bottom bar (as in the wireframes); every other screen has its own back arrow. */
export function AppShell() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const firstItem = useRef<HTMLButtonElement>(null);
  const showNav = pathname === '/';

  useEffect(() => {
    if (!adding) return;
    firstItem.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAdding(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [adding]);

  const go = (to: string) => { setAdding(false); navigate(to); };

  return (
    <div className="mx-auto min-h-dvh max-w-2xl sm:border-x sm:border-border">
      <main className={showNav ? 'pb-28' : ''}><Outlet /></main>

      {showNav && (
        <>
          {adding && <button type="button" aria-label={t('nav.closeMenu')} tabIndex={-1} onClick={() => setAdding(false)} className="fixed inset-0 z-30 cursor-default bg-background/80" />}
          <nav aria-label={t('nav.main')} className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
            <div className="relative mx-auto flex max-w-2xl items-center px-4">
              {adding && (
                <div role="group" aria-label={t('nav.add')} className="absolute bottom-[calc(100%+0.75rem)] left-1/2 flex -translate-x-1/2 flex-col gap-2.5">
                  <button ref={firstItem} type="button" onClick={() => go('/decks/new')} className={pill}><Copy size={18} aria-hidden />{t('common.newDeck')}</button>
                  <button type="button" onClick={() => go('/cards/new')} className={pill}><Copy size={18} aria-hidden />{t('common.newCard')}</button>
                </div>
              )}
              <NavLink to="/" end className={tab} onClick={() => setAdding(false)}><LibraryBig size={22} aria-hidden />{t('nav.decks')}</NavLink>
              <button
                type="button"
                aria-label={t('nav.add')}
                aria-expanded={adding}
                onClick={() => setAdding((a) => !a)}
                className="mx-3 -mt-5 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
              >
                <Plus size={26} aria-hidden className={`transition-transform duration-200 ${adding ? 'rotate-45' : ''}`} />
              </button>
              <NavLink to="/stats" className={tab} onClick={() => setAdding(false)}><ChartColumn size={22} aria-hidden />{t('nav.statistics')}</NavLink>
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
