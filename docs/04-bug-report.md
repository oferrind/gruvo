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

## Round 3 (diff 2a70726..5c59022: redesign and Sound Fingerprint)

Fixed:
- **Loves outside the Blind Test didn't teach the taste model; unloving left the stored 'love' rating.** `like()` now upserts a `love` rating once the preview is fingerprinted (it skips the write if the track was unloved meanwhile, or if there is no preview). `unlike()` removes the love rating. Blind ratings use the same upsert (`teach()`), so the rating rows no longer duplicate. (71aca7e)
- **A slow MusicBrainz trail held up the pool.** `fill()` now runs one trail request on the side and keeps asking the other sources. (7446b78)
- **Undecodable candidates held pool slots forever** in warm mode, because `nextFromQueue` only ranks candidates that have a vector. Candidates whose fingerprint resolved to `null` are now dropped. (7446b78)

Verified live (SNAP, `bug3-run1.png`, `bug3-run2-light-persisted.png`):
- iTunes `.m4a` (AAC) preview from `audio-ssl.itunes.apple.com`: 1.16 MB, decodes to 30.0 s at 22050 Hz, and gives a 14-dim vector. A 404 Deezer URL and a non-allowlisted host both give `fp = null`, with no crash.
- Theme toggle: OS default → `light`, stored in localStorage, `aria-pressed=false`. After a relaunch with the same profile, it starts in `light`.
- `#reveal` is empty before rating. The sound reason is built only inside `rate()`.

Reviewed, no change needed:
- `api.audio`: https only, exact allowlist of CDN suffixes, `redirect: 'error'`, a 2 MB cap on both content-length and the streamed bytes, and a 15 s timeout.
- Store `ratings`: validated on load and on save.
- `OfflineAudioContext` has no `close()`. It and the decoded buffer are dropped after `extract`, and only the 14-number vector is kept.

Not done: no unit test for the fixes above. They are in `renderer/app.js`, which has no node harness. The warm-pool path (3+ ratings) was not exercised live.

## Round 4 (user reports)

1. **The reveal description did not match the song.** Root cause: the audio and the revealed artist/title were always the same track, but the *description* was not about that track. Two reasons. (a) The Random trip pick looks an MB artist name up on Deezer/iTunes with no title, and took the top-ranked row of any artist whose name matched, so a substring match or a different same-name artist won (live: Trinidad's soca band "Atlantik" was revealed as the German "Atlantik" with "Gezeitenkoenig" and the text "Random trip: Trinidad and Tobago, 2000s"). (b) The text named a song decade, but the MB query is on the artist's birth/formation year (decade-20 to decade+9) and the track is their top one from any year (live: Kate Havnevik's 2006 "Unlike Me" as "Norway, 1970s"; Anslem Douglas's "Who Let the Dogs Out" as "Trinidad and Tobago, 1960s"). Verified live with the SNAP hook on 8, then 5 more mysteries: the playing `audio.src` equalled the candidate's preview and the preview of `api.deezer.com/track/<id>` every time, so no stale `current`, pool swap or refetch mix-up. Fix: name-only picks prefer exact names and refuse a name shared by two artists (`soleArtist` in `src/music.js`); the trip text now says "an artist born or formed 1950–1979"; the sound reason only talks tempo when both tracks have clear onsets, never says faster/slower for half/double time, never "driving" for a quiet track, and never "darker" next to "bright top end". Tests: `name-only pick refuses an ambiguous artist`, `explain does not overclaim tempo or contradict itself`.
2. **Liner Notes search looked random.** Hits are sorted by the title named in the query, then the artist, then Deezer `rank`, and other versions of the same song are collapsed (`sortHits`, fixture test).
3. **Mystery number removed.** The card and the now-playing bar say "Mystery track".
4. **Status text named the data source.** Loading and progress lines read "Searching…" or "Searching… x of n"; errors, empty states and the neighbour reveal no longer name MusicBrainz or Deezer.

Not done: a same-name artist that only one service lists can still slip through (Deezer has no country to check against). The warm-pool sound reasons were checked by unit test, not live.
