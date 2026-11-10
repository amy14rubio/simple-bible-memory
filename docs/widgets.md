# Home-screen widgets (Android)

Four widgets, drawn by the phone (`android/app/src/main/java/app/simplebiblememory/widgets/`), in the app's own theme:

| Widget | Shows | Tap |
|---|---|---|
| Add card | a pill with a plus | Add card screen (`simplebiblememory://add`) |
| Due today | the decks with their due counts (decks with cards due first, as many as fit) | a deck (`://deck/<id>`), or the deck list |
| Statistics | verses memorized (big), and the card-stage pie when there is room | Statistics (`://stats`) |
| Verse preview | one verse of a chosen deck, a new one each day | that deck |

## How the data gets there

A widget cannot read the app's database (it lives in the web view), so the app hands it a **snapshot** (`src/features/widgets/`):
`useWidgetSync` collects it (`collect.ts`, `snapshot.ts`) when the app opens, when the theme or language changes and 1.5 seconds after anything
is saved, and `src/platform/widgets.ts` gives it to the `WidgetBridge` plugin, which keeps the JSON in SharedPreferences and redraws the widgets.
Until the app has been opened a widget draws sensible defaults. The snapshot can be out of date if the app has not been opened for a while
(due counts at midnight); the widgets just show what they were last given.

- **Theme:** the person's choice (light, dark, custom colours; "system" carries both palettes and follows the phone). The palettes are
  `src/lib/widgetTheme.ts`; tests keep them equal to `src/styles/tokens.css` and to the defaults in `WidgetData.java`.
- **Wording:** the app's own words in the person's language (`labels`), so the widgets are in the app's language, not only the phone's.

## Licensed Bible text is never shown on a widget

Licensed text (see `docs/youversion.md`) must come with its publisher's notice and link, which a widget has no room for. `previewVerses`
leaves such cards out; a deck with only licensed cards is listed (greyed, with the reason) in the Verse preview's setup screen. Ask
YouVersion before changing this.

## Trying it on a phone

A debug build installs as a separate app, `app.simplebiblememory.debug` ("Bible Memory (debug)"), so it never replaces the Play version.
Rebuild the web part first (`npm run build && npx cap sync android`), then `cd android && ./gradlew assembleDebug` and
`adb install -r -d app/build/outputs/apk/debug/app-debug.apk`. Add the widgets from the launcher's widget picker. A debug-only screen,
`app.simplebiblememory.debug/app.simplebiblememory.widgets.WidgetPreviewActivity`, draws all of them with the current snapshot.
