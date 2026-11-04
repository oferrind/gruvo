# 19 - Mood Shelf ("Vibe Searcher")

Strategist, 2026-11-04. The user asked for a long list of "vibes" (coffee shop, rainy window…). Picking one gives 20 songs that fit the vibe **and** the user's taste: loved artists, liked genres and Blind Test ratings. The APIs below were checked live today. The probe scripts are in the session scratchpad (`vibes/probe.js`, `verify.js`, `pool.js`).

## 1. Name

**Mood Shelf** (tab label "Mood Shelf", phone label "Moods"). Real record shops have mood and staff-pick shelves, and the name sits well next to Crate Dig and Family Tree. Each result is "a Coffee shop pull". "Mixtape" fit too, but it is already a colour scheme (`SCHEMES` in src/store.js).

## 2. Where vibe → songs comes from (live checks)

| Source | What I saw | Verdict |
|---|---|---|
| **Deezer playlist search** `GET /search/playlist?q=<words>&limit=25`, then `GET /playlist/{id}/tracks?limit=100` | Every query returns about 150 playlists. Deezer's **own editors' playlists** are easy to spot: `user.name` matches `/deezer.*editor\|^deezer /i` ("Georges - Deezer Folk Editor", "Rudy - Deezer Moods Editor", "Deezer Moods Brasil"). They are clean, with real artists and no filler. "coffee shop" gives Soul Coffee (Stevie Wonder, Norah Jones, Anderson .Paak), The Indie Café and Cozy Coffeeshop (Laura Marling, boygenius). User playlists are hit and miss. Many are stuffed with library music ("Tribute Corner": 48 tracks by 5 artists, "Music Brokers", "Lofi Universe", "JazzBeats"). | **Use it, editorial playlists only.** |
| Deezer track search `/search?q=coffee shop` | Matches song **titles**: "La Plaie - Coffee shop", "Red Hot Chili Peppers - Coffee Shop". "melancholic" returns 10 songs called "Melancholic". | Junk. Don't use it. |
| MusicBrainz recording `tag:chill` / `tag:melancholic` / `tag:relaxing` | 2733 / 227 / 61 hits, mostly obscure artists and remixes ("Absolute Kaputtilation" ×5). Costs 1.5 s per request, and Deezer previews would still have to be resolved one by one. | Not a source. MB **artist** tags stay as the taste signal (§3). |
| Last.fm tags | Needs an API key that the user would have to enter. | Out of scope for v1. |

Facts measured on editorial playlist tracks:
- **Preview coverage** is 60-99%. Tracks with `readable:false` have `preview:""` (region locks). Keep `readable && preview`.
- **Pool per vibe**, using up to 4 editorial playlists: **117-311 playable tracks from 105-249 artists**. That is enough for 20, plus "More" pages.
- **Editor genre for free.** The editor's name carries the shelf: Folk, Alternative, Soul & Funk, Jazz & Blues, Rock, Pop, Dance & EDM, Electronic, Rap, R&B, Classical, Latin, Reggae, Metal, Soundtracks. "Moods" means mixed genres. This gives a per-playlist genre signal with no extra calls.
- **Noise to filter by playlist title:** `^100% ` (single-artist "Deezer Artist Editor" lists), `setlist`, `tour`, holiday lists (`christmas|xmas|noël|navidad|weihnacht|\bjul\b|halloween`), `disney`, `karaoke`, `kids`.
- **Related artists:** `/artist/{id}/related` returns 20 artists for most acts and **0 for some** (for example, id 382073 "Norah Jones(Karaoke)"). Never assume it is non-empty.
- **Overlap with a sample taste** (Radiohead, Khruangbin, Fleetwood Mac, Portishead, Bon Iver): "rainy day" pool has 5 loved-artist tracks and 22 related-artist tracks out of 223. "study" has 0 and 2 out of 392. So related artists alone personalise too little, and the genre and tag signals carry most of the weight.

## 3. Personalisation: scoring

Every input already exists in the renderer. Nothing new goes in the profile.

- **L, loved artists.** `profile.likes[].artistDzId` plus `prefs.artists[].dzId`, and normalised names for rows that have no id.
- **N, neighbours.** `{artistId: k}`, where k is the number of loved artists whose `/related` lists that artist. Built from the 15 most recent distinct loved ids, once per session, in memory, shared by all vibes.
- **G, genre weight per editor genre, 0..1.** 1.0 if the genre is in `prefs.genres` (Deezer genre ids, matched via `EDITOR_GENRE`). Otherwise it is the genre's share of `lovedTags()` (the MB tag sum the Blind Test already builds), divided by the largest genre's share. `EDITOR_GENRE` maps each editor word to a Deezer genre id and MB tag words, for example Folk → 466 → `folk, singer-songwriter, americana`. "Moods" or unknown lists get a neutral 0.4.
- **T, tag fit.** `Features.tagCos(artistTags(artist), lovedTags())`, the 0.85-AUC signal. Use it only when the tags are known: cached, or fetched by the background warm-up below.
- **Skips.** A track rated `skip` is excluded. An artist is "cooled" when `heard` has `dz:<id>`, it is not loved and it is not in `back.ok`. That proxy covers Blind Test and Tree skips, because ratings store track ids, not artists.

