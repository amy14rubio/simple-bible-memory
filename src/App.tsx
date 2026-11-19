import { HashRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { DatabaseProvider } from './app/DatabaseProvider';
import { RepositoriesProvider } from './app/repositories';
import { ThemeProvider } from './app/theme';
import { FontProvider } from './app/fonts';
import { SharingProvider } from './app/sharing';
import { I18nProvider, useI18n } from './i18n/I18nProvider';
import { AppShell } from './app/AppShell';
import { DecksPage } from './features/decks/DecksPage';
import { DeckHomePage } from './features/decks/DeckHomePage';
import { CardBrowsePage } from './features/decks/CardBrowsePage';
import { DeckFormPage } from './features/decks/DeckFormPage';
import { CardFormPage } from './features/cards/CardFormPage';
import { StatisticsPage } from './features/stats/StatisticsPage';
import { StudySessionPage } from './features/study/StudySessionPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { ThemePage } from './features/settings/ThemePage';
import { LanguagePage } from './features/settings/LanguagePage';
import { FontPage } from './features/settings/FontPage';
import { CardKindsPage } from './features/settings/CardKindsPage';
import { BlanksPage } from './features/settings/BlanksPage';
import { VoicePage } from './features/settings/VoicePage';
import { PrivacyPage } from './features/settings/PrivacyPage';
import { AboutPage } from './features/settings/AboutPage';
import { CreditsPage } from './features/settings/CreditsPage';
import { OnboardingPage } from './features/onboarding/OnboardingPage';
import { ImportPage } from './features/exchange/ImportPage';
import { DiscoverPage } from './features/discover/DiscoverPage';
import { WordStudyPage } from './features/wordstudy/WordStudyPage';
import { DiscoverDeckPage } from './features/discover/DiscoverDeckPage';
import { Toaster } from './components/shadcn/toast';

/** Toasts live above the routes, so one can appear on a screen you navigate to (e.g. after saving an edit). */
function Toasts({ children }: { children: React.ReactNode }) {
  // Announced politely to screen readers (a live region), never takes focus, stays 5 seconds, pauses while hovered or
  // focused, and can be swiped away. Some (a deletion or a move) offer an Undo.
  return <Toaster timeout={5000} limit={1}>{children}</Toaster>;
}

function NotFound() {
  const { t } = useI18n();
  return <p className="px-5 py-10 text-muted">{t('error.pageNotFound')}</p>;
}

/** Old links to /collections/:id/study now land on the open-deck screen. */
function StudyRedirect() {
  const { id } = useParams();
  return <Navigate to={`/collections/${id}`} replace />;
}

/** The old addresses, /decks/..., (bookmarks, links the web app gave out before) go to the same place under /collections/.... */
function OldDecksLink() {
  const { pathname, search } = useLocation();
  return <Navigate to={`${pathname.replace(/^\/decks/, '/collections')}${search}`} replace />;
}

// HashRouter (URLs like /#/collections/1) works from Capacitor's local files with no server rewrites.
export default function App() {
  return (
    <DatabaseProvider>
      {(db) => (
        <RepositoriesProvider db={db}>
          {({ settings }) => (
            <SharingProvider>
            <I18nProvider settings={settings}>
            <ThemeProvider settings={settings}>
            <FontProvider settings={settings}>
              <Toasts>
              <HashRouter>
                <Routes>
                  <Route element={<AppShell />}>
                    <Route index element={<DecksPage />} />
                    <Route path="collections/new" element={<DeckFormPage />} />
                    <Route path="collections/:id" element={<DeckHomePage />} />
                    <Route path="collections/:id/cards" element={<CardBrowsePage />} />
                    <Route path="collections/:id/edit" element={<DeckFormPage />} />
                    <Route path="collections/:id/study" element={<StudyRedirect />} />
                    <Route path="collections/:id/study/:mode" element={<StudySessionPage />} />
                    <Route path="cards/new" element={<CardFormPage />} />
                    <Route path="cards/:id/edit" element={<CardFormPage />} />
                    <Route path="stats" element={<StatisticsPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="import" element={<ImportPage />} />
                    <Route path="discover" element={<DiscoverPage />} />
                    <Route path="word-study" element={<WordStudyPage />} />
                    <Route path="discover/:id" element={<DiscoverDeckPage />} />
                    <Route path="settings/theme" element={<ThemePage />} />
                    <Route path="settings/language" element={<LanguagePage />} />
                    <Route path="settings/font" element={<FontPage />} />
                    <Route path="settings/card-kinds" element={<CardKindsPage />} />
                    <Route path="settings/blanks" element={<BlanksPage />} />
                    <Route path="settings/voice" element={<VoicePage />} />
                    <Route path="settings/privacy" element={<PrivacyPage />} />
                    <Route path="settings/about" element={<AboutPage />} />
                    <Route path="settings/credits" element={<CreditsPage />} />
                    <Route path="welcome" element={<OnboardingPage />} />
                    <Route path="decks/*" element={<OldDecksLink />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                </Routes>
              </HashRouter>
              </Toasts>
            </FontProvider>
            </ThemeProvider>
            </I18nProvider>
            </SharingProvider>
          )}
        </RepositoriesProvider>
      )}
    </DatabaseProvider>
  );
}
