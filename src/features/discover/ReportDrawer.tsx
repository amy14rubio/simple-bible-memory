import { useEffect, useState } from 'react';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/shadcn/drawer';
import { toast } from '../../components/shadcn/toast';
import { Button, CheckList, ErrorMessage, GrowingTextarea, HiddenClose } from '../../components/ui';
import { loadBackends } from '../sharing/backend';
import { usePopupHistory } from '../../lib/usePopupHistory';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n';
import { REPORT_REASONS, type ReportReason } from './types';

/** Tell us about a public deck that should not be there (copyright, inappropriate, anything else). No sign-in needed. */
export function ReportDrawer({ deckId, open, onClose }: { deckId: string; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState<ReportReason>('copyright');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  usePopupHistory(open, onClose);
  useEffect(() => { if (open) { setReason('copyright'); setDetails(''); setError(undefined); setBusy(false); } }, [open]);

  const send = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await (await loadBackends()).discover.report(deckId, reason, details);
      toast.add({ title: t('report.sent'), type: 'success' });
      onClose();
    } catch {
      setError(t('report.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) onClose(); }} showSwipeHandle>
      <DrawerContent className="mx-auto max-w-2xl pb-[calc(0.75rem+var(--safe-bottom))]">
        <DrawerHeader className="px-6 pb-2 pt-1 group-data-[swipe-axis=y]/drawer-popup:text-left">
          <DrawerTitle className="font-serif text-xl font-medium tracking-tight">{t('report.title')}</DrawerTitle>
          <DrawerDescription className="sr-only">{t('report.help')}</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-4 px-6 pb-2">
          <CheckList<ReportReason>
            label={t('report.title')}
            name="report-reason"
            value={reason}
            onChange={setReason}
            options={REPORT_REASONS.map((r) => ({ value: r, label: t(`report.reason.${r}` as MessageKey) }))}
          />
          <div>
            <label htmlFor="report-details" className="text-[0.9375rem] font-medium">{t('report.details')}</label>
            <GrowingTextarea id="report-details" value={details} maxLength={500} onChange={(e) => setDetails(e.target.value)} placeholder={t('common.optional')} />
          </div>
          {error && <ErrorMessage error={error} />}
          <Button className="w-full" disabled={busy} onClick={() => void send()}>{t('report.send')}</Button>
        </div>
        <div className="h-6" />
        <DrawerClose render={<HiddenClose label={t('common.cancel')} />} />
      </DrawerContent>
    </Drawer>
  );
}
