import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { bibleGatewaySearchUrl } from '../../domain/bible/bibleGateway';
import { openExternal } from '../../platform/openExternal';
import { Button, Dialog } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';

/**
 * Optional helper next to the Passage field. Shown only for a recognizable reference.
 * It opens Bible Gateway in the device's browser after a confirmation. The app never fetches or copies Bible text.
 */
export function BibleGatewayHelper({ reference }: { reference: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const url = bibleGatewaySearchUrl(reference);
  if (!url) return null;

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const proceed = () => {
    setOpen(false);
    openExternal(url);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-medium hover:bg-surface"
      >
        {t('gateway.button')} <ExternalLink size={15} aria-hidden />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('gateway.title')} closeOnBack closeLabel={t('common.cancel')}>
        <div className="space-y-3 text-muted">
          <p>{t('gateway.p1')}</p>
          <p>{t('gateway.p2')}</p>
          <p>{t('gateway.p3')}</p>
          {offline && <p role="status">{t('gateway.offline')}</p>}
        </div>
        <Button className="mt-6 w-full" onClick={proceed}>{t('gateway.continue')} <ExternalLink size={16} aria-hidden /></Button>
      </Dialog>
    </>
  );
}
