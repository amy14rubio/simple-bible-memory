import { describe, expect, it, vi } from 'vitest';
import { isDone, normalize, parseCommand, parseRating } from './commands';
import { spokenReference } from './reference';
import { uniqueByName } from '../../platform/voice';
import { SpeakRunner, type Phase, type RunnerOptions, type SpeakScript } from './runner';

describe('how a reference is said', () => {
  it('reads chapters and verses the way people say them', () => {
    expect(spokenReference('Philippians 4:13', 'en')).toBe('Philippians 4, verse 13');
    expect(spokenReference('Philippians 4:6-7', 'en')).toBe('Philippians 4, verses 6 to 7');
    expect(spokenReference('Psalm 23', 'en')).toBe('Psalm 23');
    expect(spokenReference('John 3:16–17', 'en')).toBe('John 3, verses 16 to 17'); // an en dash
    expect(spokenReference('1 Corinthians 13:4-7', 'en')).toBe('First Corinthians 13, verses 4 to 7');
    expect(spokenReference('2 Timothy 1:7', 'en')).toBe('Second Timothy 1, verse 7');
  });
  it('and in Spanish', () => {
    expect(spokenReference('Juan 3:16', 'es')).toBe('Juan 3, versículo 16');
    expect(spokenReference('Filipenses 4:6-7', 'es')).toBe('Filipenses 4, versículos 6 al 7');
    expect(spokenReference('1 Corintios 13:4-7', 'es')).toBe('Primera Corintios 13, versículos 4 al 7');
  });
  it('reads something it does not recognise as it is written', () => {
    expect(spokenReference('Genesis 1:1-2:3', 'en')).toContain('Genesis');
    expect(spokenReference('whatever', 'en')).toBe('whatever');
  });
});

describe('understanding what is said', () => {
  it('normalises accents, case and punctuation', () => {
    expect(normalize("  It's  DIFÍCIL! ")).toBe('its dificil');
  });
  it('recognises the four ratings, in words or numbers, in English and Spanish', () => {
    expect(parseRating(['again'], 'en')).toBe(1);
    expect(parseRating(['Hard.'], 'en')).toBe(2);
    expect(parseRating(['I would say good'], 'en')).toBe(3);
    expect(parseRating(['4'], 'en')).toBe(4);
    expect(parseRating(['otra vez'], 'es')).toBe(1);
    expect(parseRating(['difícil'], 'es')).toBe(2);
    expect(parseRating(['bien'], 'es')).toBe(3);
    expect(parseRating(['fácil'], 'es')).toBe(4);
  });
  it('is unclear when it hears none, or more than one', () => {
    expect(parseRating([], 'en')).toBeNull();
    expect(parseRating(['uh blah'], 'en')).toBeNull();
    expect(parseRating(['hard no good'], 'en')).toBeNull();
    expect(parseRating(['the quick brown fox jumps over the lazy good dog'], 'en')).toBeNull(); // a long sentence is not a rating
  });
  it('takes the first alternative that is clear', () => {
    expect(parseRating(['uh', 'hard', 'good'], 'en')).toBe(2);
  });
  it('finds commands, and "say it again" is a repeat, not the rating Again', () => {
    expect(parseCommand(['say it again'], 'en', true, ['repeat'])).toBe('repeat');
    expect(parseRating(['again'], 'en')).toBe(1);
    expect(parseCommand(['slower please'], 'en', true)).toBe('slower');
    expect(parseCommand(['faster'], 'en', true)).toBe('faster');
    expect(parseCommand(['skip this one'], 'en', true)).toBe('skip');
    expect(parseCommand(['stop'], 'en', true)).toBe('stop');
    expect(parseCommand(['más lento'], 'es', true)).toBe('slower');
    expect(parseCommand(['léelo otra vez'], 'es', true, ['repeat'])).toBe('repeat');
  });
  it('while the verse is being said, only a whole-utterance command counts', () => {
    expect(parseCommand(['stop'], 'en', false)).toBe('stop');
    expect(parseCommand(['be still and know that I am God'], 'en', false)).toBeNull();
    expect(parseCommand(['thou shalt not stop the ox'], 'en', false)).toBeNull();
  });
  it('"done" and "I don\'t know" end the answer, but only said on their own', () => {
    expect(isDone(['done'], 'en')).toBe(true);
    expect(isDone(["I don't know"], 'en')).toBe(true);
    expect(isDone(['listo'], 'es')).toBe(true);
    expect(isDone(["I don't know I'm done"], 'en')).toBe(true);
    expect(isDone(['en el principio creo Dios los cielos listo'], 'es')).toBe(true);
    expect(isDone(['thy will be done'], 'en')).toBe(false);
    expect(isDone(['for God so loved the world done'], 'en')).toBe(true);
    expect(isDone(['thy will be done in earth as it is in heaven'], 'en')).toBe(false);
  });
});

