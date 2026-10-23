# 06 · Genre Stamps (replaces Passport)

**Name:** Genre Stamps. **Tab:** "Stamps". **Tagline:** "Collect the world's music scenes, one stamp at a time."
**Empty state:** "Roll a stamp, pick one from the catalogue, or build your own: a decade, a place and a genre."

Why Passport is being replaced: it used the artist's formation year but played the artist's top hit from any
year, it ignored genre, and every pick was a lottery. A stamp is now **decade × place × genre**
("90s Japanese rock"), and every song in it was **first released in that decade** by an artist **from that country**.

## 1. Stamp model + storage
- `Stamp = {id, decade, cc, genre, tags[], label}`. `id = "<decade>-<CC>-<genre>"`, e.g. `1990-JP-rock`.
  `label` is the display name ("90s Japanese rock"). Catalogue stamps ship in `src/stamps.js` (§3); builder stamps
  use the same shape, with `tags` taken from the genre table (§4).
- Profile: keep `profile.stamps` as `{ [id]: lovedCount }`, the same shape it has today, so `store.js` validation still
  holds. `likes[]` entries gain `genre` next to the existing `country` and `decade`.
- Fetched playlists are cached through the existing MB cache (30-day TTL). Deezer previews are re-resolved when a stamp is opened (10-minute TTL).
- **Migration (old profiles):** on load, a key matching `^[A-Z]{2}-\d{4}$` (`JP-1980`) becomes `1980-JP-` (empty genre),
  with the same count. Empty-genre stamps show in a **"Passport (legacy)"** row as "80s Japan" and count toward
  continent/decade progress, but not toward genre. Unloving still decrements (the R2 behaviour stays).
  Run the migration once and let the next atomic save write it. It must be idempotent, so a `1980-JP-` key is left as it is.

## 2. Collection mechanics
- **Earn:** loving 1 song in a stamp's playlist earns it (bronze). 3 loves = **gold**. Unloving below 1 removes the stamp.
- **Rarity** (shown on the stamp, computed when the playlist is fetched): *Common* if the guarded pool has ≥15 artists,
  *Rare* if it has 8-14, *Legendary* if it has <8 (Mongolia, 5 artists; Ethiopian jazz, 8, is Rare; Swedish metal, 19+, is Common).
- **Stamp book** (Stamps tab, right panel, and in Saved): a grid grouped by continent (Africa, Asia, Europe, N. America,
  Latin America & Caribbean, Oceania), with a "12 / 43 catalogue · 3 custom" counter, a per-continent bar and a decade strip (50s…2010s)
  that lights up the decades you hold. Clicking a stamp re-opens its playlist.
- Ratings stay the same: Skip/OK/Love (keys 1/2/3) feed the fingerprint taste model; every row keeps the full-song links,
  the About description and Save, the same as in the other tabs.

