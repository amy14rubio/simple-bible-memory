import { useEffect, useState } from 'react';
import { useSharing } from '../../app/sharing';
import { Button, Dialog } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';

/**
 * Shown when someone signs in with a different account than the one this device was backing up to, while the device
 * still has decks. Nothing happens until they choose, so one person's decks can't land in another person's account.
 */
export function AccountSwitchDialog() {
  const { t } = useI18n();
  const { pendingSwitch, resolveSwitch } = useSharing();
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!pendingSwitch) { setConfirmingReplace(false); setBusy(false); } }, [pendingSwitch]);

  const choose = async (choice: 'merge' | 'replace' | 'cancel') => { setBusy(true); try { await resolveSwitch(choice); } finally { setBusy(false); } };
  const who = pendingSwitch?.email ?? t('switch.thisAccount');

  return (
    <Dialog open={!!pendingSwitch} onClose={() => void choose('cancel')} title={confirmingReplace ? t('switch.replaceTitle') : t('switch.title')}>
      {confirmingReplace ? (
        <>
          <p className="mb-6 text-muted">{t('switch.replaceBody', { who })}</p>
          <div className="flex flex-col gap-3">
            <Button variant="danger" disabled={busy} onClick={() => void choose('replace')}>{t('switch.replace')}</Button>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirmingReplace(false)}>{t('common.back')}</Button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-6 text-muted">{t('switch.body', { who })}</p>
          <div className="flex flex-col gap-3">
            <Button disabled={busy} onClick={() => void choose('merge')}>{t('switch.add')}</Button>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirmingReplace(true)}>{t('switch.replaceChoice')}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => void choose('cancel')}>{t('switch.cancel')}</Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