// ---- the runner, with a scripted voice ------------------------------------------------------------------------------------------

const script: SpeakScript = {
  askRating: () => 'How did you do? Again, hard, good, or easy?',
  rated: (label) => `${label}.`,
  slower: () => 'Slower.',
  faster: () => 'Faster.',
};
const labels = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' } as const;

/** `heard`: what each listening turn hears. `during`: what is heard while the app itself is talking (one entry per phrase it says while listening). */
function setup(heard: string[][], options: Partial<RunnerOptions> = {}, during: string[][] = []) {
  const spoken: { text: string; lang: string; rate: number }[] = [];
  const queue = [...heard];
  const whileTalking = [...during];
  let talking = 0;
  const phases: Phase[] = [];
  let holdSpeech: (() => void) | null = null;
  let hold = false;
  let rate = 1;
  const runner = new SpeakRunner({
    voice: {
      speak: (text, o) => {
        spoken.push({ text, ...o });
        talking++;
        if (!hold) return Promise.resolve().then(() => { talking--; });
        return new Promise<void>((resolve) => { holdSpeech = () => { talking--; resolve(); }; });
      },
      stopSpeaking: async () => { holdSpeech?.(); },
      listen: async () => {
        const heard = (talking > 0 ? whileTalking : queue).shift() ?? [];
        if (heard.length === 0) await new Promise((r) => setTimeout(r, 40)); // like the real recogniser, silence takes a while
        return heard;
      },
      stopListening: async () => undefined,
    },
    script, uiLang: 'en', verseLang: 'en', code: (l) => (l === 'es' ? 'es-ES' : 'en-US'), labels,
    rate: { get: () => rate, set: (n) => { rate = n; } },
    onPhase: (p) => phases.push(p),
    sleep: (ms) => new Promise<void>((r) => setTimeout(r, Math.min(ms, 5))), // really waits a moment, so a quiet loop never starves the clock
    ratingWaitMs: 30,
    ...options,
  });
  const voice = (runner as unknown as { o: { voice: { listen: (o: { lang: string; maxMs: number }) => Promise<string[]>; speak: (text: string, o: { lang: string; rate: number }) => Promise<void> } } }).o.voice;
  return { voice, runner, spoken, phases, say: () => spoken.map((s) => s.text), holdNextSpeech: () => { hold = true; }, rate: () => rate, remaining: () => queue.length };
}
const card = { reference: 'Philippians 4:6-7', verseText: 'Be careful for nothing.', kind: 'recall' as const };

describe('references across chapters', () => {
  it('say both chapters', () => {
    expect(spokenReference('John 3:16-4:2', 'en')).toBe('John 3, verse 16 to chapter 4, verse 2');
    expect(spokenReference('1 Kings 8:60-9:3', 'en')).toBe('First Kings 8, verse 60 to chapter 9, verse 3');
    expect(spokenReference('Juan 3:16-4:2', 'es')).toBe('Juan 3, versículo 16 al capítulo 4, versículo 2');
  });
});