## 3. Catalogue (live-verified 2026-10-23, ≥8 strict songs per stamp; 43 entries, every continent)
Format: label · MB tags (OR) · blurb. Country = the CC in the label. Songs = playable strict matches on one fresh fetch.
| Stamp (songs) | Tags | Blurb |
|---|---|---|
| 90s Japanese rock (9) | rock, j-rock, alternative rock, visual kei, punk | X Japan's heirs: eyeliner, riffs, stadium drama |
| 80s Japanese city pop (10) | city pop, j-pop, funk, aor | Neon Tokyo nights, glossy and bittersweet |
| 70s Japanese psych & folk (9) | psychedelic rock, folk rock, progressive rock | Happy End and Flower Travellin' Band rewire the West |
| 70s Turkish psych (10) | anatolian rock, psychedelic rock, rock | Saz meets fuzz pedal |
| 70s Indian filmi (10) | filmi, bollywood, soundtrack | Bollywood's golden orchestras |
| 80s Israeli music (10) | pop, rock, israeli, mizrahi, folk, new wave | Ofra Haza, Mashina, Rita: Tel Aviv goes electric |
| 80s Filipino OPM (10) | opm, pinoy rock, pop | Manila balladeers and the APO sound |
| 70s Ethiopian jazz (8) | ethio-jazz, jazz, funk, soul | Addis Ababa's swinging Éthiopiques years |
| 70s Nigerian Afrobeat (10) | afrobeat, highlife, afro-funk, funk | Fela, Onyeabor and Lagos heat |
| 2010s Nigerian Afrobeats (10) | afrobeats, afropop, afrobeat | Burna Boy and the export boom |
| 70s Ghanaian highlife (10) | highlife, afrobeat | Ebo Taylor's horn-driven Accra |
| 80s Malian desert blues (10) | desert blues, world, mandinka | Ali Farka Touré, Salif Keita, the Sahel guitar |
| 80s Congolese soukous (10) | soukous, rumba | Kinshasa guitars that never stop dancing |
| 80s South African bubblegum (10) | bubblegum, mbaqanga, disco | Township synth-pop: Yvonne Chaka Chaka, Harari |
| 60s Brazilian Tropicália (10) | tropicália, tropicalia, mpb, bossa nova | Caetano, Gil and Gal blow up bossa |
| 70s Brazilian MPB (10) | mpb, samba, bossa nova | Elis and Chico under the dictatorship |
| 80s Argentine rock (10) | rock nacional, rock, rock en español | Rock nacional after the junta |
| 70s Colombian cumbia (9) | cumbia, salsa, tropical | Coastal accordions and Medellín horns |
| 70s Peruvian chicha (10) | chicha, cumbia | Amazonian surf guitars over cumbia |
| 50s Cuban son & mambo (10) | son, mambo, son cubano, bolero | Havana before the revolution |
| 60s Jamaican ska (10) | ska, rocksteady | Kingston's offbeat, before reggae |
| 70s Jamaican reggae (10) | reggae, roots reggae, dub | Roots, dub and King Tubby's mixing desk |
| 80s Mexican rock (10)* | rock en español, rock | Rock in Spanish breaks out of the underground |
| 70s Chilean nueva canción (10) | nueva canción, folk | Violeta Parra's protest song |
| 60s US soul (10) | soul, motown, rhythm and blues, northern soul | Detroit and Memphis on 45s |
| 90s US grunge (10) | grunge, alternative rock | Seattle flannel and feedback |
| 80s US hip hop (10) | hip hop, old school hip hop, rap | The golden-age boom-bap |
| 70s Canadian folk (10) | folk, singer-songwriter, folk rock | Lightfoot, Buffy Sainte-Marie, coffeehouse songs |
| 60s British beat (10) | merseybeat, british invasion, beat, rock and roll | Liverpool to London on a Vox amp |
| 90s British trip hop (10) | trip hop, downtempo | Bristol's slow, smoky beats |
| 70s German krautrock (10) | krautrock, kosmische musik, electronic, progressive rock | Motorik grooves and synth drones |
| 60s French yé-yé (10) | yé-yé, chanson, french pop | Paris pop goes teenage |
| 80s Italo disco (10) | italo-disco, italo disco, synthpop, disco | Arpeggiators in broken English |
| 2000s Swedish metal (10) | metal, melodic death metal, death metal, heavy metal, power metal | The Gothenburg sound goes global |
| 90s Norwegian black metal (10) | black metal | Mayhem, Emperor: cold and lo-fi |
| 2000s Finnish metal (10) | metal, power metal, folk metal, symphonic metal | Nightwish and operatic thunder |
| 90s Russian rock (10) | russian rock, rock, alternative rock | DDT and Kino's heirs after the USSR |
| 70s Portuguese fado (10) | fado | Amália and the Carnation Revolution |
| 80s Spanish movida (10) | new wave, pop rock, movida madrileña | Madrid after Franco, all night long |
| 2000s Icelandic indie (10) | indie, post-rock, electronic, indie pop | Reykjavík's quiet experimentalists |
| 70s Australian pub rock (10) | pub rock, hard rock, rock | AC/DC and the beer-barn circuit |
| 80s Australian new wave (10)* | new wave, post-punk, synthpop | Sydney synths and jangle |
| 80s NZ Flying Nun (10) | dunedin sound, indie pop, jangle pop, indie rock | The Bats, Tall Dwarfs, the Dunedin sound |

