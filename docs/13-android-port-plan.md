# 13 - Android port plan (Capacitor)

Status: decided, 2026-10-26. Replaces the native-Kotlin proposal. Author: Android Developer (board). Grounded in `main.js`, `preload.js`, `src/*.js`, `renderer/app.js`, `index.html`, `styles.css`. Nothing built or run yet.

## 1. Why Capacitor now

The screen stays on while Stumble is used, so the thing a WebView does badly (screen-off playback, lock-screen rating) is not needed. The phone app starts empty (no import) and Play is "maybe some day". Advisor's rule: without screen-off use, Capacitor wins.

| | Capacitor (chosen) | Native Kotlin (previous plan) |
|---|---|---|
| Effort to a shareable APK | **12-17 sessions** (~3-4 dev-weeks) | ~6 weeks, ~10 to Play |
| Codebases | One: phone and Electron share `renderer/` and `src/` | Two, plus golden-file drift tests |

**What we give up:** screen-off playback, lock-screen/notification Love and Skip, Bluetooth/car metadata, native-feel scrolling on long lists, some battery (WebView, JS decode). If screen-off use becomes a need, revisit; `src/` stays reusable.

## 2. Architecture

### 2.1 One `window.api`, two implementations

`renderer/app.js` talks only to three globals: `api` (get, audio, call, countries, open, tree, treeMore, onTreeNode, stamp, moreStamp, prefetchStamp, onStampRow), `spotify` (status, connect, disconnect, play, exportPlaylist) and `store` (load, save). Desktop gets them from `preload.js` over IPC. The phone gets the same surface from `mobile/api.js`, bundled into the WebView and calling `src/` directly.

To keep one source, the bodies of `main.js`'s `ipcMain.handle` blocks move into **`src/handlers.js`**: a platform-free `create({ get, audio, open, emit })` that keeps the input checks (`trackIn`, root check, `Tree.validSettings`, one tree at a time via `treeRun`). `main.js` becomes IPC wiring around it; `mobile/api.js` wires it to Capacitor, with `emit` calling the `onTreeNode`/`onStampRow` callbacks directly.

### 2.2 Module by module

| Module | Phone |
|---|---|
| `music.js`, `tree.js`, `stamps.js`, `countries.js`, `cache.js`, `links.js` | Bundled as-is: they take an injected `get`. `stamps.js` `require`s `renderer/stamp-data` and `genre-data`; the bundler resolves them. |
| `renderer/features.js`, `tint.js`, `genre-data.js`, `stamp-data.js` | Loaded by `<script>` as today. |
| `net.js` | **Seam.** Its only platform calls are `fetch` with a `User-Agent` (forbidden in a browser), `AbortSignal.timeout`, `for await` over a Node stream, `Buffer.concat` and `fs`. Pacing (`GAP`, `slot`), in-flight de-dup, MB 503 backoff (2/4/6/6/6 s), Deezer `code 4` retry and the allowlists stay shared; transport `http(url, opts)` and cache I/O are injected (Node `fetch` + `fs` on desktop, `CapacitorHttp` + `Filesystem` on the phone). |
| `store.js` | **Seam.** Pure `load(raw)`/`save(p)` (validators, R4 migration, corrupt-file handling) split from file I/O. A new install gets `DEFAULT()` and the existing first-launch intro. |
| `spotify.js` | **Not bundled.** It needs `crypto`, `http.createServer` (loopback login), `fs`, `Buffer`; the phone has no OAuth (section 5). |
| `main.js` extras | Zoom: dropped (viewport meta). `SNAP` hook: desktop-only. `will-navigate` guard: Capacitor blocks external navigation by default; keep `server.allowNavigation` empty. `before-quit` cache flush: on `App` `pause`. There is no single-instance lock to stub. |

### 2.3 Network

- **HTTP:** Deezer sends no CORS headers and a WebView `fetch` can't set `User-Agent`, so JSON goes through **`CapacitorHttp.request`** (native, in `@capacitor/core`), 15 s timeouts. Call it directly; don't enable the global fetch patch, so nothing bypasses the allowlist.
- **Phone allowlist:** `musicbrainz.org`, `api.deezer.com`, `en.wikipedia.org`, `www.wikidata.org`. No `itunes.apple.com`.
- **MusicBrainz:** same `slot()` code, 1.5 s gap, 6 tries. Screen-on use means WebView timers aren't throttled. Carrier NAT shares IPs, so expect more 503s; the backoff and progress text cover it.
- **User-Agent:** `net.js` builds it from a committed `stumble.config.json` (`{ "contact": "https://<project page or alias>" }`) as `Stumble/<version> ( <contact> )`, replacing the hard-coded personal email. Desktop reads the same file.

