# 10. Design audit: how AI-generated does it look?

Advisor, 2026-10-23. Audited **main** (adf6eaf) and the Designer's in-progress worktree
`.claude/worktrees/agent-abd275b42f380329b` (commit c479a5c plus uncommitted `index.html` and `app.js`; **`styles.css` is still
untouched there**, and there are no `up-*` screenshots, so the pass is judged on its markup, JS and copy). Screenshots used:
`adv-blind.png`, `desc-wiki.png`, `tree-rate-peek.png`, `prefs-saved-dark.png`, `verify-01-prefs.png`. Electron was not launched.

## 1. Verdict: slop score (0 = hand-made by someone who loves records, 10 = template)

| Area | Main | In-progress | One-line reason |
|---|---|---|---|
| Home (main: first-launch intro) | 6 | 7 | Main: three equal cards. Pass: a stock dashboard (Continue card, stats list, 3 cards again, feed) |
| Blind Test | 5 | 4 | The record button and reveal are real ideas, but three equal buttons and a full-width amber slab bury them. Deck, tonearm and rail help |
| Family Tree | 4 | 4 | The winding amber trail is the most original thing in the app. Six-button soup on every card cheapens it |
| Saved | 5 | 5 | A column of salmon "♥ Loved" slabs on a page where everything is loved. Big empty stamp panel |
| Preferences | 6 | 6 | A wall of identical pills straight from Deezer's taxonomy ("Kids", "Films/Games") |
| Nav / now-playing | 6 | 5 | Placeholder brand name, generic round play button, full-song links shown twice |
| Copy | 4 | 4 | Plain, honest and mostly free of hype. Middle dots everywhere. The new Home lines read as template |
| **Overall** | **5** | **5** (about 3 if the "Fix now" list lands) | |

What earns praise: the walnut-and-amber palette (specific, not a default). Big Shoulders as the display face, self-hosted. The
tree trail with branch signs in their own inks. Themed selection colour, caret and scrollbar (`styles.css:139-141`). "Comfort zone /
Total stranger". "Tonight's reveals". The price-sticker idea ("Near Oasis"). The `forced-colors` and reduced-motion support.

## 2. AI tells, ranked by how much they cheapen the app

1. **Button soup on every tree card.** Screenshot `tree-rate-peek.png`: "Skip OK ♡ Love About ⌄ Full song ⌄ + More" is
   repeated on every node (`app.js` node actions; `styles.css:348-363`). Seven equal-weight text buttons per card is what a
   generator does when it cannot choose. *Fix:* show only ▶, ♡ and More at rest. Put Skip, OK, About and Full song in one "⋯"
   `details` that opens on hover or focus-within. Drop Skip and OK from the tree completely if rating there is not core.
2. **The reveal is outshouted by "Next mystery".** `adv-blind.png`: a 100%-wide amber bar (`styles.css:226`) with a blue
   3px focus ring (`--color-focus:#7cc4ff`, `:22`) is the loudest thing on screen, louder than the artist. *Fix:* make
   `#mystery-next` `width:auto; align-self:flex-end`, a ghost button with an amber underline. Use the amber focus ring:
   `--color-focus: #f6c36a` (dark) and `#8c4a0c` (light), `outline-width:2px`.
3. **Three equal rating buttons** (`.rate { grid-template-columns: repeat(3,1fr) }`, `styles.css:221`). Perfect symmetry, and
   pre-tinted Love border. *Fix:* `grid-template-columns: 1fr 1fr 1.6fr`. Skip and OK as quiet outline buttons, Love solid
   from the start, kbd hints at 50% opacity.
4. **Everything is a pill** (radius 999 on `.chip`, `.facts li`, `.count`, `.branch-name`, `.step`, `.toast`, `.picked-chip`;
   `styles.css:159,164,242,366,376,422,440`). *Fix:* keep pills only for toggles (genre and decade chips). Facts become one
   plain line in small caps: `DANKÉLÉ / 2020 / LUSAFRICA` (`font-variant: all-small-caps; letter-spacing:.06em`).
   Counts become plain tabular numerals in muted text ("Saved 3"). Branch signs keep their outline but `border-radius:3px`
   (a shelf divider, not a tag).
5. **Saved: a red "♥ Loved" slab on every row** (`prefs-saved-dark.png`, `.love[aria-pressed=true]`, `styles.css:269`). On a
   page of loved songs it is noise. *Fix:* in Saved, a 28px heart icon button (filled, `color: var(--color-love)`, no
   background) with the label "Remove from Saved" in aria-label and title only.
