import { useEffect, useState } from 'react';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/shadcn/drawer';
import { toast } from '../../components/shadcn/toast';
import { Button, ErrorMessage, HiddenClose, Switch } from '../../components/ui';
import { InfoLabel } from '../../components/InfoDrawer';
import { useRepositories } from '../../app/repositories';
import { exportFileName } from '../../domain/exchange/format';
import { downloadTextFile } from '../../lib/download';
import { usePopupHistory } from '../../lib/usePopupHistory';
import { useI18n } from '../../i18n/I18nProvider';

export interface ExportTarget {
  /** The decks to export, or null for all of them. */
  ids: string[] | null;
  title: string;
}

/**
 * The drawer behind "Export deck" and "Export everything": one switch (include my progress) and an Export button that
 * saves a deck file. Progress is off by default for a single deck (it is usually for sharing) and on for everything
 * (that is a backup).
 */
export function ExportDrawer({ target, onClose }: { target: ExportTarget | null; onClose: () => void }) {
  const { t, describeError } = useI18n();
  const { exchange } = useRepositories();
  const open = target !== null;
  const [progress, setProgress] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  usePopupHistory(open, onClose);

  useEffect(() => {
    if (target) { setProgress(target.ids === null); setError(undefined); setBusy(false); }
  }, [target]);

  const run = async () => {
    if (!target) return;
    setBusy(true);
    setError(undefined);
    try {
      const file = await exchange.exportDecks(target.ids, { progress });
      const saved = await downloadTextFile(exportFileName(file.decks.map((d) => d.title)), JSON.stringify(file, null, 2));
      if (saved) { // false: the Share panel was closed without choosing anything, so nothing is said or closed
        toast.add({ title: t(target.ids === null ? 'toast.exportedAll' : 'toast.exported', { title: target.title }), type: 'success' });
        onClose();
      }
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) onClose(); }} showSwipeHandle>
      <DrawerContent className="mx-auto max-w-2xl pb-[calc(0.75rem+var(--safe-bottom))]">
        <DrawerHeader className="px-6 pb-2 pt-1 group-data-[swipe-axis=y]/drawer-popup:text-left">
          <DrawerTitle className="font-serif text-xl font-medium tracking-tight">{target?.ids === null ? t('export.titleAll') : t('export.title')}</DrawerTitle>
          <DrawerDescription className="sr-only">{target?.title}</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-4 px-6 pb-2">
          {target?.ids !== null && <p className="font-serif text-lg">{target?.title}</p>}
          <div className="flex items-center justify-between gap-4 border-y border-border">
            <span id="export-progress"><InfoLabel title={t('export.progress')} info={t('export.progressInfo')} /></span>
            <Switch checked={progress} onChange={setProgress} labelledBy="export-progress" />
          </div>
          {error && <ErrorMessage error={error} />}
          <Button className="w-full" disabled={busy} onClick={() => void run()}>{t('export.button')}</Button>
        </div>
        <div className="h-6" />
        <DrawerClose render={<HiddenClose label={t('common.cancel')} />} />
      </DrawerContent>
    </Drawer>
  );
}
