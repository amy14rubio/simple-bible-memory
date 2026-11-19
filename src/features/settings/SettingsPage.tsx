import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, CircleHelp } from 'lucide-react';
import { SettingsCoach, useSettingsCoach } from '../../components/Coach';
import { useRepositories } from '../../app/repositories';
import { useTheme } from '../../app/theme';
import { useFont } from '../../app/fonts';
import { useSharing } from '../../app/sharing';
import { toast } from '../../components/shadcn/toast';
import { ExportDrawer, type ExportTarget } from '../exchange/ExportDrawer';
import { AppBar, BackButton, ConfirmDialog, ErrorMessage, IconButton, Page, Switch, useErrorState } from '../../components/ui';
import { InfoLabel } from '../../components/InfoDrawer';
import { AppleLogo } from '../../components/AppleLogo';
import { appleSignInSupported } from '../../platform/apple';
import { DIFFICULTIES, type Difficulty } from '../../domain/study/cloze';
import type { CardKindSetting } from '../../domain/study/cardKind';
import { LANGUAGES, type MessageKey } from '../../i18n';
import { useI18n } from '../../i18n/I18nProvider';
import { CONTACT_EMAIL } from '../discover/contact';
import { encouragementDefault } from '../study/encouragement';
import { loadCardKindSetting } from '../study/cardKinds';
import { MAX_NEW_PER_DAY, loadNewPerDay } from '../study/newPerDay';
import { RemindersSection } from '../reminders/RemindersSection';

const THEME_LABEL = { system: 'settings.themeSystem', light: 'settings.themeLight', dark: 'settings.themeDark', custom: 'settings.themeCustom' } as const;

const row = 'flex min-h-13 items-center justify-between gap-4 border-b border-border py-1.5';
const heading = 'mb-2.5 px-2 font-serif text-xl'; // px-2: the title is nudged in a little from the panel's edge
/** One group of settings: a grey panel like the sections of Statistics, its rows divided by thin lines (none under the last one). */
const panel = 'rounded-3xl bg-panel px-5 py-1 [&>*:last-child]:border-b-0';