### 2.4 Storage

- **Response cache:** one `cache.json` in `Directory.Data`, same `prune()` with a phone cap `prune(cache, 2000, 5e6)` so the cold-start parse stays short. IndexedDB only if profiling says so.
- **Profile:** `profile.json` via `@capacitor/filesystem`, tmp + rename, same format.
- **Audio:** memory only (2.5).

### 2.5 Previews and the Sound Fingerprint

Phone `api.audio(url)`: `CapacitorHttp.request({ responseType: 'arraybuffer', disableRedirects: true })`, `*.dzcdn.net` only, base64 decoded to an `ArrayBuffer`, rejected over 2 MB, kept in an in-memory LRU of 8 (~8 MB). `fingerprint()` in `app.js` is unchanged (Web Audio `decodeAudioData`, middle 20 s, `Features.extract`).

**Playback uses the same bytes:** `play()` sets `audio.src = URL.createObjectURL(new Blob([buf]))` and revokes the previous one. A plain `https` `src` would let the WebView's media stack write the preview into Chromium's disk cache, breaking "never on disk"; it also halves downloads (desktop fetches twice). A 3-line branch behind `api.caps.blobAudio`; the CSP gains `media-src blob:`.

## 3. Build setup

```
renderer/              shared UI source
src/                   shared logic (+ handlers.js; net/store seams)
mobile/api.js          Capacitor implementation of api/store
mobile/www/            build output, gitignored
android/               from `npx cap add android`, committed
capacitor.config.json  webDir "mobile/www", no server.url
stumble.config.json    User-Agent contact
```

- **esbuild** bundles `mobile/api.js` only (one devDependency, no config, browser platform, so a stray `fs`/`http` import fails the build). The renderer keeps plain `<script>` tags.
- **`scripts/build-mobile.js`** (~30 lines): copy `renderer/` to `mobile/www/`, bundle `api.js`, and in the copied `index.html` only, add `<script src="api.js">` before `app.js`, the viewport meta and `media-src blob:`.
- **Scripts:** `start` and `test` unchanged; add `mobile:build` (`build-mobile.js && npx cap sync android`) and `mobile:apk` (`mobile:build`, then `gradlew assembleDebug` in `android/`).
- **Desktop unaffected:** Electron never loads `mobile/` or `android/`. Shared edits are the `main.js`/`net.js`/`store.js` seams (covered by existing tests) and the section 4 CSS, which also improves a narrow desktop window.
- **Tests:** all 141 stay on `node --test`. Add `handlers.test.js` (IPC checks, now testable without Electron); net tests with a fake `http` and clock (1.5 s gap, backoff, iTunes refused on the phone list); `mobile-bundle.test.js` (bundle builds, no `fs`/`http`/`crypto`, no `itunes.apple.com`, no `oferrind`).

## 4. Mobile layout (doc 15 on the web stack)

Doc 15 stays the UI source. The work is CSS in `styles.css` plus small DOM changes, under the existing **`max-width: 640px`** breakpoint. Add `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` and `env(safe-area-inset-*)` padding.

| Part | Work |
|---|---|
| Tabs | `#tabs` becomes a fixed bottom bar (Blind, Crate, Tree, Saved); selected = Big Shoulders 700 + accent underline. Preferences becomes a top-bar gear. Home's "last on the platter" becomes the now-bar idle state; Recent becomes a Saved segment. |
| Now bar | The existing `<footer>`, 64px, above the tab bar; "Mystery track" + vinyl label while unrated. |
| Blind Test | Record ≥ 200px; rate buttons 56px, a third of the width each; Adventure inline; reveals collapse into a strip. |
| Crate Dig | Rows: play, title, ♥, ⋯ (Skip/OK move into the ⋯ sheet). Pick one keeps the sentence: decade and place use native `<select>`, genre opens a sheet with the Browse search. Family headers `position: sticky`; rows `content-visibility: auto` for 1,142 genres. |
| Family Tree | The existing narrow layout; labels always visible; Grow settings in a sheet. |
| Saved / Preferences | Loved/Recent segments, ⋯ Remove + undo toast (swipe later). One-scroll Preferences, 2-column scheme grid, Spotify section hidden. |
| Sheets | One `<dialog>` bottom-sheet helper (6px corners, `showModal`) for ⋯ menus, Pick one slots and Grow settings. Desktop keeps the ⋯ popover. |
| Touch | Hit areas ≥ 48px, rows 64px; hover cues behind `@media (hover: hover)`, tooltips become a first-time hint line. |
| Back | `App.addListener('backButton')`: close a sheet, else previous tab, else exit. |

