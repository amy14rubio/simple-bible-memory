import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { bibleGatewaySearchUrl } from '../../domain/bible/bibleGateway';
import { openExternal } from '../../platform/openExternal';
import { Button, Dialog } from '../../components/ui';

/**
 * Optional helper next to the Passage field. Shown only for a recognizable reference.
 * It opens Bible Gateway in the device's browser after a confirmation. The app never fetches or copies Bible text.
 */
export function BibleGatewayHelper({ reference }: { reference: string }) {
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
        Find on Bible Gateway <ExternalLink size={15} aria-hidden />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Find a Bible passage">
        <div className="space-y-3 text-muted">
          <p>You can use Bible Gateway to explore different Bible translations and find the passage you want to memorize.</p>
          <p>Bible Gateway will open in your device's web browser. You can copy the passage there and paste it into your verse card in this app.</p>
          <p>This app doesn't automatically retrieve or copy Bible text from Bible Gateway.</p>
          {offline && <p role="status">You appear to be offline, so the page may not load until you reconnect.</p>}
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={proceed}>Continue to Bible Gateway <ExternalLink size={16} aria-hidden /></Button>
        </div>
      </Dialog>
    </>
  );
}
