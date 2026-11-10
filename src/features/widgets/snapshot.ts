import type { CustomTheme } from '../../lib/customTheme';
import { widgetTheme, type WidgetThemePreference } from '../../lib/widgetTheme';

/** Bumped when the shape changes in a way the widgets (which may be older or newer than the app's data) must notice. */
export const SNAPSHOT_VERSION = 1;

export interface WidgetSnapshotInput {
  language: string;
  theme: WidgetThemePreference;
  custom: CustomTheme | undefined;
  labels: Record<string, string>;
  now: number;
}

/** Everything the home-screen widgets draw, as plain data. The widgets cannot read the app's database, so they only ever show this. */
export function buildSnapshot({ language, theme, custom, labels, now }: WidgetSnapshotInput) {
  return { v: SNAPSHOT_VERSION, updatedAt: now, language, theme: widgetTheme(theme, custom), labels };
}
