import type { Rating } from '../study/rating';
import { isDone, isDoneAlone, normalize, parseCommand, parseRating } from './commands';
import { spokenReference, type SpeakLanguage } from './reference';

/** What the runner needs from the phone's voice (the real thing lives in src/platform/voice.ts). */
export interface RunnerVoice {
  speak(text: string, options: { lang: string; rate: number }): Promise<void>;
  stopSpeaking(): Promise<void>;
  listen(options: { lang: string; maxMs: number; onPartial?: (guesses: string[]) => void }): Promise<string[]>;
  stopListening(): Promise<void>;
}

/** Every phrase the app says by itself, in the app's language (the verse and its reference are read separately, in the verse's). */
export interface SpeakScript {
  /** "How did you do? Again, hard, good, or easy?" */
  askRating(): string;
  /** "Good." */
  rated(label: string): string;
  slower(): string;
  faster(): string;
}

/** prompt: reading the question; listening: for the answer; reading: the correct answer; asking: saying "again, hard, good, easy?"; rating: listening for the rating; paused: asked enough, waiting quietly; confirming: saying the rating back. */
export type Phase = 'prompt' | 'listening' | 'reading' | 'asking' | 'rating' | 'paused' | 'confirming';
export type TapEvent = { kind: 'rate'; rating: Rating } | { kind: 'skip' } | { kind: 'stop' };
export type CardResult = { kind: 'rated'; rating: Rating } | { kind: 'skip' } | { kind: 'stop' };
export interface SpeakCard { reference: string; verseText: string; kind: 'recall' | 'identify' }

export interface RunnerOptions {
  voice: RunnerVoice;
  script: SpeakScript;
  /** The app's language: the prompts, the rating words. */
  uiLang: SpeakLanguage;
  /** The verse's language: how it is read, and how a reference said back is recognised. */
  verseLang: SpeakLanguage;
  /** BCP 47 codes for the voices ("en-US"). */
  code: (lang: SpeakLanguage) => string;
  labels: Record<Rating, string>;
  rate: { get(): number; set(rate: number): void };
  onPhase?: (phase: Phase) => void;
  /** The recogniser's best guess for what was just heard (shown on screen, so a missed finish word is easy to see). */
  onHeard?: (text: string) => void;
  /** Longest a verse is listened for in one go, and in all (milliseconds). */
  listenMs?: number;
  /** While the app is talking and listening at once, how long one listening window lasts before it is started again. */
  liveWindowMs?: number;
  /** How long a rating can go unanswered before the screen says "take your time". */
  ratingWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const STEP = 0.15;
const MIN_RATE = 0.6;
const MAX_RATE = 1.5;
type Interruption = { tap: TapEvent };

/**
 * Runs one card hands-free: say the prompt, listen while the person says their answer, read the correct verse, ask "again, hard,
 * good or easy?" and listen for the rating. Taps (buttons on the screen) can step in at any moment. The spoken answer is never
 * graded: it is only listened to, to know when it is over. The person always rates themselves, and is never asked to say the verse again.
 */
export class SpeakRunner {
  private waiter: ((e: TapEvent) => void) | null = null;
  private buffered: TapEvent | null = null;
  private stopped = false;
  /** The verse being studied, normalised: words the person says that are simply part of it must never be taken for a command. */
  private verseNorm = '';
  /** Ends the listening that runs alongside speech (see sayListening) as soon as the speech is over or a tap arrives. */
  private gate: { over: boolean; cancelled: boolean } | null = null;
  private readonly o: RunnerOptions;
  constructor(options: RunnerOptions) { this.o = options; }

  /** A button on the screen was pressed. */
  tap(e: TapEvent) {
    if (this.waiter) { const w = this.waiter; this.waiter = null; w(e); } else this.buffered = e;
  }
  /** Leaves everything quiet (the screen closed). */
  cancel() {
    this.stopped = true;
    void this.hush();
    this.tap({ kind: 'stop' });
  }

  private async hush() {
    if (this.gate) this.gate.over = this.gate.cancelled = true;
    // Neither call is trusted to answer: a phone that never replies must not leave a tap hanging.
    const quickly = (p: Promise<unknown>) => Promise.race([p.catch(() => undefined), this.sleep(500)]);
    await Promise.all([quickly(this.o.voice.stopSpeaking()), quickly(this.o.voice.stopListening())]);
  }
  private sleep(ms: number) { return (this.o.sleep ?? ((n) => new Promise<void>((r) => setTimeout(r, n))))(ms); }

