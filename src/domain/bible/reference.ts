/**
 * Parses English and Spanish Bible references like "John 3:16", "Salmos 130:1", "1 Cor 13:4-7" or "Ps 23". Accents are ignored. The result always uses the English book name.
 * It checks the SHAPE (a known book + a plausible chapter/verse pattern). It does not know how many
 * chapters or verses each book has, so "John 99:1" is accepted. It is only used to decide when the
 * Bible Gateway helper is offered; cards can still be saved with any reference text.
 */
export interface ParsedReference {
  /**
   * Where the reference points, when it stays inside one chapter. `verses` is every verse named, in order,
   * or null for a whole chapter (how many verses it has is not known). Null for references that span chapters.
   */
  span: { chapter: number; verses: number[] | null } | null;
  /** Canonical book name, e.g. "1 Corinthians". */
  book: string;
  /** The chapter/verse part in canonical punctuation, e.g. "13:4-7". */
  passage: string;
  /** "1 Corinthians 13:4-7": built only from known book names and digits. */
  normalized: string;
}

/** [canonical name, abbreviations]. For numbered books the number is added automatically. */
const BOOKS: [name: string, aliases: string[]][] = [
  ['Genesis', ['gen', 'ge', 'gn']], ['Exodus', ['exod', 'exo', 'ex']], ['Leviticus', ['lev', 'le', 'lv']],
  ['Numbers', ['num', 'nu', 'nm', 'nb']], ['Deuteronomy', ['deut', 'de', 'dt']], ['Joshua', ['josh', 'jos', 'jsh']],
  ['Judges', ['judg', 'jdg', 'jg', 'jdgs']], ['Ruth', ['rth', 'ru']],
  ['1 Samuel', ['sam', 'sa', 'sm', 's']], ['2 Samuel', ['sam', 'sa', 'sm', 's']],
  ['1 Kings', ['kgs', 'ki', 'kin']], ['2 Kings', ['kgs', 'ki', 'kin']],
  ['1 Chronicles', ['chron', 'chr', 'ch']], ['2 Chronicles', ['chron', 'chr', 'ch']],
  ['Ezra', ['ezr']], ['Nehemiah', ['neh', 'ne']], ['Esther', ['esth', 'est', 'es']], ['Job', ['jb']],
  ['Psalm', ['psalms', 'ps', 'psa', 'pss', 'pslm', 'psm']], ['Proverbs', ['prov', 'pro', 'prv', 'pr']],
  ['Ecclesiastes', ['eccles', 'eccl', 'ecc', 'ec', 'qoh']],
  ['Song of Solomon', ['song of songs', 'song', 'sos', 'ss', 'canticles', 'cant']],
  ['Isaiah', ['isa']], ['Jeremiah', ['jer', 'je', 'jr']], ['Lamentations', ['lam', 'la']],
  ['Ezekiel', ['ezek', 'eze', 'ezk']], ['Daniel', ['dan', 'da', 'dn']], ['Hosea', ['hos', 'ho']], ['Joel', ['jl']],
  ['Amos', ['am']], ['Obadiah', ['obad', 'ob']], ['Jonah', ['jon', 'jnh']], ['Micah', ['mic', 'mc']],
  ['Nahum', ['nah', 'na']], ['Habakkuk', ['hab', 'hb']], ['Zephaniah', ['zeph', 'zep', 'zp']],
  ['Haggai', ['hag', 'hg']], ['Zechariah', ['zech', 'zec', 'zc']], ['Malachi', ['mal', 'ml']],
  ['Matthew', ['matt', 'mt']], ['Mark', ['mrk', 'mk', 'mr']], ['Luke', ['luk', 'lk']], ['John', ['jhn', 'jn']],
  ['Acts', ['act', 'ac']], ['Romans', ['rom', 'ro', 'rm']],
  ['1 Corinthians', ['cor', 'co']], ['2 Corinthians', ['cor', 'co']],
  ['Galatians', ['gal', 'ga']], ['Ephesians', ['eph', 'ephes']], ['Philippians', ['phil', 'php', 'pp']],
  ['Colossians', ['col']],
  ['1 Thessalonians', ['thess', 'thes', 'th']], ['2 Thessalonians', ['thess', 'thes', 'th']],
  ['1 Timothy', ['tim', 'ti', 'tm']], ['2 Timothy', ['tim', 'ti', 'tm']],
  ['Titus', ['tit']], ['Philemon', ['philem', 'phm', 'pm']], ['Hebrews', ['heb']], ['James', ['jas', 'jm']],
  ['1 Peter', ['pet', 'pe', 'pt']], ['2 Peter', ['pet', 'pe', 'pt']],
  ['1 John', ['jn', 'jhn']], ['2 John', ['jn', 'jhn']], ['3 John', ['jn', 'jhn']],
  ['Jude', ['jud', 'jd']], ['Revelation', ['revelations', 'rev', 'rv', 'revelation of john']],
];

