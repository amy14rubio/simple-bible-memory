import { useEffect, useState, type ReactNode } from 'react';
import { useTheme, type ThemePreference } from '../../app/theme';
import { AppBar, BackButton, Button, CheckList, Page } from '../../components/ui';
import { DARK_START, LIGHT_START, isHex, type CustomTheme } from '../../lib/customTheme';
import { useI18n } from '../../i18n/I18nProvider';

type Channel = keyof CustomTheme;

/**
 * The Theme page: a list of the four choices, and, when Custom is chosen, the pickers for its
 * background, text and accent colours. Everything else (panels, borders, muted text) is worked out from those three.
 * The whole app changes as you pick, so the app itself is the preview; the card below shows a few typical pieces too.
 */
export function ThemePage() {
  const { t } = useI18n();
  const { preference, setPreference, custom, setCustom } = useTheme();
  const colors = custom ?? (document.documentElement.dataset.theme === 'dark' ? DARK_START : LIGHT_START);

  // A small dot shows what each choice looks like. System is half light, half dark: it follows the device.
  // The ring is an inner shadow in the text colour so every dot shows up against the page (even a dark dot on a dark page),
  // and it is not a border, so the colours run cleanly underneath it.
  const dot = (background: string) => (
    <span
      aria-hidden
      className="size-6 shrink-0 rounded-full shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--foreground)_55%,transparent)]"
      style={{ background, backgroundRepeat: 'no-repeat' }}
    />
  );
  const options: { value: ThemePreference; label: string; leading: ReactNode }[] = [
    { value: 'system', label: t('settings.themeSystem'), leading: dot(`linear-gradient(90deg, ${LIGHT_START.background} 50%, ${DARK_START.background} 50%)`) },
    { value: 'light', label: t('settings.themeLight'), leading: dot(LIGHT_START.background) },
    { value: 'dark', label: t('settings.themeDark'), leading: dot(DARK_START.background) },
    { value: 'custom', label: t('settings.themeCustom'), leading: dot(colors.background) },
  ];

  const rows: { channel: Channel; label: string }[] = [
    { channel: 'background', label: t('customTheme.background') },
    { channel: 'text', label: t('customTheme.text') },
    { channel: 'accent', label: t('customTheme.accent') },
  ];

  return (
    <>
      <AppBar title={t('settings.theme')} back={<BackButton to="/settings" label={t('common.back')} />} />
      <Page className="space-y-8 pt-0">
        <CheckList label={t('settings.theme')} name="theme" value={preference} options={options} onChange={(v) => void setPreference(v)} />

        {preference === 'custom' && (
          <>
            <section aria-label={t('customTheme.preview')} className="space-y-3 rounded-3xl bg-panel px-5 py-6">
              <p className="font-serif text-xl font-medium">{t('customTheme.sampleReference')}</p>
              <p className="scripture text-lg">{t('customTheme.samplePassage')}</p>
              <p className="text-sm font-medium text-accent">{t('customTheme.sampleAccent')}</p>
              <div className="h-2 overflow-hidden rounded-full bg-foreground/10"><div className="h-full w-2/3 rounded-full bg-accent" /></div>
              <div aria-hidden className="flex min-h-12 items-center justify-center rounded-lg bg-primary text-[0.9375rem] font-medium text-primary-foreground">{t('study.showAnswer')}</div>
            </section>

            <div>
              {rows.map(({ channel, label }) => (
                <ColorRow key={channel} label={label} value={colors[channel]} onChange={(v) => void setCustom({ ...colors, [channel]: v })} />
              ))}
            </div>

            <Button variant="secondary" className="w-full" onClick={() => void setCustom(systemDark() ? DARK_START : LIGHT_START)}>{t('customTheme.reset')}</Button>
          </>
        )}
      </Page>
    </>
  );
}

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

/** A colour swatch that opens the system colour picker, next to a field for typing an exact hex code. */
function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  const { t } = useI18n();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]); // follow the picker, and Reset

  return (
    <div className="flex items-center gap-4 border-b border-border py-3">
      <span className="min-w-0 flex-1">{label}</span>
      <label className="relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-full border border-border" style={{ background: value }}>
        <input
          type="color"
          aria-label={t('customTheme.pickerFor', { label })}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
      <input
        type="text"
        aria-label={t('customTheme.hexFor', { label })}
        value={text}
        maxLength={7}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(e) => {
          const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
          setText(v);
          if (isHex(v)) onChange(v.toLowerCase());
        }}
        onBlur={() => setText(value)} // drop a half-typed code
        className="w-28 rounded-lg border border-border bg-surface px-3 py-2 text-center font-mono text-base uppercase"
      />
    </div>
  );
}
