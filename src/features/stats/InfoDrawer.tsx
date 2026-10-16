import { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/shadcn/drawer';
import { HiddenClose } from '../../components/ui';
import { usePopupHistory } from '../../lib/usePopupHistory';
import { useI18n } from '../../i18n/I18nProvider';

/**
 * A section title with a small "i" button next to it. The button opens a bottom drawer (same one the + button uses)
 * with the explanation, so the page itself stays free of small print.
 */
export function SectionTitle({ id, title, info }: { id: string; title: string; info?: ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  usePopupHistory(open, () => setOpen(false));

  return (
    <div className="flex items-center justify-center gap-1">
      {info && <span aria-hidden className="size-10" />} {/* balances the button so the title stays centered */}
      <h2 id={id} className="font-serif text-xl">{title}</h2>
      {info && (
        <>
          <button
            type="button"
            aria-label={t('stats.about', { title })}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className="-my-2 flex size-10 items-center justify-center rounded-full text-muted hover:text-foreground"
          >
            <Info size={18} aria-hidden className="translate-y-0.5" />
          </button>
          <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
            <DrawerContent className="mx-auto max-w-2xl pb-[env(safe-area-inset-bottom)]">
              <DrawerHeader className="gap-2 px-6 pb-4 pt-1 group-data-[swipe-axis=y]/drawer-popup:text-left">
                <DrawerTitle className="font-serif text-xl font-medium tracking-tight">{title}</DrawerTitle>
                {typeof info === 'string' && <DrawerDescription className="max-w-none text-base text-foreground">{info}</DrawerDescription>}
              </DrawerHeader>
              {typeof info !== 'string' && <div className="px-6 pb-2">{info}</div>}
              <div className="h-6" />
              <DrawerClose render={<HiddenClose label={t('common.close')} />} />
            </DrawerContent>
          </Drawer>
        </>
      )}
    </div>
  );
}
