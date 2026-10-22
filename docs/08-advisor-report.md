# 08 · Advisor report (Agent 8, final review)

Reviewed `main` at e53f6d9 on 2026-10-21. Everything below was observed live in the real Electron app (SNAP hook,
temp `--user-data-dir`, `--disable-backgrounding-occluded-windows`). App code was not changed.

## Verdict: **GO for personal use**

All four modes work end to end against the live services, and the warm Sound Fingerprint path works too (it had
never been run live before this review). Nothing found can lose data or crash the app. The open issues are about
**honesty of labels and messages** (wrong decades, offline shown as "no results"), not about crashes.
This is not ready for distribution: there is no installer or packaging, and it runs only with `npm start`.

## WORKS

| Feature | Evidence |
|---|---|
| Tests | `npm test`: 33/33 pass. `npm audit`: 0 vulnerabilities (Electron 45.0.0). |
| First launch | Empty profile → intro screen (`final-01-intro.png`). Mystery #1 is ready behind the intro after ~1.0 s. |
| Time to first sound | Click "Start" → audio `playing` event after **~2.0 s** (`final-02-blind-cold.png`). Meets the "about 2 s" goal. |
| Blind Test, no leak | Title shows "Mystery #N" only. Artist and title appear only after rating. Keys 1/2/3 and Enter work. |
| Warm mode (3+ ratings) | From rating 4 on, every pick logged `warm=true`, with a pool of 3-6 fingerprinted candidates and the picked track always fingerprinted. |
| Taste ranking reacts to Adventure | Same profile: at **0**, reasons read "Same deep low end and busy, percussive rhythm as …". At **100**, they read "A stretch from … : slower, calmer, keeping the quiet, intimate feel". Different picks, different wording. |
| Reveal reason | Sensible and specific, e.g. "The steady ~136 BPM pulse of 'Roots, Rock, Reggae' by Ladanybene 27, but more percussive; found via a random trip to Brazil, 2010s" (`final-04-warm-adv100.png`). |
| Passport | Brazil + 1970s gave 10 playable tracks in 3.5 s. Love → stamp count 3→4 (`final-06-passport.png`). |
| Liner Notes | "Portishead Glory Box": search 0.6 s, credits 7 s (producer, engineer, players, writers incl. Isaac Hayes sample), producer trail 20 s → 8/12 playable (Depeche Mode remix, UNKLE, Ride…) (`final-07-liner-trail.png`). |
| Covers | 8 playable covers (Cairn String Quartet, Beatsteaks, Olivia Colman, The Avener…). |
| Saved + stamps + theme | Saved lists loves newest first with stamps. The toggle switches to light (`data-theme=light`). The light theme looks finished (`final-10-saved-light.png`). |
| Offline, Blind Test | Dead proxy, empty cache → after 6 s, "Can't reach the music services… Try again". No hang (`final-08-offline.png`). |
| Electron hardening | `contextIsolation`, `sandbox`, no `nodeIntegration`. Preload exposes 6 invoke-only functions (no raw `ipcRenderer`). CSP meta tag. `will-navigate` blocked, `window.open` denied. `api:call` uses an `Object.hasOwn` allowlist. No `innerHTML` and no `openExternal`. |
| Profile isolation | `--user-data-dir` is honoured (`profile.json` and `cache.json` were written to the temp dir). The real profile was never touched. |

## DOESN'T WORK / RISKS (ranked)

1. **Passport decades are often wrong (High: it breaks the core promise "a place and a time").** Brazil 1970s returned
   *Warlord* (Antonio Pinto, the *Lord of War* score, 2005), Belo (2000s pagode), Jupiter Maçã (1990s) and a gospel "Drive In" track.
   The Blind Test had the same problem: Shaabaan Abdel Rahim as "Egypt 1960s", Sogand as "Iran 1990s", Snow "Informer" (1992) as "Canada 1980s".
   Cause: `passportArtists` (src/music.js:161) matches artists who *began* in `[d-20, d+9]`, and `resolvePreview`
   then plays the artist's *top Deezer hit*, from any year. Stamps are therefore collected under the wrong decade.
   *Fix:* use the release query (`date:[d TO d+9]`, already the fallback at :165) as the primary source and keep the
   release title, so `resolvePreview(artist, title, true)` asks for that exact song. Or use Deezer `release_date` to reject tracks outside the decade.
2. **Offline shows up as "nothing found" in Passport and Liner Notes (Medium).** Seen offline: "No songs found for 'Radiohead Creep'"
   and "No recorded artists for Japan, 1980s yet". The user is told the music doesn't exist.
   Cause: `searchTracks` and `passportArtists` turn `{error}` into `[]`, so the renderer's `!hits` error branch never runs.
   *Fix:* in those flows, `if (res.error) return null` (or throw), so the existing "Couldn't reach Deezer… Try again" UI shows.
   Add one test for each.
3. **Producer trails almost never feed the Blind Test (Medium: the claimed second source is mostly idle).** Across about 25 accepted
   candidates, 0 came from a producer trail. 1 was a Deezer neighbour; the rest were random trips. Cause: `trailCandidate` needs MusicBrainz
   credits for a *loved* track, and the obscure tracks the app surfaces rarely have credits, so it silently falls back to
   `exploreCandidate`. *Fix:* seed trails from loves that do have credits (cache "has credits" per like), or let
   Liner Notes loves (which have credits) seed the trail. Also log the source on the reveal, so the fallback is visible.
