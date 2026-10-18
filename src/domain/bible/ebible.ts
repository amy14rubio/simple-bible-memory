import { parseReference } from './reference';

/**
 * eBible (https://ebible.org) is a free Bible reader with translations in many languages. It has no documented link
 * format, so this one was found by testing the live site: `/study/?w1=bible&t1=local:TRANSLATION&v1=BOOK CHAPTER_VERSE`,
 * for example `v1=JN3_16` for John 3:16. It can only jump to ONE verse: a range or a chapter opens at its first verse.
 * Like the Bible Gateway link, it just opens the page: the app never fetches or copies Bible text.
 */
export const EBIBLE_ORIGIN = 'https://ebible.org';

/** The translation each language opens (their ids on eBible): World English Bible and Reina-Valera 1909. */
export const EBIBLE_TRANSLATIONS = { en: 'eng-web', es: 'spaRV1909' } as const;
export type EbibleLanguage = keyof typeof EBIBLE_TRANSLATIONS;

/** The app's book names to eBible's book codes (all 66 were opened on the live site to check them). */
export const EBIBLE_BOOK_CODES: Record<string, string> = {
  Genesis: 'GN', Exodus: 'EX', Leviticus: 'LV', Numbers: 'NU', Deuteronomy: 'DT', Joshua: 'JS', Judges: 'JG', Ruth: 'RT',
  '1 Samuel': 'S1', '2 Samuel': 'S2', '1 Kings': 'K1', '2 Kings': 'K2', '1 Chronicles': 'R1', '2 Chronicles': 'R2',
  Ezra: 'ER', Nehemiah: 'NH', Esther: 'ET', Job: 'JB', Psalm: 'PS', Proverbs: 'PR', Ecclesiastes: 'EC', 'Song of Solomon': 'SS',
  Isaiah: 'IS', Jeremiah: 'JR', Lamentations: 'LM', Ezekiel: 'EK', Daniel: 'DN', Hosea: 'HS', Joel: 'JL', Amos: 'AM',
  Obadiah: 'OB', Jonah: 'JH', Micah: 'MC', Nahum: 'NM', Habakkuk: 'HK', Zephaniah: 'ZP', Haggai: 'HG', Zechariah: 'ZC', Malachi: 'ML',
  Matthew: 'MT', Mark: 'MK', Luke: 'LK', John: 'JN', Acts: 'AC', Romans: 'RM', '1 Corinthians': 'C1', '2 Corinthians': 'C2',
  Galatians: 'GL', Ephesians: 'EP', Philippians: 'PP', Colossians: 'CL', '1 Thessalonians': 'H1', '2 Thessalonians': 'H2',
  '1 Timothy': 'T1', '2 Timothy': 'T2', Titus: 'TT', Philemon: 'PM', Hebrews: 'HB', James: 'JM', '1 Peter': 'P1', '2 Peter': 'P2',
  '1 John': 'J1', '2 John': 'J2', '3 John': 'J3', Jude: 'JD', Revelation: 'RV',
};

/**
 * eBible link for a reference, or null if the text is not a recognizable reference. It opens at the reference's first
 * verse (a chapter, or a range, opens at its first verse). Built only from the parsed reference, a known book code and a
 * fixed translation id, so nothing the user types can change the host or add parameters.
 */
export function ebibleUrl(reference: string, language: string | null | undefined): string | null {
  const parsed = parseReference(reference);
  const code = parsed && EBIBLE_BOOK_CODES[parsed.book];
  if (!parsed || !code) return null;
  // Where it points: inside one chapter the parser already knows (so "Jude 3" is chapter 1, verse 3); across chapters, read
  // the start of "23:6-24:2".
  let chapter: number;
  let verse: number;
  if (parsed.span) {
    chapter = parsed.span.chapter;
    verse = parsed.span.verses?.[0] ?? 1;
  } else {
    const start = /^(\d+)(?::(\d+))?/.exec(parsed.passage);
    if (!start) return null;
    chapter = Number(start[1]);
    verse = start[2] ? Number(start[2]) : 1;
  }
  const translation = EBIBLE_TRANSLATIONS[(language && language in EBIBLE_TRANSLATIONS ? language : 'en') as EbibleLanguage];

  const url = new URL('/study/', EBIBLE_ORIGIN);
  url.searchParams.set('w1', 'bible');
  url.searchParams.set('t1', `local:${translation}`);
  url.searchParams.set('v1', `${code}${chapter}_${verse}`);
  return url.toString();
}
