# 01 - Discovery Ideas (Agent 1: Ideation)

**How might we** help a listener find music they would never have reached through
"people who liked X also liked Y", genre radio or charts - while keeping each
discovery explainable and fun on a free, key-less Windows desktop app?

Lenses used (idea-refine): inversion, constraint as feature, combination, expert
lens (crate diggers, DJs, radio programmers, liner-note readers), simplification.

Data shorthand: **DZ** Deezer public API, **IT** iTunes Search, **MB** MusicBrainz,
**WD** Wikidata/Wikipedia, **RB** Radio Browser, **OM** Open-Meteo (free, no key).

---

## 1. Blind Taste Test
**Pitch.** You hear 30-second previews with no artist, title, cover or genre shown.
You rate each one (skip / ok / love). Only after rating does the app reveal who it was.
Your ratings train a taste profile built on what the music *is* (tempo, era, country,
genre tag) instead of what the name signals.
**Different because.** Classic apps lean on name recognition and popularity; here
prestige and prejudice are removed, so users discover they like things they would
never have clicked.
**Data.** DZ/IT previews + metadata (BPM where present, genre, release year, country).
**Interaction.** 1) Press play on a mystery card. 2) Rate it. 3) Reveal, then save or
follow the artist.

## 2. Liner Notes Trail (follow the credits)
**Pitch.** Pick a song you love; the app shows the people behind it - producer,
drummer, bassist, engineer, arranger, songwriter. Click any person to hear other
records they worked on. Discovery follows hands and ears, not genre labels.
**Different because.** "Similar artists" groups by surface style; session players and
producers cross genres (a jazz drummer on a pop record), which yields true surprises
with a built-in explanation.
**Data.** MB recording/release artist relationships (performer, producer, engineer),
DZ/IT search for previews.
**Interaction.** 1) Search a favourite track. 2) Click a credited person. 3) Play
their other sessions; pin finds to your library.

## 3. Sonic Passport (place x time dial)
**Pitch.** A world map plus a year slider. Drop a pin on "Lagos" and slide to 1974, or
"Tokyo, 1983" - the app assembles a playlist of music from that place and era. Passport
stamps track every country and decade you have visited.
**Different because.** Classic apps organise by genre and popularity now; this
organises by geography and history, and turns exploration into a collection goal.
**Data.** MB artist area/country + release dates + tags, DZ/IT previews, IT country
stores for regional flavour.
**Interaction.** 1) Click a place on the map. 2) Drag the decade slider. 3) Listen;
collect a stamp when you like something.

## 4. Bridge Journey (A to B)
**Pitch.** Name two artists or songs far apart ("Nina Simone" to "Daft Punk"). The app
builds a 6-10 step path where each hop is a small, explained move (shared producer,
related artist, close BPM, same label, same city). You travel it like a road trip.
**Different because.** Recommendations become a narrative with a destination, and the
middle stops are the discoveries - not a flat list of look-alikes.
**Data.** DZ related artists + BPM, MB relationships/labels/areas; shortest-path search
over those links.
**Interaction.** 1) Pick start and destination. 2) Watch the path draw on screen with
the reason for each hop. 3) Play the journey; swap any stop for an alternative.

## 5. Taste Distance Dial
**Pitch.** A single dial from "comfort" (0) to "alien" (100). The app summarises your
liked tracks into a profile (eras, countries, genres, tempo) and picks music at the
chosen distance from it. Turn it up on adventurous days.
**Different because.** Classic algorithms optimise for similarity; this makes
dissimilarity a controllable, explicit choice - serendipity on a slider.
**Data.** Local history of likes, DZ genres/charts/BPM, MB tags/areas/years.
**Interaction.** 1) Set the dial. 2) Press "surprise me". 3) Like/dislike, which also
recalibrates the profile.

## 6. Cover Versions Roulette
**Pitch.** Choose a song you know by heart; hear it reinterpreted by artists you have
never heard of - a bossa nova version, a Finnish metal version, a 1960s soul version.
The familiar melody is the safety net; the new artist is the discovery.
**Different because.** Uses familiarity as a gateway to unfamiliar artists instead of
recommending the original artist's neighbours.
**Data.** MB work -> recordings (covers), DZ/IT search for previews.
**Interaction.** 1) Pick a song. 2) Spin to hear a random cover. 3) Follow the covering
artist if it clicks.

## 7. Sample Detective (musical DNA)
**Pitch.** For any track, trace what it sampled and who sampled it - backwards to the
1970s funk break, forwards to the 2010s hip-hop track. A family tree of reused sound.
**Different because.** Reveals the hidden lineage of songs, the crate-digger view no
mainstream app surfaces.
**Data.** MB "samples material" recording relationships, WD for context, DZ/IT previews.
**Interaction.** 1) Open a track's DNA view. 2) Click a parent or child node. 3) A/B the
two previews side by side.

