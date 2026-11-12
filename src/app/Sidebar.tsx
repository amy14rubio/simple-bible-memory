import { Link, NavLink, useLocation } from 'react-router-dom';
import { ChartColumn, Layers, LibraryBig, PanelLeftClose, Plus } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { IconButton } from '../components/ui';
import { ALL_DECKS } from '../features/decks/CardBrowsePage';

const item = (active: boolean) =>
  `flex min-h-11 items-center gap-3 rounded-lg px-3 text-[0.9375rem] font-medium ${active ? 'bg-surface text-foreground' : 'text-muted hover:bg-surface hover:text-foreground'}`;

/** On a wide screen the bottom bar becomes this: the same places, down the left side, and it can be hidden (like Google Calendar's). */
export function Sidebar({ onHide, onAdd, adding }: { onHide: () => void; onAdd: () => void; adding: boolean }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const browsing = pathname.endsWith('/cards') && pathname.startsWith('/collections/');
  const inDecks = !browsing && (pathname === '/' || pathname.startsWith('/collections') || pathname.startsWith('/cards') || pathname === '/import');
  return (
    <aside data-vt="sidebar" className="sticky top-0 flex h-dvh w-64 shrink-0 flex-col gap-4 border-r border-border bg-background px-3 pb-[calc(0.75rem+var(--safe-bottom))] pt-[calc(var(--safe-top)+0.5rem)]">
      <div className="flex items-center justify-between gap-1 pl-3">
        {/* The logo's heart sits in the middle 684 x 588 of its 1024 x 1024 canvas: cropped to the heart. */}
        <Link to="/" aria-label={t('app.name')} className="relative block aspect-[684/588] w-7 overflow-hidden">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="absolute left-[-24.85%] top-[-35.88%] w-[149.7%] max-w-none" />
        </Link>
        <IconButton label={t('nav.hideSidebar')} onClick={onHide}><PanelLeftClose size={20} aria-hidden /></IconButton>
      </div>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={adding}
        onClick={onAdd}
        className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-[0.9375rem] font-medium text-primary-foreground hover:opacity-90"
      >
        <Plus size={20} aria-hidden />{t('nav.add')}
      </button>
      <nav aria-label={t('nav.main')} className="flex flex-col gap-1">
        <NavLink to="/" end className={() => item(inDecks)}><LibraryBig size={20} aria-hidden />{t('nav.decks')}</NavLink>
        <NavLink to={`/collections/${ALL_DECKS}/cards`} className={() => item(browsing)}><Layers size={20} aria-hidden />{t('nav.browse')}</NavLink>
        <NavLink to="/stats" className={({ isActive }) => item(isActive)}><ChartColumn size={20} aria-hidden />{t('nav.statistics')}</NavLink>
      </nav>
    </aside>
  );
}