\* Verified with a nationality tag (`mexican`, `french`, `australian`). The tag dragged in off-genre artists (Jason Donovan,
a bolero singer), so the tag list above already drops it. **Re-verify these 2 at build time.**
**Dropped (<8 songs or off-genre):** 90s Korean pop 5, 70s Iranian pop 5, 70s Senegalese mbalax 5, 2010s Mongolian
folk-rock 5, 70s Indonesian rock 4, 70s Greek laïko 3, 60s Egyptian classics 1, 60s Cambodian rock 0, 60s Thai luk thung 0,
80s Soviet rock 0 (MB files Soviet bands under RU, not SU), 2000s Mongolian folk-rock 0-1, 90s SA kwaito (10 songs but
Johnny Clegg, not kwaito). They remain reachable in the builder as "short" stamps.

## 4. Builder + Roll
- **Builder:** three pickers in one row: Decade (1950s-2020s), Place (the existing ~60-country list, grouped by continent,
  with search), Genre (a bundled table of ~30 genres → 1-5 MB tags, e.g. `rock → rock, alternative rock, punk`). **Never
  put a nationality tag in a genre's tag list.** `country:` already covers the place, and the tag pulls in off-genre
  stars. If the combination is in the catalogue, the builder jumps to that entry.
- **Roll** (big dice button, key R): a 1.2 s dice tumble that flickers through stamp labels and lands on one, with a stamp-press
  thud. `prefers-reduced-motion` makes it instant. The pick is 70 % catalogue, 30 % random builder combo (a combo is
  re-rolled if it previously came back short). Weighting: stamps whose genre tags overlap the taste model's top tags get ×3,
  uncollected stamps ×2, and the last 5 rolls are excluded. An **"Adventurous"** toggle (default on) caps the taste boost so
  at least 1 roll in 3 lands on a continent you have no stamp from. "Roll again" is always available.
- **Prefetch:** after a playlist renders, prefetch the next Roll silently, so the next dice landing is instant.

## 5. Query strategy (exact)
MB rules from doc 02 apply: `fmt=json`, UA `MusicDiscovery/0.1 (you@example.com)`, ≥1.5 s between calls, and backoff on
503 (2 s, 4 s, 6 s; up to 5 retries; **the live run hit 0-10 503s per stamp, so this is required**). `T = (tag:"a" OR tag:"b" …)`.
1. **Recording-first (MB 1):** `recording?limit=100&query=T AND country:CC AND firstreleasedate:[D TO D+9] AND status:official`.
   Note: `country` here is the *release* (pressing) country. Unguarded, the 80s IL results were 93 % UK/US imports (Squeeze,
   U2) and 70s ET were 66 % US soul.
2. **Artist guard (MB 1):** `artist?limit=100&query=arid:<id1> OR arid:<id2> …` (≤80 distinct credited artists). Keep
   an artist only if `artist.country === CC`. Store `name`, `sort-name` and `aliases[].name` (normalised) for matching.
3. **Top-up (MB 2-4, only when <8 guarded artists):** `artist?limit=100&query=T AND country:CC`, keeping artists with
   `country === CC` **and** ≥1 of the stamp's tags in `artist.tags`. Then, for up to 30 of them in groups of 10:
   `recording?limit=100&query=(arid:a OR …) AND firstreleasedate:[D TO D+9] AND status:official`.