```
score(c) = 2.0·near·(1 − adventure/200)
         + 1.5·genreFit
         + 2.0·tagFit
         − 1.5·cooled
         + 0.25·min(2, lists(c) − 1)        // several editors put it on this vibe
         + 0.4·rand()                        // a fresh pull each visit
near     = 1 if loved artist; 0.6 if k = 1; 1 if k ≥ 2; else 0
genreFit = max over c's playlists of G[playlist genre]
tagFit   = percentile of T among pool rows with known T (0..1); unknown T → genreFit (no penalty)
```

Cold start (no likes, no genres): the personal terms are 0, so the result is the editors' vibe, shuffled. That is fine.

**Picking a page of 20.** Walk the rows in score order and enforce:
- at most **2 per artist**, never back to back;
- at most **2 tracks the user already loved**;
- at most `1 + round(4·(1 − adventure/100))` tracks by loved artists (5 at Adventure 0, 1 at 100);
- at least **10 of 20 by artists not in `heard` and not loved** (discovery). If the pool can't meet this, relax it, but never relax the artist cap.

"More" picks the next 20 from the same ranked pool and excludes everything shown this session for the vibe. When fewer than 20 remain, show them, add "This shelf ran short", and hide More.

**Background tag warm-up.** After the first page renders, look up `artistTags` for the next 30 highest-scored artists that have no known tags, one at a time on the existing MB 1.5 s queue. Stop when the tab is left. Results are disk-cached for 30 days, so they improve "More" and later visits. **Rows already on screen are never re-sorted.**

## 4. Vibe list (verified: editorial lists / playable tracks)

| Group | Vibe | Query words | Result |
|---|---|---|---|
| Places | Coffee shop | coffee shop, cafe | 7 / 219 |
| | Rainy window | rainy day, rain | 6 / 151 |
| | Late-night drive | late night, night drive | 4 / 231 |
| | Road trip | roadtrip, driving | 6 / 202 |
| | By the fire | fireplace, cosy | 5 / 172 |
| | Jazz bar | jazz bar, lounge | 6 / 263 |
| | Beach bar | beach bar, tropical | 4 / 192 |
| | Poolside | pool, sunny day | 5 / 167 |
| | Dinner party | dinner party, dinner | 4 / 206 |
| | City break | city sounds | 4 / 145 (Havana, Naples, New Orleans, Barcelona) |
| | Picnic | picnic, bloom | 2 / 117 |
| | Commute | commute | 3 / 131 |
| Doing | Study | study | 4 / 261 |
| | Deep focus | focus | 4 / 292 |
| | Reading | reading | 4 / 223 |
| | Cooking | cooking, apero | 5 / 240 |
| | Workout | workout | 4 / 195 |
| | Running | running | 4 / 196 |
| | Yoga | yoga, meditation | 7 / 158 |
| | Cleaning | cleaning, motivation | 4 / 193 |
| | Sleep | sleep | 4 / 179 |
| | Pre-party | pregame, party | 5 / 168 |
| | Gaming | gaming | 4 / 210 |
| Moods | Melancholy | sad, melancholy | 6 / 209 |
| | Feel good | feel good, happy | 6 / 174 |
| | Romantic | romantic | 4 / 182 |
| | Dreamy | dreamy | 4 / 165 |
| | Chill | chill, mellow | 6 / 260 |
| | Heartbreak | heartbreak, breakup | 7 / 311 |
| | Euphoric | euphoria | 4 / 230 |
| | Angry | rage, angry | 7 / 234 |
| | Throwback | throwback | 4 / 281 (decade pop) |
| | Cinematic | cinematic | 4 / 138 |
| Times | Slow morning | morning, brunch | 7 / 176 |
| | Golden hour | sunset | 4 / 160 |
| | Summer | summer | 4 / 209 |
| | Autumn | autumn, cosy | 8 / 231 |
| | Winter | fireplace, winter | 4 / 179 (after the holiday filter) |
| | Spring | spring, bloom | 4 / 192 |
| | Friday night | party, dance | 6 / 214 |

That is 40 vibes. Take at most the top 4 editorial lists per query and 4 lists per vibe.

