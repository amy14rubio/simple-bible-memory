import { OPEN_TRANSLATIONS, OWN_WORDS } from '../sharing/translations';

/**
 * The Bible texts the app can fill in by itself, from the YouVersion Platform (see src/platform/youversion.ts).
 *
 * - "open" texts are public domain: they are saved with the card like anything the person types, and decks that use them can be
 *   published with their text. They are the few listed by hand below (and in OPEN_TRANSLATIONS).
 * - EVERYTHING ELSE the platform offers is "licensed": it belongs to a publisher who lets the app show it through YouVersion
 *   (the agreements are in the owner's Google Drive; the rules that matter are repeated here). Its text is only ever kept on the
 *   device it was fetched to: it is never backed up, exported or published (only the reference and the translation are), it
 *   cannot be edited, and the publisher's notice and link are shown with it. Anything not known to be open is treated this way,
 *   so a translation added to the platform later is safe by default.
 *
 * Biblica's versions (the NIV family and their translations into other languages) and The Passion Translation are NOT offered:
 * their agreements are not used (see isExcluded).
 *
 * The code of a hand-listed text is the abbreviation YouVersion uses (NASB2020); any other is "YV" and YouVersion's id (YV2692).
 */
export type SourceLanguage = string;

export interface Publisher {
  name: string;
  /** Where the notice's link goes (the publisher's home page, as the agreements ask). */
  url: string;
  /** The notice to print under the passage, from the publisher's agreement (without the web address: the link to `url` follows it). */
  notice: string;
}

export interface BibleSource {
  /** What a card or deck stores: KJV-style codes for open texts, YouVersion's abbreviation for hand-listed ones, "YV<id>" for the rest. */
  code: string;
  /** YouVersion's id of this version. */
  yvId: number;
  name: string;
  /** The language's code ("en", "es", "fr", "zh"...). */
  language: SourceLanguage;
  kind: 'open' | 'licensed';
  /** The short tag shown after a verse ("NASB 2020"): it links to the publisher. */
  tag: string;
  publisher?: Publisher;
}

const LOCKMAN = { name: 'The Lockman Foundation', url: 'https://www.lockman.org' } as const;
const lockman = (notice: string): Publisher => ({ ...LOCKMAN, notice: `${notice} All rights reserved. Used by permission.` });

export const BIBLE_SOURCES: BibleSource[] = [
  // Open texts (public domain), so a deck in one of them can be published with its text.
  { code: 'WEB', yvId: 206, name: 'World English Bible', language: 'en', kind: 'open', tag: 'WEB' },
  { code: 'BSB', yvId: 3034, name: 'Berean Standard Bible', language: 'en', kind: 'open', tag: 'BSB' },
  { code: 'ASV', yvId: 12, name: 'American Standard Version', language: 'en', kind: 'open', tag: 'ASV' },
  { code: 'GNV', yvId: 2163, name: 'Geneva Bible', language: 'en', kind: 'open', tag: 'GNV' },
  { code: 'CPDV', yvId: 42, name: 'Catholic Public Domain Version', language: 'en', kind: 'open', tag: 'CPDV' },
  { code: 'WMB', yvId: 1209, name: 'World Messianic Bible', language: 'en', kind: 'open', tag: 'WMB' },
  // YouVersion calls it "Reina-Valera Antigua" (RVES); its text is the 1909 one (checked word for word against RV1909).
  { code: 'RV1909', yvId: 147, name: 'Reina-Valera 1909', language: 'es', kind: 'open', tag: 'RV1909' },
  // Licensed texts: kept on the device only.
  { code: 'NASB2020', yvId: 2692, name: 'New American Standard Bible 2020', language: 'en', kind: 'licensed', tag: 'NASB 2020',
    publisher: lockman('Scripture quotations from the New American Standard Bible® – NASB 2020, Copyright © 1960, 1971, 1977, 1995, 2020 by The Lockman Foundation.') },
  { code: 'NASB1995', yvId: 100, name: 'New American Standard Bible 1995', language: 'en', kind: 'licensed', tag: 'NASB 1995',
    publisher: lockman('Scripture quotations from the New American Standard Bible® – NASB 1995, Copyright © 1960, 1971, 1977, 1995 by The Lockman Foundation.') },
  { code: 'AMP', yvId: 1588, name: 'Amplified Bible', language: 'en', kind: 'licensed', tag: 'AMP',
    publisher: lockman('Scripture quotations from the Amplified® Bible – AMP, Copyright © 2015 by The Lockman Foundation.') },
  { code: 'EASY', yvId: 2079, name: 'EasyEnglish Bible', language: 'en', kind: 'licensed', tag: 'EasyEnglish',
    publisher: { name: 'MissionAssist', url: 'https://www.easyenglish.bible', notice: 'EasyEnglish Bible 2024, © MissionAssist 2018-2024.' } },
  { code: 'LBLA', yvId: 89, name: 'La Biblia de las Américas', language: 'es', kind: 'licensed', tag: 'LBLA',
    publisher: lockman('Escrituras tomadas de La Biblia de las Américas® – LBLA, Copyright © 1986, 1995, 1997 by The Lockman Foundation. Derechos Reservados.') },
  { code: 'NBLA', yvId: 103, name: 'Nueva Biblia de las Américas', language: 'es', kind: 'licensed', tag: 'NBLA',
    publisher: lockman('Escrituras tomadas de la Nueva Biblia de las Américas® – NBLA, Copyright © 2005 by The Lockman Foundation. Derechos Reservados.') },
];

