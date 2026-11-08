# 20 - What a good recommendation is (success target + evaluation harness)

Step 1 of the deeper-recommender programme. Every later change (event log, ListenBrainz embeddings, MusicBrainz graph,
hybrid ranker) is judged against this page. The numbers below were measured on 2026-11-08 and are aggregates only.

## Target

**A good recommendation is a song I have never heard, that I love, by an artist I would not have found myself, given with a reason that is true.**
"Love" is the Blind Test love button; OK is neutral, not a win. Popular hits and artists I already rated count for less, however well they rate.

## Metrics (all computed by `scripts/eval/run.js`)

| Metric | Computed on | Definition | Blind spots |
|---|---|---|---|
| **AUC love v rest** (primary) | non-seed Blind Test ratings | P(score of a random love > score of a random OK or skip); ties count ½ (Mann-Whitney U / (n₊n₋)) | Only ranks songs that were already picked and played, so it cannot see what the picker never offered |
| AUC love v skip | same, OKs dropped | as above, negatives = skips only | Ignores OKs; easier than the primary |
| NDCG@10 | same | items sorted by score; DCG = Σ (2^rel − 1)/log₂(i+2) over the top 10, rel love 2 / OK 1 / skip 0; divided by the ideal DCG; ties keep a seeded shuffle order | With 51 loves among 121 items a good ranker saturates near 1, so it barely separates good models; CI is wide |
| Novel-artist share | top 10 of the time-split test pool | share of the top 10 whose artist was not rated in the training period | Offline the pool is songs already played, so it measures novelty *within* past candidates |
| Mean popularity | top 10, same | mean log₁₀(Deezer artist `nb_fan` + 1) and mean Deezer track `rank` | Deezer fame is global, not "known to me" |
| Variety | top 10, same | distinct artists / 10; tag ILD = mean pairwise (1 − tag cosine) of the MusicBrainz artist tags | Tags are artist-level; untagged artists drop out |
| Popularity bias ρ | whole time-split test pool | Spearman ρ of score vs log fans (positive = favours famous artists) | Pool is small (37), CI is wide |
| Catalogue coverage | lists over a catalogue | distinct items recommended / catalogue size (function exists: `metrics.coverage`) | **Not measured yet**: needs the candidate pools the app drew from (step 2, event log) |
| Truthful reason | the shown "why" line | share of reasons whose claim is checkable and true against the data | **Not measured offline**: needs logged reasons (step 2); audit by hand until then |

Top-10 list metrics are reported as point estimates only. A top-k statistic is biased under bootstrap resampling, which draws duplicates, so a percentile CI would be misleading.

## Protocol

- **Data.** Profile ratings in stored order, which is rating time; a re-rating moves an item to the end. Onboarding seed loves stay in training and are never tested. Artist names come from the like row, else Deezer `/track`. Tags come from `music.flows.artistTags` through `src/net.js` (cache, 1.5 s MusicBrainz pacing, the existing User-Agent). Popularity comes from Deezer `/track` `rank` and `/artist` `nb_fan`. Caches and outputs go to a temp or git-ignored folder.
- **Leave-one-out (primary, because n is small).** Each rated item is scored by a model trained on all the others, plus the seeds. In the **fair** version, every item by the same artist is also removed from training, so an artist's other songs can't give the answer away. The scores are then pooled into one AUC.
- **Time split.** Train on the oldest 70% of ratings plus the seeds; test on the newest 30% (n=37). This is the honest "future" check, and the list metrics run here.
- **Uncertainty.** Percentile bootstrap over rated items, 2000 resamples, seed 1, 95% CI. A comparison against shipped is a **paired** bootstrap of the difference, with the same resamples for both models.
- **Minimum sample.** A result counts only with at least 10 loves and 10 non-loves in the test set, at least 100 items for leave-one-out, and at least 30 for the time split. Today there are 121 (51 love / 35 OK / 35 skip), of which 98 are tagged.

## Baselines (measured, LOO fair, n=121 unless noted; 95% CI)

| | random (seeded) | popular (Deezer fans) | **shipped 80/20** | tags only | sound only |
|---|---|---|---|---|---|
| AUC love v rest | 0.41 [0.31, 0.51] | 0.69 [0.59, 0.79] | **0.80 [0.72, 0.87]** | 0.79 [0.71, 0.86] | 0.60 [0.50, 0.70] |
| AUC love v skip | 0.40 [0.27, 0.52] | 0.68 [0.54, 0.81] | **0.88 [0.79, 0.95]** | 0.87 [0.79, 0.95] | 0.64 [0.51, 0.76] |
| NDCG@10 | 0.15 [0.02, 0.43] | 0.31 [0.05, 0.60] | **0.93 [0.69, 1.00]** | 0.93 [0.70, 1.00] | 0.68 [0.40, 0.91] |
| Time split AUC love v rest (n=37) | 0.53 [0.34, 0.72] | 0.49 [0.30, 0.68] | **0.75 [0.58, 0.90]** | 0.72 [0.54, 0.88] | 0.55 [0.35, 0.74] |
| Time split NDCG@10 | 0.55 [0.22, 0.82] | 0.37 [0.13, 0.69] | **0.89 [0.66, 1.00]** | 0.89 [0.63, 1.00] | 0.52 [0.33, 0.80] |
| Novel-artist share, top 10 | 1.00 | 0.90 | **0.80** | 0.80 | 1.00 |
| Mean log₁₀ fans, top 10 | 5.37 | 6.58 | **5.13** | 5.32 | 4.45 |
| Distinct artists, top 10 | 1.00 | 1.00 | **0.90** | 0.90 | 0.90 |
| Tag ILD, top 10 | 0.92 | 0.88 | **0.48** | 0.53 | 0.71 |
| Popularity bias ρ | 0.15 [−0.19, 0.45] | 1.00 | **−0.02 [−0.39, 0.37]** | 0.18 [−0.19, 0.51] | −0.29 [−0.57, 0.05] |

