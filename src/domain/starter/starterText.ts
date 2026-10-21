/**
 * The verses of the starter deck every new person gets (see src/features/onboarding/starterDeck.ts): the "Salvation & Gospel"
 * passages from docs/discover-decks, in the World English Bible (English) and Reina-Valera 1909 (Spanish). Both are in the
 * public domain. The text is copied word for word from eBible. To change the passages, change scripts/discover-decks/spec.json,
 * rebuild the decks and copy the cards here. The deck's title and description are messages (starter.title, starter.description).
 */
export interface StarterVerse { reference: string; verseText: string }
export interface StarterText { translationCode: string; bibleLanguage: 'en' | 'es'; cards: StarterVerse[] }

export const STARTER_TEXT: Record<'en' | 'es', StarterText> = {
  en: {
    translationCode: 'WEB',
    bibleLanguage: 'en',
    cards: [
      { reference: "John 3:16-17", verseText: "For God so loved the world, that he gave his only born Son, that whoever believes in him should not perish, but have eternal life. For God didn’t send his Son into the world to judge the world, but that the world should be saved through him." },
      { reference: "Romans 3:23-24", verseText: "for all have sinned, and fall short of the glory of God; being justified freely by his grace through the redemption that is in Christ Jesus," },
      { reference: "Romans 5:8", verseText: "But God commends his own love toward us, in that while we were yet sinners, Christ died for us." },
      { reference: "Romans 6:23", verseText: "For the wages of sin is death, but the free gift of God is eternal life in Christ Jesus our Lord." },
      { reference: "Ephesians 2:8-10", verseText: "for by grace you have been saved through faith, and that not of yourselves; it is the gift of God, not of works, that no one would boast. For we are his workmanship, created in Christ Jesus for good works, which God prepared before that we would walk in them." },
      { reference: "Romans 10:9", verseText: "that if you will confess with your mouth that Jesus is Lord and believe in your heart that God raised him from the dead, you will be saved." },
      { reference: "John 14:6", verseText: "Jesus said to him, “I am the way, the truth, and the life. No one comes to the Father, except through me." },
      { reference: "Acts 4:12", verseText: "There is salvation in no one else, for there is no other name under heaven that is given among men, by which we must be saved!”" },
      { reference: "John 1:12", verseText: "But as many as received him, to them he gave the right to become God’s children, to those who believe in his name:" },
      { reference: "2 Corinthians 5:21", verseText: "For him who knew no sin he made to be sin on our behalf, so that in him we might become the righteousness of God." },
      { reference: "1 John 1:9", verseText: "If we confess our sins, he is faithful and righteous to forgive us the sins and to cleanse us from all unrighteousness." },
      { reference: "John 5:24", verseText: "“Most certainly I tell you, he who hears my word and believes him who sent me has eternal life, and doesn’t come into judgment, but has passed out of death into life." },
      { reference: "2 Corinthians 5:17", verseText: "Therefore if anyone is in Christ, he is a new creation. The old things have passed away. Behold, all things have become new." },
    ],
  },
  es: {
    translationCode: 'RV1909',
    bibleLanguage: 'es',
    cards: [
      { reference: "Juan 3:16-17", verseText: "Porque de tal manera amó Dios al mundo, que ha dado á su Hijo unigénito, para que todo aquel que en él cree, no se pierda, mas tenga vida eterna. Porque no envió Dios á su Hijo al mundo para que condene al mundo, mas para que el mundo sea salvo por él." },
      { reference: "Romanos 3:23-24", verseText: "Por cuanto todos pecaron, y están destituídos de la gloria de Dios; Siendo justificados gratuitamente por su gracia, por la redención que es en Cristo Jesús;" },
      { reference: "Romanos 5:8", verseText: "Mas Dios encarece su caridad para con nosotros, porque siendo aún pecadores, Cristo murió por nosotros." },
      { reference: "Romanos 6:23", verseText: "Porque la paga del pecado es muerte: mas la dádiva de Dios es vida eterna en Cristo Jesús Señor nuestro." },
      { reference: "Efesios 2:8-10", verseText: "Porque por gracia sois salvos por la fe; y esto no de vosotros, pues es don de Dios: No por obras, para que nadie se gloríe. Porque somos hechura suya, criados en Cristo Jesús para buenas obras, las cuales Dios preparó para que anduviésemos en ellas." },
      { reference: "Romanos 10:9", verseText: "Que si confesares con tu boca al Señor Jesús, y creyeres en tu corazón que Dios le levantó de los muertos, serás salvo." },
      { reference: "Juan 14:6", verseText: "Jesús le dice: Yo soy el camino, y la verdad, y la vida: nadie viene al Padre, sino por mí." },
      { reference: "Hechos 4:12", verseText: "Y en ningún otro hay salud; porque no hay otro nombre debajo del cielo, dado á los hombres, en que podamos ser salvos." },
      { reference: "Juan 1:12", verseText: "Mas á todos los que le recibieron, dióles potestad de ser hechos hijos de Dios, á los que creen en su nombre:" },
      { reference: "2 Corintios 5:21", verseText: "Al que no conoció pecado, hizo pecado por nosotros, para que nosotros fuésemos hechos justicia de Dios en él." },
      { reference: "1 Juan 1:9", verseText: "Si confesamos nuestros pecados, él es fiel y justo para que nos perdone nuestros pecados, y nos limpie de toda maldad." },
      { reference: "Juan 5:24", verseText: "De cierto, de cierto os digo: El que oye mi palabra, y cree al que me ha enviado, tiene vida eterna; y no vendrá á condenación, mas pasó de muerte á vida." },
      { reference: "2 Corintios 5:17", verseText: "De modo que si alguno está en Cristo, nueva criatura es: las cosas viejas pasaron; he aquí todas son hechas nuevas." },
    ],
  },
};
