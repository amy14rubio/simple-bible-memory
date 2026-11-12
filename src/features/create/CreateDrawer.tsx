import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Compass, FilePlus, Layers, Upload } from 'lucide-react';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/shadcn/drawer';
import { usePopupHistory } from '../../lib/usePopupHistory';
import { useSharing } from '../../app/sharing';
import { useI18n } from '../../i18n/I18nProvider';

const row = 'flex min-h-16 w-full items-center gap-4 rounded-2xl bg-foreground/[0.06] px-3.5 py-2.5 text-left hover:bg-foreground/10';

/**
 * The bottom drawer the round "+" opens: pick what to create. Swipe it down, tap outside, press Escape or tap Cancel to close.
 * Built on shadcn's Drawer (Base UI), which handles the swipe, the backdrop and keyboard focus.
 */
export function CreateDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { available } = useSharing();
  usePopupHistory(open, () => onOpenChange(false));
  const go = (to: string) => { onOpenChange(false); navigate(to, { replace: true }); };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerContent className="mx-auto max-w-2xl pb-[calc(0.75rem+var(--safe-bottom))]" closeLabel={t('common.cancel')}>
        <DrawerHeader className="px-6 pb-4 pt-1 group-data-[swipe-axis=y]/drawer-popup:text-left">
          <DrawerTitle className="font-serif text-xl font-medium tracking-tight">{t('create.title')}</DrawerTitle>
          <DrawerDescription className="sr-only">{t('create.description')}</DrawerDescription>
        </DrawerHeader>

        <div className="grid gap-3 px-4">
          <Choice icon={<Layers size={24} aria-hidden />} title={t('common.newDeck')} onClick={() => go('/collections/new')} />
          <Choice icon={<FilePlus size={24} aria-hidden />} title={t('common.newCard')} onClick={() => go('/cards/new')} />
          <Choice icon={<Upload size={24} aria-hidden />} title={t('create.import')} onClick={() => go('/import')} />
          {available && <Choice icon={<Compass size={24} aria-hidden />} title={t('create.discover')} onClick={() => go('/discover')} />}
        </div>

        <div className="h-6" />
      </DrawerContent>
    </Drawer>
  );
}

function Choice({ icon, title, onClick }: { icon: ReactNode; title: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={row}>
      <span className="flex size-8 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 text-[1.0625rem] font-medium">{title}</span>
      <ChevronRight size={20} aria-hidden className="shrink-0 text-muted" />
    </button>
  );
}
