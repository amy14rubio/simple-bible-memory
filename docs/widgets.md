# Home-screen widgets (Android, iPhone and iPad)

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

Note for a new machine: the debug build has its own application id, so `android/app/google-services.json` (git-ignored, downloaded from the Firebase
console) must list a client for `app.simplebiblememory.debug` as well (copy the existing client entry and change its `package_name`), or the build stops
with "No matching client found for package name". Google sign-in does not work in the debug copy; the widgets do not need it.

## iPhone and iPad (WidgetKit)

The same four widgets, drawn by a WidgetKit extension, `ios/App/SBMWidgets/` (SwiftUI, iOS 17 and later; the app itself still runs on iOS 16.4, it just has no widgets there):

| File | Does |
|---|---|
| `Snapshot.swift` | reads the snapshot, the palette (light, dark, custom) and the wording; the same job as `WidgetData.java` |
| `Views.swift` | the four pictures (Add card, Due today, Statistics with the stage pie, Verse preview) in small, medium and large where they fit |
| `Widgets.swift` | the widget definitions and timelines; Verse preview lets you pick its deck (an App Intent), and a new verse each day |

The app gives the extension its data through an **App Group**, `group.app.simplebiblememory`: `ios/App/App/WidgetBridgePlugin.swift` (the iOS twin of the
Android plugin, registered in `MainViewController`) saves the snapshot JSON there and asks WidgetKit to redraw. The web side is the same code for both
(`src/platform/widgets.ts`). Taps use the same `simplebiblememory://` links as Android.

Things that differ from Android: no border ring (iOS draws its own rounded corner), a widget cannot be resized freely (it has fixed small, medium and
large sizes), and the Verse preview picks its deck in the widget's own "Edit Widget" sheet instead of a setup screen.

**On the Apple side** the extension is a second App ID, `app.simplebiblememory.widgets`, and the App Group has to exist on both App IDs. With
automatic signing Xcode registers them the first time you build for a device or archive with `-allowProvisioningUpdates`. The widget extension's
version and build number must equal the app's (`MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in both targets): bump them together.

## Known limits

- The first widgets on iPhone and iPad are in this build; Android's resizable layouts do not apply there.
- Due counts and statistics are as of the last time the app saved something: a widget cannot recompute them. The Verse preview changes by itself each
  day (the phone asks it to refresh hourly); the others wait for the app.
- If the phone's light or dark setting changes while "System" is chosen, a widget picks up the new colours the next time it is redrawn.

