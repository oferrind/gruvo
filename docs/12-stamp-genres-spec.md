# 12 · Genre Stamps: the genre atlas (about 1,500 genre-only stamps)

**Ask:** "add a whole lot more genres, from shoegaze to the most obscure genres possible", maybe from "a website with a
massive tree of genres". **Answer:** ship every MusicBrainz genre that plays live as a **genre-only stamp** ("Zeuhl",
no decade, no place), built and verified by a script. Use Wikidata for the parent tree. Treat Every Noise and musicmap as
inspiration only.

## 1. Source of the list
| Source | Size | Licence | Verdict |
|---|---|---|---|
| **MusicBrainz genres** (`/ws/2/genre/all`) | **2,216** (live 2026-10-24) | CC0 | **Use.** Each name is an MB tag, so each one can be queried by the code we already have. |
| **Wikidata** `P8052` (MB genre ID) + `P279` (subclass of) | 2,182 of 2,216 mapped; **1,510** have a parent that is also an MB genre | CC0 | **Use** for parents, families and "nearby genres". One SPARQL call at build time. |
| Every Noise at Once | about 6,000 Spotify microgenres, frozen since 2023 | no licence, scraped Spotify data | Inspiration only. Many entries are Spotify-only labels ("deep german indie") that no MB tag can query. |
| musicmap.info | about 230 genres, hand-drawn genealogy | all rights reserved | Inspiration only. MB + Wikidata already give the tree. |
| Ishkur's Guide | electronic genres only | copyrighted | Skip. |

- The MB list does reach the obscure end. Shoegaze, vaporwave, zeuhl, witch house, dungeon synth, kayōkyoku, funk carioca
  (baile funk is listed under this name), gqom, amapiano, lowercase, nintendocore, sea shanty, drill and bass and
  "psichedelia occulta italiana" are all present.
- The MB ws/2 genre endpoint returns no relationships (`inc=genre-rels` is ignored), which is why Wikidata supplies the tree.
- **Drop** non-music entries with a fixed blocklist: asmr, children's music, christmas music, comedy (and its 4 variants),
  field recording, guided meditation, interview, sound effects, spoken word.
- **Slugs:** NFKD → ASCII → `[a-z0-9-]`. There is one collision (`kaseko`, listed twice), so keep the first. Longest slug: 33 chars.

## 2. Live feasibility (2026-10-24, real APIs, MB pacing 1.5 s, app UA)
Probe = `stampSongs` with **no country and no decade** (scratch copy, same guards, strict Deezer/iTunes match, max 2 songs per artist).
Tier = the MB recording count for `tag:"<g>" AND status:official` (§3).

| Tier | Sampled | ≥5 playable | Results (songs found) |
|---|---|---|---|
| Common (≥1000 recs) | 11 | **11/11** | shoegaze, trip hop, post-punk, bossa nova, synthwave, emo, drum and bass, dream pop, math rock, chamber pop 10 each; vaporwave 9 |
| Deep (100-999) | 4 | **4/4** | city pop, witch house, dungeon synth, drill and bass 10 each |
| Obscure (<100) | 13 | **9/13** | zeuhl, funk carioca, gqom, amapiano, nintendocore, sea shanty, pagan black metal 10; zamba 9; lowercase 5. **Failed:** kayōkyoku 1, psichedelia occulta italiana 3, biguine 0, cadence rampa 0 |
| **All** | 28 | **24/28 (86 %)** | 6 random picks from the list (a tail-heavy sample) passed 4/6 |

- **Cost per genre:** 2 MB calls (6 for obscure genres, which need the top-up), 9-40 Deezer calls, 0-4 iTunes calls.
  Time per genre is 5-42 s (median about 16 s) cold.
- **Projection:** 65-75 % of the 2,216 pass, so about **1,400-1,600 shipped stamps**. The build script reports the exact number.
- **Precision:** recording tags match exactly (city pop: 98/100 results carry the exact tag). But users tag oddly:
  Melanie Martinez came back as shoegaze and Amel Bent as city pop. Artists that *also* carry the tag on the artist record
  are canonical (Catherine Wheel, Galaxie 500; Tatsuro Yamashita, Mariya Takeuchi; Massive Attack, Morcheeba). They make up
  18/45, 13/70 and 18/71 of the artists returned. **Fix (§4.2): play artist-tagged artists first.**
- **Bug the probe found:** without a country guard, MB's special-purpose artists get through ("[unknown] – [untitled]" was
  the only kayōkyoku hit). The genre-only path must drop them. Today's place stamps are immune because `country === CC`
  already excludes them.
