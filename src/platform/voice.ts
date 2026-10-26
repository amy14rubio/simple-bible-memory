import { Capacitor } from '@capacitor/core';

/**
 * The phone's voice: reading text aloud and listening to the person.
 * - In the Android app, and the iPhone and iPad app: the phone's own text-to-speech and speech recognition (through two small Capacitor plugins).
 * - In a browser: the browser's speech features, where it has them (Chrome does; many do not).
 * - In browser tests: a stand-in that logs what would be said and plays back scripted answers (see `FakeVoice`).
 * Nothing here ever stores or uploads audio.
 */
export interface VoiceInfo { name: string; lang: string; isDefault: boolean }

/** Some phones list the same voice several times (same name). They cannot be told apart, so only the first of each is kept. */
export const uniqueByName = (voices: VoiceInfo[]): VoiceInfo[] => voices.filter((v, i) => voices.findIndex((w) => w.name === v.name) === i);

/** The voice chosen for each language is remembered on this device (voices differ from phone to phone, so it is not synced). */
const voiceKey = (lang: string) => `speak_voice_${lang.slice(0, 2).toLowerCase()}`;
export const chosenVoice = (lang: string): string | undefined => { try { return localStorage.getItem(voiceKey(lang)) ?? undefined; } catch { return undefined; } };
export const chooseVoice = (lang: string, name: string) => { try { localStorage.setItem(voiceKey(lang), name); } catch { /* not remembered */ } };

/**
 * Which voice reads in `lang`: the one chosen (in Settings, or picked here the first time and then kept), so the voice never
 * changes from one phrase to the next. Without a choice, the phone's own default for that language, else the first that fits.
 */