6. **Unicode glyphs as icons**: ▶ ❚❚ ♥ ♡ ✕ ↗ (`app.js:70,79,152,173,773`; `styles.css:430`). These are banned in
   craft-floor ("Unicode glyphs or emoji standing in for an icon system"). The tree already has authored 16px SVG icons
   (`app.js:577-583`). *Fix:* draw play, pause, heart and close in the same 1.6 stroke and use them everywhere.
7. **Placeholder brand.** "Music Discovery" (`index.html:7,13`) is a category name, not a name. *Fix:* the Designer already
   wrote the name: **After Hours**. Use it in the topbar and `<title>`, and drop "After hours" as the Home H1.
8. **Body font is the platform sans** (`--font-body: system-ui, "Segoe UI"`, `styles.css:42`). Big Shoulders does all the
   character work alone. *Fix:* self-host one text face. Either a serif for the About/liner text only (e.g. Literata or Source
   Serif 4 at 15px/1.55, `max-width:62ch`), or a humanist sans with character for the UI. Do not add both.
9. **Middle-dot overuse.** It appears in the keys hint, "50 · Half near…", "Favourite artists · three or more", tree reasons
   ("formed 1989 · fans of…"), and in the pass: "loved · OK · skipped", "Random trip · Greece", "Blind Test · #3",
   `played … · From …`. *Fix:* use at most one per line. Use a colon or a comma: "50: half near what you loved, half strangers".
   Write sentences: "Formed 1989. Fans of Supergrass play them too."
10. **Tree reasons repeat the branch sign.** "Same scene: britpop, UK…" sits under a SAME SCENE sign
    (`EDGE_NAMES`, `app.js:560`). *Fix:* drop the prefix in the card reason when the card sits under its branch sign.
11. **Duplicate content.** Artist equals title ("Bamba Wassoulou Groove / Bamba Wassoulou Groove", `adv-blind.png`, reveal
    and bar). The full-song links appear in both the reveal and the bar at the same moment. *Fix:* hide `.reveal-title`
    when it equals the artist. Show full-song links in the bar only when the reveal is off screen.
12. **Provenance that is wrong reads as fabricated.** "Picked at random from Greece" for Moist, a Canadian band
    (`desc-wiki.png`). A made-up-sounding fact is the most "AI" thing a music app can say. *Fix:* only print the place when
    the artist's MusicBrainz area matches it. Otherwise write "Picked at random".
13. **Soft-shadowed rounded rectangles.** `.card` and `.node-card` use `--radius-lg:14px` plus `--shadow` (`styles.css:57,193,336`),
    and on walnut the shadow is invisible. *Fix:* `--radius-lg: 6px`, no shadow on node cards, and a 1px top highlight only.
    Sleeves are square: covers are already `3px`. Make the containers agree.
14. **Preferences: a wall of identical pills from an API taxonomy** (`verify-01-prefs.png`). "Kids", "Films/Games", "Asian
    Music" are Deezer's labels, not a record shop's bins. *Fix:* hide Kids and Films/Games. Rename "X Music" to "X". Set the
    decades in Big Shoulders 20px as a row of plain toggles, not pills. Replace the empty state "None yet." with
    "Add three. We listen to them and never play them back."
15. **Detector: radial halo plus repeating stripes** (see §5). The stamp guilloche (`styles.css:287`) reads as vinyl
    grooves, but across a full-width empty panel it is wallpaper. *Fix:* size the stamp panel to its content
    (`width: fit-content; min-width: 50%`), and show the grooves only behind stamps.
16. **Low-information states.** "Nothing playing", "No family found yet.", "Can't reach the music services." *Fix:* "Nothing
    on the platter.", "No relatives on record for this one. Try a song by a band, not a solo name.", "Offline: the shop's
    radio can't reach Deezer. Retry."

**In-progress pass, specific risks:**
- **Home is the stock SaaS dashboard** (`index.html` worktree lines 45-61): a "Continue where you left off" card, a "Your taste
  so far" stats `dl`, "Ways in" (the intro's three cards a second time, `app.js:872`) and a "Recent finds" feed. Every AI app
  home looks like this. "The shop's quiet. Pick up where you left off…" is theme-park copy. *Fix:* one thing, not four.
  Show the last record as a big sleeve on the counter: "Last on the platter: Moist, *Deliver Me*. Play it again / Next
  mystery". Then the crate (Recent finds) as covers, no stats block. Cut "Ways in": the tabs already are the ways in.
- **"Mystery track #N" is back** (`app.js:440`, plus the `· #N` in the from-label). The user had it removed (021b64f). Revert it.
- **Progress rim around the record** is on craft-floor's refuse list ("progress rings"). *Fix:* let the tonearm travel
  across the record as the progress (rotate 0→22° over the preview). Drop the ring SVG and keep a sr-only progress bar.