- **Why kayōkyoku failed:** the artists are credited in kanji, with no Latin alias that Deezer matches. This is the same
  weakness §3 of doc 06 describes. The build-time check drops the genre; nothing else is needed.

## 3. Catalogue design
- **Key:** `--<slug>`, e.g. `--zeuhl` or `--drill-and-bass`. It reads as the existing `<decade>-<CC>-<genre>` shape with the
  decade and place left empty, so one regex covers every key:
  `^(\d{4})?-([A-Z]{2})?-([a-z0-9-]{0,40})$`, with the rule "at least one of decade / CC / genre is present".
  - Legacy `1980-JP-` keys and the 43 catalogue keys keep working unchanged.
  - v1 ships only `--slug`. `1990--slug` (a decade, any place) and `-FR-slug` (a place, any decade) become valid for free
    and are used only by the builder (§5, step 6).
- **Display:** label = the MB name in sentence case ("Zeuhl", "Drill and bass"). On the stamp face, family replaces the decade
  and the parent replaces the place, e.g. *Rock · Zeuhl · progressive rock*.
- **Tiers** (browse filter and Roll weight, separate from runtime rarity):
  - *Common* means ≥1000 tagged recordings, *Deep* means 100-999, *Obscure* means <100.
  - A tier measures how deep MusicBrainz goes, not how big the genre is in the world: amapiano lands in Obscure.
  - Runtime rarity (Common/Rare/Legendary from the artist pool) stays as it is.
- **Families** (stamp book groups, from a Wikidata P279 BFS to the nearest root): rock, metal, punk, pop, electronic, hip hop,
  r&b/soul, jazz, blues, folk, country, reggae, latin, classical, experimental, ambient, plus "other" when the BFS finds no
  root.
  - Metal sits under rock in Wikidata, but the nearest root wins, so metal stays metal.
  - Multiple parents: pick the first one in the root order above.
- **Nearby:** each entry stores its `parent` slug, and children are derived at load time. The playlist header shows
  "Nearby: <parent> · up to 4 siblings/children" as chips (only ones that are in the shipped list).
  - A thin genre result suggests the parent and two siblings instead of the ±10-year buttons.
- **No dead stamps:** verify the whole list at build time (≥6 playable songs on one fetch, which leaves margin above the
  runtime threshold of 5). The runtime thin path stays as the safety net, and it adds the id to `stampShort` so Roll skips it.
- **Roll** (stamp-data.js `roll`):
  - Split: 50 % place catalogue, 30 % genre atlas, 20 % builder combo.
  - Genre weights: tier Common 1, Deep 2, Obscure 2 (the user wants the deep end); ×3 if the genre or its parent matches a
    taste tag; ×2 if uncollected. The last 5 rolls are still excluded.
  - Adventurous on a genre roll: after 2 genre rolls in a row inside families you already hold, force a family you don't hold.
    This mirrors the continent rule.
- **Blurb:** none is hand-written. Show "A branch of <parent>."

## 4. Build plan (Builder: sonnet)
### 4.1 Data: `renderer/genre-data.js` (generated, committed, about 120 KB)
Same UMD pattern as stamp-data.js (`module.exports` / `root.GENRE_DATA`). It holds one compact array, sorted by name:
```js
// generated by scripts/build-genre-stamps.js on <date>; do not edit. MB genres CC0, Wikidata CC0.
[["zeuhl","zeuhl","rock","O","progressive-rock",10,"Magma|Corima|Universal Totem Orchestra"], ...]
//  slug   MB name  family tier parent-slug   songs artists (build run)
```
Load it in index.html before stamp-data.js. `src/stamps.js` requires it and passes it to `StampData(COUNTRIES, GENRE_DATA)`.

### 4.2 `src/stamps.js`: generalise `stampSongs` (decade and cc become optional)
- **Queries:** build `country:CC` and `firstreleasedate:[…]` only when they are set. `addGuard(guard, artists, cc)`
  accepts any country when `cc` is empty. iTunes uses `country=US` when there is no cc.
- **Drop special-purpose artists:** `[unknown]` 125ec42a-7229-4250-afc5-e057484327fe and Various Artists
  89ad4ac3-39f7-470e-963a-56509c546377 (and any title that starts with `[`).
- **Genre-only ranking:**
  - Mark each guard artist `tagged` when `artist.tags` contains the exact tag (normalised).
  - In `order`, put tagged artists' songs first, then the rest.
  - The top-up trigger becomes "fewer than 8 *tagged* artists" (this is where zeuhl, gqom and nintendocore got their songs).
