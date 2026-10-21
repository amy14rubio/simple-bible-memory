# Discover decks (ready to import)

Seven decks in two languages: **English, World English Bible (WEB)** and **Spanish, Reina-Valera 1909 (code `RV1909`)**. One
file per deck, each in the app's own import format. The English and Spanish decks have the same passages in the same order.

| # | English | Spanish | Cards |
|---|---|---|---|
| 1 | Anxiety & Peace | Ansiedad y paz | 9 |
| 2 | Faith & Trust in God | Fe y confianza en Dios | 12 |
| 3 | Family & Relationships | Familia y relaciones | 13 |
| 4 | Joy & Gratitude | Gozo y gratitud | 12 |
| 5 | Psalms | Salmos | 16 |
| 6 | Salvation & Gospel | Salvación y evangelio | 13 |
| 7 | Wisdom & Guidance | Sabiduría y dirección | 12 |

## To publish them

1. Sign in, then in the app: **Create (+) → Import deck**, and choose a file. Each file holds one deck.
2. Open the imported deck, **Deck actions → Publish**. The translation and language are already set, so publishing is allowed.

## Where the text comes from

Copied word for word from eBible's USFM files ([WEB](https://ebible.org/Scriptures/engwebp_usfm.zip),
[RV1909](https://ebible.org/Scriptures/spaRV1909_usfm.zip)). Only the markup (Strong's numbers, footnotes) was removed. Nothing is
translated, shortened or reworded.

Spanish only, three clean-ups (decided with the owner): Psalm titles that the source runs into verse 1 ("Salmo de David.") and the
Psalm 119 heading "NUN." are left out, as the English has none; and a verse's first word printed in small capitals
("LA blanda respuesta") is written in normal capitals ("La blanda respuesta"). "JAH" in Isaías 12:2 stays, as in the source.

References use a hyphen for ranges ("Filipenses 4:6-7"), like the rest of the app, and the app's Spanish book names ("Salmos").

## Rebuilding

`scripts/discover-decks/spec.json` lists the passages; `scripts/discover-decks/build.mjs` builds the files:

```
node scripts/discover-decks/build.mjs <WEB USFM folder> <RV1909 USFM folder> docs/discover-decks
```

It stops with an error if any verse is missing.