- **Monospace for metadata** turns into a costume if it touches labels. Use it only for measurements: time `0:29`, year,
  step numbers. Never for sticker text or headings.
- **Motion budget.** Sleeve-slide, needle-drop, spin, rate micro-bursts, stamp, grow, draw and breathe add up to eight
  effects. Craft-floor allows one authored moment. Make the **sleeve-slide reveal** the moment (520ms). Everything else ≤160ms
  or static.
- **Paper grain** as a full-page overlay is a 2023 landing-page tell. If you keep it, use it only on `.card`/sleeve surfaces,
  `opacity ≤ .035`.
- **Duotone covers** must stay on past items in the rail only, never in Saved or the tree. The covers are the only real
  content. **Cover tint**: clamp it as tint.js does and apply it to one surface (the now-playing bar), not the whole page.
- `img.crossOrigin = 'anonymous'` (`app.js:137`) fails the image load on any CDN without CORS headers. Check that
  mzstatic covers still render, or read pixels only when CORS succeeds.

## 3. Fix now (current pass: small, high leverage)

1. Revert "Mystery track #N" and "· #N" (`app.js:440`, from-labels). Use "Mystery track" and "Blind Test".
2. Home: cut "Ways in" and the taste `dl`. Use one "last on the platter" sleeve plus a crate of covers. Rewrite the H1/lede.
3. Rename the brand "Music Discovery" to **After Hours** (topbar and `<title>`).
4. Tree cards: rest state ▶ ♡ More only. The other actions go behind "⋯" on hover/focus.
5. `#mystery-next`: auto width, quiet, right-aligned. Focus ring amber, 2px.
6. Rate grid `1fr 1fr 1.6fr`, with Love solid and kbd hints dimmed.
7. Replace the glyph icons (▶ ❚❚ ♥ ♡ ✕ ↗) with authored SVGs in the tree icons' stroke.
8. Drop the progress rim. The tonearm angle is the progress.
9. Strip pills from facts, counts and toast. Facts become one small-caps line with slashes.
10. Radii: `--radius-lg: 6px`, no shadow on `.node-card`. Middle dots at most one per line. Hide the reveal title when it
    equals the artist.

## 4. Later

- Self-host one text face (serif for the liner/About text). Big Shoulders stays the display face.
- Saved: heart icon instead of slabs. Group by month ("October: 4 records") rather than a flat list.
- Preferences: a curated genre list written by a person (bins: "Highlife & Afrobeat", "Bossa & MPB", "Krautrock"…) instead of Deezer's.
- Provenance correctness before any "from X" copy (item 12).
- The edge inks: `--ink-4`/`--edge-producer` lilac `#c3a2ec` is the one AI-pastel in a walnut room. Shift it to a
  stamp-pad violet `#a58bd0`, or replace it with oxblood.

**Lessons for Genre Stamps (replacing Passport):**
- A stamp earns its place only when it records something that happened (you loved a track there). Never show empty
  placeholder stamps or a "0 / 120 collected" progress bar: that is gamification slop.
- Keep the real ink: the double border, the noise mask and the rotation (`styles.css:289-297`) are the best surface work in the app.
  But draw the four shapes from the genre (round for jazz labels, oblong for customs), not cycled by `nth-child`.
- Each stamp carries a date and the track that earned it, in small type ("12 OCT · Fela Kuti, *Zombie*"), so the
  page reads like a passport, not a badge grid.
- No full-width ruled panel for two stamps: let the page grow with the collection. The empty state is one line and one
  button ("Love a track and its genre gets stamped here").
- No equal-size cards for genres, no pills, no emoji flags.

## 5. Raw detector output (`impeccable detect --json`)

| Target | Findings |
|---|---|
| main `renderer/index.html` | `radial-halo` (warning, slop): "radial-gradient halo (#f0a63a → transparent) on dark page"; `repeating-stripes-gradient` (advisory, slop) |
| main `renderer/styles.css` | 0 when scanned alone (the two findings above come from the linked CSS: `.brand::before`/`.bigplay` and `.stamps`/`.bigplay`) |
| main `renderer/app.js` | 0 |
| worktree `styles.css` + `index.html` + `app.js` | the same 2 (CSS unchanged so far) |

**Totals: main 2 (1 warning, 1 advisory). In-progress 2 (1 warning, 1 advisory).** The halo is really the record label on the
logo and the play disc, so it is close to a false positive. The stripes are real (see tell 15).