export function pickVoice(voices: VoiceInfo[], lang: string): VoiceInfo | undefined {
  const fits = voices.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  const saved = chosenVoice(lang);
  const found = fits.find((v) => v.name === saved)
    ?? fits.find((v) => v.isDefault && v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase())
    ?? fits.find((v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase())
    ?? fits[0];
  if (found && found.name !== saved) chooseVoice(lang, found.name);
  return found;
}

export interface Voice {
  /** The voices on this device that speak `lang` ("en", "es"). */
  voices(lang: string): Promise<VoiceInfo[]>;
  /** Can this device read aloud, and can it listen? */
  support(): Promise<{ speak: boolean; listen: boolean }>;
  /** Asks for the microphone (once; Android remembers the answer). */
  requestMicrophone(): Promise<boolean>;
  /** Reads `text` aloud and resolves when it has finished (or been stopped). `rate` 1 is normal speed. */
  speak(text: string, options: { lang: string; rate: number }): Promise<void>;
  stopSpeaking(): Promise<void>;
  /**
   * Listens until the person pauses, or `maxMs` passes, and gives back the recogniser's guesses, best first (an empty list means
   * nothing was heard). It never throws for "no speech": that is just an empty list.
   */
  listen(options: { lang: string; maxMs: number; onPartial?: (guesses: string[]) => void }): Promise<string[]>;
  stopListening(): Promise<void>;
}

/** BCP 47 codes the phone's voices and recogniser expect. */
export const speechCode = (lang: 'en' | 'es') => (lang === 'es' ? 'es-ES' : 'en-US');

// ---- Android -------------------------------------------------------------------------------------------------------------
// Plugins are wrapped in objects on purpose: a Capacitor plugin must never be returned straight from a promise.
const speechPlugin = () => import('@capacitor-community/speech-recognition').then((m) => ({ plugin: m.SpeechRecognition }));
const ttsPlugin = () => import('@capacitor-community/text-to-speech').then((m) => ({ plugin: m.TextToSpeech }));

function nativeVoice(): Voice {
  let all: Promise<VoiceInfo[]> | undefined;
  const list = () => (all ??= ttsPlugin().then(({ plugin }) => plugin.getSupportedVoices()).then((r) => r.voices.map((x) => ({ name: x.name, lang: x.lang, isDefault: x.default }))).catch(() => []));
  return {
    async voices(lang) { return uniqueByName((await list()).filter((x) => x.lang.replace('_', '-').toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()))); },
    async support() {
      const { plugin } = await speechPlugin();
      return { speak: true, listen: (await plugin.available().catch(() => ({ available: false }))).available };
    },
    async requestMicrophone() {
      const { plugin } = await speechPlugin();
      const have = await plugin.checkPermissions();
      const granted = have.speechRecognition === 'granted' || (await plugin.requestPermissions()).speechRecognition === 'granted';
      // On an iPhone or iPad the app must set up its audio first, so it can read aloud and listen at once (and the person can speak
      // over the voice). The listening code for iOS lives in the app itself: ios/App/App/SpeechRecognitionPlugin.swift.
      if (granted && Capacitor.getPlatform() === 'ios') await (plugin as unknown as { prepareAudio(): Promise<void> }).prepareAudio().catch(() => undefined);
      return granted;
    },
    async speak(text, { lang, rate }) {
      const { plugin } = await ttsPlugin();
      const everything = await list();
      const picked = pickVoice(everything, lang);
      const index = picked ? everything.findIndex((x) => x.name === picked.name) : -1;
      await plugin.speak({ text, lang, rate, pitch: 1, volume: 1, category: 'playback', ...(index >= 0 ? { voice: index } : {}) });
    },
    async stopSpeaking() {
      const { plugin } = await ttsPlugin();
      await plugin.stop().catch(() => undefined);
    },
    async listen({ lang, maxMs, onPartial }) {
      const { plugin } = await speechPlugin();
      if (onPartial) {
        // Live mode: guesses arrive while the person is still speaking (even over the app's own voice, where the phone would
        // otherwise never decide that speech had ended).
        return new Promise<string[]>((resolve) => {
          let last: string[] = [];
          const handles: { remove(): Promise<void> }[] = [];
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            clearInterval(watch);
            handles.forEach((h) => void h.remove().catch(() => undefined));
            resolve(last);
          };
          const timer = setTimeout(() => { void plugin.stop().catch(() => undefined); finish(); }, maxMs);
          // Android's recogniser quietly gives up after a few seconds of nothing it can use and tells nobody, so ask it. The
          // sooner this notices, the sooner listening starts again, and the fewer words are said into a dead microphone.
          let started = false;
          const watch = setInterval(() => { if (started) void plugin.isListening().then((s) => { if (!s.listening) finish(); }).catch(() => undefined); }, 250);
          void (async () => {
            try {
              handles.push(await plugin.addListener('partialResults', (d) => { last = (d.matches ?? []).filter(Boolean); if (last.length) onPartial(last); }));
              handles.push(await plugin.addListener('listeningState', (d) => { if (d.status === 'stopped') setTimeout(finish, 50); }));
              await plugin.start({ language: lang, maxResults: 3, popup: false, partialResults: true });
              started = true;
            } catch { finish(); }
          })();
        });
      }
      const timer = setTimeout(() => void plugin.stop().catch(() => undefined), maxMs);
      try {
        const result = await plugin.start({ language: lang, maxResults: 3, popup: false, partialResults: false });
        return (result.matches ?? []).filter(Boolean);
      } catch {
        return []; // Android reports "no speech" and "did not understand" as errors; here they just mean nothing was heard
      } finally {
        clearTimeout(timer);
      }
    },
    async stopListening() {
      const { plugin } = await speechPlugin();
      await plugin.stop().catch(() => undefined);
    },
  };
}

