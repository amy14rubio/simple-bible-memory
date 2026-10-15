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