// ---- Everything else the platform offers --------------------------------------------------------------------------------------
/** What the platform's list says about a version (see GET /v1/bibles). */
export interface CatalogueItem {
  id: number;
  abbreviation: string;
  title: string;
  /** The language tag as YouVersion gives it ("en", "pt-BR", "zh-Hans"). */
  language: string;
  organization: string | null;
}

/** What is only known after asking about one version (GET /v1/bibles/{id}): the publisher's own notice. */
export interface SourceDetails {
  copyright: string | null;
  publisherUrl: string | null;
}

/** Biblica's id on the platform (the NIV family, La Bible du Semeur, the NVI...): their agreement is not used. */
export const BIBLICA_ORGANIZATION = '05a9aa40-37b6-4e34-b9f1-a443fa4b1fff';

/** Versions the app does not offer: Biblica's, and The Passion Translation (BroadStreet). */
export function isExcluded(item: Pick<CatalogueItem, 'organization' | 'abbreviation' | 'title'>): boolean {
  return item.organization === BIBLICA_ORGANIZATION || /passion translation/i.test(item.title) || /^tpt$/i.test(item.abbreviation);
}

const baseLanguage = (tag: string) => tag.split('-')[0]!.toLowerCase();

let catalogue: CatalogueItem[] = [];
const details = new Map<number, SourceDetails>();

/** Tells the app which versions the platform offers (without the excluded ones, and without the hand-listed ones twice). */
export function registerCatalogue(items: CatalogueItem[]) {
  const known = new Set(BIBLE_SOURCES.map((b) => b.yvId));
  catalogue = items.filter((i) => !isExcluded(i) && !known.has(i.id)).sort((a, b) => a.title.localeCompare(b.title));
}
/** May this text be fetched? The hand-listed ones, and those the platform's list offers (never an excluded one, whatever a card says). */
export const isOffered = (code: string | null | undefined): boolean => {
  const m = /^YV(\d+)$/.exec(code ?? '');
  return m ? catalogue.some((i) => i.id === Number(m[1])) : !!BIBLE_SOURCES.find((b) => b.code === code);
};
export function registerDetails(id: number, d: SourceDetails) { details.set(id, d); }
export const hasDetails = (id: number) => details.has(id);

function fromItem(item: Pick<CatalogueItem, 'id' | 'abbreviation' | 'title' | 'language'>): BibleSource {
  const d = details.get(item.id);
  const url = d?.publisherUrl && /^https:\/\//.test(d.publisherUrl) ? d.publisherUrl : `https://www.bible.com/versions/${item.id}`;
  const notice = d?.copyright?.replace(/\s*\n\s*/g, ' ').trim() || `${item.title}, through YouVersion.`;
  return {
    code: `YV${item.id}`, yvId: item.id, name: item.title, language: baseLanguage(item.language), kind: 'licensed', tag: item.abbreviation || `YV${item.id}`,
    publisher: { name: d?.copyright ? 'Publisher' : 'YouVersion', url, notice },
  };
}

/** The text with this code: hand-listed, or from the platform's list, or (a card from another device, before the list is here) just its id. */
export function sourceFor(code: string | null | undefined): BibleSource | undefined {
  if (!code) return undefined;
  const listed = BIBLE_SOURCES.find((b) => b.code === code);
  if (listed) return listed;
  const m = /^YV(\d+)$/.exec(code);
  if (!m) return undefined;
  const id = Number(m[1]);
  const item = catalogue.find((i) => i.id === id);
  return fromItem(item ?? { id, abbreviation: code, title: `YouVersion ${id}`, language: 'und' });
}

/** Open texts, "my own words", and the placeholder "another translation": everything else a card names is licensed. */
export const NOT_LICENSED_CODES: string[] = [...OPEN_TRANSLATIONS.map((t) => t.code), OWN_WORDS, 'OTHER'];

/** Is this a licensed text (kept only on the device, never edited, always with the publisher's notice)? */
export const isLicensed = (code: string | null | undefined): boolean => !!code && !NOT_LICENSED_CODES.includes(code);

/** For SQL: true when `column` holds a licensed code. The parameters go with it. */
export const licensedSql = (column: string) => ({
  sql: `(${column} IS NOT NULL AND ${column} NOT IN (${NOT_LICENSED_CODES.map(() => '?').join(', ')}))`,
  params: [...NOT_LICENSED_CODES],
});

/** Every text that can be filled in (hand-listed first), optionally only those in one language. */
export function autofillSources(language?: string | null): BibleSource[] {
  const all = [...BIBLE_SOURCES, ...catalogue.map(fromItem)];
  return language ? all.filter((b) => b.language === baseLanguage(language)) : all;
}

/** The languages there are texts in (the base code: "pt-BR" is "pt"), with how many texts each has. */
export function sourceLanguages(): { code: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const b of autofillSources()) counts.set(b.language, (counts.get(b.language) ?? 0) + 1);
  return [...counts].map(([code, count]) => ({ code, count }));
}
