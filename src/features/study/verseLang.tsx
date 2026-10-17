import { createContext, useContext } from 'react';

/**
 * The language of the verses in the deck being studied ("en", "es"), so a screen reader pronounces them with the right
 * voice even when the app itself is in another language. Undefined when the deck has none set (the app's language is used).
 */
const Ctx = createContext<string | undefined>(undefined);
export const VerseLangProvider = Ctx.Provider;
export const useVerseLang = () => useContext(Ctx);

/** A language tag a browser accepts, or undefined. */
export const asLang = (code: string | null | undefined) => (code && /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(code) ? code : undefined);
