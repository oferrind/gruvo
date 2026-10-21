# 02 - Evaluation (Agent 2: Feasibility & Effectiveness)

Method: doubt-driven. Every idea's key assumption was attacked with a live call
(2026-10-21, from this machine). Scores: **Ease** = how easy it is to build well with free,
key-less APIs (5 = trivial). **Disc** = how likely it is to surface *new* music the user
likes (5 = best). Build size: S/M/L.

## 1. Scores

| # | Idea | Ease | Disc | Size | Verdict / deciding evidence |
|---|------|-----:|-----:|:----:|-----------------------------|
| 1 | Blind Taste Test | 4 | 4 | M | **APPROVED (A)**. Previews play; works with zero setup |
| 2 | Liner Notes Trail | 3 | 4 | M | **APPROVED (C)**. Creep has 21 credits; producer -> 50 artists in 1 call. Obscure tracks have 0 |
| 3 | Sonic Passport | 3 | 5 | M | **APPROVED (B)**. MB artist-by-country+era is rich; ~80% resolve to a preview |
| 4 | Bridge Journey | 2 | 3 | L | Reject. Deezer related lists are popularity hubs; BFS hits the quota |
| 5 | Taste Distance Dial | 4 | 3 | S | **Folded into A** as the "Adventure" slider |
| 6 | Cover Versions Roulette | 4 | 3 | S | **Folded into C** as a Covers tab. 261 covers of Creep, ~40% playable |
| 7 | Sample Detective | 3 | 2 | M | Reject. "samples material" rels are sparse (Creep: 1) |
| 8 | Influence Chain | 3 | 1 | M | Reject. Wikidata P737: Radiohead 1, Fela 2, Hailu Mergia 0, Khruangbin 0 |
| 9 | Label Dive | 3 | 3 | M | Later. Feasible via MB label browse, but overlaps C |
| 10 | Daily Quest | 3 | 3 | M | Later. Needs BPM (unreliable); could reuse B's engine |
| 11 | Weather Window | 4 | 2 | S | Reject. No audio features: the mood mapping is guesswork |
| 12 | Sunrise Chase | 3 | 3 | M | Later. Radio Browser works (Lagos stations, MP3) but you can't save tracks |
| 13 | Bracket Showdown | 4 | 3 | M | Later. Fun, but it's mostly a UI skin over A |
| 14 | Scene Sketch | 3 | 2 | M | Reject. Keyword-to-tag table without audio features gives weak results |

## 2. API evidence (live calls)

**Deezer** (`api.deezer.com`, no key)
- `/search?q=radiohead` OK. Track objects carry `id, title, isrc, duration, rank, preview,
  artist{id,name}, album{id,title,cover_medium}`. **No `release_date` or `bpm` in search results.**
- `/track/3135556` (Harder Better...) gives `bpm: 0`. Radiohead top 8 tracks: 3 of 8 have `bpm: 0`.
  **Never depend on BPM.**
- `/artist/399/related` returns exactly 20 artists with `nb_fan` (Muse 5.0M ... The Smile 44k).
  For obscure artists it is excellent: Hailu Mergia gives Mulatu Astatke, Getatchew Mekurya, Girma Beyene...
- **Preview URLs are signed and expire about 15 min after the API call** (`hdnea=exp=now+900`).
  A HEAD or GET of a fresh URL returns 200 `audio/mpeg`, ~480 KB. A URL with the token stripped, or
  an expired one, returns **403**. Never persist preview URLs.
- **Advanced search is broken**: `q=artist:"radiohead"` returns `total:0`. `bpm_min:120` is
  treated as plain text. Use plain `q=artist title` only.
- `/search/artist?q=fela kuti`: **the top hit is a 24-fan duplicate**; the real one (id 9440) has 205k fans.
  Pick the result with the highest `nb_fan` among exact name matches.
- **Quota**: a burst of 70 calls returns many `{"error":{"type":"Exception","message":"Quota limit
  exceeded","code":4}}` **with HTTP 200**. Unknown id returns `{"error":{...,"code":800}}`. Always
  check `body.error`.
- `/genre/{id}/artists` is **geo-localized**: "African Music" returned Israeli pop for this IP.
  Don't use it as a seed.
- **No `Access-Control-Allow-Origin` header**, so fetches must run in the main process.

**iTunes Search** (`itunes.apple.com/search?entity=song`): Fela and Hailu Mergia both covered.
Results carry `primaryGenreName`, `releaseDate`, and a stable `previewUrl` (.m4a, ~980 KB, plays).
CORS is `*`. Apple's documented limit is ~20 calls/min, so use it only as a fallback.

**MusicBrainz** (`/ws/2`, UA header, `fmt=json`)
- Deezer `isrc` maps to MB: `isrc/GBAYE9200070` returns 2 "Creep" recordings. One has 21 rels
  (producer, engineer, mix, instrument+attributes, vocal) and the other has 0. **Pick the recording
  with the most rels.**
