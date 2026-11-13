import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppBar, BackButton, ErrorMessage, Page } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';
import { bsbVerseText, originalWords, strongsNumber, versesOfReference, type OriginalWord, type VerseRef } from './wordData';
import { WordStudyDrawer, type WordStudyTarget } from './WordStudyDrawer';

interface Loaded { ref: VerseRef; words: OriginalWord[]; text: string }

/**
 * Every original word of a verse (or a few verses) in a table, like an interlinear Bible: the Greek or Hebrew word with its transliteration, the
 * English it stands for in the Berean text, its Strong's number and its grammar. Tapping a row opens the word's definition.
 */
export function WordStudyPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const reference = params.get('ref') ?? '';
  const jump = params.get('w'); // "16.2": the word to bring into view, when the page was opened from a press on it
  const jumped = useRef(false);
  const refs = versesOfReference(reference);
  const [verses, setVerses] = useState<Loaded[] | 'loading' | 'error'>('loading');
  const [target, setTarget] = useState<WordStudyTarget | null>(null);

  useEffect(() => {
    if (!refs) return;
    let cancelled = false;
    setVerses('loading');
    Promise.all(refs.map(async (ref) => ({ ref, words: await originalWords(ref), text: await bsbVerseText(ref).catch(() => '') })))
      .then((v) => { if (!cancelled) setVerses(v); })
      .catch(() => { if (!cancelled) setVerses('error'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  // Once the table is there, the word that was pressed is brought into view (once).
  useEffect(() => {
    if (!Array.isArray(verses) || !jump || jumped.current) return;
    jumped.current = true;
    document.getElementById(`word-${jump.replace('.', '-')}`)?.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
  }, [verses, jump]);

  return (
    <>
      <AppBar title={t('wordstudy.pageTitle')} back={<BackButton label={t('common.back')} />} />
      <Page className="space-y-6">
        <div className="space-y-2">
          <h2 className="font-serif text-2xl">{reference}</h2>
          {Array.isArray(verses) && verses.some((v) => v.text) && (
            <>
              <p className="scripture text-lg">{verses.map((v) => v.text).filter(Boolean).join(' ')}</p>
              <p className="text-sm text-muted">{t('wordstudy.bsb')}</p>
            </>
          )}
        </div>
        {!refs && <p className="text-muted">{t('wordstudy.unsupported')}</p>}
        {refs && verses === 'loading' && <p role="status" className="text-muted">{t('wordstudy.loading')}</p>}
        {verses === 'error' && <ErrorMessage error={t('wordstudy.error')} />}
        {Array.isArray(verses) && verses.map(({ ref, words }) => (
          <section key={ref.verse} aria-label={`${ref.book} ${ref.chapter}:${ref.verse}`}>
            {verses.length > 1 && <h3 className="mb-2 font-serif text-lg">{ref.book} {ref.chapter}:{ref.verse}</h3>}
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[22rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border text-sm text-muted">
                    <th scope="col" className="py-2 pr-3 font-normal">{t('wordstudy.colWord')}</th>
                    <th scope="col" className="py-2 pr-3 font-normal">{t('wordstudy.colEnglish')}</th>
                    <th scope="col" className="py-2 font-normal">{t('wordstudy.colStrongs')}</th>
                  </tr>
                </thead>
                <tbody>
                  {words.map((w) => (
                    <tr key={w.pos} id={`word-${ref.verse}-${w.pos}`} className={`border-b border-border align-top ${jump === `${ref.verse}.${w.pos}` ? 'bg-surface' : ''}`}>
                      <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                        <button type="button" onClick={() => setTarget({ reference: `${ref.book} ${ref.chapter}:${ref.verse}`, ref, word: w })} className="block text-left">
                          <span lang={w.language === 'hebrew' ? 'he' : 'el'} dir={w.language === 'hebrew' ? 'rtl' : 'ltr'} className="block font-serif text-xl leading-tight underline decoration-dotted underline-offset-4">{w.text}</span>
                          <span className="block text-sm text-muted">{w.transliteration}</span>
                        </button>
                      </th>
                      <td className="py-2.5 pr-3">{w.gloss ?? <span aria-hidden className="text-muted">·</span>}</td>
                      <td className="py-2.5 text-sm">{strongsNumber(w.strongs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </Page>
      <WordStudyDrawer target={target} onClose={() => setTarget(null)} hidePage />
    </>
  );
}
