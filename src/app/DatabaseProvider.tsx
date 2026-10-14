import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { openAppDatabase, type Database } from '../data/database';
import { currentLanguage, translate } from '../i18n';

const DatabaseContext = createContext<Database | null>(null);

export function DatabaseProvider({ children }: { children: (db: Database) => ReactNode }) {
  const [db, setDb] = useState<Database | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    openAppDatabase().then(
      (d) => !cancelled && setDb(d),
      (e) => !cancelled && setError(e instanceof Error ? e : new Error(String(e))),
    );
    return () => { cancelled = true; };
  }, []);

  // Outside the language provider (it needs the database), so this reads the saved language choice directly.
  const language = currentLanguage();
  if (error) return <p role="alert" className="p-6 text-danger">{translate(language, 'db.failed', { message: error.message })}</p>;
  if (!db) return <p className="p-6 text-muted">{translate(language, 'db.opening')}</p>;
  return <DatabaseContext value={db}>{children(db)}</DatabaseContext>;
}

export const useDatabase = () => {
  const db = useContext(DatabaseContext);
  if (!db) throw new Error('useDatabase must be used inside DatabaseProvider');
  return db;
};