- `artist/{mbid}?inc=recording-rels+artist-credits`: Paul Q. Kolderie has 780 rels across
  **50 distinct artists** (Pixies, Hole, Morphine, Dinosaur Jr., Lush...) **in one call**.
  Without `+artist-credits`, the related recordings have no artist names.
- Obscure case: Hailu Mergia "Tezeta" exists (2 recordings) but has **0 credits**.
- `work/{id}?inc=recording-rels+artist-credits` for Creep: 415 performances, of which 261 are
  `attributes:["cover"]`. Strict Deezer match for 15 random covers: **6/15 playable**.
- `artist?query=country:NG AND begin:[1940 TO 1965]` returns 46 artists (Tony Allen, King Sunny Adé,
  William Onyeabor...). `country:JP AND begin:[1975 TO 1985] AND type:group` returns 535
  (YMO, Casiopea...). `release?query=country:NG AND date:[1972 TO 1978]` returns 196, but a
  release country is the *pressing* country (KISS appeared in JP 1983), so prefer the artist query.
- Preview hit rate for 12 Nigerian/Ethiopian/Japanese 70s-80s artists: **Deezer 10/12, iTunes 9/12**.
  A loose first-word match produced a false positive ("Seifu Yohannes" matched "Misread"), so matching
  must be strict.
- At ~1.1 s spacing, some calls returned an error body. Use **1.5 s spacing plus retry on 503**.

