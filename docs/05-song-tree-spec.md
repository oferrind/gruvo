# 05 - Family Tree (replaces Liner Notes)

You pick a song you saved. The tab grows a small, explained tree of songs from the same scene and era,
plus the band members, samples and influences that connect them. It is not Blind Test: no random trips,
and no audio-fingerprint ranking. Every step says why it is there.

## 1. Name
Candidates: **Family Tree**, Lineage, Roots, Scene Guide, Rabbit Hole.
**Chosen: Family Tree.** It is a short noun like "Blind Test / Passport / Saved", it says "tree", and
it covers both bloodlines (members who moved) and family resemblance (same scene).
Tab id `tree`, label "Family Tree". The intro card reads: "Start from a song you saved. Walk through its
scene, step by step."

## 2. Edge types: live check (2026-10-23)
These were probed live with Oasis "Wonderwall" (UK, 1991) and Nirvana "Smells Like Teen Spirit" (US, 1987).
They sent 11 MB calls plus 28 Deezer calls per root and took about 25 s, including probes we will not ship.

| Edge | Source | Observed | Cost | Verdict |
|---|---|---|---|---|
| **Same scene** | MB artist search by top tag + begin-year window + country | Oasis: 57 hits, with The Verve, Blur, Suede, Supergrass, Charlatans and Ocean Colour Scene in the top 25. Nirvana: 58 hits (Pearl Jam, Soundgarden, Alice in Chains, Mudhoney, Melvins). Without the country filter, grunge pulls in Radiohead and Blur, so keep the country filter | 1 MB call | **Approve. Main driver** |
| **Fans' pick, same scene** | Deezer `artist/{id}/related` **intersected** with the scene list | Oasis: Verve, Blur. Verve: Suede, Manics, Blur, Supergrass, Charlatans, OCS. Nirvana: Pearl Jam, Pumpkins, Soundgarden, AiC, Green Day | 1 Deezer call | **Approve as a ranking boost.** Deezer album dates are reissues (Verve 2017, RHCP 1999), so they are useless as an era check |
| **Member moved** | MB `artist/{mbid}?inc=artist-rels`, `member of band` | Oasis: Liam to Beady Eye, Guigsy to Cornershop, Bonehead to The Rain. Nirvana: Crover to Melvins, but also junk pre-fame bands (Fecal Matter, Brown Towel). Blur's members carry no instrument attributes. Dates are mostly null | 1 MB call per member | **Approve, max 2 members per node, and only bands with a matching Deezer artist** |
| **Built on** | MB work rels `based on` (backward) + recording rels `samples material` (backward) | The Verve's BSS is based on The Rolling Stones' "The Last Time". Wonderwall and Teen Spirit have only *forward* rels (parodies, 37 mashups), so 1 of 3 hit | 2 MB calls (recording + work) | **Approve, backward only.** Forward rels are noise |
| **Roots** (influence) | Wikidata `P737` on the artist's QID (from MB `url-rels` type `wikidata`) | Oasis: Beatles, Stones, Who, Kinks. Nirvana: Pixies, Sonic Youth, Stooges, Zeppelin, Sabbath, Wipers, Vaselines, Melvins. Earlier, obscure artists gave 0 to 2 (doc 02 #8) | 2 Wikidata calls, no MB pacing | **Approve, max 1 node per parent.** Big artists only |
| **Same producer** | existing credits logic: `recording?inc=artist-rels`, then the producer's `artist?inc=recording-rels` | Teen Spirit has producers and engineers. The original Wonderwall recording has 0 artist rels | rides on the Built-on call, +1 | **Approve for "More" only** |
| **Same label + era** | MB `release?query=label:"X" AND date:[y-2 TO y+2]` | Creation Records 1993-97: 23 artists (Boo Radleys, Teenage Fanclub, Slowdive, Swervedriver, Heavy Stereo). The label comes only from the MB `recording contract` rel: Oasis has it, Nirvana has none. Deezer album labels are reissue labels (Ignition 2025, Geffen 2011) | 1 MB call | **Approve for "More" only, when the MB label rel exists** |
| Wikipedia "inspired by" text | song article extract | Wonderwall: "title inspired by George Harrison's *Wonderwall Music*" is an album and not resolvable. Teen Spirit: 0 sentences | 1 call | **Reject** as an edge. It stays in About |
| Covers | MB work `performance` + `cover` | 165 / 317 covers | 1 MB call | **Reject.** Same song, so it does not open up the genre |

