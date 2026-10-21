# 04 - Bug report (Agent 4, round 1)

Branch: `worktree-agent-a249fc4cf87f2de0a`. `npm test`: 15 tests, all passing (was 9).

## Fixed (main process / src)

1. `src/net.js` - the host allowlist used `host in GAP`, so `https://constructor/` and other `Object.prototype` names got past it, and `get()` then threw in `slot()` instead of returning `{error}`. Now uses `Object.hasOwn`. (test/net.test.js)
2. `src/cache.js` - `prune` capped the entry count only and kept expired entries forever. 263 entries already made a 7.7 MB `cache.json`; 5000 could reach ~150 MB, re-serialized on every save. It now drops expired entries, then the oldest until the file is under 20 MB. On the real cache: 263 entries/7.7 MB went to 193 entries/6.8 MB. (test/music.test.js)
3. `src/net.js` - `fetch` had no timeout (undici waits 300 s), so a stalled server kept a tab on "Loading" for minutes. Requests now abort after 15 s and resolve to `{error}`. (test/net.test.js)
4. `src/store.js` - a `profile.json` that failed to parse loaded as defaults, and the next save overwrote the user's likes for good. It is now renamed to `profile.json.corrupt-<ts>`. Fields of the wrong type (e.g. `heard: null`, which crashed the renderer's `profile.heard.includes`) now fall back to the default per field. (test/store.test.js)
5. `src/net.js` - every response restarted the 2 s cache-save debounce, so steady traffic (Passport, Blind Test fill) postponed writing `cache.json` until traffic stopped. The timer is no longer restarted.
6. `main.js` - the app window could be navigated away (`location.href`, a dropped link or file) and `window.open` was allowed. A remote page loaded there would keep `window.api`/`window.store`. Added `will-navigate` preventDefault and a deny `setWindowOpenHandler`. Verified live with SNAP: before the fix the window showed example.com, after it stays on the app.

Checked and found correct: MB 503 backoff (2 s, then 4 s, 3 tries), Deezer HTTP-200 `{error}` bodies (never cached; code 4 waits 5 s and retries once), the preview 403 path (renderer retries once with `freshPreview(item, true)`, which bypasses the Deezer cache), `contextIsolation`/`sandbox`/no `nodeIntegration`, CSP in index.html, and the `api:call` name check (`Object.hasOwn(flows, name)`).

## Renderer bugs (for Agent 5)

- **R1 `renderer/app.js:129`** - the Blind Test "preview dead" callback does `profile.heard.push(norm(m.artist))` without the `includes` check used elsewhere (lines 58, 138). Repro: let a mystery's preview fail twice (for example, offline after it was queued); the same key can be stored twice. Fix: `if (!profile.heard.includes(k)) profile.heard.push(k)`.
- **R2 `renderer/app.js:57` and `:61`** - `like()` adds 1 to `stamps[cc-decade]`, but `unlike()` never subtracts. Repro: on a Passport track, press Love, unlove, Love again; the stamp count for that key is now 2 for one track. A stamp also survives unloving its only track. Fix: subtract (and delete at 0) in `unlike()` when the removed like has `country` and `decade`, or decide that stamps are permanent and stop counting.
- **R3 `renderer/app.js` `renderSaved`** - unloving a track on the Saved tab leaves its row in place (the button just flips to "☆ Love") until you leave the tab and come back. Fix: call `renderSaved()` from `unlike()` when `#saved` is visible.
- **R4 `renderer/app.js:58/105/138` (known limitation)** - `heard` stores normalized names, so two artists with the same name (for example the US and UK "Nirvana") are treated as one, and a name made only of symbols (such as "!!!") normalizes to `''` and collides with every other such name. Fix later: key heard on `artistDzId` or the MBID when present and fall back to the name only when there is no id.

## Suspected, not confirmed

- In-flight requests are not deduplicated. If two tabs ask for the same uncached MusicBrainz URL at once, both go through the 1.5 s queue. Also, Blind Test's background `fill()` shares the MusicBrainz queue with Liner Notes, so a credits lookup can wait behind a few explore queries (about 1.5 s each). I didn't measure this in practice.
- `api:get` (preload) lets the renderer request any path on the three allowed hosts. The renderer doesn't use it today, so it could be removed to shrink the IPC surface, but the spec lists it, so I left it in.
- `store.save` writes without fsync. On power loss a zero-length `profile.json` is possible. With fix 4 it is now moved aside rather than overwritten, but the likes would still be lost.

# Round 2 (review of Agent 5's renderer diff, 68b35e9..7570f40)

## Fixed

1. **R4, heard keyed on ids.** `src/music.js` has `isHeard(heard, {dz, mb, name})`. It matches `dz:<id>` / `mb:<id>` entries and falls back to the normalized name, and it's used by `pickRelated`, `trailPicks` (picks now carry `mbid`) and `exploreCandidate`. The renderer stores `dz:<artistDzId>` when it knows the id, otherwise the name. `store.load` migrates old name-only entries of loved Deezer artists to their `dz:` ids. Other name entries keep working as before. Tests: music + store.
2. **Saved focus loss.** After unloving a row, focus moves to the next row's Love button. If the list is now empty, it moves to the "Loved tracks" heading. Verified live.
3. **Stale Liner search.** A slow `searchTracks` response could overwrite a newer search, or a track the user had opened in the meantime. It's now guarded by `lnRun`.
4. **Lost stamp on re-love.** If you played a Saved track, unloved it, then pressed Love again in the now-playing bar, the track was saved without its country/decade and the Passport stamp was lost. Saved rows now pass `extra`.

## Checked, no bug found

- Listener leaks: rows use `onclick` properties, and the global listeners are attached once.
- Shortcuts while typing: `#country-q` and `#liner-q` are inputs and are ignored.
- localStorage: both accesses are in try/catch.
- Autoplay: only fires when Blind is visible.
- Passport and covers runs are guarded.
- Stamp count goes back down on unlove (verified live).

## Suspected, not confirmed

- When the user switches back to the Credits sub-tab while covers are still loading, `loadCovers` keeps writing the "Finding cover previews" status line.
- In the SNAP run, `capturePage` sometimes returns a frame from before the `SNAP_JS` actions. The console log showed the state after the actions. Screenshots taken with the hook are therefore not proof of the final state.
- Not covered by the `isHeard` shortcut: a `dz:`-keyed artist isn't recognised when that same artist comes back only through an iTunes fallback, or as an MB trail name.
