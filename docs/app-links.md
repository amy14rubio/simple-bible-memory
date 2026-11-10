# Shared deck links that open the app

A shared deck link is `https://simple-bible-memory.web.app/d/<deck id>`. With the setup below, tapping it on a phone that has the app opens the
deck inside the app. Without the app it opens the web page (`public/deck-link.html`), with the store buttons.

The app side is already in the code: `src/lib/deepLink.ts` reads `/d/<id>` links and `src/platform/deepLinks.ts` opens the deck
(the same code handles the `simplebiblememory://discover/<id>` link used by the page's "Open in the app" button).

## iPhone and iPad (Universal Links)

Done in the repo:
- `public/.well-known/apple-app-site-association` (served as JSON by `firebase.json`) says app `UCZ2CMX8NG.app.simplebiblememory` opens `/d/*`.
- `ios/App/App/App.entitlements` has `com.apple.developer.associated-domains` = `applinks:simple-bible-memory.web.app`.

On your side:
1. Open the project in Xcode, target **App**, **Signing & Capabilities**. **Associated Domains** should be listed with
   `applinks:simple-bible-memory.web.app` (it comes from the entitlements file). With "Automatically manage signing", Xcode turns the capability on for
   the App ID (developer.apple.com, Identifiers, `app.simplebiblememory`, Associated Domains) when you build. If the build says the profile
   lacks the entitlement, tick Associated Domains on the App ID there and build again.
2. Deploy the website (`npx firebase deploy --only hosting --project simple-bible-memory`) so the file is online. Check
   `https://simple-bible-memory.web.app/.well-known/apple-app-site-association` shows the JSON (no redirect).
3. Install the new build (TestFlight or the App Store version) on an iPhone and tap a shared link **in Messages or Notes**. Universal Links do not
   fire when you type the address into Safari's address bar, or from a link on the same website: long-press the link and choose "Open in Simple Bible Memory".
   Apple caches the file for a while, so a first try right after a deploy can fail; delete and reinstall the app if needed.

## Android (App Links)

Done in the repo: `AndroidManifest.xml` has an `autoVerify` intent filter for `https://simple-bible-memory.web.app/d/…`.

Done: `public/.well-known/assetlinks.json` lists package `app.simplebiblememory` with the **app signing key** fingerprint from Play Console
(Setup, App signing). It is the key Google signs the app with, not the upload key (`~/keys/simple-bible-memory-upload.jks`), which is different.
A build you sign and install yourself (outside Play) will not be verified; install the version from Play.

On your side: deploy the website, install the build from Play, and check with
`adb shell pm get-app-links app.simplebiblememory` (the host should say `verified`). If you later add other signing keys (for example a debug build to test with),
add their SHA-256 to the same list.

## After both apps are released

In `public/deck-link.html` set `APP_LINKS_READY = true` so phones also see the "Open in the app" button (it uses the `simplebiblememory://` link, which
works for people who open the page from a browser), and update the test in `tests/share-deck.spec.ts`.

## Link previews in chat apps

`public/og-image.jpg` (made by `node scripts/make-og-image.mjs`) and the `og:` / `twitter:` tags in `deck-link.html`, `landing.html` and
`es/landing.html` give a link a picture, a title and a line of text. The page is one static file for every deck, so the preview says
"A Bible memory deck" and not the deck's own name; that would need a server to build each page.