**Poor results, left out or reworded:**
- **No editorial lists** for "late night drive", "sunday morning", "lazy sunday", "cozy cabin", "cabin", "rooftop", "working from home", "confidence", "golden hour", "after midnight", "friday night", "wine", "stargazing" and "forest". Those vibes now use the reworded queries in the table.
- **Drifts off topic:**
  - "nostalgia" returns Disney soundtracks (Throwback uses "throwback" instead).
  - "winter" returns Christmas lists.
  - "city night" returns Havana salsa.
  - "train journey" returns one unrelated list.
  - "Dark and moody" drifts to Love Classics and study lofi, so it was dropped.
- **Too thin:** "home office" and "bath" (1 list each) were dropped. "After midnight" duplicated Late-night drive and was dropped.

## 5. Output

- 20 rows, all with `readable && preview`.
- Max 2 per artist.
- Built by `fromDeezer(row)`, so titles go through `cleanTitle` in `trackRow`.
- De-duplicated by track id and by `artistId|norm(cleanTitle(title))`. The same song on two lists counts once.
- **Why line**, `"<Vibe> · <reason>"`, first match wins:
  1. the track is already loved → "Coffee shop · one of your loves";
  2. by a loved artist → "Coffee shop · more from Norah Jones, a love of yours";
  3. a neighbour → `Features.whyLine({kind:'near', artist})` with the vibe prefix ("Coffee shop · in Radiohead's orbit"); name the loved artist with the largest k;
  4. tagFit ≥ 0.75 → "Rainy window · shares the trip hop and downtempo of your loves" (the two tags with the largest `theirs·mine`);
  5. genreFit ≥ 0.8 → `whyLine({kind:'genre'})` ("Coffee shop · Folk, a genre you picked");
  6. otherwise → "Coffee shop · from Deezer's “Cozy Coffeeshop”". This also credits the source.

## 6. UX sketch (for the Designer)

- **Its own tab, between Crate Dig and Family Tree.** Crate Dig is scene-based (decade × place × genre, stamps, rarity). Vibes are a different axis, and mixing them would muddle stamps.
  - On the phone, Home is hidden and Preferences sits top-right, so the bottom bar today has 4 tabs (Blind Test, Crate Dig, Family Tree, Saved). It becomes 5, which still fits at `minmax(0,1fr)`. The landscape left rail gets one more item.
  - It needs a `--tab-icon`, for example a small shelf of three sleeves.
  - Fallback if the user prefers no new tab: a fourth Crate Dig mode next to Roll / Scenes / Genres. Same code, different mount.
- **Layout.** Left column: the shelf, four groups (Places, Doing, Moods, Times) of paper "divider card" chips, plus a "Surprise me" chip. Right column (or below, on the phone): the head "Coffee shop, pulled for you", then the list.
- **Loading** streams rows in rank order, with the same row skeleton and stagger as the Roll. The data arrives in about 1 s, so the stream is cosmetic. Rows never reorder afterwards.
- **Rows** are the normal `trackRow(t, {reason})`. Love, play and the "came from" chip work as everywhere else. `from: {tab:'moods', label:'Mood Shelf · Coffee shop'}`.
- **More** gives the next 20 (§3). **Export to Spotify** reuses ``exportToSpotify(`Gruvo: ${label}`, rows, status, btn)``, shown once the page is in, like `#stamp-export-box`.
- A footnote under the list: "Pulled from Deezer editors' playlists, re-ranked to your taste." Show the Deezer logo there if the release adds it (docs/17).
- Keyboard: arrow keys move between chips, Enter pulls, M is More. Remember the last vibe in `localStorage` (try/catch), as `stampRecent` does.

## 7. Licensing

- The Deezer API terms (developers.deezer.com/termsofuse, read today) grant access to "Album, Artist, Comment, **Editorial, Playlist**, Radio". Use is "strictly limited for a non-commercial purpose", and any use "beyond those stated shall be beforehand reviewed and approved by DEEZER".
- Nothing in the terms addresses re-ranking editorial playlists into your own mixes. It is not forbidden, but it is a derived curation. **Add one line to the still-unsent Deezer email in docs/17:** "The app also builds 20-song mood mixes from your public editorial playlists, re-ordered to the user's taste, crediting the playlist. Is that OK?"
- The feature uses **no audio analysis** to rank, so it adds nothing to the fingerprint grey area. Loving a song still teaches the fingerprint, as it does everywhere.
- Previews are never written to disk (net.js already strips `preview`).
- Exporting to Spotify sends only the user's own 20-song pick, matched by name or ISRC (existing code). It is the same as exporting a Crate Dig list.

## 8. Performance

