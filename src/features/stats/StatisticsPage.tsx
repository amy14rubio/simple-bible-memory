import { useState } from 'react';
import { useRepositories } from '../../app/repositories';
import { useAsync } from '../../app/useAsync';
import { AppBar, BackButton, ButtonLink, EmptyState, ErrorMessage, Page, TitleSelect } from '../../components/ui';
import { Donut } from './Donut';
import { loadCardKinds } from '../study/cardKinds';

const ALL = 'all';

export function StatisticsPage() {
  const { decks, stats, settings } = useRepositories();
  const [scope, setScope] = useState(ALL);
  const { data, error, loading } = useAsync(
    async () => {
      const kinds = await loadCardKinds(settings);
      return { list: await decks.list(), kinds, overview: await stats.overview(scope === ALL ? null : scope, kinds) };
    },
    [scope, decks, stats, settings],
  );

  const back = <BackButton to="/" label="Back to decks" />;
  const title = (
    <>
      <h1 className="sr-only">Statistics</h1>
      <TitleSelect
        label="Show statistics for"
        value={scope}
        options={[{ value: ALL, label: 'All decks' }, ...(data?.list.map((d) => ({ value: d.id, label: d.title })) ?? [])]}
        onChange={setScope}
      />
    </>
  );

  if (error) return <><AppBar back={back} title="Statistics" /><Page><ErrorMessage error={error} /></Page></>;
  if (loading && !data) return <AppBar back={back} title="Statistics" />;
  if (!data) return null;
  const { list, kinds, overview: o } = data;
  if (list.length === 0) {
    return (
      <>
        <AppBar back={back} title="Statistics" />
        <EmptyState title="Nothing to show yet" action={<ButtonLink to="/decks/new">Create a deck</ButtonLink>}>Your progress appears here once you add and study verses.</EmptyState>
      </>
    );
  }

  const headline: [string, number][] = [
    ['Total cards added', o.totalCards],
    ['Verses memorized', o.memorized],
    ['Verses mastered', o.mastered],
    ['Days since starting', o.daysSinceStarting],
  ];

  return (
    <>
      <AppBar back={back} titleSlot={title} />
      <Page className="space-y-12">
        <dl aria-label="Progress summary" className="grid grid-cols-2 gap-x-6 gap-y-8 text-center">
          {headline.map(([label, n]) => (
            <div key={label}>
              <dd className="font-serif text-5xl font-medium tracking-tight">{n}</dd>
              <dt className="mt-1 text-sm text-muted">{label}</dt>
            </div>
          ))}
        </dl>

        <section aria-labelledby="books" className="space-y-4">
          <h2 id="books" className="text-center font-serif text-xl">Books progress</h2>
          {o.books.length === 0 ? (
            <p className="text-center text-muted">Cards with references like "John 3:16" show up here, book by book.</p>
          ) : (
            <ul className="space-y-3">
              {o.books.map((b) => (
                <li key={b.book} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3">
                  <span className="truncate font-serif">{b.book}</span>
                  <div role="img" aria-label={`${b.memorized} of ${b.total} memorized`} className="h-2 overflow-hidden rounded-full bg-surface">
                    <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(b.memorized / b.total) * 100}%` }} />
                  </div>
                  <span className="text-right text-sm text-muted">{b.memorized}/{b.total}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-center text-sm text-muted">A verse counts as memorized once it graduates from learning.</p>
        </section>

        <section aria-labelledby="counts" className="space-y-6">
          <h2 id="counts" className="text-center font-serif text-xl">Card counts</h2>
          {kinds.length > 1 && <p className="text-center text-sm text-muted">Each verse has two cards, so these count both.</p>}
          <Donut
            caption={`Cards by stage: ${o.counts.new} new, ${o.counts.learning} learning, ${o.counts.young} young, ${o.counts.mature} mature`}
            slices={[
              { label: 'New', value: o.counts.new, color: 'var(--muted)' },
              { label: 'Learning', value: o.counts.learning, color: 'var(--accent)' },
              { label: 'Young', value: o.counts.young, color: 'color-mix(in srgb, var(--foreground) 55%, var(--background))' },
              { label: 'Mature', value: o.counts.mature, color: 'var(--foreground)' },
            ]}
          />
        </section>
      </Page>
    </>
  );
}