Edge labels (the chip on each node, which is the "why" line):
- Same scene: "Same scene: britpop, UK, formed 1989"; with the boost, add "· fans of Oasis play them too".
- Member moved: "Liam Gallagher (vocals) went on to Beady Eye", or "...came from Ride" for a member who joined later.
- Built on: "Built on The Rolling Stones' 'The Last Time'" (samples: "Samples ...").
- Roots: "Oasis named The Kinks as an influence".
- Same producer: "Also produced by Butch Vig".
- Same label: "Also on Creation Records, 1993-97".

Fallbacks: no MB tags means no scene. In that case use Deezer related, keeping only artists whose MB search
`life-span.begin` is within ±8 years of the parent (1 MB call each, at most 3). If that is also empty, the
node shows "No family found yet" and a "Try More" button.

## 3. Tree-building algorithm
Inputs: `root = {title, artist, deezerTrackId}` from Saved, or from the old Liner search box (kept as a secondary option).

1. **Root artist** (MB 1): `artist?query=artist:"<artist>"&limit=3`. Keep the exact-name match.
   The search result already carries `tags`, `life-span.begin`, `country` and `type`. Top tag means
   highest `count`, skipping generic tags (`rock`, `pop`, `british`, `seen live`, any country name).
2. **Scene list** (MB 1): `artist?query=tag:"<topTag>" AND begin:[b-6 TO b+4] AND country:<cc>&limit=50`,
   started at the same time as step 3. Add `AND type:group` only when the root is a group.
   **Related** (Deezer 1): `search/artist?q=` exact match, then `artist/{id}/related?limit=25`.
3. **First children (target: under 5 s).** Rank the candidates:
   score = 3 if the artist is in the scene list AND in the parent's Deezer related; 2 if only in the scene list;
   then add the MB search score / 100. Show the top 2 as soon as steps 1-2 return (about 3.5 s).
4. **Special slot** (MB 3-4, in the background): `artist/{mbid}?inc=artist-rels+url-rels`, then up to 2
   member calls, then recording search `recording?query=recording:"<title>" AND artist:"<artist>"&limit=5`.
   Keep the recording with the earliest `first-release-date`; do not use the Deezer ISRC, because Saved can
   hold a 2025 live version. Then `work/{id}?inc=work-rels`. The third child is the first available of
   **Built on > Member moved > Roots**; if none exists, use the third scene candidate.
5. **Level 2 (3 parents × 3 children).** For each child: MB artist search (1), `artist-rels+url-rels` (1),
   and 1 member call. Reuse the **root's scene list**: do not run a new scene query. Rank it with the
   child's own Deezer related list. Built on and producer edges run for children only on "More".
6. **Pick the song for an artist node:** Built-on edges carry their exact song. Otherwise use Deezer
   `artist/{id}/top?limit=10`, take the first track with a `preview` whose title has no
   live/remix/demo/version wording, and strip remaster suffixes (existing helper). Use the existing
   `resolvePreview` when a node is played.
7. **Dedupe:** one `Set` per tree of normalised artist names plus MBIDs, seeded with the root artist and
   members' solo names that Deezer related returns (e.g. "Liam Gallagher" under Oasis). An artist never
   appears twice in one tree. Optional toggle "Skip artists I've saved" (default off) seeds the set with
   Saved artists. `heard` artists are ranked down by 0.5, not removed.
8. **Era guard:** scene candidates already sit inside the begin window. A Member-moved band must have
   `begin` ≤ parent begin + 15 or null. Roots ignores era (it is meant to go back in time), but allows
   only 1 Roots node per parent and at most 2 per tree.

Budget per tree: root 7 MB calls + level 2 at 3 × 3 = 9, so about 16 MB calls ≈ 24 s, and Deezer about 20 calls.
Nodes stream in as they resolve, and the progress line reads "Growing... 7/12".

## 4. Limits and "More"
- Auto-build: depth 2, 3 children per node, so at most 1 + 3 + 9 = 13 songs.
- **More like this branch** (on every node): adds 3 more children. It first takes from that node's leftover
  ranked queue (0 calls). When the queue is empty, it pulls in order: Built on (2 MB), Same producer (1-2 MB),
  Same label (1 MB, only with an MB label rel), and finally the node's own scene query (1 MB).
- **Grow** on a leaf builds its children (same as step 5), so the tree can go deeper one click at a time.
- Hard cap of 60 nodes per tree. Past that, More is disabled with the line "This tree is full. Start a
  new one from any song."
- Only one build runs at a time. Starting a new root cancels pending MB jobs for the old one (queue token).

## 5. Caching and rate limits
- All calls go through the existing `api:get` IPC (host allowlist + UA + MB 1.5 s queue). Add
  `www.wikidata.org` to the allowlist; Wikipedia is already allowed.
- TTL: MB 30 days and Wikidata 30 days (existing cache). Deezer stays at 10 min for previews; `related`
  and `top` lists may use 1 day, because they contain no preview tokens.
