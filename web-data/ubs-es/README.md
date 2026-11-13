# Spanish word-study dictionaries (UBS)

These files are served from the website (`/ubs-es/greek.json`, later `/ubs-es/hebrew.json`) and are **not** part of the app's own code.

## License

**Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)** — https://creativecommons.org/licenses/by-sa/4.0/
These files are adapted material and are released under the same license. Anyone may copy and adapt them under that license, with the credit below.

## Credit

- *UBS Dictionary of the Greek New Testament* (Spanish), © United Bible Societies, 2023. Adapted from the *Semantic Dictionary of Biblical Greek* © United Bible Societies 2018-2023, which is adapted from *Greek-English Lexicon of the New Testament: Based on Semantic Domains*, eds. J. P. Louw and Eugene Albert Nida, © United Bible Societies 1988, 1989.
- Source: https://github.com/ubsicap/ubs-open-license (`dictionaries/greek/JSON/UBSGreekNTDic-v1.0-es.JSON`, commit `099f4dc`).
- United Bible Societies does not endorse this app or this adaptation.

## Changes made to the UBS data

Nothing is reworded. The definitions, glosses, comments and footnotes are the UBS's own Spanish text. Changes:

1. Only these parts of each entry are kept: the lemma, the Strong's numbers, and for each sense its glosses, short definition and comment, plus the entry's footnotes. Everything else (semantic domains, verse lists, links and so on) is left out.
2. Entries with no Strong's number are left out (110 of 5,507 in the Greek file). Entries with no definition or gloss are left out (2).
3. The UBS's markup is turned into plain text: `{L:word<…>}` (a link to another entry) becomes the word; `{S:…}` (an encoded verse) becomes a reference like "Jn 21:15" (several verses are separated by commas; the same verse is named once); `{D:93.32}` (a Louw-Nida domain number) becomes `93.32`; `{N:001}` (a footnote mark) becomes `[1]`.
4. An entry with two Strong's numbers appears under each. A word the UBS numbers with a letter (G0518a) is also reachable by the plain number (G0518) when that number has no entry of its own and there is only one lettered variant.
5. Senses that the UBS marks as AI-generated are not used (none in the Greek file).

Regenerate with `node scripts/make-ubs-lexicon.mjs greek`.
