import { useCallback, useEffect, useRef } from 'react';
import { useRepositories } from '../../app/repositories';
import { useRefreshOnWrites } from '../../app/useRefreshOnWrites';
import { isOffered, sourceFor } from '../../domain/bible/sources';
import { isSwitchedOff } from '../../domain/bible/switch';
import { loadCatalogue, useCatalogueVersion } from './catalogue';
import { currentSwitch, useLicensedSwitch } from './remoteSwitch';
import { getPassageSource, PassageError } from '../../platform/youversion';

/**
 * Fills in the text of licensed cards that do not have it on this device yet: cards just added without a connection, cards that
 * came from the account, from a file, or from a public deck, or text that was emptied. It keeps asking quietly in the background
 * (when the app opens, when the connection comes back, and when cards change) until every card has its text.
 * The text is kept on this device only (see src/domain/bible/sources.ts).
 */
export function useLicensedText() {
  const { cards } = useRepositories();
  const listVersion = useCatalogueVersion();
  const off = useLicensedSwitch();
  const running = useRef(false);
  const gaveUp = useRef(new Set<string>()); // cards the publisher has no such passage for: asked about once per session

  const run = useCallback(async () => {
    if (running.current) return;
    const source = getPassageSource();
    if (!source.available()) return;
    running.current = true;
    try {
      const refused = new Set<string>(); // translations this app may not read right now
      for (const card of await cards.listMissingText()) {
        const bible = sourceFor(card.translationCode);
        // Only texts the platform offers (the list may not be here yet: then this waits, and runs again when it is).
        if (!bible || gaveUp.current.has(card.id) || refused.has(bible.code) || isSwitchedOff(bible.code, currentSwitch())) continue; // (switched off: no text until it is on again)
        if (!isOffered(bible.code)) { void loadCatalogue(); continue; } // asks for the list now, and this runs again when it is here
        try {
          await cards.setFetchedText(card.id, await source.fetchPassage(bible, card.reference));
        } catch (e) {
          const problem = e instanceof PassageError ? e.problem : 'failed';
          if (problem === 'offline' || problem === 'busy') break; // try again later
          if (problem === 'not-allowed') refused.add(bible.code);
          else gaveUp.current.add(card.id);
        }
      }
    } finally {
      running.current = false;
    }
  }, [cards]);

  // A translation that is switched off loses its text on this device at once (and gets it back when it is switched on again).
  useEffect(() => {
    if (!off.all && off.off.length === 0) return;
    void cards.clearFetchedText(off.all ? undefined : off.off);
  }, [cards, off]);

  useEffect(() => {
    void run(); // (and again whenever the list of translations arrives, or the switch changes)
    const again = () => void run();
    window.addEventListener('online', again);
    return () => window.removeEventListener('online', again);
  }, [run, listVersion, off]);
  useRefreshOnWrites(run);
}