| Step | Calls | Time |
|---|---|---|
| Open a vibe | 1-2 `search/playlist` + ≤4 `playlist/{id}/tracks` = ≤6 Deezer calls | ~1 s at the 125 ms Deezer gap |
| Neighbour map | ≤15 `/artist/{id}/related`, once per session, started when the tab first opens | ~2 s, shared by all vibes |
| Tag warm-up | ≤30 MB calls in the background on the shared 1.5 s queue; cancelled when leaving the tab | most are already cached for artists seen before |

- The Deezer disk cache is purged at start-up and has a 10-minute TTL (preview tokens die after ~15 min). Keep the pool in memory per vibe for 10 minutes, and refetch it after that (6 cheap calls).
- A row played after its token expired goes through the existing `freshPreview` / onFail path.
- The MB queue is shared with the Blind Test's tag lookups. Capping the warm-up at 30 and cancelling it when the user leaves the tab keeps the Blind Test responsive.

## 9. Files to touch

- **`renderer/vibes.js`** (new, UMD like features.js / dig.js → `window.Vibes`, and `require`-able in tests). It holds `VIBES` ([{id, label, group, q:[...]}]), `EDITOR_GENRE`, `isEditorial(p)`, `badTitle(title)`, `genreWeights(prefsGenres, lovedTags)`, `score(c, taste, rand)`, `pickPage(ranked, taste, shown, adventure)`, and `why(c, vibe, taste, prevKey)`, which uses `Features.whyLine`.
- **`src/vibes.js`** (new, platform-free; `get` injected like music.js). It exports `flows.vibePool(get, id)` → `{rows:[{...fromDeezer(t), lists:[{title, genre}]}]}` or `{error}`, and `flows.relatedMap(get, ids)` → `{artistId: k}`. It requires `../renderer/vibes` for the list, as src/stamps.js does with stamp-data.
- **`src/handlers.js`**: `call()` also dispatches `Vibes.flows`. This is a one-line merge with `flows`, and it means **no IPC, preload or mobile api changes**: the renderer uses the existing `call('vibePool', id)`.
- **`renderer/index.html`**: a tab button, a `<section id="moods" class="panel">` with the shelf, list, More and export box, and `<script src="vibes.js">` before app.js. The CSP is unchanged.
- **`renderer/app.js`**: about 120 lines. The tab handler, shelf render, pull/More/export, the neighbour map memo, the tag warm-up, and `tabName`, keyboard and `ways` entries (check `stampTab` at app.js:1385, which picks "the tab after Blind Test" by exclusion, so add `'moods'` to its exclude list).
- **`renderer/styles.css`**: shelf chips, the phone tab icon, and a check that the 5-column bottom bar and landscape rail fit.
- **Tests**: `test/vibes.test.js` plus `test/fixtures/vibe-*.json` (one search and one tracks body, recorded).

## 10. Test plan

- **Unit (`npm test`):**
  - `isEditorial` / `badTitle`: the editor names above pass; "Tribute Corner", "100% Terrace Martin" and "Christmas Hits" fail.
  - `vibePool` on the fixtures: drops `readable:false` and empty preview, de-duplicates across lists, and attaches the editor genre.
  - `pickPage`: max 2 per artist, none back to back; ≤2 loved tracks; the loved-artist cap at Adventure 0 and 100; the discovery floor met when the pool allows it; a short pool returns fewer and `more:false`.
  - `score`: a loved-artist row outranks the same row without love; a cooled artist ranks lower; unknown tags are not penalised.
  - `why`: the priority order, and the vibe prefix on every line.
  - `platform-free.test.js` still passes (src/vibes.js has no fs or electron).
- **Live (Bug Hunter, temp `--user-data-dir` with a copied profile.json):** pull Coffee shop, Study and Angry. All 20 rows play. Check the why lines, More, and Love → Saved. Export only if Spotify is connected in the temp profile; never click external links. On the phone, check the 5-tab bar and the landscape rail.

## 11. Smallest first version

- **In v1:** all 40 vibes, editorial pool, scoring with near + genre + cached/warm-up tags + skips, the quotas, why lines, More, Love, and Export (the last three are existing code).
- **Later:**
  - store `vibe` on loves to learn "your Coffee shop", which needs a profile field;
  - user-typed vibes (free-text playlist search with the same editorial filter);
  - an artist id on new ratings, so skips are exact instead of the `heard` proxy;
  - Last.fm tags with a user key;
  - Deezer logo placement (part of the release work in docs/17).

## Open questions for the user

1. Name: "Mood Shelf"? Alternatives: "Listening Booth", "Mood Crates".
2. Its own tab (phone bar goes to 5), or a fourth mode inside Crate Dig?
3. OK to add the "mood mixes from your editorial playlists" line to the Deezer email in docs/17 before any public release?
