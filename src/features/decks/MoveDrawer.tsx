import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/shadcn/drawer';
import { usePopupHistory } from '../../lib/usePopupHistory';
import { useI18n } from '../../i18n/I18nProvider';

/** "Move 3 cards to…": choose a deck and the cards go there straight away. */
export function MoveDrawer({ open, count, decks, onPick, onClose }: { open: boolean; count: number; decks: { id: string; title: string }[]; onPick: (deckId: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  usePopupHistory(open, onClose);
  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) onClose(); }} showSwipeHandle>
      <DrawerContent className="mx-auto max-w-2xl pb-[calc(0.75rem+var(--safe-bottom))]" closeLabel={t('common.cancel')}>
        <DrawerHeader className="px-6 pb-2 pt-1 group-data-[swipe-axis=y]/drawer-popup:text-left">
          <DrawerTitle className="font-serif text-xl font-medium tracking-tight">{t('move.title', { count })}</DrawerTitle>
          <DrawerDescription className="sr-only">{t('move.help')}</DrawerDescription>
        </DrawerHeader>
        <ul className="max-h-[60dvh] overflow-y-auto border-t border-border">
          {decks.map((d) => (
            <li key={d.id} className="border-b border-border last:border-b-0">
              <button type="button" onClick={() => onPick(d.id)} className="flex min-h-14 w-full items-center px-6 py-2 text-left font-serif text-lg hover:bg-surface">
                <span className="truncate">{d.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </DrawerContent>
    </Drawer>
  );
}
