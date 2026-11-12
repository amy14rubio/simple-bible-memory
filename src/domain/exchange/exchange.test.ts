import { describe, it, expect } from 'vitest';
import { APP_ID, FORMAT_VERSION, buildExportFile, exportFileName, parseExportFile, type ExportedDeck } from './format';
import { mapAnkiRows, parseAnkiText, splitDelimited, stripHtml } from './anki';

const deck = (over: Partial<ExportedDeck> = {}): ExportedDeck => ({
  title: 'Psalms',
  description: null,
  bibleLanguage: 'en',
  translationCode: 'KJV',
  cards: [{ reference: 'Psalm 23:1', verseText: 'The Lord is my shepherd; I shall not want.', note: null }],
  ...over,
});
const file = (decks: ExportedDeck[], extra: Record<string, unknown> = {}) => JSON.stringify({ ...buildExportFile(decks, false), ...extra });

describe('deck file: licensed translations', () => {
  const licensedDeck = (over: Partial<ExportedDeck> = {}) => deck({ translationCode: 'KJV', cards: [{ reference: 'John 3:16', verseText: '', note: null, translationCode: 'NASB2020' }], ...over });

  it('a file with a card in its own translation is written as format 2; any other as format 1', () => {
    expect(buildExportFile([licensedDeck()], false).format).toBe(2);
    expect(buildExportFile([deck()], false).format).toBe(1);
    expect(FORMAT_VERSION).toBe(2);
  });

  it('reads a licensed card without text, and keeps its translation', () => {
    const r = parseExportFile(file([licensedDeck()]));
    expect(r.ok && r.file.decks[0]!.cards[0]).toMatchObject({ reference: 'John 3:16', verseText: '', translationCode: 'NASB2020' });
  });

  it('never takes a licensed text from a file, whatever the file holds', () => {
    const r = parseExportFile(file([licensedDeck({ cards: [{ reference: 'John 3:16', verseText: 'For God so loved the world', note: null, translationCode: 'AMP' }] })]));
    expect(r.ok && r.file.decks[0]!.cards[0]!.verseText).toBe('');
  });

  it('an ordinary card still needs its text, even in a file that has licensed cards', () => {
    const r = parseExportFile(file([licensedDeck({ cards: [{ reference: 'John 3:16', verseText: '', note: null }] })]));
    expect(r).toMatchObject({ ok: false, code: 'invalid', where: 'decks[0].cards[0].verseText' });
  });

  it('a deck\'s own translation is only a label: its cards keep their text', () => {
    const r = parseExportFile(file([deck({ translationCode: 'NIV' })]));
    expect(r.ok && r.file.decks[0]!.cards[0]!.verseText).toBe('The Lord is my shepherd; I shall not want.');
  });

  it('a file from a newer app than this one is refused politely', () => {
    expect(parseExportFile(file([deck()], { format: 3 }))).toMatchObject({ ok: false, code: 'newer' });
  });
});

describe('deck file', () => {
  it('round-trips a deck', () => {
    const r = parseExportFile(file([deck()]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.file.decks[0]!.title).toBe('Psalms');
      expect(r.file.decks[0]!.cards[0]!.reference).toBe('Psalm 23:1');
      expect(r.file.format).toBe(1); // an ordinary deck is still written in the first format, so an older app can open it
    }
  });

  it('trims text and treats blank optional fields as nothing', () => {
    const r = parseExportFile(file([deck({ title: '  Psalms  ', description: '   ' })]));
    expect(r.ok && r.file.decks[0]).toMatchObject({ title: 'Psalms', description: null });
  });

  it('explains what is wrong: not JSON, not ours, newer, empty, too big', () => {
    expect(parseExportFile('hello')).toEqual({ ok: false, code: 'not-json' });
    expect(parseExportFile('{"app":"something-else"}')).toEqual({ ok: false, code: 'not-ours' });
    expect(parseExportFile('[1,2]')).toEqual({ ok: false, code: 'not-ours' });
    expect(parseExportFile(file([deck()], { format: 99 }))).toEqual({ ok: false, code: 'newer' });
    expect(parseExportFile(file([]))).toEqual({ ok: false, code: 'empty' });
    expect(parseExportFile('x'.repeat(51 * 1024 * 1024))).toEqual({ ok: false, code: 'too-big' });
  });

  it('rejects the whole file and says where when a field is wrong', () => {
    const bad = deck({ cards: [{ reference: 'Psalm 23:1', verseText: 'ok', note: null }, { reference: '', verseText: 'no reference', note: null }] });
    expect(parseExportFile(file([bad]))).toEqual({ ok: false, code: 'invalid', where: 'decks[0].cards[1].reference' });
    expect(parseExportFile(file([deck({ title: '' })]))).toMatchObject({ ok: false, code: 'invalid', where: 'decks[0].title' });
    expect(parseExportFile(JSON.stringify({ app: APP_ID, format: 1, decks: 'nope' }))).toMatchObject({ ok: false, code: 'invalid', where: 'decks' });
    expect(parseExportFile(file([deck({ title: 'x'.repeat(201) })]))).toMatchObject({ ok: false, code: 'invalid' });
  });

  it('checks progress values: ratings, kinds, states and numbers', () => {
    const schedule = { kind: 'recall', due: 1, stability: 2, difficulty: 3, state: 2, reps: 1, lapses: 0, learningSteps: 0, scheduledDays: 5, lastReview: 1 };
    const review = { kind: 'recall', reviewedAt: 1, rating: 3, studyMode: 'type', stateBefore: 0, dueBefore: 1, stability: 1, difficulty: 1, scheduledDays: 1, elapsedDays: 0 };
    const withProgress = (s: object, r: object) => file([deck({ cards: [{ reference: 'A 1:1', verseText: 'a', note: null, schedules: [s], reviews: [r] } as never] })], { includesProgress: true });

    const ok = parseExportFile(withProgress(schedule, review));
    expect(ok.ok && ok.file.includesProgress).toBe(true);
    expect(parseExportFile(withProgress({ ...schedule, kind: 'nope' }, review))).toMatchObject({ code: 'invalid', where: 'decks[0].cards[0].schedules[0].kind' });
    expect(parseExportFile(withProgress({ ...schedule, state: 9 }, review))).toMatchObject({ code: 'invalid' });
    expect(parseExportFile(withProgress({ ...schedule, stability: -1 }, review))).toMatchObject({ code: 'invalid' });
    expect(parseExportFile(withProgress({ ...schedule, due: 'soon' }, review))).toMatchObject({ code: 'invalid' });
    expect(parseExportFile(withProgress(schedule, { ...review, rating: 5 }))).toMatchObject({ code: 'invalid', where: 'decks[0].cards[0].reviews[0].rating' });
    expect(parseExportFile(withProgress(schedule, { ...review, studyMode: 'telepathy' }))).toMatchObject({ code: 'invalid' });
  });

  it('refuses two schedules of the same kind for one card', () => {
    const s = { kind: 'recall', due: 1, stability: 2, difficulty: 3, state: 2, reps: 1, lapses: 0, learningSteps: 0, scheduledDays: 5, lastReview: null };
    const dup = file([deck({ cards: [{ reference: 'A 1:1', verseText: 'a', note: null, schedules: [s, s] } as never] })]);
    expect(parseExportFile(dup)).toMatchObject({ ok: false, code: 'invalid' });
  });

  it('says includesProgress only when the file really has some', () => {
    const r = parseExportFile(file([deck()], { includesProgress: true }));
    expect(r.ok && r.file.includesProgress).toBe(false);
  });

  it('makes safe file names, in any alphabet', () => {
    expect(exportFileName(['Psalms: 23 / 91!'])).toBe('Psalms-23-91.json');
    expect(exportFileName(['Versículos del camino'])).toBe('Versículos-del-camino.json');
    expect(exportFileName(['???'])).toBe('collection.json');
    expect(exportFileName(['a', 'b'])).toBe('bible-memory-backup.json');
  });
});