  /** Waits for `work`, unless a tap arrives first (then the voice is hushed and the tap is returned). */
  private async race<T>(work: Promise<T>): Promise<{ value: T } | Interruption> {
    if (this.buffered) { const tap = this.buffered; this.buffered = null; await this.hush(); await this.settle(work); return { tap }; }
    const tapped = new Promise<Interruption>((resolve) => { this.waiter = (tap) => resolve({ tap }); });
    try {
      const first = await Promise.race([work.then((value) => ({ value })), tapped]);
      if ('tap' in first) { await this.hush(); await this.settle(work); }
      return first;
    } finally {
      this.waiter = null;
    }
  }

  /** Is this (two words or more) just a piece of the verse itself? */
  private partOfVerse(heard: string) {
    const n = normalize(heard);
    return n.includes(' ') && this.verseNorm.includes(` ${n} `);
  }

  /**
   * Listens like `hear`, but acts on guesses as they arrive. The phone decides that speech is over only after a pause (on an iPhone
   * or iPad, a few seconds), and a person who has said "done" should not have to wait for that. `soon` says how long a guess must
   * stay unchanged before it is acted on (null: not a finish): short for a whole-utterance command, longer when the word ends a
   * longer sentence (a verse that merely ends in "done" keeps growing, and then the wait starts over).
   */
  private hearLive(lang: SpeakLanguage, maxMs: number, soon: (heard: string[]) => number | null) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const work = new Promise<string[]>((resolve) => {
      let early = false;
      const finish = (heard: string[]) => { clearTimeout(timer); early = true; void this.o.voice.stopListening().catch(() => undefined); resolve(heard); };
      this.o.voice
        .listen({
          lang: this.o.code(lang),
          maxMs,
          onPartial: (heard) => {
            if (early || this.stopped) return;
            clearTimeout(timer);
            if (heard.length > 0) this.o.onHeard?.(heard[0]!);
            const wait = soon(heard);
            if (wait !== null) timer = setTimeout(() => finish(heard), wait);
          },
        })
        .then((heard) => { clearTimeout(timer); resolve(heard); }, () => { clearTimeout(timer); resolve([]); });
    });
    return this.race(work);
  }

  /** Gives stopped voice work a moment to finish, but never waits on it for good (a stopped recogniser may never report back). */
  private settle(work: Promise<unknown>) {
    return Promise.race([work.catch(() => undefined), this.sleep(400)]);
  }

  /** Says `text` (nothing is said for an empty one). */
  private say(text: string, lang: SpeakLanguage) {
    if (!text) return Promise.resolve({ value: undefined } as { value: void });
    return this.race(this.o.voice.speak(text, { lang: this.o.code(lang), rate: this.o.rate.get() }));
  }

  /**
   * Says `text` while listening, so the person can cut in: if what they say is something `accept` wants (a rating, "done"...),
   * the speech stops at once and what they said comes back. If the speech ends first, the result is null. Guesses are looked at
   * as they arrive (not only when the phone decides speech is over, which never happens while the app itself is talking).
   * Anything that merely repeats the words being spoken is the app hearing itself, and is ignored.
   */
  private sayListening(text: string, speakLang: SpeakLanguage, listenLang: SpeakLanguage, accept: (heard: string[]) => boolean) {
    const gate = { over: false, cancelled: false };
    this.gate = gate;
    const spoken = normalize(text);
    const echo = (heard: string[]) => heard.every((h) => { const n = normalize(h); return n.split(' ').length >= 2 && spoken.includes(n); });
    let hit: string[] | null = null;
    let signalHit: () => void = () => undefined;
    const hitSignal = new Promise<void>((resolve) => { signalHit = resolve; });
    const take = (heard: string[]) => {
      if (heard.length > 0) this.o.onHeard?.(heard[0]!);
      if (hit || gate.cancelled || heard.length === 0 || echo(heard) || !accept(heard)) return;
      hit = heard;
      gate.over = true;
      signalHit(); // do not wait for the voice to confirm it has stopped: a stopped voice may never say so
      void this.o.voice.stopSpeaking().catch(() => undefined);
      void this.o.voice.stopListening().catch(() => undefined);
    };
    const work = (async (): Promise<string[] | null> => {
      const speaking = this.o.voice.speak(text, { lang: this.o.code(speakLang), rate: this.o.rate.get() }).catch(() => undefined).then(() => { gate.over = true; });
      const hearing = (async () => {
        while (!gate.over && !this.stopped) {
          // Android's recogniser quietly gives up after a few seconds without speech it can use, which a long verse outlasts, so
          // listening is started again every few seconds while the app talks.
          const heard = await this.o.voice.listen({ lang: this.o.code(listenLang), maxMs: this.o.liveWindowMs ?? 4000, onPartial: take }).catch(() => [] as string[]);
          // A rating said just as the speech ends still counts; one that arrives after a tap or the screen closing does not.
          take(heard);
          if (hit || gate.cancelled) return hit;
          if (!gate.over && heard.length === 0) await this.sleep(30);
        }
        return hit;
      })();
      await Promise.race([speaking, hitSignal]);
      void this.o.voice.stopListening().catch(() => undefined);
      return Promise.race([hearing, this.sleep(500).then(() => hit)]);
    })();
    return this.race(work);
  }