- **Same as today:** era guard (skipped when there is no decade), BAD regex, dedupe, max 2 per artist, Deezer cap 40,
  iTunes cap 4, thin <5, short 5-7.
- Emit rows with `genre: stamp.genre`, `stamp: stamp.id`, and `decade`/`country` only when they are set.

### 4.3 `renderer/stamp-data.js`
- `StampData(COUNTRIES, GENRE_DATA = [])` builds `ATLAS` (a Map from slug to entry) and a `kids` index.
- `makeStamp(id)`: check the catalogue first; then `--slug` → `{id, decade:null, cc:'', genre:slug, tags:[mbName], label,
  family, tier, parent, artists, atlas:true}`; then today's combo/legacy paths.
  - Optional decade or cc with an atlas slug gives tags `[mbName]` (builder step 6).
  - A catalogue/builder `GENRES` slug keeps its curated multi-tag list.
- New exports: `ATLAS`, `FAMILIES`, `nearby(slug)` (parent + up to 4 siblings/children), `searchGenres(q, {family, tier}, limit=60)`.
  `searchGenres` uses a normalised substring match on the name and ranks prefix hits first.
- `roll` as in §3. Guard every `continentOf(k.split('-')[1])` call (here and in app.js:765) so it skips keys with no CC.
- `book(held)`: groups by continent as today. It also returns `families`, a list of `{family, slots (earned only),
  earned, total}`, plus `atlas` and `atlasTotal` counts.

### 4.4 `src/store.js` (3 regexes, lines 41/50/58)
- Use the unified key regex from §3. `genre` = the third key part (`/^\d{0,4}-[A-Z]{0,2}-(.*)$/`), not `slice(8)`.
- Reject `--` (all three parts empty). The legacy `JP-1980` migration is unchanged.

### 4.5 Script: `scripts/build-genre-stamps.js` (run by hand, not in CI; resumable)
1. Page through `/ws/2/genre/all?fmt=json&limit=100&offset=…` (23 calls) through `src/net.js` `get`, then apply the
   blocklist, slugs and dedupe.
2. Run one SPARQL query against `query.wikidata.org` (plain `fetch` with the app UA; this host is **not** added to net.js's
   allowlist):
   `SELECT ?mb ?pmb WHERE { ?g wdt:P8052 ?mb . OPTIONAL { ?g wdt:P279 ?p . ?p wdt:P8052 ?pmb } }`.
   Map MB ids to slugs → parent (the first parent that is itself in the list), then BFS to a family root (with a visited set,
   since Wikidata has cycles).
3. For each genre: run `stampSongs(get, makeStamp('--'+slug))`. Record `count`, the MB recording `count` from the first call
   (for the tier), and the top 3 artists. Keep entries with `count >= 6`.
   - Save progress after every genre to `scripts/.genre-verify.json` (add it to .gitignore). `--resume` is the default,
     `--only "<name>,<name>"`, `--limit N`.
   - `--no-itunes` drops iTunes (3 s per call): the full run takes about 4-5 h instead of about 12 h.
4. Write `renderer/genre-data.js` and print a summary: total, per tier, per family, the drop list with reasons.
   Keep the pure helpers (`slugify`, `familyOf`, `tierOf`) exported for tests.

**How to run the full build (built; only the slice below has been run).**
```
node scripts/build-genre-stamps.js --no-itunes
```
- Run it from the repo root, in the background (about 2,200 genres, roughly 4-5 h). It paces MusicBrainz at 1.5 s through `src/net.js`.
- **Checkpoint:** `scripts/.genre-verify.json` (git-ignored). It holds the genre list, the Wikidata parents and every result so far, and is
  written atomically after each genre. Kill it any time and run the same command again: it continues with the genres that are not
  checked yet. Genres that hit a network error are not recorded, so the next run retries them. `--fresh` throws the checkpoint away.
- `renderer/genre-data.js` is rewritten at the end of every run (also after a `--limit` or `--only` run) from everything in the checkpoint,
  so a partial run ships only verified genres (≥6 playable songs on one fetch). Nothing unverified is ever written.
- Other flags: `--only "zeuhl,gqom"` (names or slugs), `--limit N`. Without `--no-itunes` the iTunes fallback is used too (3 s per call, about 12 h).
- **Status (2026-10-24):** the script and the UI are done. `genre-data.js` currently holds only the verified 17-genre slice (18 tried; kayōkyoku dropped as thin)
  (see the commit message); the 500+ entry check in `test/genre-atlas.test.js` is reported as a diagnostic until the full run is committed.

