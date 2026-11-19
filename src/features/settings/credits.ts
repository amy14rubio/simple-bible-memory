import type { MessageKey } from '../../i18n';

/**
 * Who and what made the app possible: the Bible texts and word-study data, the sites the app sends people to, and the open-source library behind the study scheduling (NOT the tech stack it is built on, and not everyday building blocks such as shadcn/ui, Lucide or dnd kit). Each credit is a
 * name (kept as it is written, in every language) that links to its own website, with a short line saying what it is for (`credits.note.<id>`).
 * The things named here must be things the app really uses (checked against the code: scheduler.ts imports ts-fsrs); the licences of the Bible texts and word-study data are the ones the app already shows
 * where it uses them.
 */
export interface Credit { id: string; name: string; href: string | null }
export interface CreditSection { id: string; title: MessageKey; items: Credit[] }

export const CREDIT_SECTIONS: CreditSection[] = [
  {
    id: 'texts',
    title: 'credits.section.texts',
    items: [
      { id: 'youversion', name: 'YouVersion Platform', href: 'https://developers.youversion.com' },
    ],
  },
  {
    id: 'wordstudy',
    title: 'credits.section.wordstudy',
    items: [
      { id: 'helloao', name: 'Free Use Bible API', href: 'https://bible.helloao.org' },
      { id: 'interlinear', name: 'Berean Interlinear Bible', href: 'https://berean.bible' },
      { id: 'stepbible', name: 'STEPBible Brief Lexicons', href: 'https://www.stepbible.org' },
      { id: 'ubs', name: 'UBS Dictionary of the Greek New Testament', href: 'https://www.unitedbiblesocieties.org' },
    ],
  },
  {
    id: 'find',
    title: 'credits.section.find',
    items: [
      { id: 'biblegateway', name: 'Bible Gateway', href: 'https://www.biblegateway.com' },
      { id: 'ebible', name: 'eBible', href: 'https://ebible.org' },
    ],
  },
  {
    id: 'software',
    title: 'credits.section.software',
    items: [
      { id: 'fsrs', name: 'ts-fsrs (Open Spaced Repetition)', href: 'https://github.com/open-spaced-repetition/ts-fsrs' },
    ],
  },
  {
    id: 'ai',
    title: 'credits.section.ai',
    items: [
      { id: 'claude', name: 'Claude (Anthropic)', href: 'https://www.anthropic.com/claude' },
    ],
  },
];
