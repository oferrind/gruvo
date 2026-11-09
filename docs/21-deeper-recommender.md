# 21 - Deeper recommender: what was built, and what the evidence says

2026-11-09. Steps 2 to 5 of the plan whose target and pass bar are in docs/20. The short answer: the new hybrid picker did
**not** pass the offline bar. The owner chose to run the live blind A/B anyway, since 121 ratings cannot show a gain under
about 0.04: `HYBRID_AB` (renderer/app.js) is on, so each Blind Test mystery is picked by the shipped or the hybrid picker at
random, and the shipped picker stays the default unless the A/B shows the hybrid wins. Setting the flag to false removes
the hybrid, the table and the Preferences "Picker test" line.

## Built

| Step | What | Where |
|---|---|---|
| 2 | On-device listening log: seconds heard per play, plays to the end, verdicts (with source and picker), saves and unsaves, time | src/store.js `events`, renderer/app.js `logEvent` |
| 3 | Artist vectors from raw listens: implicit ALS (Hu, Koren and Volinsky 2008), 48 dimensions | scripts/data/colisten.py |
| 3 | Relationship graph: MusicBrainz artist-artist relationships + co-credits, for personalised PageRank | scripts/data/graph.py |
| 4 | Hybrid ranker: tags, sound, co-listening, graph; weights by LambdaRank; Thompson-sampled sources; genre calibration (Steck 2018) | renderer/features.js, renderer/colisten.js |
| 5 | Blind A/B (each mystery picked by one picker at random, logged); offline harness entries; A/B analysis; Crate Dig scene check | renderer/app.js, scripts/eval/ |

## Data

- **Listens:** ListenBrainz MLHD+ (CC0), archive `complete-0` (one sixteenth of its users). 30,000 listeners, 1.07 billion
  listens, 309,259 artists. Artists heard by at least 15 listeners were kept; "Various Artists" and "[unknown]" dropped.
- **Names, co-credits:** MusicBrainz canonical dump 2026-11-03 (CC0). 109,377 of 110,551 artists named.
- **Relationships, countries, tags:** MusicBrainz full export 2026-11-04 core and derived dumps (CC0 core data; tags are
  CC BY-NC-SA). Among the 40,000 table artists: 7,178 relationship edges and 121,178 co-credit edges.
- **Linking:** through MusicBrainz IDs (listens to names) and normalised artist names (names to Deezer). ISRC linking
  was not needed at the artist level, so it was not built.
- **App table:** the 40,000 most-listened artists, int8 vectors plus edges, 3.8 MB (renderer/colisten-data.js). Loads in
  about 135 ms on the desktop; the PageRank walks (one per loved artist, cached) run spread out after load, so the longest
  pause measured was under 0.2 s. Works offline; nothing is sent.
- **Match rate:** 86 of 110 rated artists (78%) and 45 of 48 saved artists (94%) are in the table. Skipped artists are
  matched least (17 of 32): rarer acts fall outside the 40,000.

## Results

### Held-out ListenBrainz listeners (3,000; their last-discovered 20% of artists hidden)

| | Recall@50 | NDCG@50 |
|---|---|---|
| Random | 0.002 | 0.002 |
| Most popular | 0.109 | 0.110 |
| Co-listening (ALS) | **0.155** | **0.163** |

The vectors work for listeners in general: about 43% more later discoveries found than by popularity.

### Your ratings (n=121, docs/20 protocol, 2000 paired bootstrap resamples)

| Measure | Bar | Shipped 80/20 | Co-listening alone | Hybrid, no graph | Hybrid, complete | Pass |
|---|---|---|---|---|---|---|
| AUC love v rest (primary) | ≥ +0.03, CI > 0 | 0.80 | 0.77 | 0.81 (+0.01 [−0.03, 0.05]) | 0.80 (+0.01 [−0.03, 0.05]) | ✗ |
| AUC love v skip | CI lower ≥ −0.03 | 0.88 | **0.90** | 0.88 | 0.87 (−0.01 [−0.05, 0.03]) | ✗ (lower −0.05) |
| Time split AUC | ≥ 0.75 | 0.75 | 0.71 | 0.77 | 0.77 | ✓ |
| NDCG@10 | ≥ 0.88 | 0.93 | 0.81 | 0.79 | **0.75** | ✗ |
| Novel / distinct / pop ρ / log fans | 0.80 / 0.90 / ≤0.20 / ≤5.6 | 0.80 / 0.90 / −0.02 / 5.13 | 1.00 / 1.00 / −0.04 / 4.73 | 0.80 / 0.90 / −0.01 / 5.08 | 0.80 / 0.90 / 0.02 / 5.05 | ✓ |
| Tag variety (ILD) | higher is better | 0.48 | **0.77** | 0.55 | 0.50 | |

