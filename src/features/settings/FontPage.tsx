import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { LoaderCircle } from 'lucide-react';
import { MAX_SCALE, MIN_SCALE, useFont } from '../../app/fonts';
import { AppBar, BackButton, Button, ErrorMessage, FormRow, Page, useErrorState } from '../../components/ui';
import { OptionPicker, type PickerOption } from '../../components/OptionPicker';
import { InfoLabel } from '../../components/InfoDrawer';
import { useCatalogue } from '../../app/catalogue';
import { FONT_CATEGORIES, fontCssUrl, fontFamilyValue, type CatalogueFont } from '../../lib/fonts/catalogue';
import { fontStorageAvailable } from '../../lib/fonts/fontStore';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n';

const DEFAULT = '__default';
const DEFAULT_STACKS = { serif: "'Literata Variable', Georgia, 'Times New Roman', serif", sans: "'Instrument Sans Variable', system-ui, sans-serif" };

/** True once the element is on (or near) the screen: fonts for rows far below are not fetched until you scroll there. */
function useNearScreen<E extends Element>() {
  const ref = useRef<E>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    // A short pause, so flicking quickly past hundreds of rows doesn't request a font for each one.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver((entries) => {
      clearTimeout(timer);
      if (entries.some((e) => e.isIntersecting)) timer = setTimeout(() => setNear(true), 150);
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => { io.disconnect(); clearTimeout(timer); };
  }, [near]);
  return [ref, near] as const;
}

