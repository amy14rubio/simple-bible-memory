import type { Rating } from '../study/rating';
import type { SpeakLanguage } from './reference';

/**
 * Understanding what a person SAYS to the Speak mode. The phone's recogniser gives back a few written guesses ("alternatives"),
 * best first; everything here looks at them in that order. Words are compared without accents or punctuation.
 */
export type Command = 'repeat' | 'skip' | 'stop' | 'slower' | 'faster';

const RATING_WORDS: Record<SpeakLanguage, Record<Rating, string[]>> = {
  en: { 1: ['again', 'one', '1'], 2: ['hard', 'two', '2'], 3: ['good', 'three', '3'], 4: ['easy', 'four', '4'] },
  es: { 1: ['otra vez', 'de nuevo', 'uno', '1'], 2: ['dificil', 'dos', '2'], 3: ['bien', 'bueno', 'tres', '3'], 4: ['facil', 'cuatro', '4'] },
};
const COMMAND_WORDS: Record<SpeakLanguage, Record<Command, string[]>> = {
  en: {
    repeat: ['repeat', 'say it again', 'read it again', 'once more'],
    skip: ['skip', 'next'],
    stop: ['stop', 'quit', 'exit', 'end session'],
    slower: ['slower', 'slow down'],
    faster: ['faster', 'speed up'],
  },
  es: {
    repeat: ['repite', 'repetir', 'repitelo', 'leelo otra vez', 'leelo de nuevo', 'otra vez el versiculo'],
    skip: ['saltar', 'salta', 'siguiente', 'omitir'],
    stop: ['parar', 'detener', 'alto', 'salir', 'terminar sesion'],
    slower: ['mas lento', 'lento', 'despacio'],
    faster: ['mas rapido', 'rapido'],
  },
};
const DONE_WORDS: Record<SpeakLanguage, string[]> = {
  en: ['done', 'im done', 'i am done', 'i have finished', 'finished', 'im finished', 'i dont know', 'i dont remember', 'i forgot', 'no idea', 'thats it', 'that is it'],
  es: ['listo', 'lista', 'listos', 'ya listo', 'ya esta', 'terminado', 'termine', 'ya termine', 'hecho', 'ya hecho', 'ya', 'no se', 'no recuerdo', 'no me acuerdo', 'eso es todo'],
};
const MAX_WORDS_FOR_A_COMMAND = 5; // a long sentence is the verse being said, not a command

/** Lower case, no accents, no punctuation (the apostrophe goes too: "I'm" and "im" match). */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const hasPhrase = (text: string, phrase: string) => ` ${text} `.includes(` ${phrase} `);
const wordCount = (text: string) => (text ? text.split(' ').length : 0);

/** Does any alternative say exactly (or, when `loose`, contain within a short sentence) one of the phrases? */
function matches(heard: string[], phrases: string[], loose: boolean): boolean {
  return heard.some((h) => {
    const n = normalize(h);
    if (!n) return false;
    return phrases.some((p) => (loose ? wordCount(n) <= MAX_WORDS_FOR_A_COMMAND && hasPhrase(n, p) : n === p));
  });
}

/** "done" / "I don't know": the whole utterance, so a verse that happens to contain "done" never ends the turn early. */
/** Said at the end of an utterance, they finish the turn even after other words ("... I don't know I'm done"). */
const DONE_ENDINGS: Record<SpeakLanguage, string[]> = {
  en: ['im done', 'i am done', 'im finished', 'i dont know', 'i dont remember', 'i forgot', 'thats it', 'that is it'],
  es: ['estoy listo', 'estoy lista', 'ya estoy listo', 'ya termine', 'termine', 'ya acabe', 'no se', 'no recuerdo', 'no me acuerdo', 'eso es todo'],
};
/** A trailing "done" / "listo" also finishes the turn, unless it is the end of a phrase like "thy will be done". */
const TRAILING: Record<SpeakLanguage, { word: string[]; notAfter: string[] }> = {
  en: { word: ['done', 'finished'], notAfter: ['be', 'is', 'was', 'been', 'are', 'will', 'shall', 'it', 'get', 'being', 'have', 'has', 'had', 'be'] },
  es: { word: ['listo', 'lista', 'listos'], notAfter: [] },
};
export function isDone(heard: string[], lang: SpeakLanguage): boolean {
  if (matches(heard, DONE_WORDS[lang], false)) return true;
  return heard.some((h) => {
    const n = normalize(h);
    if (!n) return false;
    if (DONE_ENDINGS[lang].some((p) => n.endsWith(` ${p}`) || n === p)) return true;
    const words = n.split(' ');
    const last = words[words.length - 1]!;
    const before = words[words.length - 2];
    return TRAILING[lang].word.includes(last) && (before === undefined || !TRAILING[lang].notAfter.includes(before));
  });
}

/**
 * A command. While the person is saying a verse (`loose` false) only a whole-utterance command counts, so words inside the verse
 * ("stop", "next") are never mistaken for commands; while waiting for a rating (`loose` true) a short sentence containing one counts.
 */
export function parseCommand(heard: string[], lang: SpeakLanguage, loose: boolean, only: Command[] = ['repeat', 'skip', 'stop', 'slower', 'faster']): Command | null {
  for (const h of heard) {
    for (const command of only) {
      if (matches([h], COMMAND_WORDS[lang][command], loose)) return command;
    }
  }
  return null;
}

/** The rating said, if the best alternative that mentions one mentions exactly one ("hard no good" is unclear). */
export function parseRating(heard: string[], lang: SpeakLanguage, maxWords = MAX_WORDS_FOR_A_COMMAND): Rating | null {
  for (const h of heard) {
    const n = normalize(h);
    if (!n || wordCount(n) > maxWords) continue;
    const said = ([1, 2, 3, 4] as Rating[]).filter((r) => RATING_WORDS[lang][r].some((p) => hasPhrase(n, p)));
    if (said.length === 1) return said[0]!;
    if (said.length > 1) return null;
  }
  return null;
}
