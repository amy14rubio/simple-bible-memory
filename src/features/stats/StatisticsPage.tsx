import { lazy, Suspense, useState } from 'react';
import { useRepositories } from '../../app/repositories';
import { useAsync } from '../../app/useAsync';
import { AppBar, BackButton, ButtonLink, EmptyState, ErrorMessage, Page } from '../../components/ui';
import { DeckPicker } from '../../components/DeckPicker';
// The charting library is large, so it is loaded only when Statistics is opened.
const CardCountsChart = lazy(() => import('./CardCountsChart'));
import { SectionTitle } from './InfoDrawer';
import { loadCardKinds } from '../study/cardKinds';
import { useI18n } from '../../i18n/I18nProvider';

const ALL = 'all';

export function StatisticsPage() {
  const { t, bookName, language } = useI18n();
  const { decks, stats, settings } = useRepositories();
  const [scope, setScope] = useState(ALL);
  const { data, error, loading } = useAsync(
    async () => {
      const kinds = await loadCardKinds(settings);
      return { list: await decks.list(), kinds, overview: await stats.overview(scope === ALL ? null : scope, kinds) };
    },
    [scope, decks, stats, settings],
  );

  const back = <BackButton to="/" label={t('common.backToDecks')} />;
  const title = (
    <>
      <h1 className="sr-only">{t('stats.title')}</h1>
      <DeckPicker
        label={t('stats.scope')}
        value={scope}
        options={[{ value: ALL, label: t('stats.allDecks') }, ...(data?.list.map((d) => ({ value: d.id, label: d.title })) ?? [])]}
        onChange={setScope}
      />
    </>
  );

  if (error) return <><AppBar back={back} title={t('stats.title')} /><Page><ErrorMessage error={error} /></Page></>;
  if (loading && !data) return <AppBar back={back} title={t('stats.title')} />;
  if (!data) return null;
  const { list, overview: o } = data;
  if (list.length === 0) {
    return (
      <>
        <AppBar back={back} title={t('stats.title')} />
        <EmptyState title={t('stats.emptyTitle')} action={<ButtonLink to="/decks/new">{t('stats.createDeck')}</ButtonLink>}>{t('stats.emptyBody')}</EmptyState>
      </>
    );
  }

  const headline: [string, number][] = [
    [t('stats.totalCards'), o.totalCards],
    [t('stats.memorized'), o.memorized],
    [t('stats.mastered'), o.mastered],
    [t('stats.days'), o.daysSinceStarting],
  ];

  const stages = [
    { key: 'new', label: t('stage.new'), info: t('stage.newInfo'), value: o.counts.new, color: 'var(--stage-new)' },
    { key: 'learning', label: t('stage.learning'), info: t('stage.learningInfo'), value: o.counts.learning, color: 'var(--accent)' },
    { key: 'young', label: t('stage.young'), info: t('stage.youngInfo'), value: o.counts.young, color: 'color-mix(in srgb, var(--foreground) 55%, var(--background))' },
    { key: 'mature', label: t('stage.mature'), info: t('stage.matureInfo'), value: o.counts.mature, color: 'var(--foreground)' },
  ];

  return (
    <>
      <AppBar back={back} titleSlot={title} />
      <Page className="space-y-4">
        <dl aria-label={t('stats.summary')} className="grid grid-cols-2 gap-x-6 gap-y-8 rounded-3xl bg-panel px-5 py-8 text-center">
          {headline.map(([label, n]) => (
            <div key={label}>
              <dd className="font-serif text-5xl font-medium tracking-tight">{n}</dd>
              <dt className="mt-2.5 text-sm text-muted">{label}</dt>
            </div>
          ))}
        </dl>

        <section aria-labelledby="books" className="space-y-4 rounded-3xl bg-panel px-5 py-6">
          <SectionTitle id="books" title={t('stats.books')} info={t('stats.memorizedNote')} />
          {o.books.length === 0 ? (
            <p className="text-center text-muted">{t('stats.booksEmpty')}</p>
          ) : (
            // Name and count share a line, the bar sits underneath at full width: every bar is the same length
            // whatever the name. Capped and centred so it never becomes a very long stripe on a wide screen.
            <ul className="mx-auto max-w-sm space-y-5">
              {o.books.map((b) => (
                <li key={b.book} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="min-w-0 truncate font-serif">{bookName(b.book)}</span>
                    <span className="shrink-0 text-sm text-muted">{b.memorized}/{b.total}</span>
                  </div>
                  <div role="img" aria-label={t('stats.bookProgress', { memorized: b.memorized, total: b.total })} className="h-2 overflow-hidden rounded-full bg-foreground/10">
                    <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(b.memorized / b.total) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="counts" className="space-y-6 rounded-3xl bg-panel px-5 py-6">
          <SectionTitle
            id="counts"
            title={t('stats.counts')}
            info={
              <dl className="grid gap-4">
                {stages.map((st) => (
                  <div key={st.key} className="grid grid-cols-[1rem_1fr] items-baseline gap-x-3">
                    <span aria-hidden className="size-3 translate-y-0.5 rounded-full border border-border" style={{ background: st.color }} />
                    <dt className="font-semibold">{st.label}</dt>
                    <dd className="col-start-2 text-muted">{st.info}</dd>
                  </div>
                ))}
              </dl>
            }
          />
          <Suspense fallback={<div aria-hidden className="mx-auto h-[260px]" />}>
          <CardCountsChart
            legendLabel={t('stats.legendLabel')}
            describe={(slice, fraction) =>
              t('stats.slice', { label: slice.label, count: slice.value, percent: new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 }).format(fraction) })
            }
            caption={t('stats.donut', { new: o.counts.new, learning: o.counts.learning, young: o.counts.young, mature: o.counts.mature })}
            slices={stages}
          />
          </Suspense>
        </section>
      </Page>
    </>
  );
}
