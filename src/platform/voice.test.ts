import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chooseVoice, pickVoice as pick, type VoiceInfo } from './voice';

const IOS = { en: 'en-au', es: 'es-mx' }; // the favourites the iPhone and iPad app uses
const pickVoice = (voices: VoiceInfo[], lang: string) => pick(voices, lang, IOS);

const v = (name: string, lang: string, isDefault = false): VoiceInfo => ({ name, lang, isDefault });
const english = [v('Samantha', 'en-US', true), v('Daniel', 'en-GB'), v('Karen', 'en-AU'), v('Lee', 'en_AU'), v('Moira', 'en-IE')];
const spanish = [v('Monica', 'es-ES', true), v('Juan', 'es-MX'), v('Paulina', 'es-MX'), v('Diego', 'es-AR')];

// The unit tests run without a browser, so the phone's small key-value storage is a stand-in.
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, x: string) => void data.set(k, x), clear: () => data.clear() });
});

describe('which voice reads when none was chosen', () => {
  it('English: the first Australian voice, not the phone\'s default', () => {
    expect(pickVoice(english, 'en-US')?.name).toBe('Karen');
  });

  it('Spanish: the first Mexican voice, not the phone\'s default', () => {
    expect(pickVoice(spanish, 'es-ES')?.name).toBe('Juan');
  });

  it('falls back to the phone\'s default when there is no voice from the favourite region', () => {
    expect(pickVoice([v('Samantha', 'en-US', true), v('Daniel', 'en-GB')], 'en-US')?.name).toBe('Samantha');
    expect(pickVoice([v('Monica', 'es-ES'), v('Diego', 'es-AR')], 'es-ES')?.name).toBe('Monica');
  });

  it('a voice the person chose always wins, and the favourite is then remembered so the voice never changes mid-session', () => {
    chooseVoice('en-US', 'Daniel');
    expect(pickVoice(english, 'en-US')?.name).toBe('Daniel');
    localStorage.clear();
    expect(pickVoice(english, 'en-US')?.name).toBe('Karen');
    expect(localStorage.getItem('speak_voice_en')).toBe('Karen');
  });
});

describe('on Android and the website there is no favourite region', () => {
  it('the device\'s own default for the language is used, as before', () => {
    expect(pick(english, 'en-US', {})?.name).toBe('Samantha');
    expect(pick(spanish, 'es-ES', {})?.name).toBe('Monica');
  });
  it('and with no favourites given, a browser (not the iOS app) picks like that too', () => {
    expect(pick(english, 'en-US')?.name).toBe('Samantha');
  });
});
