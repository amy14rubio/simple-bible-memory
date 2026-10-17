import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Database } from '../data/database';
import { createDeckRepository, type DeckRepository } from '../data/repositories/deckRepository';
import { createCardRepository, type CardRepository } from '../data/repositories/cardRepository';
import { createSettingsRepository, type SettingsRepository } from '../data/repositories/settingsRepository';
import { createReviewRepository, type ReviewRepository } from '../data/repositories/reviewRepository';
import { createStatsRepository, type StatsRepository } from '../data/repositories/statsRepository';
import { createExchangeRepository, type ExchangeRepository } from '../data/repositories/exchangeRepository';
import { createSharingRepository, type SharingRepository } from '../data/repositories/sharingRepository';
import { createAccountRepository, type AccountRepository } from '../data/repositories/accountRepository';
import { watchWrites } from '../data/writeEvents';
import { createScheduler, type Scheduler } from '../domain/scheduling/scheduler';

export interface Repositories {
  decks: DeckRepository;
  cards: CardRepository;
  settings: SettingsRepository;
  reviews: ReviewRepository;
  stats: StatsRepository;
  exchange: ExchangeRepository;
  /** The local record of what is published. It uses the plain database, so its own bookkeeping is not announced as a change. */
  sharing: SharingRepository;
  /** The local half of keeping the signed-in person's account in step. Also the plain database: the sync announces its own changes. */
  account: AccountRepository;
  scheduler: Scheduler;
}
const Ctx = createContext<Repositories | null>(null);

export function RepositoriesProvider({ db, children }: { db: Database; children: (r: Repositories) => ReactNode }) {
  const repos = useMemo<Repositories>(
    () => {
      const scheduler = createScheduler();
      const watched = watchWrites(db); // anything saved through this is announced, which is how published decks notice edits
      return {
        decks: createDeckRepository(watched),
        cards: createCardRepository(watched),
        settings: createSettingsRepository(watched),
        reviews: createReviewRepository(watched, scheduler),
        stats: createStatsRepository(watched),
        exchange: createExchangeRepository(watched),
        sharing: createSharingRepository(db),
        account: createAccountRepository(db),
        scheduler,
      };
    },
    [db],
  );
  return <Ctx value={repos}>{children(repos)}</Ctx>;
}

export function useRepositories() {
  const r = useContext(Ctx);
  if (!r) throw new Error('useRepositories must be used inside RepositoriesProvider');
  return r;
}