describe('Anki plain text', () => {
  it('reads a tab-separated export with its header lines', () => {
    const t = parseAnkiText('#separator:tab\n#html:false\n#columns:Front\tBack\tTags\nJohn 3:16\tFor God so loved the world\tmemory\nPsalm 23:1\tThe Lord is my shepherd\t\n');
    expect(t.columns).toEqual(['Front', 'Back', 'Tags']);
    expect(t.rows).toEqual([['John 3:16', 'For God so loved the world', 'memory'], ['Psalm 23:1', 'The Lord is my shepherd', '']]);
  });

  it('handles quotes, doubled quotes, separators and line breaks inside fields', () => {
    expect(splitDelimited('a\t"b\tc"\t"say ""hi"""\n"line1\nline2"\tx\ty\n', '\t')).toEqual([['a', 'b\tc', 'say "hi"'], ['line1\nline2', 'x', 'y']]);
  });

  it('copes with Windows line endings, a BOM and blank lines', () => {
    const t = parseAnkiText('﻿a\tb\r\n\r\nc\td\r\n');
    expect(t.rows).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('guesses the separator when there is no header: tab, then comma or semicolon', () => {
    expect(parseAnkiText('a\tb\nc\td').rows).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseAnkiText('a,b\nc,d').rows).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseAnkiText('a;b;c\nd;e;f').rows).toEqual([['a', 'b', 'c'], ['d', 'e', 'f']]);
  });

  it('honours other separators named in the header', () => {
    expect(parseAnkiText('#separator:semicolon\na;b\nc;d').rows).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseAnkiText('#separator:pipe\na|b').rows).toEqual([['a', 'b']]);
  });

  it('cleans HTML out of fields', () => {
    expect(stripHtml('John&nbsp;3:16<br>For God<br/>so loved <b>the</b> world &amp; all<div>end</div>')).toBe('John 3:16\nFor God\nso loved the world & all\nend');
    const t = parseAnkiText('#html:true\nJohn 3:16\t<div>For God</div><div>so loved</div>');
    expect(t.rows[0]).toEqual(['John 3:16', 'For God\nso loved']);
  });

  it('maps columns to cards and counts the rows it had to skip', () => {
    const rows = [['Front', 'Back', 'Src'], ['John 3:16', 'For God', 'KJV'], ['', 'orphan text', ''], ['Psalm 1:1', '', ''], ['Psalm 23:1', 'The Lord', '']];
    const m = mapAnkiRows(rows, { verse: 0, passage: 1, source: 2, skipFirstRow: true });
    expect(m.cards).toEqual([{ reference: 'John 3:16', verseText: 'For God', note: 'KJV' }, { reference: 'Psalm 23:1', verseText: 'The Lord', note: null }]);
    expect(m.skipped).toBe(2);
    expect(mapAnkiRows(rows, { verse: 1, passage: 0, source: null, skipFirstRow: false }).cards).toHaveLength(3);
  });
});
