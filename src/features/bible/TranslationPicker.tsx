import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, Search, X } from 'lucide-react';
import { autofillSources, sourceFor } from '../../domain/bible/sources';
import { languageName, loadLanguageNames } from '../../domain/bible/languageNames';
import { isSwitchedOff } from '../../domain/bible/switch';
import { useCatalogue } from './catalogue';
import { useLicensedSwitch } from './remoteSwitch';
import { useI18n } from '../../i18n/I18nProvider';
import { HiddenClose, IconButton } from '../../components/ui';
import { usePopupHistory } from '../../lib/usePopupHistory';

/**
 * A form row's value that opens a popup with two tabs, like YouVersion's: the translations (of the language chosen) and the
 * languages. Choosing a language switches to its translations. Closed like the app's other popups: tap outside, Escape or Back.
 */
/** A choice listed above the translations (for a deck: "my own words", a translation that is not on the platform...). */
export interface PickerExtra { code: string; label: string; note?: string; /** Listed only with the translations of this language (always, when searching). */ language?: string }

export function TranslationPicker({ id, value, onChange, initialLanguage, extras = [], emptyLabel }: { id?: string; value: string; onChange: (code: string) => void; initialLanguage: string; extras?: PickerExtra[]; emptyLabel?: string }) {
  const { t, language: appLanguage } = useI18n();
  const [namesLoaded, setNamesLoaded] = useState(false);
  useEffect(() => { void loadLanguageNames().then(() => setNamesLoaded(true)); }, []);
  const switchState = useLicensedSwitch();
  const listState = useCatalogue(); // the list of translations is part of the app: made known the first time the picker opens
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const current = sourceFor(value);
  const extra = extras.find((e) => e.code === value);
  const shownName = extra ? (extra.note ? `${extra.label} (${extra.note})` : extra.label) : current ? `${current.name} (${current.tag})` : emptyLabel ?? t('translation.none');
  const [language, setLanguage] = useState<string>(current?.language ?? initialLanguage);
  const [tab, setTab] = useState<'translation' | 'language'>('translation');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // (opening starts on the language of the translation in use)
  const close = () => { setOpen(false); setTab('translation'); setSearching(false); setQuery(''); };
  usePopupHistory(open, close);
  // Search looks through what the open tab lists. On the Translation tab that is every translation, whatever the language (people
  // search by name: "NASB", "Reina"); on the Language tab it is the languages.
  const q = query.trim().toLowerCase();
  const offered = (list: ReturnType<typeof autofillSources>) => list.filter((o) => !isSwitchedOff(o.code, switchState)); // a translation switched off is not offered
  const shownExtras = tab === 'translation' ? extras.filter((e) => (q ? `${e.label} ${e.note ?? ''} ${e.code}`.toLowerCase().includes(q) : !e.language || e.language === language)) : [];
  const shown = offered(tab === 'translation' && q ? autofillSources().filter((o) => `${o.name} ${o.tag} ${o.code}`.toLowerCase().includes(q)) : autofillSources(language));
  // English and Spanish first, then the rest by name (names are in the app's language, once they are loaded).
  const languages = [...new Set(offered(autofillSources()).map((o) => o.language))]
    .map((code) => ({ code, name: languageName(code, appLanguage) ?? t('autofill.languageCode', { code }) }))
    .sort((a, b) => (a.code === 'en' ? -1 : b.code === 'en' ? 1 : a.code === 'es' ? -1 : b.code === 'es' ? 1 : a.name.localeCompare(b.name, appLanguage)));
  void namesLoaded; // (looks again once the names are here)
  const shownLanguages = tab === 'language' && q ? languages.filter((l) => `${l.name} ${l.code}`.toLowerCase().includes(q)) : languages;
  const searchLabel = t(tab === 'language' ? 'autofill.searchLanguages' : 'autofill.searchTranslations');
  const title = t('autofill.pickerTitle');

  return (
    <div className="min-w-0 flex-1">
      <button
        id={id}
        type="button"
        aria-label={`${t('translation.label')}: ${extra?.label ?? current?.name ?? shownName}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setLanguage(current?.language ?? initialLanguage); setOpen(true); }}
        className="flex w-full min-w-0 items-center justify-between gap-2 py-2.5 text-left text-base font-medium"
      >
        <span className="truncate">{shownName}</span>
        <ChevronDown size={18} aria-hidden className="shrink-0 text-muted" />
      </button>

      <dialog
        ref={ref}
        onClose={close}
        onClick={(e) => e.target === ref.current && close()}
        aria-label={title}
        className="m-auto max-h-[85dvh] w-[min(26rem,calc(100%-2rem))] overflow-hidden rounded-3xl border border-border bg-background p-0 text-foreground backdrop:bg-black/50"
      >
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex h-16 shrink-0 items-center gap-1 px-3">
            {searching ? (
              <>
                <IconButton label={t('decks.searchClose')} onClick={() => { setSearching(false); setQuery(''); }}><ChevronLeft size={22} aria-hidden /></IconButton>
                <input
                  aria-label={searchLabel}
                  type="search"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchLabel}
                  className="min-w-0 flex-1 bg-transparent px-2 text-base placeholder:text-muted [&::-webkit-search-cancel-button]:appearance-none"
                />
                {query && <IconButton label={t('search.clear')} onClick={() => setQuery('')}><X size={20} aria-hidden /></IconButton>}
              </>
            ) : (
              <>
                <h2 className="min-w-0 flex-1 truncate px-2 font-serif text-xl font-medium tracking-tight">{title}</h2>
                <IconButton label={searchLabel} onClick={() => setSearching(true)}><Search size={20} aria-hidden /></IconButton>
              </>
            )}
          </div>
          <div role="tablist" aria-label={title} className="flex shrink-0 border-b border-border px-3">
            {(['translation', 'language'] as const).map((name) => (
              <button
                key={name}
                id={`tab-${name}`}
                type="button"
                role="tab"
                aria-selected={tab === name}
                aria-controls="tabpanel-picker"
                onClick={() => { setTab(name); setQuery(''); }}
                className={`min-h-11 flex-1 border-b-2 px-3 text-[0.9375rem] font-medium ${tab === name ? 'border-foreground text-foreground' : 'border-transparent text-muted hover:text-foreground'}`}
              >
                {t(name === 'translation' ? 'autofill.tabTranslation' : 'autofill.tabLanguage')}
              </button>
            ))}
          </div>
          <div id="tabpanel-picker" role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto">
          <ul>
            {shownExtras.map((e) => (
              <li key={e.code} className="border-b border-border">
                <button
                  type="button"
                  aria-current={e.code === value || undefined}
                  onClick={() => { close(); onChange(e.code); }}
                  className="flex min-h-14 w-full items-center justify-between gap-3 px-5 py-2 text-left hover:bg-surface"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-serif text-lg">{e.label}</span>
                    {e.note && <span className="block text-sm text-muted">{e.note}</span>}
                  </span>
                  {e.code === value && <Check size={18} aria-hidden className="shrink-0" />}
                </button>
              </li>
            ))}
            {tab === 'translation'
              ? shown.map((o) => (
                  <li key={o.code} className="border-b border-border last:border-b-0">
                    <button
                      type="button"
                      aria-current={o.code === value || undefined}
                      onClick={() => { close(); onChange(o.code); }}
                      className="flex min-h-14 w-full items-center justify-between gap-3 px-5 py-2 text-left hover:bg-surface"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-serif text-lg">{o.name}</span>
                        <span className="block text-sm text-muted">{o.tag}</span>
                      </span>
                      {o.code === value && <Check size={18} aria-hidden className="shrink-0" />}
                    </button>
                  </li>
                ))
              : shownLanguages.map((l) => (
                  <li key={l.code} className="border-b border-border last:border-b-0">
                    <button
                      type="button"
                      aria-current={l.code === language || undefined}
                      onClick={() => { setLanguage(l.code); setTab('translation'); setSearching(false); setQuery(''); }}
                      className="flex min-h-14 w-full items-center justify-between gap-3 px-5 py-2 text-left hover:bg-surface"
                    >
                      <span className="min-w-0 truncate font-serif text-lg">{l.name}</span>
                      {l.code === language && <Check size={18} aria-hidden className="shrink-0" />}
                    </button>
                  </li>
                ))}
            {tab === 'translation' && shown.length === 0 && shownExtras.length === 0 && <li className="px-5 py-6 text-center text-muted">{q ? t('translation.noMatch', { query }) : listState === 'idle' ? t('autofill.loadingList') : t('autofill.noneInLanguage')}</li>}
            {tab === 'language' && shownLanguages.length === 0 && <li className="px-5 py-6 text-center text-muted">{t('translation.noMatch', { query })}</li>}
          </ul>
          </div>
          <HiddenClose label={t('common.cancel')} onClick={close} />
        </div>
      </dialog>
    </div>
  );
}
