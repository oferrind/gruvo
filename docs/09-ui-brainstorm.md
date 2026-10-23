# 09 · UI brainstorm (Designer)

> DEGRADED: single-context, screenshots only (no live app, no detector run; machine low on memory).
> Sources: `adv-more`, `snake-blind-after`, `desc-wiki`, `design-saved-dark`, `design-passport-dark`,
> `prefs-onboarding-dark`, `prefs-tab-light` (some are pre-scale and still say "Liner Notes"), `PRODUCT.md`, the tokens in `styles.css`.
> Limits: Genre Stamps replaces Passport (Strategist), and the Family Tree node action row belongs to the Builder (Skip/OK/Love).

## 1. Critique

**Verdict:** the "after hours at the record shop" world is real. Walnut and amber, the Big Shoulders display face, ink stamps and relation-coloured
tree edges are specific to this product, not a template. The weak points are the *moments*. The reveal, the love and the stamp all land
as static state changes, and every tab except the Tree leaves half the window empty.

**Strengths:** (1) the stamp art and the tree edge inks carry the brand. (2) Keyboard use is first-class and shown on screen (kbd chips).
(3) Copy is human ("Comfort zone ↔ Total stranger", "never plays them back to you").

| Tab | Top problems |
|---|---|
| Blind Test | The mystery card fills about 55% of the width and the right half is dead. The vinyl is static, so nothing says "listening". The reveal is a text dump (the wiki paragraph comes before the tags, and "Picked at random from Greece" is buried). The keys legend and the Adventure slider float below the card with no grouping. |
| Genre Stamps (was Passport) | The old Passport put a long scrolling list of country chips in a box beside a big empty area. Stamps lived in two places (Passport and Saved). The new tab must not repeat the chip-wall. |
| Family Tree | It is dense but readable. Every card repeats the same reason ("Same scene: alternative rock, UK…") 5×, and the root card is pushed to the top-right corner and cut off. There is no page title or "you are here". |
| Saved | It is one flat list with no grouping, sorting or "where did I find it" filter. The Loved button has the same weight as a CTA (salmon fill) even though it is a state. |
| Preferences | The chip walls work but the hierarchy is flat (5 sections, all equal). The light theme is good, but the primary button and the selected chips share one brown, so "selected" and "action" read the same. |
| Nav + now-playing bar | The nav has no icons and no sense of progress. The bar shows no cover, can't scrub and doesn't say *where* the track came from. "Nothing playing" is a dead 90px strip. Full-song links duplicate the reveal. |

**Nielsen (0-4):** Visibility of status 2 · Match to real world 4 · User control 3 · Consistency 3 · Error prevention 3 ·
Recognition over recall 3 · Flexibility/efficiency 3 · Aesthetic & minimalist 3 · Error recovery n/a (not seen) · Help/docs 2. **≈ 26/36**

**Emotional journey:** the peak should be the reveal ("oh, it's *them*") and the end should be the stamp or the love. Both are flat today
(peak-end rule), so the single biggest lever is motion and staging at those two moments, not more features.

## 2. Ideas (impact 1-5 · effort S/M/L)

### Quick polish
| # | Idea | Tab | Imp | Eff | Risk / dependency |
|---|---|---|---|---|---|
| 1 | **Spinning record + progress ring**: the vinyl spins while playing, and its rim becomes the 30 s progress ring (replacing the separate bar) | Blind | 4 | S | Must stop under reduced-motion. CSS only. |
| 2 | **Reveal hierarchy**: artist and title, then a meta row (country · year · label · genre) with "Picked from Greece" as a tag, then the description clamped to 3 lines with "more" | Blind | 4 | S | None |
| 3 | **"Loved" as a state, not a CTA**: an outlined heart filled in love-red. The filled block is kept for actions only | global | 3 | S | Touches the shared Love button. Not the Tree action row. |
| 4 | **Page heads everywhere**: the same display H1 and one-line purpose on every tab (the Tree has none) | global | 2 | S | Tree head is the Builder's area. Add the head above the canvas only. |
| 5 | **Selected vs action colour (light theme)**: selected chips get an ink-tinted fill and a check, and the brown stays for buttons | Prefs | 3 | S | Token-only change |
| 6 | **Nav icons + counts**: small line icons, and a count on the Stamps tab like Saved has | nav | 2 | S | Icon set must ship locally (CSP) |

