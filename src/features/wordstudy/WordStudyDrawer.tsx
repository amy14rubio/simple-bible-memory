import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/shadcn/drawer';
import { ExternalLink } from '../../components/ExternalLink';
import { usePopupHistory } from '../../lib/usePopupHistory';
import { useI18n } from '../../i18n/I18nProvider';
import {
  blueLetterUrl, blueLetterVerseUrl, commentaryUrl, lexiconEntry, strongsNumber, versesOfReference,
  type LexiconEntry, type OriginalWord, type VerseRef,
} from './wordData';

/** What the drawer is about: a reference, and (when it is known which one) the original word with the verse it is in. */
export interface WordStudyTarget { reference: string; ref?: VerseRef; word?: OriginalWord }

const button = 'flex min-h-12 w-full items-center justify-center rounded-lg px-5 text-[0.9375rem] font-medium';

/**
 * The drawer behind a word: when the word is known, its original spelling, Strong's number and definition; always three ways to go on:
 * the word-by-word page for the verse, Blue Letter Bible, and a verse commentary.
 */
export function WordStudyDrawer({ target, onClose, hidePage = false }: { target: WordStudyTarget | null; onClose: () => void; /** Already on the word-by-word page: no button to it. */ hidePage?: boolean }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const open = target !== null;
  usePopupHistory(open, onClose);
  const [entry, setEntry] = useState<LexiconEntry | null | 'loading'>('loading');
  const word = target?.word;

  useEffect(() => {
    if (!word) return;
    let cancelled = false;
    setEntry('loading');
    void lexiconEntry(word.strongs).then((e) => { if (!cancelled) setEntry(e); });
    return () => { cancelled = true; };
  }, [word]);

  const verse = target?.ref ?? (target ? versesOfReference(target.reference)?.[0] : undefined);
  const sense = entry && entry !== 'loading' ? entry.senses[0] : undefined;
  const lang = word?.language === 'hebrew' ? 'he' : 'el';

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) onClose(); }} showSwipeHandle>
      <DrawerContent className="mx-auto max-w-2xl pb-[calc(0.75rem+var(--safe-bottom))]" closeLabel={t('common.close')}>
        <DrawerHeader className="px-6 pb-2 pt-1 group-data-[swipe-axis=y]/drawer-popup:text-left">
          <DrawerTitle className="font-serif text-xl font-medium tracking-tight">{t('wordstudy.title')}</DrawerTitle>
          <DrawerDescription>{target?.reference}</DrawerDescription>
        </DrawerHeader>
        <div className="max-h-[70dvh] space-y-4 overflow-y-auto px-6 pb-2">
          {word && (
            <section aria-live="polite" className="space-y-2">
              <p lang={lang} dir={word.language === 'hebrew' ? 'rtl' : 'ltr'} className="font-serif text-3xl">{sense?.lemma ?? word.text}</p>
              <p className="text-sm text-muted">
                {sense?.transliteration ?? word.transliteration} · {strongsNumber(word.strongs)}
                {word.parsingFull && <> · {word.parsingFull}</>}
              </p>
              {entry === 'loading' && <p role="status" className="text-muted">{t('wordstudy.loading')}</p>}
              {sense?.gloss && <p className="text-lg">{sense.gloss}</p>}
              {sense && <p className="max-h-40 overflow-y-auto whitespace-pre-line text-[0.9375rem] leading-snug text-muted">{sense.definition}</p>}
              {entry === null && <p className="text-muted">{t('wordstudy.noEntry')}</p>}
            </section>
          )}
          {!verse && <p className="text-muted">{t('wordstudy.unsupported')}</p>}
          {verse && target && (
            <div className="space-y-2">
              {!hidePage && (
                <button type="button" className={`${button} bg-primary text-primary-foreground`} onClick={() => { onClose(); navigate(`/word-study?ref=${encodeURIComponent(target.reference)}`); }}>
                  {t('wordstudy.page')}
                </button>
              )}
              <ExternalLink href={word ? blueLetterUrl(word.strongs) : blueLetterVerseUrl(verse)} className={`${button} border border-border`}>{t('wordstudy.blueLetter')}</ExternalLink>
              <ExternalLink href={commentaryUrl(verse)} className={`${button} border border-border`}>{t('wordstudy.commentary')}</ExternalLink>
            </div>
          )}
          <p className="text-xs text-muted">{t('wordstudy.credit')}</p>
        </div>
        <div className="h-4" />
      </DrawerContent>
    </Drawer>
  );
}
