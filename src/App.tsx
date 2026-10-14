import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { DatabaseProvider } from './app/DatabaseProvider';
import { RepositoriesProvider } from './app/repositories';
import { ThemeProvider } from './app/theme';
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

function NotFound() {
  const { t } = useI18n();
  return <p className="px-5 py-10 text-muted">{t('error.pageNotFound')}</p>;
}

/** Old links to /decks/:id/study now land on the open-deck screen. */
function StudyRedirect() {
  const { id } = useParams();
  return <Navigate to={`/decks/${id}`} replace />;
}

// HashRouter (URLs like /#/decks/1) works from Capacitor's local files with no server rewrites.
export default function App() {
  return (
    <DatabaseProvider>
      {(db) => (
        <RepositoriesProvider db={db}>
          {({ settings }) => (
            <I18nProvider settings={settings}>
            <ThemeProvider settings={settings}>
              <HashRouter>
                <Routes>
                  <Route element={<AppShell />}>
                    <Route index element={<DecksPage />} />
                    <Route path="decks/new" element={<DeckFormPage />} />
                    <Route path="decks/:id" element={<DeckHomePage />} />
                    <Route path="decks/:id/cards" element={<CardBrowsePage />} />
                    <Route path="decks/:id/edit" element={<DeckFormPage />} />
                    <Route path="decks/:id/study" element={<StudyRedirect />} />
                    <Route path="decks/:id/study/:mode" element={<StudySessionPage />} />
                    <Route path="cards/new" element={<CardFormPage />} />
                    <Route path="cards/:id/edit" element={<CardFormPage />} />
                    <Route path="stats" element={<StatisticsPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                </Routes>
              </HashRouter>
            </ThemeProvider>
            </I18nProvider>
          )}
        </RepositoriesProvider>
      )}
    </DatabaseProvider>
  );
}