**Wikidata P737** is too sparse (see #8). **Radio Browser** works (`/json/stations/bycountrycodeexact/NG`).

## 3. Approved features

### Shared helper: `resolvePreview(artistName, title?)` returns `{source, id, title, artist, cover, previewUrl} | null`
1. `norm(s)` = NFKD, lowercase, keep only letters and digits. An artist matches when the `norm` values are
   equal, or one contains the other and both are 5 or more chars.
2. Deezer `/search?q=<artist> <title>&limit=10`: keep rows where the artist matches and `preview` is set.
   Prefer a row whose `norm(title)` contains `norm(title)`, else the highest `rank`.
3. If there are none: iTunes `search?entity=song&limit=10&term=<artist> <title>` with the same filter
   on `artistName` and `previewUrl`.
4. Otherwise return null and let the caller skip the candidate.
**Playback:** one `<audio>`. On `error` for a Deezer item, refetch `/track/{id}` (bypassing the
cache) and retry once. If that fails, try the iTunes fallback, then skip with the toast "Preview unavailable".

### A. Blind Taste Test + Adventure slider (zero setup, default home screen)
- **Candidate sources:**
  - *Explore*: pick a random country (from a bundled list of ~40 ISO codes spanning all continents)
    and a random decade (1950-2010). Run B's artist query with `offset` random 0-20, take one random
    artist, then `resolvePreview(name)`. Its reason reads: "Random trip: Nigeria, 1970s".
  - *Neighbour* (only once there are 3 or more loves): take a random loved artist's Deezer id, call
    `/artist/{id}/related`, keep artists with `nb_fan < fanCap` that are not in `heard`, take a random
    one, call `/artist/{id}/top?limit=5`, and play a random track with a preview. Its reason reads:
    "Near <loved artist>".
- **Adventure slider** (0-100, default 50, persisted): P(explore) = adventure/100.
  `fanCap = 1,000,000 * (1 - adventure/100) + 20,000`. At 70 or above, take a second related hop.
- **Loop:**
  1. Keep 3 prefetched candidates.
  2. The card shows "Mystery #n", a play button and a progress bar. Autoplay on load.
  3. The user rates with Skip / OK / Love (keys 1/2/3).
  4. Reveal cover, artist, title, the reason, and a "Save" star.
  5. Love adds the track to `likes`; every rated artist goes into `heard`.
- **Edge cases:**
  - A candidate without a preview is dropped silently.
  - After 5 consecutive failures, show "Can't reach music services" with Retry.
  - Never repeat an artist in `heard`.
- **Acceptance:**
  - With an empty profile, the first mystery plays within 10 s.
  - Artist and title are **not in the DOM** before rating, so screen readers can't leak them.
  - 30 rounds produce no repeated artist.
  - After 3 loves, about half the picks show "Near ..." at adventure 50.
  - Keyboard alone completes a round.

### B. Sonic Passport (zero setup)
- **UI:** a country picker (bundled list of ~60 countries grouped by continent, with search) plus
  decade buttons 1940s-2010s. `shortcut: list instead of map, upgrade to an SVG world map later`.
  - A results list renders progressively.
  - A stamp shows on each liked country-decade, and a "Passport" panel counts the stamps.
- **Algorithm:**
  1. Call `artist?query=country:<CC> AND begin:[<D-20> TO <D+9>]&limit=100`.
  2. If it returns fewer than 5 artists, fall back to `release?query=country:<CC> AND date:[<D> TO <D+9>]
     AND status:official&limit=100` and use the artist-credit names.
  3. Dedupe the names and shuffle them.
  4. Run `resolvePreview` sequentially until there are 10 playable tracks or 30 attempts.
- **Rows:** cover, artist, track, play, Love. Love adds to `likes` with `{country, decade}` and stamps
  `<CC>-<D>`.
- **Edge cases:**
  - Zero MB results: "No recorded artists for <country> in the <decade>s yet. Try a neighbouring decade",
    with buttons for D-10 and D+10.
  - Fewer than 3 playable: show the MB artists that were found without previews, greyed out.
- **Acceptance:**
  - Nigeria 1970s shows 8 or more playable tracks within 45 s, with the first one in under 10 s.
  - Japan 1980s works.
  - The UI never freezes during the MB pacing.
  - Stamps persist across restarts.

### C. Liner Notes Trail + Covers tab
1. A search box calls Deezer `/search?q=` and lists 10 tracks (Enter/arrow keys). Picking a track
   gives `{title, artist, isrc}`.
2. Call MB `isrc/<isrc>`, then for up to 3 recordings call `recording/<id>?inc=artist-rels+work-rels+artist-credits`
   and keep the one with the most relations. If the ISRC returns 404 or nothing has rels, fall back to
   `recording?query=recording:"<title>" AND artist:"<artist>"&limit=5` and apply the same rule.
3. **Credits panel:** group by role (producer, engineer, mix, instrument with its attributes, vocal),
   plus composer/lyricist from `work/<id>?inc=artist-rels`. The track's own credited artists are listed last.
4. **Clicking a person:**
   - Call `artist/<mbid>?inc=recording-rels+artist-credits` and group by artist-credit name,
     excluding the original artist.
   - Shuffle, preferring artists not in `heard`, and take up to 12, one recording each.
   - Run `resolvePreview(artist, recordingTitle)` progressively.
   - Each row explains itself: "Paul Q. Kolderie, producer, for Hole". Clicking a row's track
     opens *its* credits, so the trail continues. Breadcrumbs let the user go back.
5. **Covers tab:**
   - From the work, call `work/<id>?inc=recording-rels+artist-credits` and keep only relations whose
     `attributes` include `cover`.
   - Take distinct artists, excluding the original, and shuffle them.
   - Run `resolvePreview(artist, workTitle)` and require a title match. Stop at 8 playable or
     25 attempts.
   - A "Spin" button plays a random cover.
- **Edge cases:**
  - No credits: "MusicBrainz has no credits for this recording yet", plus the Covers tab and a
    "Explore <artist's country> in Passport" link when the MB artist has a `country`.
  - Show a progress line ("Asking MusicBrainz... 3/5"), because each step costs about 1.5 s.
- **Acceptance:**
  - "Radiohead Creep" shows Paul Q. Kolderie and Sean Slade as producers.
  - Clicking Kolderie shows 8 or more playable tracks by other artists (Pixies, Hole...).
  - The Covers tab plays 5 or more covers.
  - "Hailu Mergia Tezeta" shows the no-credits state without errors.

## 4. Architecture and build order

- **main.js (main process) owns all network calls**, because Deezer sends no CORS header.
  - `ipcMain.handle('api:get', url)` with a host allowlist (`api.deezer.com`, `itunes.apple.com`,
    `musicbrainz.org`), using Electron's global `fetch`.
  - Per-host serial queues: MB 1 request per 1.5 s with header
    `User-Agent: MusicDiscovery/0.1 (you@example.com)`; Deezer up to 8/s; iTunes 1 per 3 s.
  - Retry: Deezer `error.code === 4` waits 5 s and retries once. MB 503 backs off 2 s, then 4 s
    (3 tries). Other errors resolve to `{error}`, never throw into the UI.
- **Cache:** `app.getPath('userData')/cache.json`, keyed by URL, `{t, body}`.
  - TTL: MB 30 days, iTunes 1 day, Deezer **10 min** (preview tokens last 15 min).
  - Load at start and write debounced. Cap at 5,000 entries; drop the oldest first.
- **Profile store:** `userData/profile.json` holds `{likes:[{dzId|itId, artist, artistDzId, title, cover,
  source, country?, decade?, ts}], heard:[artistKey], stamps:{}, adventure:50}`. Write it atomically
  (tmp file + rename). Likes store ids only; preview URLs are fetched again at play time.
- **Renderer:**
  - `contextIsolation: true` and a preload exposing `api.get`, `store.load` and `store.save`.
  - CSP: `media-src https://*.dzcdn.net https://*.apple.com`; `img-src https://*.dzcdn.net https://*.mzstatic.com`.
  - Tabs: Blind Test (default) | Passport | Liner Notes | Saved (list of likes, playable).
- **Build order:**
  1. Shell, `api:get`, queues, cache, store, player, and `resolvePreview` (M).
  2. Passport (M), the simplest end-to-end MB-to-preview chain.
  3. Blind Test (M), which reuses Passport's query as its Explore source.
  4. Liner Notes (M).
  5. Covers tab (S).
  6. Saved list (S).
