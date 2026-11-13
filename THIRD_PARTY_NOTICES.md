# Third-party notices

Checked against each installed package's license metadata (2026-10-13). Bible texts are not bundled.

| Package | License | Shipped in the app? |
|---|---|---|
| react, react-dom, react-router-dom | MIT | yes |
| ts-fsrs (FSRS-6 scheduler) | MIT | yes |
| wa-sqlite (SQLite for the browser) | MIT (LICENSE file; its package.json omits the field) | yes |
| SQLite itself | public domain | yes, inside wa-sqlite |
| @fontsource-variable/literata (Literata font, used for scripture and titles) | SIL OFL 1.1 | yes. Keep the notice when distributing |
| @fontsource-variable/instrument-sans (Instrument Sans font, used for the interface) | SIL OFL 1.1 | yes. Keep the notice when distributing |
| lucide-react (icons) | ISC | yes |
| @base-ui/react (headless components, used by the create drawer) | MIT | yes |
| cn (class-name merging, used by shadcn components) | MIT | yes |
| recharts (charting, used for the card-counts pie chart) | MIT | yes, loaded only on the Statistics screen |
| shadcn/ui Drawer and Chart (source added to `src/components/shadcn/`, then restyled) | MIT | yes |
| shadcn skill (`.claude/skills/shadcn`, guidance for AI assistants) | see the shadcn/ui repository | no (development aid only) |
| tailwindcss | MIT | build-time CSS only |
| vite, vitest, typescript, oxlint, @vitejs/plugin-react, @types/* | MIT / Apache-2.0 | no (dev only) |
| @playwright/test | Apache-2.0 | no (dev only) |
| @axe-core/playwright | MPL-2.0 | no (dev only) |

Design: the original wireframes are the layout reference. The Minimal Design System skill (MIT) informed the first neutral palette as an idea only; no code was copied.

The FSRS algorithm comes from the open-spaced-repetition project (https://github.com/open-spaced-repetition). Bible Gateway is a separate service; we only link to it.

## Spanish word-study dictionaries (UBS)

The Spanish definitions in the word-study drawer come from the United Bible Societies' open data, **CC BY-SA 4.0**: *UBS Dictionary of the Greek New Testament* (Spanish), © United Bible Societies 2023, adapted from the *Semantic Dictionary of Biblical Greek* and from Louw and Nida's *Greek-English Lexicon of the New Testament: Based on Semantic Domains* (© United Bible Societies 1988, 1989). Source: https://github.com/ubsicap/ubs-open-license. The adapted files are in `web-data/ubs-es/` (with the credit and the list of changes in its README), are hosted by the website, are not bundled in the app, and are released under CC BY-SA 4.0 as well. English definitions come from the STEPBible Brief Lexicons (CC BY 4.0, Tyndale House) and the words from the Berean Interlinear Bible (public domain), both through the Free Use Bible API.

