import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, EllipsisVertical, GripVertical, Search, Settings } from 'lucide-react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type Announcements, type DragEndEvent, type KeyboardCoordinateGetter } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from '../../components/shadcn/toast';
import { usePopupHistory } from '../../lib/usePopupHistory';
import { useRepositories } from '../../app/repositories';
import { useAsync } from '../../app/useAsync';
import { useRefreshOnWrites } from '../../app/useRefreshOnWrites';
import { AppBar, ButtonLink, EmptyState, ErrorMessage, IconButton, IconLink, SearchBar } from '../../components/ui';
import { DeckMenu } from './DeckMenu';
import { loadCardKinds } from '../study/cardKinds';
import { loadNewPerDay } from '../study/newPerDay';
import { useI18n } from '../../i18n/I18nProvider';

type Row = { id: string; title: string; due: number; cardCount: number };

/** The width where decks sit two to a row (the same as the `wide:` style below). */
const WIDE = '(min-width: 1000px) and (min-height: 700px)';
function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const m = window.matchMedia(WIDE);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

const LONG_PRESS_MS = 450; // the same as pressing and holding a card
const MOVE_TOLERANCE_PX = 10;

/**
 * One deck in the list. Touch and hold it to start reordering (like pressing and holding a card to select it). While reordering, the
 * row has a handle to drag by, and tapping the deck does nothing, so a deck can never open by accident.
 */
function DeckRow({ d, wide, reordering, onMenu, onHold }: { d: Row; wide: boolean; reordering: boolean; onMenu: () => void; onHold: () => void }) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: d.id, disabled: !reordering, attributes: { roleDescription: t('decks.draggable') } });
  // On a phone the list is one column, so a deck only moves up and down; two to a row it can move both ways.
  const moved = transform ? { ...transform, x: wide ? transform.x : 0 } : null;

  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const justHeld = useRef(false); // a long press ends with a click, which must not also open the deck
  const cancelPress = () => { if (press.current) { window.clearTimeout(press.current.timer); press.current = null; } };
  useEffect(() => cancelPress, []);

  const badge = d.due === 0 && d.cardCount > 0 ? (
    // Nothing left today: a check mark says "all done" better than a 0 (a deck with no cards at all still shows 0).
    <span className="shrink-0 text-muted"><Check size={20} aria-hidden /><span className="sr-only">{t('decks.doneToday')}</span></span>
  ) : (
    <span className={`shrink-0 text-sm tabular-nums ${d.due > 0 ? 'font-semibold' : 'text-muted'}`}>
      {d.due}
      <span className="sr-only"> {t('decks.dueSuffix')}</span>{/* the screen shows just the number; screen readers also hear what it counts */}
    </span>
  );
  const body = 'flex min-h-16 min-w-0 flex-1 items-center justify-between gap-4 py-3 pl-5 pr-2';

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(moved), transition }}
      onPointerDown={(e) => {
        if (reordering || e.button > 0) return;
        press.current = { x: e.clientX, y: e.clientY, timer: window.setTimeout(() => { press.current = null; justHeld.current = true; onHold(); }, LONG_PRESS_MS) };
      }}
      onPointerMove={(e) => { if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > MOVE_TOLERANCE_PX) cancelPress(); }}
      onPointerUp={() => { cancelPress(); if (justHeld.current) window.setTimeout(() => { justHeld.current = false; }, 0); }}
      onPointerCancel={cancelPress}
      onPointerLeave={cancelPress}
      onContextMenu={(e) => e.preventDefault()} // the phone's "touch and hold a link" menu must not take over
      className={`flex select-none items-center border-b border-border bg-background pr-2 [-webkit-touch-callout:none] wide:rounded-xl wide:border ${isDragging ? 'relative z-10 opacity-90 shadow-lg' : ''}`}
    >
      {reordering ? (
        <>
          <div className={body}><span className="truncate font-serif text-lg">{d.title}</span>{badge}</div>
          <button
            type="button"
            ref={setActivatorNodeRef}
            data-handle
            aria-label={t('decks.dragHandle', { title: d.title })}
            className="flex size-11 shrink-0 touch-none items-center justify-center rounded-lg text-muted hover:bg-surface"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={22} aria-hidden />
          </button>
        </>
      ) : (
        <>
          <Link
            to={`/decks/${d.id}`}
            draggable={false}
            onClick={(e) => { if (justHeld.current) { justHeld.current = false; e.preventDefault(); } }}
            className={`${body} hover:bg-surface wide:rounded-l-xl`}
          >
            <span className="truncate font-serif text-lg">{d.title}</span>
            {badge}
          </Link>
          <IconButton label={t('decks.actionsFor', { title: d.title })} onClick={onMenu}><EllipsisVertical size={20} aria-hidden /></IconButton>
        </>
      )}
    </li>
  );
}