4. **Covers are slow (Low-Med).** 54 s to list 8 covers (one MusicBrainz call, then up to 25 Deezer lookups in sequence).
   *Fix:* resolve 4 at a time with `Promise.all` (Deezer isn't under the 1.5 s MusicBrainz limit), and show rows as they arrive (this already happens).
5. **Taste anchors are fragile with few ratings (Low).** At Adventure 0, reasons kept pointing at "The Boy Is Mine" by
   The Hit Crew, a karaoke-style cover act that a Deezer neighbour of Snow brought in. With 6 loves, the "nearest love" is coarse.
   Also, the first mystery after a relaunch is always unranked (pool `ready=0/1`). *Fix:* persist 2-3 fingerprinted
   candidates in the profile so warm mode starts warm. Down-weight "neighbour" picks from compilation and cover acts (`Hit Crew`, `Karaoke`, `Tribute`).
6. **Adventure helper text is cut off** by the now-playing bar at 1100×800 ("…until then every pick is a").
   *Fix:* add `padding-bottom` equal to the bar height on `main`.
7. **Housekeeping (Low).** `package-lock.json` has an uncommitted 4-line change. There's no packaging (electron-builder) for a
   double-click install. `api:get` is an unused IPC surface (any path on 3 hosts), so it should be removed.

## Discovery quality

**Novelty: strong.** In 17 Blind Test rounds, almost nothing was mainstream for an English-speaking listener: Boy Gé Mendès (Cape Verde),
Musique Terreur (Morocco), Örn Magnússon (Icelandic piano), Irina Mejoueva (Russian classical), Golden Hands
(Morocco), Ladánybene 27 (Hungarian reggae), Black Kirin (China), Agnes Buen Garnås was in the queue. The
anti-repeat (`heard`) held: no artist came back. Liner Notes is the best mode for *sensible* discovery: the
Portishead trail (UNKLE, Earthling, Sabres of Paradise remix) is exactly the "follow the people" idea working.

**Relevance: weak to moderate.** Warm mode ranks only ~6 *random-world* candidates. The sound match picks the least-bad of
six, not a good match from a large pool, so the results feel like an adventurous radio station more than a taste engine. The
explanations are honest about sound ("deep low end", "~136 BPM") but sometimes compare very different genres (a Russian piano
étude was explained as "a stretch from 'Informer' … keeping the busy, percussive rhythm"). Quality also varies: a
karaoke cover act and a Pakistani political campaign song came through. For a personal "surprise me" tool this is fine
and fun. Calling it a recommender would overstate it.

## Top 5 next steps

1. Fix Passport decade accuracy (risk 1): pick release-dated songs, not an artist's top hit.
2. Turn `{error}` into a real error in `searchTracks` and `passportArtists` (risk 2), with 2 unit tests.
3. Make producer trails actually contribute: seed them from credited loves and show the source mix (risk 3).
4. Enlarge and persist the warm pool (e.g. 12 candidates, keep fingerprinted leftovers across launches), so ranking
   has real choice and the first mystery after a relaunch is ranked too.
5. Parallelise cover lookups (risk 4), fix the clipped Adventure text, commit the lockfile, and add `electron-builder` for a
   one-click Windows install.

Screenshots (scratchpad, not committed): `final-01-intro`, `-02-blind-cold`, `-03/-05-warm-adv0`, `-04-warm-adv100`,
`-06-passport`, `-07-liner-trail`, `-08-offline`, `-09-offline-liner`, `-10-saved-light` (.png).

## Round 2 verification (after merging Agents 3 and 4)

I tested the merged app live with an empty temp profile (`--user-data-dir`), using 3 listed artists (Radiohead, Portishead,
Massive Attack), 2 genres (Rock, Alternative) and 8 rated mysteries.

1. **Reveal matches the audio: PASS.** In 8 of 8 mysteries (2 cold, 6 warm), the playing `audio.src` was the revealed
   track's preview, and the revealed artist and title matched. Passport trips now say "an artist born or formed 1950–1979"
   rather than claiming a song decade. "faster"/"slower" is suppressed when the tempo is half or double (features.js
   `octave` guard).
2. **Liner Notes search: PARTIAL.** "creep": Radiohead is first. "hallelujah": Jul, Jeff Buckley, Vianney (live),
   Pentatonix, Leonard Cohen. Deezer's rank favours a French rapper's song of the same name, so the expected
   versions are #2 and #5.
3. **No "Mystery #n": PASS.** Every text the page showed during the run was recorded, and none matched.
4. **No source names: FIXED.** The genre source (Agent 3) said "found via Deezer's Alternative artists". Agent 4's
   wording fix did not cover it. This is fixed in a separate commit, with an assertion in the prefs test. No
   "MusicBrainz" or "iTunes" was seen. "Deezer" now appears only on the full-song button.
5. **First-launch preferences: PASS.** The flow opens on an empty profile ("First, what do you already love?"). Early
   reasons reference the listed artists ("A stretch from Portishead…", "artists related to Portishead"), and the genre
   source fired by mystery 3. No listed artist was recommended. Note: mysteries 1 and 2 were still random trips
   (Finland, Venezuela), compared against the listed artists' sound.
6. **Full-song links: PASS.** They were absent before rating and present after it (YouTube, Spotify, Deezer). Through the
   real IPC, `shell:open` blocked `https://evil.com`, `http://www.youtube.com`, `javascript:`, `file:` and
   `www.youtube.com.evil.com`.

**Tests:** 41/41 pass. The trail test "producer of a loved track…" is **flaky** (about 7% of runs) on main and before the
merge. Its fake search returns artist = query, and `artistMatch` rejects names under 5 characters ("Hole", "Lush"),
which falls back to iTunes. The test is at fault, not the app: it should pin `rand` or use a realistic fake row.

Screenshots (scratchpad): `verify-01-prefs.png`, `verify-02-liner.png`.