**What changes from doc 15:**
- **Dropped:** Material 3, its role mapping and `Schemes.kt` (the CSS tokens are the scheme); `WindowSizeClass` (CSS breakpoints at 600/840px); the `LazyColumn` tree-line fix (the DOM measures every card, so `drawLines` works); section 4's notification, lock screen and mystery artwork; risk 1 and `FLAG_SECURE` (no MediaSession, and the recents thumbnail only shows the unrated "Mystery" screen).
- **Simplified:** predictive back becomes the `backButton` listener; haptics via `@capacitor/haptics`, deferred; grain/paper textures and duotone stay CSS.
- **Kept:** navigation model, screen sketches, 48/56/64px sizes, no swipe-to-rate, the Pick one sentence, existing ARIA labels and live regions, 200% text test, reduced motion.

## 5. Phone-build feature flags

Each implementation sets `api.caps`; desktop `preload.js` sets all `true`.

| Flag | Phone | Effect |
|---|---|---|
| `itunes` | `false` | Not in the allowlist. Four call sites in `music.js` (`resolvePreview`, `freshPreview` lookup + search, `searchTracks`' `Promise.all`) and one in `stamps.js` must degrade to Deezer-only; M1 tests them with iTunes returning `{error}`. |
| `spotifyLogin` | `false` | No `window.spotify`; Spotify Preferences and "Export to Spotify" hidden. "Open in Spotify" is the existing `https://open.spotify.com/search/<q>` link through the `links.js` allowlist and `@capacitor/app-launcher` (opens the Spotify app if installed). No tokens on the phone, so nothing for the Keystore. |
| `blobAudio` | `true` | 2.5 |

**Attribution (both platforms, unflagged):** a "Data sources" block in Preferences. Deezer (logo per their guidelines). MusicBrainz: core CC0, tags CC BY-NC-SA 3.0, "the genre atlas is derived from MusicBrainz tags, CC BY-NC-SA 3.0". Wikidata CC0. Wikipedia summaries CC BY-SA 4.0 (the "Wikipedia" link beside each summary stays). Big Shoulders Display (OFL). **No revenue anywhere:** no ads, IAP or donation links. These defaults make the build sent to people Store-safe per doc 14.

## 6. Milestones

A session is one focused agent block (~2-3 h plus your review), in a git worktree, tests green before merge.

| # | Milestone | Sessions | Acceptance | Who |
|---|---|---|---|---|
| M0 | Capacitor shell | 1-2 | Config, `android/`, `build-mobile.js`. Debug APK installs over USB and shows the existing UI (network may fail). `npm start`/`npm test` unchanged. | Builder (sonnet); Android Developer (opus) on call for SDK/Gradle |
| M1 | Shared handlers + phone api | 3-4 | `src/handlers.js` extracted, desktop identical (tests + user smoke test). `net`/`store` seams; `mobile/api.js`. On the phone: Blind Test plays and fingerprints, Crate Dig rolls, Tree grows, profile survives force-stop, MB calls ≥ 1.5 s apart, iTunes-error test passes, phone vs desktop vector on one preview within 0.02. | Android Developer (opus): net, audio, blob, fingerprint. Builder (sonnet): extraction, tests |
| M2 | Store-safe flags | 1-2 | `api.caps`, Spotify hidden, Open in Spotify, attribution, UA from config, bundle test passes. `adb shell run-as <appId> find .` shows no audio and no `dzcdn` cache entries. | Builder (sonnet) |
| M3 | Mobile layout | 4-6 | Section 4 at 360px: bottom bar, sheets, 48px targets, back button, no horizontal scroll. Desktop unchanged at 1100px; `contrast.test.js` passes. | Designer (opus) designs/reviews; Builder (sonnet) implements |
| M4 | Device bug hunt | 2 | 30-min Blind Test with no stalls; 30-node Tree on mobile data; airplane-mode messages; rotation keeps state. | Bug Hunter (sonnet) |
| M5 | Shareable APK + review | 1 | Release keystore kept outside the repo; signed APK installs on a second phone and updates over itself. Sign-off. | Builder (sonnet); Advisor (opus) |

**Total 12-17 sessions.** Play is not scheduled; when wanted: privacy policy, Data safety ("no data collected"), 12 testers for 14 days, neutral name/icon, and a MusicBrainz caching proxy before ~1k users (doc 14).

**M5 release build (code side done):**
- **Keystore (once, outside the repo):** `keytool -genkeypair -v -keystore %USERPROFILE%\stumble-keys\stumble-release.jks -alias stumble -keyalg RSA -keysize 4096 -validity 10000`. Back it up: lose it and no update can ever install over existing copies.
- **`android/keystore.properties`** (gitignored; template `keystore.properties.example`): `storeFile` (forward slashes), `storePassword`, `keyAlias`, `keyPassword`. Without it any release task fails with a clear message; debug builds are unaffected.
- **Build:** `npm run mobile:release` writes the signed APK to `android/app/build/outputs/apk/release/app-release.apk` and the Play bundle to `android/app/build/outputs/bundle/release/app-release.aab`.
- **Hardening:** `allowBackup=false`, cleartext off, WebView debugging off in release (Capacitor defaults it to the debuggable flag), R8/minify off (Capacitor plugins use reflection; turn on only after an on-device test). Permissions: `INTERNET` only (keep-awake needs none).
- **Updates:** keep the same keystore and raise `versionCode` (integer, +1 per release) in `android/app/build.gradle`; bump `versionName` (currently 0.1.0) to match. Android refuses an update with a lower versionCode or a different key.
- **Cache privacy:** `src/net.js` never writes Deezer `preview` URLs to the cache file, and drops Deezer entries at load so nothing serves audio-less rows. Stored/saved tracks refetch through `freshPreview` by Deezer id.

**Installing a debug APK (Windows 11, low RAM):**
- **No emulator:** it needs 2-4 GB on top of Android Studio (2-3 GB) and the Gradle daemon (1-2 GB).
- Open Android Studio once to install the SDK and JDK, then close it and build from the terminal. Set `org.gradle.jvmargs=-Xmx1536m` in `android/gradle.properties`.
- **Real phone over USB:** turn on Developer options > USB debugging, plug in, accept the prompt; `npm run mobile:apk`; `adb install -r android\app\build\outputs\apk\debug\app-debug.apk`.
- **Debug:** `chrome://inspect` in desktop Chrome gives full devtools on the phone's WebView.
- **Other people:** send the M5 signed APK; they allow "install unknown apps" for their browser or file manager and tap it.

## 7. Risks and on-device tests

| Risk | Test / mitigation |
|---|---|
| Screen times out mid-preview, WebView pauses | Test at the default timeout; if it bites, `@capacitor-community/keep-awake` while playing. |
| Preview bytes reach disk via the WebView cache | Blob playback (2.5); the M2 `run-as` check. |
| `decodeAudioData` differs on some WebViews | M1 vector check; failure already returns `null`. |
| Base64 of 1-2 MB previews costs memory | Pool of 6, LRU of 8; profile on a mid-range phone in M4. |
| MB 503 storms behind carrier NAT | Existing backoff; Tree on mobile data in M4. |
| Edge-to-edge (targetSdk 35+) | `viewport-fit=cover` + `env()` insets; verify in M3. |
| Desktop regressions from the refactor | `node --test` plus your desktop smoke test after M1 and M3. |
| Deezer judges in-memory analysis as "storage" | Doc 14: email Deezer before any Play release. |

## 8. Open questions

1. **User-Agent contact** (also for a future privacy policy): a project page URL or an email alias? Needed in M2, before the build goes to anyone else.
2. **Keep the screen awake while playing?** If yes, add keep-awake in M3 rather than waiting for M4 to find it.
3. **Should desktop also drop iTunes and switch its User-Agent now**, so both builds behave alike? No extra cost, but desktop results change slightly.
