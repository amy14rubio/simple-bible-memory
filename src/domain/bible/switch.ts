import { isLicensed } from './sources';

/**
 * The off switch for licensed translations, kept in Firestore (document `config/licensedTranslations`, read by everyone and written
 * only in the Firebase console) so a translation can be turned off without releasing a new version of the app. A publisher can
 * end an agreement (Lockman on 30 days' notice; any of them at once for a breach), and then its text must come off every device.
 *
 *   all  true: every licensed translation is off.
 *   off  a list of codes ("NASB2020", "YV93"...): those translations are off.
 *
 * No document, or one the app cannot read, means everything is on.
 */
export interface SwitchState {
  all: boolean;
  off: string[];
}

export const EVERYTHING_ON: SwitchState = { all: false, off: [] };

/** Reads the document's data, trusting nothing in it. */
export function parseSwitch(data: unknown): SwitchState {
  if (typeof data !== 'object' || data === null) return EVERYTHING_ON;
  const d = data as Record<string, unknown>;
  const off = Array.isArray(d.off) ? d.off.filter((c): c is string => typeof c === 'string' && c.length > 0 && c.length <= 40).slice(0, 2000) : [];
  return { all: d.all === true, off };
}

/** Is this translation turned off? Only licensed ones can be. */
export const isSwitchedOff = (code: string | null | undefined, state: SwitchState): boolean =>
  !!code && isLicensed(code) && (state.all || state.off.includes(code));
