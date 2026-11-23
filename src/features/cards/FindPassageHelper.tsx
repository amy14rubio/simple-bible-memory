import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { bibleGatewaySearchUrl } from '../../domain/bible/bibleGateway';
import { ebibleUrl } from '../../domain/bible/ebible';
import { openExternal } from '../../platform/openExternal';
import { Button, Dialog } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';

/**
 * Optional helper next to the Passage field. Shown only for a recognizable reference.
 * It offers two Bible websites (Bible Gateway, and eBible for free translations in many languages) and opens the one
 * chosen in the device's browser, to copy the passage from. The app never fetches or copies Bible text.
 * `language` is the deck's Bible language, which picks eBible's translation (English or Spanish).
 */
export function FindPassageHelper({ reference, language }: { reference: string; language?: string }) {
  const { t, language: appLanguage } = useI18n();
  const [open, setOpen] = useState(false);
  const gateway = bibleGatewaySearchUrl(reference);
  const ebible = ebibleUrl(reference, language ?? appLanguage); // a deck with no language follows the app's
  if (!gateway) return null;

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const go = (url: string) => {
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
        {t('find.button')} <ExternalLink size={15} aria-hidden />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('find.title')} closeOnBack closeLabel={t('common.cancel')}>
        <div className="space-y-3 text-muted">
          <p>{t('find.p1')}</p>
          <p>{t('find.p2')}</p>
          {offline && <p role="status">{t('find.offline')}</p>}
        </div>
        {/* Equal importance: the same transparent outlined button for each. */}
        <div className="mt-6 space-y-3">
          <Button variant="outline" className="w-full" onClick={() => go(gateway)}>{t('find.openGateway')} <ExternalLink size={16} aria-hidden /></Button>
          {ebible && <Button variant="outline" className="w-full" onClick={() => go(ebible)}>{t('find.openEbible')} <ExternalLink size={16} aria-hidden /></Button>}
        </div>
      </Dialog>
    </>
  );
}