  private phase(p: Phase) { this.o.onPhase?.(p); }
  private static fromTap(e: TapEvent): CardResult { return e.kind === 'rate' ? { kind: 'rated', rating: e.rating } : { kind: e.kind }; }

  /** What interrupts the reading of the correct verse: "done", a short rating, skip or stop. */
  private acceptWhileReading(spoken: string) {
    const firstWord = normalize(spoken).split(' ')[0];
    return (h: string[]) =>
      isDone(h, this.o.uiLang) || isDone(h, this.o.verseLang) || parseCommand(h, this.o.uiLang, false, ['skip', 'stop']) !== null
      // A short rating word cuts the verse off ("again": I know I got it wrong). Not when it is simply the verse's own first word, heard back.
      || (parseRating(h, this.o.uiLang, 2) !== null && !h.some((x) => normalize(x) === firstWord));
  }
  /** What interrupts the rating question: a rating or a command. */
  private readonly acceptWhileAsking = (h: string[]) =>
    parseRating(h, this.o.uiLang, 2) !== null || parseCommand(h, this.o.uiLang, false, ['repeat', 'slower', 'faster', 'skip', 'stop']) !== null;

  /** What was said while the rating was awaited: a result, "again" (read the verse once more), or null when it was not understood. */
  private async interpret(heard: string[]): Promise<CardResult | 'again' | null> {
    const { script, uiLang, labels } = this.o;
    if (parseCommand(heard, uiLang, true, ['repeat'])) return 'again';
    const rating = parseRating(heard, uiLang);
    if (rating) {
      this.phase('confirming');
      const step = await this.say(script.rated(labels[rating]), uiLang);
      if ('tap' in step) return SpeakRunner.fromTap(step.tap);
      return { kind: 'rated', rating };
    }
    const command = parseCommand(heard, uiLang, true, ['slower', 'faster', 'skip', 'stop']);
    if (command === 'skip') return { kind: 'skip' };
    if (command === 'stop') return { kind: 'stop' };
    if (command === 'slower' || command === 'faster') {
      const next = Math.min(MAX_RATE, Math.max(MIN_RATE, this.o.rate.get() + (command === 'faster' ? STEP : -STEP)));
      this.o.rate.set(Math.round(next * 100) / 100);
      const step = await this.say(command === 'faster' ? script.faster() : script.slower(), uiLang);
      if ('tap' in step) return SpeakRunner.fromTap(step.tap);
      return 'again'; // say the verse again at the new speed
    }
    return null;
  }