/** Books with a single chapter: "Jude 3" means verse 3. */
const SINGLE_CHAPTER = new Set(['Obadiah', 'Philemon', '2 John', '3 John', 'Jude']);

/** Spanish names and abbreviations, keyed by the canonical English name. Accents are folded away before lookup. */
const SPANISH: Record<string, string[]> = {
  Genesis: ['genesis', 'gn', 'gen'], Exodus: ['exodo', 'ex', 'exo'], Leviticus: ['levitico', 'lv', 'lev'],
  Numbers: ['numeros', 'nm', 'num'], Deuteronomy: ['deuteronomio', 'dt', 'deut'], Joshua: ['josue', 'jos'],
  Judges: ['jueces', 'jue', 'jc'], Ruth: ['rut', 'rt'], '1 Samuel': ['samuel', 'sm', 'sam'], '2 Samuel': ['samuel', 'sm', 'sam'],
  '1 Kings': ['reyes', 're'], '2 Kings': ['reyes', 're'], '1 Chronicles': ['cronicas', 'cr', 'cron'], '2 Chronicles': ['cronicas', 'cr', 'cron'],
  Ezra: ['esdras', 'esd'], Nehemiah: ['nehemias', 'neh'], Esther: ['ester', 'est'], Job: ['job'],
  Psalm: ['salmos', 'salmo', 'sal'], Proverbs: ['proverbios', 'prov', 'pr'], Ecclesiastes: ['eclesiastes', 'ecl', 'ec'],
  'Song of Solomon': ['cantares', 'cantar de los cantares', 'cantico de los canticos', 'cnt', 'cant'],
  Isaiah: ['isaias'], Jeremiah: ['jeremias', 'jer'], Lamentations: ['lamentaciones', 'lam'], Ezekiel: ['ezequiel', 'ez', 'eze'],
  Daniel: ['daniel', 'dn', 'dan'], Hosea: ['oseas', 'os'], Joel: ['joel'], Amos: ['amos', 'am'], Obadiah: ['abdias', 'abd'],
  Jonah: ['jonas', 'jon'], Micah: ['miqueas', 'miq'], Nahum: ['nahum', 'nah'], Habakkuk: ['habacuc', 'hab'],
  Zephaniah: ['sofonias', 'sof'], Haggai: ['hageo', 'hag'], Zechariah: ['zacarias', 'zac'], Malachi: ['malaquias', 'mal'],
  Matthew: ['mateo', 'mat', 'mt'], Mark: ['marcos', 'mr'], Luke: ['lucas', 'lc', 'luc'], John: ['juan', 'jn'],
  Acts: ['hechos', 'hch', 'hec'], Romans: ['romanos', 'ro', 'rom'],
  '1 Corinthians': ['corintios', 'co', 'cor'], '2 Corinthians': ['corintios', 'co', 'cor'],
  Galatians: ['galatas', 'gal'], Ephesians: ['efesios', 'ef', 'efe'], Philippians: ['filipenses', 'fil', 'flp'],
  Colossians: ['colosenses', 'col'], '1 Thessalonians': ['tesalonicenses', 'ts', 'tes'], '2 Thessalonians': ['tesalonicenses', 'ts', 'tes'],
  '1 Timothy': ['timoteo', 'ti', 'tim'], '2 Timothy': ['timoteo', 'ti', 'tim'], Titus: ['tito'], Philemon: ['filemon', 'flm', 'filem'],
  Hebrews: ['hebreos', 'heb'], James: ['santiago', 'stg', 'sant'], '1 Peter': ['pedro', 'p', 'pe', 'ped'], '2 Peter': ['pedro', 'p', 'pe', 'ped'],
  '1 John': ['juan', 'jn'], '2 John': ['juan', 'jn'], '3 John': ['juan', 'jn'], Jude: ['judas'], Revelation: ['apocalipsis', 'ap', 'apoc'],
};

/** Lowercase and remove accents, so "Génesis", "genesis" and "GENESIS" all match. */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const LOOKUP = new Map<string, string>();
const addAlias = (name: string, alias: string) => {
  const numbered = /^[123] /.test(name);
  const key = fold(numbered ? `${name.slice(0, 1)} ${alias}` : alias);
  if (!LOOKUP.has(key)) LOOKUP.set(key, name); // English names were added first and win any clash
};
for (const [name, aliases] of BOOKS) {
  addAlias(name, numberedBase(name));
  for (const alias of aliases) addAlias(name, alias);
}
for (const [name, aliases] of Object.entries(SPANISH)) for (const alias of aliases) addAlias(name, alias);

function numberedBase(name: string) {
  return /^[123] /.test(name) ? name.slice(2) : name;
}

const NUMBER_WORDS: Record<string, string> = {
  i: '1', ii: '2', iii: '3', first: '1', second: '2', third: '3', primera: '1', segunda: '2', tercera: '3',
  primero: '1', segundo: '2', tercero: '3', primer: '1',
};

