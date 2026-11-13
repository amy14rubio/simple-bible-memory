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
  // On the table page the title is the English the word has in the Berean text ("loved"); everywhere else (and for a word with no English), the verse.
  const english = hidePage ? word?.gloss?.replace(/[[\]{}]/g, '').trim() : undefined;
  const title = english || target?.reference || t('wordstudy.title');

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) onClose(); }} showSwipeHandle>
      <DrawerContent className="mx-auto max-h-[90dvh] max-w-2xl overflow-y-auto pb-[calc(1.5rem+var(--safe-bottom))]" closeLabel={t('common.close')}>
        <DrawerHeader className="px-6 pb-2 pt-1 group-data-[swipe-axis=y]/drawer-popup:text-left">
          <DrawerTitle className="font-serif text-2xl font-medium tracking-tight">{title}</DrawerTitle>
          <DrawerDescription className="sr-only">{target?.reference}</DrawerDescription> {/* the title already says it, for the eye */}
        </DrawerHeader>
        <div className="space-y-5 px-6 pb-2">
          {word && (
            <>
              <section aria-live="polite" className="space-y-3">
                <p lang={lang} dir={word.language === 'hebrew' ? 'rtl' : 'ltr'} className="font-serif text-xl">{sense?.lemma ?? word.text}</p>
                <dl className="divide-y divide-border border-y border-border text-[0.9375rem]">
                  <div className="flex justify-between gap-4 py-2"><dt className="text-muted">{t('wordstudy.factSounds')}</dt><dd className="text-right">{sense?.transliteration ?? word.transliteration}</dd></div>
                  <div className="flex justify-between gap-4 py-2"><dt className="text-muted">{t('wordstudy.colStrongs')}</dt><dd className="text-right">{strongsNumber(word.strongs)}</dd></div>
                  {word.parsingFull && <div className="flex justify-between gap-4 py-2"><dt className="text-muted">{t('wordstudy.factType')}</dt><dd className="text-right">{word.parsingFull}</dd></div>}
                </dl>
              </section>
              <section className="space-y-1">
                <h3 className="text-sm font-medium text-muted">{t('wordstudy.sectionDefinition')}</h3>
                {entry === 'loading' && <p role="status" className="text-muted">{t('wordstudy.loading')}</p>}
                {sense?.gloss && <p className="text-lg">{sense.gloss}</p>}
                {sense && <p className="whitespace-pre-line text-[0.9375rem] leading-snug text-muted">{sense.definition}</p>}
                {entry === null && <p className="text-muted">{t('wordstudy.noEntry')}</p>}
              </section>
            </>
          )}
          {!verse && <p className="text-muted">{t('wordstudy.unsupported')}</p>}
          {verse && target && !hidePage && (
            <section className={`space-y-2 ${word ? '' : 'pt-6'}`}>
              <button type="button" className={`${button} bg-primary text-primary-foreground`} onClick={() => { onClose(); navigate(`/word-study?ref=${encodeURIComponent(target.reference)}${word && target.ref ? `&w=${target.ref.verse}.${word.pos}` : ''}`); }}>
                {t('wordstudy.page')}
              </button>
              <ExternalLink href={word ? blueLetterUrl(word.strongs) : blueLetterVerseUrl(verse)} className={`${button} border border-border`}>{t('wordstudy.blueLetter')}</ExternalLink>
              <ExternalLink href={commentaryUrl(verse)} className={`${button} border border-border`}>{t('wordstudy.commentary')}</ExternalLink>
            </section>
          )}
          <div className="space-y-0.5 text-xs text-muted">
            <p>{t('wordstudy.creditWords')}</p>
            <p>{t('wordstudy.creditDefinitions')}</p>
          </div>
        </div>
        <div className="h-6" />
      </DrawerContent>
    </Drawer>
  );
}
