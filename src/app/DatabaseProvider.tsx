import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { openAppDatabase, type Database } from '../data/database';

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

  if (error) return <p role="alert" className="p-6 text-danger">Could not open the local database: {error.message}</p>;
  if (!db) return <p className="p-6 text-muted">Opening your library…</p>;
  return <DatabaseContext value={db}>{children(db)}</DatabaseContext>;
}

export const useDatabase = () => {
  const db = useContext(DatabaseContext);
  if (!db) throw new Error('useDatabase must be used inside DatabaseProvider');
  return db;
};
