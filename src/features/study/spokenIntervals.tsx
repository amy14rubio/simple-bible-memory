import { createContext, useContext } from 'react';
import type { Rating } from '../../domain/study/rating';

/** The rating buttons' intervals written out in words, for screen readers ("10m" would be read as a letter). */
const Ctx = createContext<Record<Rating, string> | undefined>(undefined);
export const SpokenIntervalsProvider = Ctx.Provider;
export const useSpokenIntervals = () => useContext(Ctx);