Learned weights (mean over 341 folds, complete hybrid): tags 1.10, sound 0.47, co-listening 0.63, graph 0.24.

**Reading.** Co-listening is a real, independent signal: it is the best single separator of loves from skips and its top
ten is far more varied and less famous. But blended in, it does not lift the primary measure, and the learned weights hurt
the top-ten order (NDCG@10) on this small set. The graph adds a little weight and nothing measurable. On 121 ratings the
CIs are about ±0.04 wide, so a real gain under that size cannot show here.

**Not tried, on purpose.** Tuning variants until one passes would make the bar meaningless. One untested idea worth
pre-registering next is co-listening *in place of* sound (sound is the weakest signal, 0.60), judged in the live A/B rather
than on these 121 ratings again.

### Not measured yet

- **Live A/B and the 12 testers:** running from this build. Preferences shows each picker's Love rate;
  `node scripts/eval/ab.js <profile.json>...` gives the interval, pooled across testers. Decide at 60 rated mysteries per
  picker (docs/20), not before.
- **Audio features:** still waiting on Deezer's answer about analysis (docs/17); AcousticBrainz was not added.
- **Catalogue coverage and the truthful reason:** need weeks of the listening log.

### Crate Dig against an outside reference

`scripts/eval/scenes.js`: for each scene, the 10 most-listened ListenBrainz artists that MusicBrainz places in its
country, decade and genre (top-3 tags), against a real Roll plus More (live network). Discogs was not used: its API needs
an account token.

| Scene | Top 10 reached | Dug artists in the scene's top 50 |
|---|---|---|
| 2000s Swedish indie pop | 8/10 | 11/15 |
| 90s US grunge | 5/10 | 12/14 |
| 90s Norwegian black metal | 5/10 | 11/13 |
| 60s US soul | 5/10 | 11/14 |
| 70s Turkish psych | 5/10 | 5/13 |
| 80s UK post-punk | 4/10 | 13/15 |
| 70s Brazilian MPB | 4/10 | 9/14 |
| 70s Nigerian afrobeat | 3/7 | 3/9 |
| 90s Japanese rock | 3/10 | 8/14 |
| 90s Britpop | 3/10 | 12/14 |
| 70s krautrock | 1/10 | 9/14 |
| 80s US hip hop | 1/10 | 3/14 |
| 80s Japanese city pop | 0/10 | 0/13 |
| **All** | **47/127 (0.37)** | **107/176 (0.61)** |

**Caveat.** MusicBrainz "begin" is the birth year for solo artists, so the reference wrongly counts some later solo stars
as active (Kanye West in 80s hip hop, Utada Hikaru under 80s city pop via the j-pop tag). Without those two scenes: 46/107
(0.43). **Finding:** Crate Dig misses some flagship bands of their scenes (Nirvana, Joy Division, New Order, Kraftwerk,
CAN, Oasis, Pulp, Burzum, Mayhem). A next Crate Dig change could seed each Roll with the scene's most-listened artists
from this table, and be judged by this same check.
## Rerun

```sh
python -I scripts/data/colisten.py <mlhdplus-complete-0.tar> <musicbrainz-canonical-dump-*.tar.zst> <out> --users 30000 --keep 40000
python -I scripts/data/graph.py <mbdump.tar.bz2> <mbdump-derived.tar.bz2> <out>
COLISTEN_DATA=<out>/colisten-data.js node scripts/eval/run.js <profile.json> --rec scripts/eval/rec/colisten.js --rec scripts/eval/rec/hybrid.js
node scripts/eval/scenes.js <out>/scene-ref.json
```

Needs about 24 GB of downloads (MLHD+ archive 16.4 GB, MusicBrainz dumps 10.6 GB), several GB of free memory, and about
an hour. Inputs and outputs stay outside the repo; the harness reads a copy of a profile and prints aggregates only.