## 8. Influence Chain
**Pitch.** Walk the "influenced by" graph: from an artist you love to their heroes,
and to their heroes' heroes, with a short story card at each step.
**Different because.** Explains *why* the music sounds the way it does and moves
through time, not sideways through current popularity.
**Data.** WD "influenced by" (P737), Wikipedia summaries, DZ previews.
**Interaction.** 1) Choose an artist. 2) Step back (roots) or forward (descendants).
3) Read the card, play a preview, keep walking.

## 9. Label Dive
**Pitch.** Treat small record labels as curators. Liked a track? See its label's
catalogue by year and dive into the label's sound - often a tighter taste match than
any algorithm.
**Different because.** Labels are a human curation signal ignored by streaming UIs.
**Data.** MB label + releases, DZ album/label search, previews.
**Interaction.** 1) Click the label name on a track. 2) Browse its timeline.
3) Play a sampler of one track per release.

## 10. Daily Quest (constraint challenges)
**Pitch.** Every day a new challenge: "a song from a country you have never heard, made
before 1980, under 100 BPM." The app offers candidates; completing quests builds
streaks and badges.
**Different because.** Constraints force breadth; game mechanics replace endless
scrolling with a small daily goal.
**Data.** MB area/year/tags, DZ BPM/genre, local history for "never heard".
**Interaction.** 1) Open today's quest. 2) Pick from 5 candidates. 3) Rate it to
complete the quest.

## 11. Weather Window
**Pitch.** The app reads your local weather and time of day and picks matching music:
slow and warm for a grey drizzle at 7am, bright and fast for a sunny Saturday noon -
but always from artists you have not played.
**Different because.** Context comes from the real world, not from your listening
history.
**Data.** OM weather (no key), system clock, DZ BPM/genre, MB tags.
**Interaction.** 1) App shows "Rainy, 11C, evening". 2) Press play on the matched set.
3) Nudge "more mellow / more energy".

## 12. Sunrise Chase (live radio around the clock)
**Pitch.** Tune into live radio stations in cities where it is *right now* sunrise (or
midnight, or Friday evening). You hear what real local DJs play this minute.
**Different because.** Live, human-curated, local and unrepeatable - the opposite of a
precomputed playlist.
**Data.** RB stations by country/geo, time zones per country, sunrise calculation.
**Interaction.** 1) Choose a moment ("sunrise"). 2) App lists cities where it is
happening now. 3) Listen; save a station or search the current song.

## 13. Bracket Showdown
**Pitch.** 16 previews enter a tournament bracket; you pick winners head-to-head until
one champion remains. The champion's traits seed the next bracket.
**Different because.** Pairwise choice is fast and honest; it learns taste in minutes
without the user describing themselves.
**Data.** DZ/IT previews and metadata; local scoring.
**Interaction.** 1) Start a bracket. 2) Choose A or B per match. 3) Get a champion and
a new bracket built from its traits.

## 14. Scene Sketch (describe a moment)
**Pitch.** Type a scene - "cooking pasta late at night with the window open" - and the
app maps the words to tempo, era, mood and genre tags via a local keyword dictionary,
then builds a set.
**Different because.** Starts from the situation, not from an artist or genre the user
must already know.
**Data.** Local word-to-tag table, DZ/MB tags, DZ BPM.
**Interaction.** 1) Type a scene. 2) See the tags it inferred (editable chips).
3) Play the set.

---

## Convergence

**Hidden assumptions to check (for later agents):**
- MB relationship coverage (credits, samples, covers) is good for well-known records
  but thin for obscure ones - ideas 2, 6, 7 need graceful "not enough data" states.
- DZ BPM is missing on many tracks; nothing should *depend* on BPM alone.
- MB rate limit is ~1 request/second - caching is mandatory for graph walks (2, 4, 7).
- Previews are 30s only; that suits blind tests and brackets, less so long journeys.

**Not doing:** collaborative filtering, top-charts feeds, social following, full-length
streaming, AI/LLM services needing keys.

## Top 5 Picks

1. **Blind Taste Test** - simplest to build, most clearly unlike any mainstream app,
   and it doubles as the taste-profile engine for other modes.
2. **Liner Notes Trail** - cross-genre surprises with a built-in "why"; MB credits are a
   free, deep, unique data source.
3. **Sonic Passport** - map + decade slider is a striking UI, and the stamp collection
   gives a reason to come back.
4. **Bridge Journey** - discovery as a story with a destination; shows off the graph of
   relationships behind all the other ideas.
5. **Taste Distance Dial** - one control that makes serendipity explicit; cheap to add
   once a profile exists (from idea 1).
