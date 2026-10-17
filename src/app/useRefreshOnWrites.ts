import { useEffect } from 'react';
import { onDatabaseWrite } from '../data/writeEvents';

/** Reloads a screen's data whenever the database changes, including changes that arrive from the person's account. */
export function useRefreshOnWrites(refresh: () => void) {
  useEffect(() => onDatabaseWrite(refresh), [refresh]);
}