### Bigger UX
| # | Idea | Tab | Imp | Eff | Risk / dependency |
|---|---|---|---|---|---|
| 7 | **Sleeve-slide reveal**: on rating, the cover slides out of a sleeve over the record and the name types on in the display face. About 600 ms, skippable with Enter | Blind | 5 | M | Reduced-motion falls back to a fade |
| 8 | **Rating micro-interactions**: Love is an ink "stamp" press with a heart pulse, OK is a soft tick, Skip flicks the card away | Blind | 4 | S | Don't over-animate. 150-250 ms. |
| 9 | **Session rail**: a right-hand column in Blind Test listing tonight's reveals (mini cover, rating, ▶). It fills the dead space and lets you go back | Blind | 4 | M | Needs session state (in memory is fine) |
| 10 | **Now-playing bar 2.0**: cover thumbnail (a blurred "?" while it is a mystery), a draggable scrubber, a source chip ("Family Tree · 1.2", "Blind #4") that jumps back to where the track came from, and the bar collapses to 48 px when idle | bar | 4 | M | Needs the playing source to be stored with the track |
| 11 | **Cover-art accent**: sample the cover's dominant colour and use it as a soft glow behind the reveal card and the bar. Amber stays for controls | Blind, bar | 3 | M | Canvas CORS on Deezer images. Contrast must be clamped. |
| 12 | **Queue / up next**: "Play next" from the Tree and Saved, with a small queue popover on the bar | bar | 3 | L | Previews expire after about 15 min, so URLs must be re-resolved |
| 13 | **Command palette (Ctrl+K)**: jump to a tab, search a song to start a tree, toggle the theme, set Adventure | global | 3 | M | Keyboard focus trap. Discoverability. |
| 14 | **Saved, grouped**: filter chips by route (Blind / Tree / Stamps) and sort by date or place. Each row says how you found it ("via Damon Albarn") | Saved | 4 | M | Requires the origin to be saved with each love |
| 15 | **Taste map**: a page or Saved section with a world map dot-grid and a decade strip, coloured by loves | Saved | 3 | L | Data viz scope. May overlap Genre Stamps. |
| 16 | **Tab transitions**: a 150 ms crossfade with an 8 px rise. Panels keep their scroll | global | 2 | S | Reduced-motion off |
| 17 | **Onboarding as 3 steps**: artists, then genres, then eras/regions on one card each, with progress dots and a "Start listening" finale that drops you into a first mystery | Prefs | 3 | M | Prefs tab remains as an edit view |
| 18 | **Empty states with intent**: Saved, Tree and the bar each get one line of copy and one button ("Love something in Blind Test →"), with a small line illustration in ink | global | 3 | S | Copy only, plus an SVG |
| 19 | **Tree reason de-duplication**: when siblings share a reason, show it once on the branch label and keep only the *difference* on cards ("formed 1989") | Tree | 4 | M | Builder owns the Tree, so hand this to them later |
| 20 | **Accessibility pass**: live-region announcement on reveal, focus moved to the revealed title, visible focus on the tree canvas, forced-colors check on the stamps | global | 3 | S | None |

### For Genre Stamps (design when the tab is built)
| # | Idea | Imp | Eff | Risk |
|---|---|---|---|---|
| 21 | **Stamp book**: a two-page spread with perforated stamp slots. Empty slots show a faint outline of the combo you could earn | 5 | M | Must stay readable at 1366 px |
| 22 | **🎲 Roll moment**: three reels (decade · place · genre) spin and land one by one with a tick, then a "Listen" CTA. Rolling again is instant | 5 | M | Reduced-motion uses an instant swap |
| 23 | **Rarity**: the stamp border changes by how unusual the combo is (common → rare → "first listener"), using perforation and ink weight, not loot-box colours | 4 | M | Rarity needs a heuristic (catalogue size) |
| 24 | **Stamp landing**: on Love, the stamp drops into the book with an ink-press squash and a short paper sound (optional) | 4 | S | Sound must be opt-in |
| 25 | **Combo builder as a sentence**: "Play me [90s] [Japanese] [rock]". Each slot is a dropdown, which avoids the old chip-wall | 4 | S | None |

## 3. Recommended next sprint: top 5 (no Genre Stamps or Tree action-row dependencies)

1. **Sleeve-slide reveal and reveal hierarchy (#7 + #2)**, impact 5, effort M. This is the product's peak moment, so it gives the biggest emotional return for the effort.
2. **Spinning record + progress ring (#1)**, impact 4, effort S. It shows status at a glance and makes the mystery feel alive. Cheap.
3. **Rating micro-interactions + "Loved" as a state (#8 + #3)**, impact 4, effort S. It gives the "end" of every loop a payoff and fixes a consistency error.
4. **Now-playing bar 2.0 (#10)**, impact 4, effort M. The bar is on every tab, and the source chip ties the three routes together ("why is this playing?").
5. **Session rail in Blind Test (#9)**, impact 4, effort M. It fills the dead half of the main screen and gives recall over memory of tonight's finds.

The reasoning: 4 of the 5 touch the Blind Test and the bar, which the user sees most. All are CSS and renderer work with no API or data-model risk
except #10's source chip. Each one respects reduced-motion. Tab transitions (#16) and empty states (#18) can ride along if there is time.

## 4. Questions for the user (with the default if no answer)

1. **Bolder or calmer?** Should the app get louder overall, or stay calm with a few big moments?
   *Default:* calm chrome and bold moments. Nav and forms stay quiet, while the reveal, love and stamp get the motion.
2. **Do you want a home or dashboard tab** (recent finds, stats, taste map) or should it open straight into Blind Test?
   *Default:* no new tab. Blind Test stays the landing page, the session rail (#9) covers "recent", and stats come later inside Saved.
3. **Should album cover colours tint the UI** (#11), or should everything stay amber?
   *Default:* stay amber for now. I will try a soft cover-coloured glow behind the reveal card only, behind one CSS variable, so it is easy to remove.