describe('the list of voices', () => {
  it('keeps each voice once, even when the phone lists it several times', () => {
    const v = (name: string, lang = 'es-ES') => ({ name, lang, isDefault: false });
    expect(uniqueByName([v('a'), v('a'), v('b'), v('a', 'es-US')]).map((x) => x.name)).toEqual(['a', 'b']);
  });
});

describe('one card, hands free', () => {
  it('a tap still works when the recogniser never reports back after being stopped', async () => {
    const t = setup([['Be careful for nothing'], ['done']], { ratingWaitMs: 5 });
    let hang = false;
    const listen = t.voice.listen;
    t.voice.listen = (o) => (hang ? new Promise<string[]>(() => undefined) : listen(o));
    const done = t.runner.run(card);
    await vi.waitFor(() => expect(t.phases).toContain('asking'));
    hang = true; // from here the recogniser swallows everything, as a stopped one can
    await new Promise((r) => setTimeout(r, 50));
    t.runner.tap({ kind: 'rate', rating: 4 });
    expect(await done).toEqual({ kind: 'rated', rating: 4 });
  });

  it('says the reference, listens, reads the verse, asks for the rating, and takes it', async () => {
    const t = setup([['Be careful for nothing'], ['done'], ['good']]);
    expect(await t.runner.run(card)).toEqual({ kind: 'rated', rating: 3 });
    expect(t.say()).toEqual([
      'Philippians 4, verses 6 to 7.',
      'Be careful for nothing.',
      'How did you do? Again, hard, good, or easy?',
      'Good.',
    ]);
    expect(t.phases).toEqual(['prompt', 'listening', 'reading', 'asking', 'rating', 'confirming']);
  });

  it('listens again after a pause in the middle of the verse, and ends once it goes quiet', async () => {
    const t = setup([['Be careful'], ['for nothing'], ['done'], ['easy']]);
    expect(await t.runner.run(card)).toEqual({ kind: 'rated', rating: 4 });
    expect(t.remaining()).toBe(0);
  });

  it('"done" ends the turn at once, and a verse containing "done" does not', async () => {
    const quick = setup([['done'], ['hard']]);
    expect(await quick.runner.run(card)).toEqual({ kind: 'rated', rating: 2 });
    const verse = setup([['thy will be done in earth'], ['as it is in heaven'], ['done'], ['good']]);
    expect(await verse.runner.run(card)).toEqual({ kind: 'rated', rating: 3 });
    expect(verse.remaining()).toBe(0);
  });

  describe('a verse that contains the finish word', () => {
    it('does not end the answer when a pause falls right after "done" in the verse', async () => {
      const t = setup([['well done'], ['good and faithful servant'], ['done'], ['good']]);
      expect(await t.runner.run({ reference: 'Matthew 25:21', verseText: 'Well done, good and faithful servant.', kind: 'recall' })).toEqual({ kind: 'rated', rating: 3 });
      expect(t.remaining()).toBe(0); // all four turns were listened to: the first "well done" did not end it
    });

    it('does not end the answer on "thy will be done", but still ends on "done" said after it', async () => {
      const verse = 'Thy will be done in earth, as it is in heaven.';
      const t = setup([['thy will be done'], ['in earth as it is in heaven'], ['done'], ['easy']]);
      expect(await t.runner.run({ reference: 'Matthew 6:10', verseText: verse, kind: 'recall' })).toEqual({ kind: 'rated', rating: 4 });
      expect(t.remaining()).toBe(0);
      const same = setup([['thy will be done done'], ['easy']]);
      expect(await same.runner.run({ reference: 'Matthew 6:10', verseText: verse, kind: 'recall' })).toEqual({ kind: 'rated', rating: 4 });
    });

    it('a lone "done" always ends the answer, even if the verse contains the word', async () => {
      const t = setup([['done'], ['good']]);
      expect(await t.runner.run({ reference: 'Matthew 6:10', verseText: 'Thy will be done.', kind: 'recall' })).toEqual({ kind: 'rated', rating: 3 });
    });

    it('works the same in Spanish ("listos" inside the verse)', async () => {
      const t = setup([['estad listos'], ['porque no sabéis'], ['listo'], ['bien']], { uiLang: 'es', verseLang: 'es' });
      expect(await t.runner.run({ reference: 'Mateo 24:44', verseText: 'Estad listos, porque no sabéis el día ni la hora.', kind: 'recall' })).toEqual({ kind: 'rated', rating: 3 });
      expect(t.remaining()).toBe(0);
    });

    it('ignores accents and punctuation when comparing with the verse', async () => {
      const t = setup([['bien hecho'], ['siervo bueno y fiel'], ['listo'], ['bien']], { uiLang: 'es', verseLang: 'es' });
      expect(await t.runner.run({ reference: 'Mateo 25:21', verseText: '¡Bien hecho, siervo bueno y fiel!', kind: 'recall' })).toEqual({ kind: 'rated', rating: 3 });
      expect(t.remaining()).toBe(0);
    });
  });

  it('never asks for the verse again, even if nothing at all was heard', async () => {
    const t = setup([[], [], ['done'], ['good']]);
    await t.runner.run(card);
    expect(t.say().filter((s) => s === 'Philippians 4, verses 6 to 7.')).toHaveLength(1);
  });

  it('never asks the question again when it is unclear: it waits quietly for a tap', async () => {
    const t = setup([['done'], ['umm'], ['blah'], ['hmm'], ['nope']]);
    const result = t.runner.run(card);
    await vi.waitFor(() => expect(t.phases).toContain('paused'));
    t.runner.tap({ kind: 'rate', rating: 2 });
    expect(await result).toEqual({ kind: 'rated', rating: 2 });
    expect(t.say().filter((s) => s.startsWith('How did'))).toHaveLength(1); // asked once, never again
  });

  it('while waiting quietly, a spoken rating still counts', async () => {
    const t = setup([['done'], ['umm'], ['blah'], ['hmm'], ['easy']]);
    expect(await t.runner.run(card)).toEqual({ kind: 'rated', rating: 4 });
  });

  it('"repeat" reads the verse again, then asks again', async () => {
    const t = setup([['done'], ['repeat'], ['good']]);
    expect(await t.runner.run(card)).toEqual({ kind: 'rated', rating: 3 });
    expect(t.say().filter((s) => s.startsWith('Be careful'))).toHaveLength(2);
  });

  it('"slower" and "faster" change the speed, and the verse is read again at it', async () => {
    const t = setup([['done'], ['slower'], ['faster'], ['good']]);
    await t.runner.run(card);
    expect(t.spoken.filter((s) => s.text.startsWith('Be careful')).map((s) => s.rate)).toEqual([1, 0.85, 1]);
    expect(t.rate()).toBe(1);
  });

  it('the speed never goes outside a sensible range', async () => {
    const t = setup([['done'], ['slower'], ['slower'], ['slower'], ['slower'], ['slower'], ['good']]);
    await t.runner.run(card);
    expect(t.rate()).toBeGreaterThanOrEqual(0.6);
  });

  it('"skip" and "stop" end the card without a rating', async () => {
    expect(await setup([['done'], ['skip']]).runner.run(card)).toEqual({ kind: 'skip' });
    expect(await setup([['done'], ['stop']]).runner.run(card)).toEqual({ kind: 'stop' });
    expect(await setup([['stop']]).runner.run(card)).toEqual({ kind: 'stop' }); // even while saying the verse
    expect(await setup([['skip']]).runner.run(card)).toEqual({ kind: 'skip' });
  });

  it('saying "done" while the verse is being read moves on, and a rating over the question counts at once', async () => {
    const t = setup([['done']], {}, [['done'], ['good']]);
    expect(await t.runner.run(card)).toEqual({ kind: 'rated', rating: 3 });
    expect(t.say()).toEqual(['Philippians 4, verses 6 to 7.', 'Be careful for nothing.', 'How did you do? Again, hard, good, or easy?', 'Good.']);
  });

  it('a rating said over the verse cuts it off and is taken, without asking the question', async () => {
    const t = setup([['done']], {}, [['again']]);
    expect(await t.runner.run(card)).toEqual({ kind: 'rated', rating: 1 });
    expect(t.say()).toEqual(['Philippians 4, verses 6 to 7.', 'Be careful for nothing.', 'Again.']);
  });

  it('but the verse\'s own first word, heard back, is not taken for a rating', async () => {
    const t = setup([['done'], ['easy']], {}, [['again']]);
    const hard = { reference: 'Test 1:1', verseText: 'Again he said it.', kind: 'recall' as const };
    expect(await t.runner.run(hard)).toEqual({ kind: 'rated', rating: 4 });
  });

  it('moves on at once when the voice never confirms that it has stopped', async () => {
    const t = setup([['done'], ['good']], {}, [[]]);
    const speak = t.voice.speak;
    t.voice.speak = (text, o) => { const done = speak(text, o); return text.startsWith('How did') ? new Promise<void>(() => undefined) : done; }; // a question that never "finishes"
    expect(await t.runner.run(card)).toEqual({ kind: 'rated', rating: 3 });
  });

  it('the verse heard back over the speaker is ignored, and "skip" said over the question is taken', async () => {
    const t = setup([['done']], {}, [['be careful for nothing'], ['skip']]);
    expect(await t.runner.run(card)).toEqual({ kind: 'skip' });
    expect(t.say()).toEqual(['Philippians 4, verses 6 to 7.', 'Be careful for nothing.', 'How did you do? Again, hard, good, or easy?']); // the verse was read to the end
  });

  it('its own voice, heard back as the whole question, is not mistaken for a rating', async () => {
    const t = setup([['done'], ['good']], {}, [[], ['again hard good or easy']]);
    expect(await t.runner.run(card)).toEqual({ kind: 'rated', rating: 3 });
  });

  it('a tap on a rating button steps in while the verse is being read', async () => {
    const t = setup([['done']]);
    t.holdNextSpeech();
    const result = t.runner.run(card);
    await new Promise((r) => setTimeout(r, 20)); // now speaking the prompt: hold lets it finish only when stopped
    t.runner.tap({ kind: 'rate', rating: 3 });
    expect(await result).toEqual({ kind: 'rated', rating: 3 });
  });

  it('a tap that arrives just before the next step is not lost', async () => {
    const t = setup([['done']]);
    t.runner.tap({ kind: 'rate', rating: 1 });
    expect(await t.runner.run(card)).toEqual({ kind: 'rated', rating: 1 });
  });

  it('for a card that shows the passage, it reads the passage, asks which verse it is, and says the reference afterwards', async () => {
    const t = setup([['Philippians four six'], ['done'], ['hard']]);
    const identify = { reference: 'Philippians 4:6', verseText: 'Be careful for nothing.', kind: 'identify' as const };
    expect(await t.runner.run(identify)).toEqual({ kind: 'rated', rating: 2 });
    expect(t.say()).toEqual(['Be careful for nothing.', 'Philippians 4, verse 6.', 'How did you do? Again, hard, good, or easy?', 'Hard.']);
  });

  it('speaks the prompts in the app\'s language and the verse in the verse\'s language', async () => {
    const t = setup([['listo'], ['bien']], { uiLang: 'es', verseLang: 'en' });
    await t.runner.run(card);
    expect(t.spoken.map((s) => s.lang)).toEqual(['en-US', 'en-US', 'es-ES', 'es-ES']);
  });
});