### 4.6 UI (renderer/app.js, index.html, styles.css)
- **Left panel:** a two-way switch above the catalogue: **Scenes** (the 43, as today) | **Genres (N)**.
  - Genres view: a search box (`#genre-q`, debounced 150 ms), a family select and tier chips (All/Common/Deep/Obscure).
  - Results show the first 60 hits as `cat-item` buttons ("Zeuhl · rock · Obscure"), each with a ✓ when held, and a
    "Show more" button. Enter on the search opens the top hit.
  - Empty query: show 12 random uncollected Deep/Obscure genres ("Dig somewhere new"), plus a "Roll a genre" button.
- **Header:** the stamp face shows family/genre/parent, the blurb line from §3 and the **Nearby** chips (each opens that stamp).
- **Book:** below the continents, add a "Genres" section grouped by family.
  - Draw only earned stamps, with a line per family such as "rock 3 / 212". The "Still to find" list is not drawn for genres,
    since it would be too long.
  - The counter becomes "12 / 43 scenes · 7 / 1,480 genres · 3 custom".
- **Thin genre:** "Only N songs tagged <genre> made it. Try <parent> or <sibling>?"
- The keyboard (R, 1/2/3) is unchanged. The search box swallows R and the digits while it has focus.

### 4.7 Tests (extend test/stamps.test.js, test/store.test.js; node --test, fake `get` as today)
1. `makeStamp('--zeuhl')` builds the atlas stamp. `makeStamp('--nope')` returns null. Every existing catalogue and legacy id
   still resolves (a regression check).
2. Store: `{"--zeuhl":2,"1980-JP-":1,"JP-1970":1,"--":5,"--BAD":1}` → only the 3 valid keys are kept, and loading twice is
   idempotent. `validLast` with `stamp:'--zeuhl'` gives `genre:'zeuhl'`.
3. `stampSongs` genre-only: the first MB URL has no `country:` and no `firstreleasedate`; `[unknown]` and `[untitled]` rows
   are dropped; tagged artists come out first; with fewer than 8 tagged artists the artist top-up is called.
4. `roll` with a seeded rand: it returns atlas stamps, never one of the last 5, never one in `short`, and the
   family-Adventurous rule fires on the 3rd roll.
5. `book` returns family groups with the right counts. `nearby()` on the fixture returns the parent and siblings, and never the genre itself.
   `searchGenres('sho')` ranks shoegaze first.
6. Script helpers: the slugify collision case, BFS with a cycle, tier thresholds 999/1000 and 99/100.
7. `genre-data.js` sanity: slugs are unique, every parent slug exists or is empty, every family is in `FAMILIES`, there are
   ≥500 entries.

### 5. Order of work
1. stamps.js generalisation + tests 3.
2. stamp-data.js atlas/makeStamp/search/nearby/book + tests 1, 4, 5, using a 20-entry hand fixture.
3. store.js regexes + test 2.
4. The build script + tests 6. Run it with `--only` on the 28 probe genres, then do the full run (overnight) and commit
   `genre-data.js` + test 7.
5. UI (§4.6). Review screens with the Designer.
6. Optional, cheap: the builder Genre picker becomes searchable over the atlas, and Decade/Place get an "Any" option
   (`1990--slug`, `-FR-slug`). The thin path covers any dead combo.

## 6. Acceptance
1. ≥1,000 atlas stamps ship. Each one returned ≥6 playable songs on the build run, and none is in the blocklist.
2. A genre-only song row always comes from a strict Deezer/iTunes match. It is never [unknown]/[untitled] or a
   special-purpose artist.
3. All 43 place stamps and all legacy keys behave exactly as before. Old profiles load unchanged.
4. Searching "zeu" in Genres shows Zeuhl within 100 ms. Opening it plays ≥5 songs, mostly by artists who carry the tag.
5. MB pacing is ≥1.5 s in both the app and the script. The script survives being killed and resumes where it stopped.

## 7. Risks
- **Tag precision:** user tags drift (Melanie Martinez as "shoegaze"). Tagged-first ordering limits it but does not remove it.
- **Results drift over time:** a genre that passed at build can come back thin later. The runtime thin path + `stampShort`
  handle that.
- **Build time:** about 4-5 h with `--no-itunes`. That's fine overnight; run it again each quarter at most.
- **Non-Latin credits** (Japanese, Korean, Arabic genres) fail the strict Deezer match more often. The atlas will
  under-represent them, as the place catalogue already does.
