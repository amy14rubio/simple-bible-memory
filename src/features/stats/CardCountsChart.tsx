import { useEffect, useState } from 'react';
import { Pie, PieChart, Sector, type PieSectorShapeProps } from 'recharts';
import { ChartContainer, type ChartConfig } from '@/components/shadcn/chart';

export interface PieSlice {
  /** Stable id, used for the slice's color variable. */
  key: string;
  label: string;
  value: number;
  /** Any CSS color, usually a design token. */
  color: string;
}

/** How far (px) a selected slice slides out, and how long its label stays up. */
const POP_OUT = 12;
const LABEL_MS = 3000;

/**
 * Card counts as a filled pie with a legend underneath (shadcn's "pie chart with a legend"), made tappable:
 * tap a slice, or its legend item, and that slice slides out a little (the others fade) while a short label appears
 * for a few seconds. Tap it again or tap elsewhere to clear. The legend items are real buttons, which gives keyboard
 * and screen-reader users the same interaction, and makes tiny slices easy to reach with a finger.
 *
 * The selection lives in this component's own state (as shadcn advises for persistent active shapes), not in
 * Recharts' hover state, because hover does not exist on a touch screen.
 * `caption` spells out every number in words, so the picture is a summary, not the only source.
 * Loaded on demand (see StatisticsPage) so the charting library is not part of the app's first load.
 */
export default function CardCountsChart({ slices, caption, legendLabel, describe }: {
  slices: PieSlice[];
  caption: string;
  /** Names the group of legend buttons, e.g. "Highlight a stage in the chart". */
  legendLabel: string;
  /** The temporary label for a slice, e.g. "Learning: 1 card (8%)". */
  describe: (slice: PieSlice, fraction: number) => string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const total = slices.reduce((n, s) => n + s.value, 0);
  const empty = total === 0;

  const toggle = (key: string) => setSelected((current) => (current === key ? null : key));

  // The label is temporary: it goes away by itself.
  useEffect(() => {
    if (!selected) return;
    const id = setTimeout(() => setSelected(null), LABEL_MS);
    return () => clearTimeout(id);
  }, [selected]);

  const config = Object.fromEntries(slices.map((s) => [s.key, { label: `${s.label} ${s.value}`, color: s.color }])) as ChartConfig;
  const data = slices.map((s) => ({ name: s.key, value: s.value, fill: `var(--color-${s.key})` }));
  const current = slices.find((s) => s.key === selected);

  /** One slice. The selected one slides outward along its middle angle; the others fade. */
  const shape = (props: PieSectorShapeProps) => {
    const key = slices[props.index]?.key;
    const active = key !== undefined && key === selected;
    const radians = ((props.midAngle ?? 0) * Math.PI) / 180;
    return (
      <Sector
        {...props}
        style={{
          transform: active ? `translate(${Math.cos(radians) * POP_OUT}px, ${-Math.sin(radians) * POP_OUT}px)` : 'translate(0px, 0px)',
          // Fade the others only when the selected stage actually has a slice to highlight.
          opacity: current && current.value > 0 && !active ? 0.45 : 1,
          transition: 'transform 180ms ease-out, opacity 180ms ease-out',
          cursor: 'pointer',
        }}
      />
    );
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Tapping the empty space around the pie clears the selection. */}
      <div
        role="img"
        aria-label={caption}
        className="w-full"
        onClick={(e) => { if (!(e.target as Element).closest('.recharts-pie-sector')) setSelected(null); }}
      >
        <ChartContainer config={config} className="mx-auto aspect-square max-h-[260px]">
          <PieChart accessibilityLayer={false}>
            {empty && <Pie data={[{ name: 'empty', value: 1 }]} dataKey="value" outerRadius="85%" fill="var(--surface)" legendType="none" isAnimationActive={false} />}
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              outerRadius="85%"
              stroke="var(--background)"
              strokeWidth={slices.filter((s) => s.value > 0).length > 1 ? 2 : 0} // a lone slice would show its seam as a stray line
              isAnimationActive={false}
              shape={shape}
              onClick={(_, index) => { const s = slices[index]; if (s) toggle(s.key); }}
            />
          </PieChart>
        </ChartContainer>
      </div>

      {/* Room is always reserved for the label, so showing it never makes the page jump. */}
      <p role="status" className="min-h-6 text-center text-sm font-medium">
        {current ? describe(current, empty ? 0 : current.value / total) : ''}
      </p>

      <div role="group" aria-label={legendLabel} className="grid w-fit grid-cols-2 gap-x-6 gap-y-1">
        {slices.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={selected === s.key}
            onClick={() => toggle(s.key)}
            className="flex min-h-9 items-center gap-1.5 justify-self-start rounded-md px-2.5 text-xs whitespace-nowrap hover:bg-foreground/10 aria-pressed:bg-foreground/10 aria-pressed:font-medium"
          >
            <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: s.color }} />
            {s.label} {s.value}
          </button>
        ))}
      </div>
    </div>
  );
}