- Errors: Deezer errors arrive as HTTP 200 with `error`, and `code 4` waits 5 s and retries once. MB 503
  backs off 2 s, then 4 s (existing). A failed source skips that edge and does not fail the tree.
- Save the finished tree in the store under `trees[rootDeezerId]` as `{nodes, edges, builtAt}`, without
  preview URLs. Reopening it is instant. A "Rebuild" button ignores the stored tree.

## 6. UI
- Top bar: a root picker (Saved songs dropdown, newest first) + "or search" (the Liner search box) + "Grow tree".
- The tree renders as an indented outline (`role="tree"`, `treeitem`, arrow keys expand and collapse),
  not a canvas. This is cheaper and accessible.
- A node row shows: step number · title - artist (year) · edge chip (§2 label) · Play · Love (to Saved) ·
  About toggle (existing About flow) · More like this branch · Grow (leaves only).
- **Guided path:** step numbers follow depth-first pre-order (1 = first child, 1.1, 1.2, then 2 ...), so the
  tree reads like a walk: Wonderwall → Bitter Sweet Symphony → The Last Time → ... "Play the path" queues
  the steps in that order using the existing player. Next/prev follow the numbers.
- Nodes still loading show a skeleton row with the edge label already filled in.
- An empty Saved list shows the search box plus "Save songs in Blind Test or Passport to grow trees from them."

## 7. Old Liner Notes features
- **Search box:** kept, as the secondary root picker.
- **Credits → person trail:** folded in as the **Same producer** edge (for "More" only). The standalone
  credits panel and breadcrumbs are **dropped**.
- **Covers tab:** **dropped**, because it is off-theme (same song, not new artists). Its MB work call is
  reused for Built on.
- Code to reuse: MB client/queue, `resolvePreview`, remaster-suffix strip, About flow, Saved/heard store.
  Remove the `liner` section and tab, and rename the home card and `data-goto` to `tree`.

## 8. Acceptance criteria
1. Root "Oasis - Wonderwall": the first 2 children show within 5 s, and the full 2-level tree within 30 s.
   Level 1 contains **The Verve - Bitter Sweet Symphony** and a **Blur** song, both with chips
   "Same scene: britpop, UK ...". The tree observed from the live data, after applying §3:
   ```
   Oasis - Wonderwall  (britpop, GB, 1991)
   1 The Verve - Bitter Sweet Symphony   Same scene · fans of Oasis play them too
     1.1 The Rolling Stones - The Last Time   Built on 'The Last Time'
     1.2 Suede                              Same scene · fans of The Verve play them too
     1.3 Manic Street Preachers             Same scene · fans of The Verve play them too
   2 Blur - Song 2                       Same scene · fans of Oasis play them too
     2.1 Supergrass                         Same scene · fans of Blur play them too
     2.2 Radiohead                          Same scene (top MB hit)
     2.3 (Damon Albarn / Graham Coxon member call; not run in the probe)
   3 Beady Eye - Start Anew              Liam Gallagher (vocals) went on to Beady Eye
     3.1 The Charlatans                     Same scene · fans of Beady Eye play them too
     3.2 The Kinks                          Oasis named The Kinks as an influence
     3.3 Ocean Colour Scene                 Same scene
   ```
2. "Nirvana - Smells Like Teen Spirit": level 1 is drawn from Pearl Jam, Soundgarden, Alice in Chains,
   Smashing Pumpkins and Mudhoney; More on the root offers Roots (Pixies / Sonic Youth / Melvins) and
   "Also produced by Butch Vig".
3. No artist appears twice in a tree, and the root artist never appears as a child.
4. Every node has a non-empty chip label. A node with no preview shows "No preview" and stays in the tree.
5. More adds exactly 3 children (or says "No more family found"). The cap of 60 holds.
6. A song with no MB tags (e.g. "Hailu Mergia - Tezeta") falls back to era-checked Deezer related, or shows
   the empty state without errors.
7. No MB burst: the logged MB requests are spaced ≥ 1.5 s apart. Reopening a built tree makes 0 MB calls.

## 9. Risks
- MB tag quality varies: the grunge scene list includes Metallica, Warrant and Anthrax. The Deezer-related
  boost pushes them down but cannot remove them.
- Member data is noisy (pre-fame bands with no releases) and mostly undated. The Deezer-artist-exists
  filter is the only guard.
- Built on and Roots are sparse (1 of 3 songs, and big artists only), so most trees will be mostly scene edges.
- MB artist search by name can pick the wrong homonym ("Blur", "Cast", "Gene"). Mitigation: require the
  scene tag or country to match before accepting.