4. **Client guards:** `first-release-date` year in [D, D+9] (era fixed: this is the recording's own first release, never the
   artist's begin year); credited artist passes the guard; skip `video`, non-empty `disambiguation`, and titles matching
   `/\b(live|remix|mix|demo|instrumental|karaoke|version|edit|interview|intro|outro|skit)\b/i`; dedupe artist+title.
5. **Order:** shuffle, then round-robin across artists (max 2 per artist; a 3rd only to reach 8). Stop at 10 songs.
6. **Preview (strict):** Deezer `/search?q=<artist> <title>` (**plain query; the `artist:"…" track:"…"` syntax returned 0 hits
   live**). Accept a row only if it has a `preview`, its normalised artist name is in the MB name/alias set, and one title
   starts with the other. Search with the Latin credit name (or the first Latin alias): Amharic/kanji names return 0 hits,
   aliases fixed 70s Ethiopia (0 → 8). Fallback: iTunes `search?entity=song&country=<CC>&term=…` with the same filter, at most 4 per
   stamp. Cap Deezer at 40 calls per stamp.
7. **Thin results:** fewer than 5 songs: "Only N songs from <label> made it. Try the 70s or 90s?" (±10-year buttons). 5-7 songs: build a
   "short" stamp (still collectable, always Legendary).

**Measured (live, one fetch each, today; songs = in-era, in-country, previewable):**
| Combo | Songs | MB | Deezer | iTunes | Time | Notes |
|---|---|---|---|---|---|---|
| 90s Japanese rock | 9 | 2 | 70 | 4 | 19 s | 74/100 recordings pass the guard; many kanji titles have no Deezer preview |
| 80s Israeli music | 10 | 5 | 15 | 4 | 59 s | 6× MB 503; Ofra Haza, Arik Einstein, Mashina, Rita |
| 70s Ethiopian jazz | 8 | 4 | 19 | 4 | 16 s | Mulatu, Mahmoud Ahmed, Getatchew Mekurya |
| 2000s Mongolian folk-rock | 0-1 | 4 | 4 | 4 | 37 s | 2 artists; 2010s gives 5 (The HU) |
| 70s Nigerian Afrobeat | 10 | 2 | 22 | 4 | 19 s | Fela, Onyeabor, BLO, Ofege |
| 60s Brazilian Tropicália | 10 | 2 | 10 | 2 | 6 s | Caetano, Gil, Gal, plus bossa neighbours |
| 2000s Swedish metal | 10 | 2 | 10 | 0 | 4 s | In Flames, Dark Tranquillity, Soilwork |
Baseline, Passport-style artist-first only (same guards): JP 2-3, IL 3, ET 0, NG 4-8, SE 6-10. Recording-first without the
artist guard: 7 % country precision for IL.
**Precision:** era 100 % and country 100 % by construction. Genre: about 85-90 % by eye on the test combos (Swedish metal and
Nigerian Afrobeat 10/10; Tropicália about 6/10 strict, the rest MPB/bossa). Precision is worst when a tag list has umbrella or
nationality tags. Time: median 18 s cold, 4-60 s depending on 503s, near-instant when cached.

## 6. UI interactions
- Layout: left = Roll button + builder + catalogue list (filterable by continent); centre = playlist; right = stamp book.
- Playlist header: big stamp graphic (label, rarity, bronze/gold ring, "0/1 loves to earn"). The progress line is shown
  while fetching ("Digging through 1990s Japan… 2/4"), and rows render as each preview resolves (the first row lands at about 4 s).
- Each row: cover, artist, title, **year** (the MB first-release year, shown so the era is visible), play, Skip/OK/Love, Save, About, full-song links.
- The first Love on a stamp plays the stamp-press animation and a toast: "Stamp earned: 90s Japanese rock (Rare)".
- Family Tree's "Explore <country> in Passport" link becomes "Roll a <country> stamp" (opens the builder pre-filled with the place).

## 7. Acceptance criteria
1. Every song shown has an MB first-release year inside the stamp's decade and an artist whose `country` is the stamp's CC.
2. Deezer/iTunes rows are accepted only through the strict name/alias + title match; nothing plays from a fuzzy hit.
3. A scripted check runs all catalogue entries against live APIs and fails any entry with fewer than 8 songs (run before release, not in CI).
4. Loving 1 song earns the stamp, 3 makes it gold, unloving reverses it; the counts survive a restart.
5. An old profile with `{"JP-1980":2}` loads as `1980-JP-` = 2 under "Passport (legacy)"; loading it twice changes nothing.
6. Roll never repeats any of the last 5 stamps, respects reduced motion, and with Adventurous on reaches a new continent at least once in 3 rolls.
7. MB pacing is never under 1.5 s; a 503 backs off and retries, and the UI shows progress instead of hanging.
8. A builder combo with 0 results shows the ±10-year suggestion, never an empty list or an error.

## 8. Risks
- Cold fetch is slow (up to 60 s under MB 503s). Mitigations: progressive rows, Roll prefetch, the 30-day cache.
- Genre is only as good as MB tags: umbrella tags (rock, pop, folk) leak neighbouring styles. Mitigation: headline-specific tags.
- Asia and the Middle East are thin outside JP/IN/TR/IL (KR, IR, ID, TH, EG all dropped). Mongolia needs the 2010s.
- MB `first-release-date` can be a later compilation date for obscure tracks, which errs toward *later*, never earlier. A re-recording
  matched on Deezer could play a newer take.