export function DecksPage() {
  const { t } = useI18n();
  const { decks, reviews, settings } = useRepositories();
  const { data, error, loading, reload, refresh } = useAsync(async () => {
    const list = await decks.list();
    const due = await reviews.dueCounts({ newPerDay: await loadNewPerDay(settings), kinds: await loadCardKinds(settings) });
    return list.map((d) => ({ ...d, due: due[d.id] ?? 0 }));
  }, [decks, reviews, settings]);
  useRefreshOnWrites(refresh);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [menuFor, setMenuFor] = useState<{ id: string; title: string } | null>(null);

  const wide = useWide();
  // The order the person just chose is shown straight away, then replaced by what the database says once it is saved.
  const [chosen, setChosen] = useState<string[] | null>(null);
  useEffect(() => setChosen(null), [data]);
  const ordered = useMemo(() => {
    if (!data || !chosen) return data;
    const byId = new Map(data.map((d) => [d.id, d]));
    return chosen.flatMap((id) => byId.get(id) ?? []);
  }, [data, chosen]);

  const q = query.trim().toLowerCase();
  const shown = ordered?.filter((d) => d.title.toLowerCase().includes(q));
  // A search shows only some decks, so it cannot be used to move them.
  const canReorder = !q && !searching && (ordered?.length ?? 0) > 1;
  // Reordering is a mode, like selecting cards: touch and hold a deck to start it, "Done" (or Back) to leave it.
  const [reordering, setReordering] = useState(false);
  const stopReordering = () => setReordering(false);
  usePopupHistory(reordering, stopReordering); // Back leaves reordering instead of the screen
  useEffect(() => { if (reordering && !canReorder) setReordering(false); }, [reordering, canReorder]); // for example, one deck was deleted
  const wasReordering = useRef(false);
  const [announce, setAnnounce] = useState('');
  useEffect(() => {
    if (reordering) {
      setAnnounce(t('decks.reorderStatus'));
      document.querySelector<HTMLElement>('[data-handle]')?.focus({ preventScroll: true });
    } else if (wasReordering.current) {
      setAnnounce(t('decks.reorderEnded'));
      // Back to the screen's heading (not a control that comes and goes, which would shift the list under the pointer).
      const heading = document.querySelector<HTMLElement>('main h1, h1');
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    }
    wasReordering.current = reordering;
  }, [reordering, t]);
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('decks.dragPicked', { title: ordered?.find((d) => d.id === active.id)?.title ?? '' }),
    onDragOver: ({ active, over }) => over ? t('decks.dragOver', { title: ordered?.find((d) => d.id === active.id)?.title ?? '', position: (ordered?.findIndex((d) => d.id === over.id) ?? 0) + 1, total: ordered?.length ?? 0 }) : undefined,
    onDragEnd: ({ active, over }) => t('decks.dragDropped', { title: ordered?.find((d) => d.id === active.id)?.title ?? '', position: (ordered?.findIndex((d) => d.id === (over ?? active).id) ?? 0) + 1, total: ordered?.length ?? 0 }),
    onDragCancel: ({ active }) => t('decks.dragCancelled', { title: ordered?.find((d) => d.id === active.id)?.title ?? '' }),
  };

  const save = (ids: string[]) => { setChosen(ids); void decks.reorder(ids); };
  // Every arrow key moves the deck one place along the list (Down and Right: later; Up and Left: earlier), whether the decks are in
  // one column or two to a row, so it never depends on how the screen happens to be laid out.
  const oneStep: KeyboardCoordinateGetter = (event, { context: { active, droppableRects, collisionRect } }) => {
    const forward = event.code === 'ArrowDown' || event.code === 'ArrowRight';
    if (!forward && event.code !== 'ArrowUp' && event.code !== 'ArrowLeft') return undefined;
    event.preventDefault(); // the page must not scroll instead
    if (!active || !collisionRect || !ordered) return undefined;
    const centre = { x: collisionRect.left + collisionRect.width / 2, y: collisionRect.top + collisionRect.height / 2 };
    let at = -1;
    let nearest = Infinity;
    ordered.forEach((d, i) => {
      const r = droppableRects.get(d.id);
      const away = r ? Math.hypot(r.left + r.width / 2 - centre.x, r.top + r.height / 2 - centre.y) : Infinity;
      if (away < nearest) { nearest = away; at = i; }
    });
    const next = droppableRects.get(ordered[at + (forward ? 1 : -1)]?.id ?? '');
    return next ? { x: next.left, y: next.top } : undefined;
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), // only the handle starts a drag, and it does not scroll (touch-none), so no waiting is needed
    useSensor(KeyboardSensor, { coordinateGetter: oneStep }), // Space on a handle, then the arrow keys, then Space
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!ordered || !over || active.id === over.id || !canReorder) return;
    const from = ordered.findIndex((d) => d.id === active.id);
    const to = ordered.findIndex((d) => d.id === over.id);
    if (from >= 0 && to >= 0) save(arrayMove(ordered, from, to).map((d) => d.id));
  };
  // Move up / Move down from a deck's menu: the same thing without dragging.
  const moveFor = (id: string | undefined) => {
    if (!ordered || !id || !canReorder) return undefined;
    const i = ordered.findIndex((d) => d.id === id);
    if (i < 0) return undefined;
    const go = (to: number) => () => {
      save(arrayMove(ordered, i, to).map((d) => d.id));
      toast.add({ title: t(to < i ? 'toast.deckMovedUp' : 'toast.deckMovedDown', { title: ordered[i]!.title }), type: 'success' }); // heard by screen readers too
    };
    return { up: i > 0 ? go(i - 1) : null, down: i < ordered.length - 1 ? go(i + 1) : null };
  };

  return (
    <>
      {reordering ? (
        <AppBar title={t('decks.reorderTitle')} actions={<IconButton label={t('decks.reorderDone')} onClick={stopReordering}><Check size={22} aria-hidden /></IconButton>} />
      ) : searching ? (
        <SearchBar label={t('decks.search')} placeholder={t('decks.search')} value={query} onChange={setQuery} backLabel={t('decks.searchClose')} onClose={() => { setSearching(false); setQuery(''); }} actions={<IconLink to="/settings" label={t('common.settings')}><Settings size={20} aria-hidden /></IconLink>} />
      ) : (
        <AppBar
          title={t('app.name')}
          actions={
            <>
              <IconButton label={t('decks.search')} onClick={() => setSearching(true)}><Search size={20} aria-hidden /></IconButton>
              <IconLink to="/settings" label={t('common.settings')}><Settings size={20} aria-hidden /></IconLink>
            </>
          }
        />
      )}
      {error && <div className="p-5"><ErrorMessage error={error} /></div>}
      {!loading && data?.length === 0 && (
        <EmptyState title={t('decks.emptyTitle')} action={<ButtonLink to="/decks/new">{t('decks.emptyAction')}</ButtonLink>}>
          {t('decks.emptyBody')}
        </EmptyState>
      )}
      {shown && data && data.length > 0 && shown.length === 0 && <p className="px-5 py-10 text-center text-muted">{t('decks.noMatch', { query })}</p>}
      {/* On a wide screen one deck takes the whole width; more sit two to a row. */}
      <p role="status" className="sr-only">{announce}</p>
      {canReorder && !reordering && <button type="button" onClick={() => setReordering(true)} className="sr-only focus:not-sr-only focus:m-3 focus:rounded-lg focus:border focus:border-border focus:px-4 focus:py-2">{t('decks.reorder')}</button>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={{ announcements, screenReaderInstructions: { draggable: t('decks.dragInstructions') } }}>
        <SortableContext items={(shown ?? []).map((d) => d.id)} strategy={wide && shown && shown.length > 1 ? rectSortingStrategy : verticalListSortingStrategy}>
          <ul className={`wide:grid wide:gap-3 wide:p-5 ${shown && shown.length > 1 ? 'wide:grid-cols-2' : ''}`}>
            {shown?.map((d) => <DeckRow key={d.id} d={d} wide={wide} reordering={reordering} onMenu={() => setMenuFor(d)} onHold={() => { if (canReorder) setReordering(true); }} />)}
          </ul>
        </SortableContext>
      </DndContext>
      <DeckMenu deck={menuFor} onClose={() => setMenuFor(null)} onDeleted={reload} move={moveFor(menuFor?.id)} />
    </>
  );
}
