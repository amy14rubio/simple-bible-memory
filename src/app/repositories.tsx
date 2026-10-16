import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Database } from '../data/database';
import { createDeckRepository, type DeckRepository } from '../data/repositories/deckRepository';
import { createCardRepository, type CardRepository } from '../data/repositories/cardRepository';
import { createSettingsRepository, type SettingsRepository } from '../data/repositories/settingsRepository';
import { createReviewRepository, type ReviewRepository } from '../data/repositories/reviewRepository';
import { createStatsRepository, type StatsRepository } from '../data/repositories/statsRepository';
import { createExchangeRepository, type ExchangeRepository } from '../data/repositories/exchangeRepository';
import { createScheduler, type Scheduler } from '../domain/scheduling/scheduler';

export interface Repositories {
  decks: DeckRepository;
  cards: CardRepository;
  settings: SettingsRepository;
  reviews: ReviewRepository;
  stats: StatsRepository;
  exchange: ExchangeRepository;
  scheduler: Scheduler;
}
const Ctx = createContext<Repositories | null>(null);

export function RepositoriesProvider({ db, children }: { db: Database; children: (r: Repositories) => ReactNode }) {
  const repos = useMemo<Repositories>(
    () => {
      const scheduler = createScheduler();
      return {
        decks: createDeckRepository(db),
        cards: createCardRepository(db),
        settings: createSettingsRepository(db),
        reviews: createReviewRepository(db, scheduler),
        stats: createStatsRepository(db),
        exchange: createExchangeRepository(db),
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