// ---- Browsers ------------------------------------------------------------------------------------------------------------
interface BrowserRecognition {
  lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecognitionCtor = new () => BrowserRecognition;
const recognitionCtor = (): RecognitionCtor | undefined =>
  typeof window === 'undefined' ? undefined : ((window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition);

function browserVoice(): Voice {
  let current: BrowserRecognition | null = null;
  const installed = (): VoiceInfo[] => ('speechSynthesis' in window ? window.speechSynthesis.getVoices() : []).map((x) => ({ name: x.name, lang: x.lang, isDefault: x.default }));
  return {
    async voices(lang) { return uniqueByName(installed().filter((x) => x.lang.replace('_', '-').toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()))); },
    async support() {
      return { speak: typeof window !== 'undefined' && 'speechSynthesis' in window, listen: !!recognitionCtor() };
    },
    async requestMicrophone() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        return true;
      } catch {
        return false;
      }
    },
    speak(text, { lang, rate }) {
      return new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang; u.rate = rate;
        const picked = pickVoice(installed(), lang);
        const match = picked && window.speechSynthesis.getVoices().find((x) => x.name === picked.name);
        if (match) u.voice = match;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
      });
    },
    async stopSpeaking() { window.speechSynthesis.cancel(); },
    listen({ lang, maxMs, onPartial }) {
      const Ctor = recognitionCtor();
      if (!Ctor) return Promise.resolve([]);
      return new Promise<string[]>((resolve) => {
        const r = new Ctor();
        current = r;
        r.lang = lang; r.interimResults = !!onPartial; r.maxAlternatives = 3; r.continuous = false;
        let heard: string[] = [];
        const timer = setTimeout(() => r.stop(), maxMs);
        const finish = () => { clearTimeout(timer); current = null; resolve(heard); };
        r.onresult = (e) => { heard = Array.from(e.results[e.results.length - 1] ?? []).map((a) => a.transcript); if (onPartial && heard.length) onPartial(heard); };
        r.onerror = finish;
        r.onend = finish;
        try { r.start(); } catch { finish(); }
      });
    },
    async stopListening() { current?.stop(); },
  };
}

// ---- Tests ---------------------------------------------------------------------------------------------------------------
/** Browser tests only (VITE_FAKE_VOICE=true): reads nothing aloud, logs it, and plays back answers a test queued. */
export interface FakeVoice {
  spoken: { text: string; lang: string; rate: number }[];
  /** Each entry is what the next `listen()` hears (a list of guesses; [] is silence). Empty queue: silence. */
  heard: string[][];
  micRequests: number;
  micAllowed: boolean;
  /** Say each phrase after this many ms (default 0: at once). */
  speakMs: number;
}
function fakeVoice(): Voice {
  // A test may set up `window.__fakeVoice` (answers to play back) before the page starts; otherwise a fresh one is made.
  const state: FakeVoice = (window as unknown as { __fakeVoice?: FakeVoice }).__fakeVoice ?? { spoken: [], heard: [], micRequests: 0, micAllowed: true, speakMs: 0 };
  (window as unknown as { __fakeVoice: FakeVoice }).__fakeVoice = state;
  let stopSpeak: (() => void) | null = null;
  return {
    async voices() { return []; },
    async support() { return { speak: true, listen: true }; },
    async requestMicrophone() { state.micRequests++; return state.micAllowed; },
    speak(text, { lang, rate }) {
      state.spoken.push({ text, lang, rate });
      return new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, state.speakMs);
        stopSpeak = () => { clearTimeout(timer); resolve(); };
      });
    },
    async stopSpeaking() { stopSpeak?.(); },
    async listen() {
      await new Promise((r) => setTimeout(r, 20));
      return state.heard.shift() ?? [];
    },
    async stopListening() { /* the fake answers at once */ },
  };
}

let voice: Voice | undefined;
export function getVoice(): Voice {
  voice ??= import.meta.env.VITE_FAKE_VOICE === 'true' ? fakeVoice() : Capacitor.isNativePlatform() ? nativeVoice() : browserVoice();
  return voice;
}

/** Keeps the screen on while Speak mode runs (the phone sits in a mount and nobody touches it). Returns a function that lets it sleep again. */
export async function keepScreenOn(): Promise<() => void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { plugin } = await import('@capacitor-community/keep-awake').then((m) => ({ plugin: m.KeepAwake }));
      await plugin.keepAwake();
      return () => { void plugin.allowSleep().catch(() => undefined); };
    } catch { return () => undefined; }
  }
  try {
    const lock = await (navigator as unknown as { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen');
    return () => { void lock?.release().catch(() => undefined); };
  } catch { return () => undefined; }
}
