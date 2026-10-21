import { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/shadcn/drawer';
import { HiddenClose } from './ui';
import { usePopupHistory } from '../lib/usePopupHistory';
import { useI18n } from '../i18n/I18nProvider';

/**
 * A title with a small "i" after it. The whole thing is one button: tapping the words or the icon opens a bottom
 * drawer (the same one the + button uses) with the explanation, so the page itself stays free of small print.
 * `info` is plain text, or content (e.g. a list) for several explanations.
 */
export function InfoLabel({ title, info, className = '' }: { title: string; info: ReactNode; className?: string }) {
  const { t } = useI18n();
  const cut = title.lastIndexOf(' ') + 1;
  const head = title.slice(0, cut);
  const last = title.slice(cut);
  const [open, setOpen] = useState(false);
  usePopupHistory(open, () => setOpen(false));

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={`group inline-block py-2.5 text-left ${className}`}
      >
        {/* the icon is glued to the last word, so it can never wrap onto a line of its own */}
        {head}
        <span className="whitespace-nowrap">
          {last}
          <Info size={14} aria-hidden className="ml-1.5 inline-block align-[-0.06em] text-muted group-hover:text-foreground" />
        </span>
      </button>
      <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
        <DrawerContent className="mx-auto max-w-2xl pb-[calc(0.75rem+var(--safe-bottom))]">
          <DrawerHeader className="gap-2 px-6 pb-4 pt-1 group-data-[swipe-axis=y]/drawer-popup:text-left">
            <DrawerTitle className="font-serif text-xl font-medium tracking-tight">{title}</DrawerTitle>
            {typeof info === 'string' && <DrawerDescription className="max-w-none whitespace-pre-line text-base text-foreground">{info}</DrawerDescription>}
          </DrawerHeader>
          {typeof info !== 'string' && <div className="px-6 pb-2">{info}</div>}
          <div className="h-6" />
          <DrawerClose render={<HiddenClose label={t('common.close')} />} />
        </DrawerContent>
      </Drawer>
    </>
  );
}

/** A centred section title; with `info` it is tappable and shows the "i". */
export function SectionTitle({ id, title, info }: { id: string; title: string; info?: ReactNode }) {
  return (
    <h2 id={id} className="flex justify-center font-serif text-xl">
      {info ? <InfoLabel title={title} info={info} /> : title}
    </h2>
  );
}