/** Loads a tiny version of a font holding only the given letters, so it can be shown before anything is downloaded. */
function usePreviewFont(font: CatalogueFont | undefined, text: string, enabled: boolean) {
  useEffect(() => {
    if (!font || !enabled || !navigator.onLine) return;
    const href = fontCssUrl(font, text);
    if (document.head.querySelector(`link[data-font-preview][href="${CSS.escape(href)}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.fontPreview = '';
    document.head.append(link);
  }, [font, text, enabled]);
}

const formatSize = (bytes: number, language: string) => `${new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(Math.max(1, Math.round(bytes / 1024)))} KB`;

export function FontPage() {
  const { t, language } = useI18n();
  const { family, stored, apply, scale, setScale } = useFont();
  const { fonts, status } = useCatalogue();
  const byName = useMemo(() => new Map(fonts.map((f) => [f.family, f])), [fonts]);
  const [selected, setSelected] = useState<string | null>(family); // what the preview shows; not applied until you press the button
  const [busy, setBusy] = useState(false);
  const [error, setError] = useErrorState();

  useEffect(() => setSelected(family), [family]); // follow the applied font (for example once the saved one has loaded)
  useEffect(() => () => { document.querySelectorAll('link[data-font-preview]').forEach((l) => l.remove()); }, []);

  const sampleReference = t('customTheme.sampleReference');
  const samplePassage = t('fonts.sample');
  // The chosen font as an object: from the list, or (for one already on the device) rebuilt from what was stored.
  const chosen: CatalogueFont | undefined = selected
    ? byName.get(selected) ?? (stored && stored.family === selected ? { family: stored.family, category: stored.category ?? 'sans-serif', weights: [400, 700] } : undefined)
    : undefined;
  usePreviewFont(chosen, `${selected ?? ''}${sampleReference}${samplePassage}`, selected !== family);

  const options: PickerOption[] = [
    { value: DEFAULT, label: t('fonts.default') },
    ...fonts.map((f) => ({ value: f.family, label: f.family, style: { fontFamily: fontFamilyValue(f) }, group: f.category })),
  ];
  const previewStyle = {
    '--font-serif': chosen ? fontFamilyValue(chosen) : DEFAULT_STACKS.serif,
    '--font-sans': chosen ? fontFamilyValue(chosen) : DEFAULT_STACKS.sans,
  } as CSSProperties;

  const lastTap = useRef({ time: 0, x: 0, y: 0 });
  // (Counted when the tap is complete, as a click: resetting any earlier would shrink the page before the tap lands, and whatever moved up under the finger would take it.)
  const onSizeTap = (e: React.MouseEvent) => {
    const last = lastTap.current;
    const quick = e.timeStamp - last.time < 350 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 40;
    lastTap.current = quick ? { time: 0, x: 0, y: 0 } : { time: e.timeStamp, x: e.clientX, y: e.clientY };
    if (quick) setScale(1);
  };

  const use = async () => {
    setBusy(true);
    // (An error already on screen stays while this tries again, so nothing above or below it jumps; a failure nudges it, a success removes it.)
    try { await apply(chosen ?? null); setError(undefined); } catch { setError(t('fonts.failed', { family: selected ?? '' })); } finally { setBusy(false); }
  };

  return (
    <>
      <AppBar
        title={
          <InfoLabel
            title={t('settings.font')}
            info={
              <div className="space-y-3 text-base">
                <p>{t('fonts.infoPreview')}</p>
                <p>{t('fonts.infoStored')}</p>
                <p>{t('fonts.infoSize')}</p>
              </div>
            }
          />
        }
        back={<BackButton to="/settings" label={t('common.back')} />}
      />
      <Page className="space-y-6 pt-2">
        <FormRow label={t('settings.font')} labelNode={<span id="font-row-label" className="block text-[0.9375rem] font-medium">{t('settings.font')}</span>}>
          {() => (
          <OptionPicker
            variant="field"
            label={t('settings.font')}
            value={selected ?? DEFAULT}
            options={options}
            onChange={(v) => { setError(undefined); setSelected(v === DEFAULT ? null : v); }}
            popupTitle={t('fonts.selectTitle')}
            searchLabel={t('fonts.search')}
            noMatch={(query) => t('fonts.noMatch', { query })}
            renderOption={(o) => <FontName option={o} font={byName.get(o.value)} applied={family} />}
            filters={FONT_CATEGORIES.map((c) => ({ value: c, label: t(`fonts.cat.${c}` as MessageKey) }))}
            filtersLabel={t('fonts.categories')}
            allLabel={t('fonts.cat.all')}
          />
          )}
        </FormRow>

        <section aria-label={t('customTheme.preview')} style={previewStyle} className="space-y-3 rounded-3xl bg-panel px-5 py-6">
          <p className="font-serif text-xl font-medium">{sampleReference}</p>
          <p className="scripture break-words text-lg">{samplePassage}</p>
        </section>

        <div>
          {/* Two quick taps anywhere on this row (the label, the slider or the percentage) reset the size to 100%. */}
          {/* One line at every size, as it always was: a layout that changed with the text size would move the slider under your finger while you drag it. The name and the percentage widen with the text. */}
          <div className="flex touch-manipulation items-center gap-4 py-1" onClick={onSizeTap}>
            {/* (A name, not a <label for>: a tap on a label is passed on to the slider as a second click, which would count as a double-tap) */}
            <span id="text-size-label" className="w-[calc(var(--spacing)*24*var(--icon-scale,1))] shrink-0 text-[0.9375rem] font-medium">{t('fonts.size')}</span>
            <input
              id="text-size"
              aria-labelledby="text-size-label"
              type="range"
              min={MIN_SCALE * 100}
              max={MAX_SCALE * 100}
              step={5}
              value={Math.round(scale * 100)}
              onChange={(e) => setScale(Number(e.target.value) / 100)}
              aria-valuetext={new Intl.NumberFormat(language, { style: 'percent' }).format(scale)}
              className="min-w-0 flex-1 accent-[var(--foreground)]"
            />
            <span aria-hidden className="min-w-[calc(var(--spacing)*12*var(--icon-scale,1))] shrink-0 whitespace-nowrap text-right text-sm text-muted">{new Intl.NumberFormat(language, { style: 'percent' }).format(scale)}</span>
          </div>
        </div>

        {status === 'loading' && <p role="status" className="text-sm text-muted">{t('fonts.loadingList')}</p>}
        {status === 'unavailable' && <p role="status" className="text-sm text-muted">{t('fonts.shortList')}</p>}
        {!fontStorageAvailable() && <p role="status" className="text-sm text-muted">{t('fonts.unsupported')}</p>}
        {error && <ErrorMessage error={error} />}

        {selected !== family && (
          <Button className="w-full" disabled={busy} onClick={() => void use()}>
            {busy ? <><LoaderCircle size={18} aria-hidden className="animate-spin" />{t('fonts.downloading')}</> : t(selected ? 'fonts.use' : 'fonts.useDefault')}
          </Button>
        )}
        {stored && selected === family && <p className="text-center text-sm text-muted">{t('fonts.stored', { size: formatSize(stored.bytes, language) })}</p>}
      </Page>
    </>
  );
}

/** A font's name written in that font. Its tiny preview file is fetched only when the row is on screen. */
function FontName({ option, font, applied }: { option: PickerOption; font: CatalogueFont | undefined; applied: string | null }) {
  const [ref, near] = useNearScreen<HTMLSpanElement>();
  usePreviewFont(font, option.label, near && option.value !== applied);
  return <span ref={ref} style={option.style}>{option.label}</span>;
}
