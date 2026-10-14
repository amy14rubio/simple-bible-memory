export interface DonutSlice {
  label: string;
  value: number;
  /** Any CSS color, usually a design token. */
  color: string;
}

/**
 * Ring chart. The legend next to it carries the exact numbers, so the picture is a summary, not the only source.
 * An empty chart is drawn as a plain ring instead of nothing.
 */
export function Donut({ slices, caption }: { slices: DonutSlice[]; caption: string }) {
  const total = slices.reduce((n, s) => n + s.value, 0);
  const r = 70;
  const c = 2 * Math.PI * r;
  const gap = total > 0 && slices.filter((s) => s.value > 0).length > 1 ? 3 : 0;
  // Each arc starts where the previous one ended.
  const arcs = slices
    .filter((s) => s.value > 0)
    .reduce<{ slice: DonutSlice; start: number; len: number }[]>((all, slice) => {
      const prev = all[all.length - 1];
      return [...all, { slice, start: prev ? prev.start + prev.len : 0, len: (slice.value / total) * c }];
    }, []);

  return (
    <figure className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-10">
      <svg viewBox="0 0 180 180" role="img" aria-label={caption} className="size-44 -rotate-90">
        <circle cx="90" cy="90" r={r} fill="none" stroke="var(--surface)" strokeWidth="22" />
        {arcs.map(({ slice, start, len }) => (
          <circle
            key={slice.label}
            cx="90" cy="90" r={r} fill="none" stroke={slice.color} strokeWidth="22"
            strokeDasharray={`${Math.max(len - gap, 0)} ${c}`} strokeDashoffset={-start}
          />
        ))}
      </svg>
      <figcaption>
        <dl className="space-y-2">
          {slices.map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <span aria-hidden className="size-3 rounded-sm" style={{ background: s.color }} />
              <dt className="w-20 text-muted">{s.label}</dt>
              <dd className="font-serif text-lg">{s.value}</dd>
            </div>
          ))}
        </dl>
      </figcaption>
    </figure>
  );
}