function bookKey(raw: string): string {
  const cleaned = fold(raw).replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  let m = /^([123])(?:st|nd|rd|ra|da)?\s*([a-z].*)$/.exec(cleaned); // 1 John, 1John, 1st John, 1ra Juan
  if (m) return `${m[1]} ${m[2]}`;
  m = /^(\S+)\s+(.+)$/.exec(cleaned); // "I John", "Primera Juan": the number word needs a space, so "isaiah" is safe
  if (m && NUMBER_WORDS[m[1]!]) return `${NUMBER_WORDS[m[1]!]} ${m[2]}`;
  return cleaned;
}

const MAX_CHAPTER = 150; // Psalms
const MAX_VERSE = 176; // Psalm 119
const inRange = (n: number, max: number) => Number.isInteger(n) && n >= 1 && n <= max;

function parsePassage(rest: string, singleChapter: boolean): string | null {
  const r = rest.replace(/\s*([:,-])\s*/g, '$1').trim();
  let m: RegExpExecArray | null;

  if ((m = /^(\d+)$/.exec(r))) return inRange(+m[1]!, singleChapter ? MAX_VERSE : MAX_CHAPTER) ? m[1]! : null;

  if ((m = /^(\d+)-(\d+)$/.exec(r))) {
    const [a, b] = [+m[1]!, +m[2]!];
    return inRange(a, singleChapter ? MAX_VERSE : MAX_CHAPTER) && inRange(b, singleChapter ? MAX_VERSE : MAX_CHAPTER) && b > a ? `${a}-${b}` : null;
  }

  if ((m = /^(\d+):(\d+)-(\d+):(\d+)$/.exec(r))) {
    const [c1, v1, c2, v2] = m.slice(1).map(Number) as [number, number, number, number];
    return inRange(c1, MAX_CHAPTER) && inRange(c2, MAX_CHAPTER) && c2 > c1 && inRange(v1, MAX_VERSE) && inRange(v2, MAX_VERSE) ? `${c1}:${v1}-${c2}:${v2}` : null;
  }

  if ((m = /^(\d+):(\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)$/.exec(r))) {
    const chapter = +m[1]!;
    if (!inRange(chapter, MAX_CHAPTER)) return null;
    const parts = m[2]!.split(',');
    for (const part of parts) {
      const [a, b] = part.split('-').map(Number) as [number, number | undefined];
      if (!inRange(a, MAX_VERSE) || (b !== undefined && (!inRange(b, MAX_VERSE) || b <= a))) return null;
    }
    return `${chapter}:${parts.join(',')}`;
  }
  return null;
}

export function parseReference(input: string): ParsedReference | null {
  const text = fold(input).trim().replace(/[–—]/g, '-').replace(/\s+/g, ' ');
  if (text.length === 0 || text.length > 60) return null;
  // Everything before the trailing chapter/verse part is the book name; the lookup decides if it is a real book.
  const m = /^(.*?[a-z.])\s*(\d[\d :,-]*)$/.exec(text);
  if (!m) return null;
  const book = LOOKUP.get(bookKey(m[1]!));
  if (!book) return null;
  const passage = parsePassage(m[2]!, SINGLE_CHAPTER.has(book));
  return passage ? { book, passage, normalized: `${book} ${passage}`, span: spanOf(passage, SINGLE_CHAPTER.has(book)) } : null;
}

function spanOf(passage: string, singleChapterBook: boolean): ParsedReference['span'] {
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  let m: RegExpExecArray | null;
  if (singleChapterBook) {
    if ((m = /^(\d+)$/.exec(passage))) return { chapter: 1, verses: [Number(m[1])] };
    if ((m = /^(\d+)-(\d+)$/.exec(passage))) return { chapter: 1, verses: range(Number(m[1]), Number(m[2])) };
  }
  if ((m = /^(\d+)$/.exec(passage))) return { chapter: Number(m[1]), verses: null };
  if ((m = /^(\d+):(.+)$/.exec(passage)) && !/^\d+:\d+-\d+:\d+$/.test(passage)) {
    const verses = m[2]!.split(',').flatMap((part) => {
      const [a, b] = part.split('-').map(Number) as [number, number | undefined];
      return b === undefined ? [a] : range(a, b);
    });
    return { chapter: Number(m[1]), verses };
  }
  return null; // chapter ranges and cross-chapter ranges
}

/**
 * Writes a new passage in the same style as the user wrote the reference (same book name, same spacing):
 * withPassage("Salmos 130:1-2", "130:2") -> "Salmos 130:2". Null if the text is not a recognizable reference.
 */
export function withPassage(reference: string, passage: string): string | null {
  const m = /^(.*?[a-z.])(\s*)(\d[\d :,-]*)$/i.exec(reference.trim());
  if (!m || !parseReference(reference)) return null;
  return `${m[1]}${m[2]}${passage}`;
}

/** Position of a canonical book name in Bible order (Genesis = 0), or -1 if unknown. */
export const bookIndex = (book: string) => BOOKS.findIndex(([name]) => name === book);

export const isBibleReference = (input: string) => parseReference(input) !== null;