**Paired differences vs shipped (LOO fair).** On AUC love v rest, tags-only is −0.01 [−0.03, 0.01], popular −0.11 [−0.21, −0.00] and sound-only −0.20 [−0.32, −0.08].

**Sanity check against the earlier one-off test.**

| Model | Earlier test | Now |
|---|---|---|
| Sound fingerprint, love v skip | 0.63 (59 ratings) | 0.64 |
| Tags only, love v skip, fair | 0.84–0.85 (59 ratings) | 0.87 (121 ratings); 0.80 [0.67, 0.92] on the tagged-only subset (n=98) |
| 80/20 blend, love v skip | 0.83 (96 tagged ratings) | 0.81 [0.67, 0.93] (98 tagged ratings) |

**What the baselines say.**
- The shipped picker is almost all tags.
- It lists a narrow tag neighbourhood (ILD 0.48 against 0.9 for random) and is neutral on popularity.
- The seeded random baseline sits below 0.5 at seed 1, which is within chance at this n.

## Pre-registered thresholds (a new ranker must pass all of them)

1. **Primary win.** On LOO fair AUC love v rest, the paired difference vs shipped must be at least **+0.03**, with the 95% CI lower bound **above 0**.
   Why: the paired CI between two near-identical rankers (tags-only vs shipped) is ±0.02, so any gain under 0.03 is indistinguishable from re-weighting noise. The unpaired CI (±0.08) is too wide to use.
2. **No regression on skips.** The paired AUC love v skip difference must have its CI lower bound at or above **−0.03**.
3. **Future holds.** On the time-split AUC love v rest, the point estimate must be at least **0.75**, shipped's value. At n=37 the paired CI is ±0.08, so this is a guard against harm, not proof of a gain.
4. **NDCG@10 guard.** On LOO fair, the point estimate must be at least **0.88** (shipped 0.93 minus 0.05). NDCG saturates here, so it can veto a change but not approve one.
5. **Discovery guards** (time-split top 10, point estimates):
   - novel-artist share at least **0.80**;
   - distinct artists at least **0.90**;
   - popularity bias ρ at most **0.20**, so it can't drift to favouring famous artists (popular scores 1.0);
   - mean log₁₀ fans at most **5.6**, which is shipped plus half the gap to the popular baseline.
   - A ranker that raises tag ILD above 0.48 while passing 1 to 4 is preferred.
6. **Sample.** Re-run on the current profile with the same seed, reps and protocol, and meet the minimum sample above. If the profile has grown, re-measure shipped on that same profile first; the thresholds are differences, so they carry over.

## Later evidence (described, not built)

- **In-app interleaved A/B.** Team-draft interleave the shipped and new rankers inside one Blind Test queue and log which source each love, OK or skip came from. Decide with a pre-set sample of at least 60 rated mysteries per arm. The 2026-10-26 live A/B, with 61 mysteries split two ways, was not significant alone (Fisher p 0.31). Needs the event log from step 2.
- **Testers.** Profiles from other people, run through the same harness per tester. Report the median and the share of testers above the thresholds, so that one user's taste doesn't decide the outcome.
- **Held-out ListenBrainz listens.** For users with public listens, hide their last N weeks and score whether the ranker puts the artists they later played above random catalogue artists. This is AUC on implicit feedback, and gives a far larger n than ratings.
- **Crate Dig scenes, outside reference.** Check scene picks against an external labelling: MusicBrainz tags and genre relations, or a Wikipedia or Discogs list of the scene's artists. Measure precision@10 of "this artist belongs to this scene".

## Running it

```
node scripts/eval/run.js <profile.json> [--cache dir] [--out dir] [--rec my-ranker.js]... [--reps 2000] [--seed 1] [--offline]
```

- A ranker is a module exporting `{name, score(candidate, train, ctx)}`, or `{name, rank(list, train, ctx)}` returning the list best first. Baselines are in `scripts/eval/rec/`.
- The profile is only read.
- Output is a table on stdout plus aggregate JSON in `--out` (default `scripts/eval/out/`, git-ignored). The caches hold artist names, so keep them in a temp or git-ignored folder.
- `--offline` re-runs from the cache.