  async run(card: SpeakCard): Promise<CardResult> {
    const { uiLang, verseLang } = this.o;
    const ref = spokenReference(card.reference, verseLang);
    const recall = card.kind === 'recall';
    this.verseNorm = ` ${normalize(card.verseText)} `;

    // 1. the prompt: just the reference (or the passage), with no instructions
    this.phase('prompt');
    // (The reference, and the passage, are read in the deck's language: that is the language of the book names and of "verse".)
    const step = await this.say(recall ? `${ref}.` : card.verseText, verseLang);
    if ('tap' in step) return SpeakRunner.fromTap(step.tap);

    // 2. listen to the answer (never graded)
    this.phase('listening');
    const heardOutcome = await this.listenToAnswer(verseLang);
    if (heardOutcome) return heardOutcome;

    // 3. read the correct answer (the person can cut in), then 4. ask for the rating
    for (;;) {
      this.phase('reading');
      const reading = recall ? card.verseText : `${ref}.`;
      const read = await this.sayListening(reading, verseLang, uiLang, this.acceptWhileReading(reading));
      if ('tap' in read) return SpeakRunner.fromTap(read.tap);
      if (read.value) {
        // they cut in: a rating or command is acted on; "done" just moves on to the question
        const said = await this.interpret(read.value);
        if (said === 'again') continue;
        if (said) return said;
        if (parseCommand(read.value, uiLang, false, ['skip']) === 'skip') return { kind: 'skip' };
      }
      const outcome = await this.askForRating();
      if (outcome !== 'again') return outcome; // anything but "read it again"
    }
  }

  /**
   * Listens for the answer until the person says they are finished ("done" / "listo") or skips, stops or taps. There is no
   * time limit: people pause to remember, and Android's recogniser gives up after a second or two of quiet, so it is simply
   * started again. Returns a result only if they asked to skip or stop.
   */
  private async listenToAnswer(lang: SpeakLanguage): Promise<CardResult | null> {
    while (!this.stopped) {
      const r = await this.hearLive(lang, this.o.listenMs ?? 15_000, (h) => {
        const own = h.filter((x) => !this.partOfVerse(x));
        if (isDoneAlone(own, this.o.uiLang) || isDoneAlone(own, this.o.verseLang) || parseCommand(h, this.o.uiLang, false, ['skip', 'stop'])) return 250;
        return isDone(own, this.o.uiLang) || isDone(own, this.o.verseLang) ? 700 : null;
      });
      if ('tap' in r) return SpeakRunner.fromTap(r.tap);
      const heard = r.value;
      if (heard.length === 0) { await this.sleep(100); continue; }
      this.o.onHeard?.(heard[0]!);
      // Said inside the verse ("well done, good and faithful servant", "thy will be done"), "done" is not a command.
      const own = heard.filter((h) => !this.partOfVerse(h));
      if (isDone(own, this.o.uiLang) || isDone(own, this.o.verseLang)) return null;
      const strict = parseCommand(heard, this.o.uiLang, false, ['skip', 'stop']);
      if (strict === 'skip') return { kind: 'skip' };
      if (strict === 'stop') return { kind: 'stop' };
      // they said something (the verse, or part of it): listen again for the rest
    }
    return { kind: 'stop' };
  }

  /**
   * Asks "how did you do?" (the person can cut in), then listens for the answer for as long as it takes: it never asks again.
   * After a while of quiet it only changes the status on screen ("take your time"); a tap or a spoken rating still works.
   * "again" means: read the verse once more. Otherwise the final result.
   */
  private async askForRating(): Promise<CardResult | 'again'> {
    const { script, uiLang } = this.o;
    this.phase('asking');
    const step = await this.sayListening(script.askRating(), uiLang, uiLang, this.acceptWhileAsking);
    if ('tap' in step) return SpeakRunner.fromTap(step.tap);
    if (step.value) { const early = await this.interpret(step.value); if (early) return early; }
    let pausedShown = false;
    let quietSince = Date.now();
    this.phase('rating');
    for (;;) {
      if (this.stopped) return { kind: 'stop' };
      const r = await this.hearLive(uiLang, 12_000, (h) => (parseRating(h, uiLang) !== null || parseCommand(h, uiLang, true, ['repeat', 'slower', 'faster', 'skip', 'stop']) ? 250 : null));
      if ('tap' in r) return SpeakRunner.fromTap(r.tap);
      const heard = r.value;
      if (heard.length === 0) {
        if (!pausedShown && Date.now() - quietSince >= (this.o.ratingWaitMs ?? 10_000)) { pausedShown = true; this.phase('paused'); }
        await this.sleep(150);
        continue;
      }
      const said = await this.interpret(heard);
      if (said) return said;
    }
  }
}
