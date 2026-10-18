import { createContext, useContext } from 'react';
import { useI18n } from '../../i18n/I18nProvider';

/** Which card of the session this is ("Card 3 of 10"). */
const Ctx = createContext<{ n: number; total: number } | undefined>(undefined);
export const CardPositionProvider = Ctx.Provider;
export const useCardPosition = () => useContext(Ctx);

/** The id the first control on a card points at, so it is described as it takes focus. */
export const CARD_PROMPT_ID = 'card-prompt';

/**
 * Hidden text that says where you are and what is being asked ("Card 3 of 10. John 3:16"). The first control on each
 * card (Show answer, the answer box) points at it with aria-describedby, so a screen reader reads it as that control gets
 * focus: otherwise someone who cannot see the card hears only "Show answer, button" with no idea what is being asked.
 */
export function CardPrompt({ prompt }: { prompt: string }) {
  const { t } = useI18n();
  const pos = useCardPosition();
  return <span id={CARD_PROMPT_ID} className="sr-only">{pos ? t('study.cardPrompt', { n: pos.n, total: pos.total, prompt }) : prompt}</span>;
}