export function SettingsPage() {
  const { t, preference: languagePreference } = useI18n();
  const { preference } = useTheme();
  const { family: fontFamily } = useFont();
  const [exporting, setExporting] = useState<ExportTarget | null>(null);
  const share = useSharing();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [accountError, setAccountError] = useErrorState();
  const { settings } = useRepositories();
  const [newPerDay, setNewPerDay] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [kinds, setKinds] = useState<CardKindSetting>('both');
  const [encouragement, setEncouragement] = useState(true);
  const encouragementTouched = useRef(false); // a tap before the saved value has loaded must not be undone by it

  const coach = useSettingsCoach();

  useEffect(() => { share.ensureLoaded(); }, [share]);

  useEffect(() => {
    loadNewPerDay(settings).then((n) => setNewPerDay(String(n)));
    loadCardKindSetting(settings).then(setKinds);
    settings.get<Difficulty>('blank_difficulty').then((d) => d && DIFFICULTIES.includes(d) && setDifficulty(d));
    settings.get<boolean>('encouragement').then((on) => { if (!encouragementTouched.current) setEncouragement(on ?? encouragementDefault()); });
  }, [settings]);

  const changeNew = (value: string) => {
    setNewPerDay(value);
    const n = Number(value);
    if (value !== '' && Number.isInteger(n) && n >= 0 && n <= MAX_NEW_PER_DAY) void settings.set('new_cards_per_day', n);
  };

  return (
    <>
      <AppBar title={t('settings.title')} back={<BackButton to="/" label={t('common.backToDecks')} />} actions={<IconButton label={t('coach.settings.replay')} onClick={coach.start}><CircleHelp size={22} aria-hidden /></IconButton>} />
      <Page id="settings-page" className="space-y-7">
        <section aria-labelledby="personalization">
          <h2 id="personalization" className={heading}>{t('settings.personalization')}</h2>
          {/* Language, theme and font are one step of the Settings guide (they are all about how the app looks and reads). */}
          <div data-coach="look" className={panel}>
            <Link to="/settings/language" className={`${row} hover:bg-surface`}>
              <span>{t('settings.language')}</span>
              <span className="flex items-center gap-1 text-muted">
                {languagePreference === 'system' ? t('settings.languageSystem') : LANGUAGES.find((l) => l.code === languagePreference)?.name}
                <ChevronRight size={20} aria-hidden />
              </span>
            </Link>
            <Link to="/settings/theme" className={`${row} hover:bg-surface`}>
              <span>{t('settings.theme')}</span>
              <span className="flex items-center gap-1 text-muted">
                {t(THEME_LABEL[preference])}
                <ChevronRight size={20} aria-hidden />
              </span>
            </Link>
            <Link to="/settings/font" className={`${row} hover:bg-surface`}>
              <span>{t('settings.font')}</span>
              <span className="flex min-w-0 items-center gap-1 text-muted">
                <span className="truncate">{fontFamily ?? t('fonts.default')}</span>
                <ChevronRight size={20} aria-hidden className="shrink-0" />
              </span>
            </Link>
          </div>
        </section>

        <section aria-labelledby="study">
          <h2 id="study" className={heading}>{t('settings.study')}</h2>
          <div className={panel}>
          <Link to="/settings/card-kinds" data-coach="kinds" className={`${row} hover:bg-surface`}>
            <span>{t('settings.kindsLegend')}</span>
            <span className="flex items-center gap-1 text-muted">
              {t(`kinds.${kinds}.title` as MessageKey)}
              <ChevronRight size={20} aria-hidden />
            </span>
          </Link>
          <Link to="/settings/blanks" data-coach="blanks" className={`${row} hover:bg-surface`}>
            <span>{t('settings.blanks')}</span>
            <span className="flex items-center gap-1 text-muted">
              {t(`difficulty.${difficulty}` as MessageKey)}
              <ChevronRight size={20} aria-hidden />
            </span>
          </Link>
          <Link to="/settings/voice" className={`${row} hover:bg-surface`}>
            <span>{t('settings.voice')}</span>
            <ChevronRight size={20} aria-hidden className="text-muted" />
          </Link>
          <div data-coach="new" className={row}>
            <InfoLabel title={t('settings.newPerDay')} info={t('settings.newPerDayHint')} />
            <input
              id="new-per-day"
              aria-label={t('settings.newPerDay')}
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_NEW_PER_DAY}
              value={newPerDay}
              onChange={(e) => changeNew(e.target.value)}
              className="w-20 rounded-lg border border-border bg-surface px-3 py-2 text-center text-base"
            />
          </div>
          <div className={row}>
            <span id="encouragement-label" className="sr-only">{t('settings.encouragement')}</span>
            <InfoLabel title={t('settings.encouragement')} info={t('settings.encouragementHint')} />
            <Switch checked={encouragement} labelledBy="encouragement-label" onChange={(on) => { encouragementTouched.current = true; setEncouragement(on); void settings.set('encouragement', on); }} />
          </div>
          </div>
        </section>
        <RemindersSection />

        <section aria-labelledby="backup" data-coach="backup">
          <h2 id="backup" className={heading}><InfoLabel title={t('settings.backup')} info={t('settings.backupBody')} className="-my-2.5" /></h2>
          <div className={panel}>
          {/* One line says who is signed in and how the backup is going (when there is no backup status, "Signed in as" stands alone below). */}
          {share.available && share.user && share.accountStatus.state !== 'off' && (
            <div role="status" className={`${row} text-muted`}><span>{t(`account.backup.${share.accountStatus.state}` as MessageKey, { name: share.user.displayName ?? share.user.email ?? '' })}</span></div>
          )}
          {/* Some cards the account would not take (the rest is backed up): which ones, so they can be fixed. */}
          {share.available && share.user && share.accountStatus.state === 'synced' && share.accountStatus.refused && (() => {
            const { count, examples } = share.accountStatus.refused;
            const cards = examples.every((e) => e.entity === 'card');
            const kind = cards ? 'refused' : 'refusedItems';
            return (
              <div role="status" className={`${row} block space-y-1 text-muted`}>
                <p>{t(`account.backup.${kind}.${count === 1 ? 'one' : 'other'}` as MessageKey, { count })}</p>
                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                  {examples.map((r, i) => <li key={i} className="break-words">{r.name}</li>)}
                </ul>
                {count > examples.length && <p className="text-sm">{t('account.backup.refusedMore', { count: count - examples.length })}</p>}
              </div>
            );
          })()}
          <button type="button" onClick={() => setExporting({ ids: null, title: t('export.everything') })} className={`${row} w-full text-left hover:bg-surface`}>
            <span>{t('export.titleAll')}</span>
            <ChevronRight size={20} aria-hidden className="shrink-0 text-muted" />
          </button>
          {share.available && (
            <>
              {accountError && <div className="py-2"><ErrorMessage error={accountError} /></div>}
              {share.user ? (
                <>
                  {share.accountStatus.state === 'off' && <div className={row}><span className="min-w-0 truncate">{t('account.signedInAs', { name: share.user.displayName ?? share.user.email ?? '' })}</span></div>}
                  <button type="button" onClick={() => void share.signOut()} className={`${row} w-full text-left hover:bg-surface`}>
                    <span>{t('account.signOut')}</span>
                  </button>
                  <button type="button" onClick={() => setConfirmingDelete(true)} className={`${row} w-full text-left text-danger hover:bg-surface`}>
                    <span>{t('account.delete')}</span>
                  </button>
                </>
              ) : (
                <>
                  <button type="button" disabled={!share.authLoaded} onClick={() => { share.signIn().then(() => setAccountError(undefined), () => setAccountError(t('publish.signInFailed'))); }} className={`${row} w-full text-left hover:bg-surface disabled:opacity-60`}>
                    <span>{t('account.signIn')}</span>
                    <ChevronRight size={20} aria-hidden className="shrink-0 text-muted" />
                  </button>
                  {appleSignInSupported() && (
                    <button type="button" disabled={!share.authLoaded} onClick={() => { share.signInWithApple().then(() => setAccountError(undefined), () => setAccountError(t('publish.signInFailed'))); }} className={`${row} w-full text-left hover:bg-surface disabled:opacity-60`}>
                      <span className="flex items-center gap-2"><AppleLogo />{t('account.signInApple')}</span>
                      <ChevronRight size={20} aria-hidden className="shrink-0 text-muted" />
                    </button>
                  )}
                </>
              )}
            </>
          )}
          </div>
        </section>
        <section aria-labelledby="about">
          <h2 id="about" className={heading}>{t('settings.about')}</h2>
          <div className={panel}>
          <Link to="/settings/about" className={`${row} hover:bg-surface`}>
            <span>{t('about.row')}</span>
            <ChevronRight size={20} aria-hidden className="shrink-0 text-muted" />
          </Link>
          <Link to="/welcome" data-coach="tour" className={`${row} hover:bg-surface`}>
            <span>{t('onboarding.tour')}</span>
            <ChevronRight size={20} aria-hidden className="shrink-0 text-muted" />
          </Link>
          <Link to="/settings/privacy" className={`${row} hover:bg-surface`}>
            <span>{t('privacy.row')}</span>
            <ChevronRight size={20} aria-hidden className="shrink-0 text-muted" />
          </Link>
          {share.available && (
            <div className={row}>
              <InfoLabel title={t('settings.contact')} info={t('settings.contactBody')} className="whitespace-nowrap" />
              {/* the address is shown where there is room; on a phone the row is just the label and the arrow (the link still says the address) */}
              <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Simple Bible Memory')}`} aria-label={CONTACT_EMAIL} className="-my-2 flex min-w-0 items-center gap-1 py-2 pl-8 text-muted hover:text-foreground">
                <span className="hidden truncate sm:inline">{CONTACT_EMAIL}</span>
                <ChevronRight size={20} aria-hidden className="shrink-0" />
              </a>
            </div>
          )}
          </div>
        </section>
        <ExportDrawer target={exporting} onClose={() => setExporting(null)} />
        {coach.open && <SettingsCoach onClose={coach.close} />}
        <ConfirmDialog
          open={confirmingDelete}
          title={t('account.deleteTitle')}
          message={t('account.deleteBody')}
          confirmLabel={t('account.delete')}
          onConfirm={() => { setConfirmingDelete(false); share.deleteAccount().then(() => toast.add({ title: t('toast.accountDeleted'), type: 'success' })).catch(() => setAccountError(t('account.deleteFailed'))); }}
          onCancel={() => setConfirmingDelete(false)}
        />
      </Page>
    </>
  );
}
