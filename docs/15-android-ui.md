# 15 - Android UI

Status: proposal, 2026-10-26. Author: Designer (board). Companion to `docs/13-android-port-plan.md`. Where it disagrees with section 3 of doc 13, it says why.

Ground rule: Material 3 is the engine (insets, ripples, semantics, sheets). Nothing should look like the M3 sample app.

## 1. Navigation model

**Bottom bar, 4 destinations: Blind Test, Crate Dig, Tree, Saved** (as doc 13 proposes). Preferences is a gear at the top-right of every top bar.

Home is not a tab, and is not folded into Blind Test (doc 13's idea). Its three parts go elsewhere:

| Desktop Home part | Phone |
|---|---|
| "Last on the platter" | The **mini-player** itself: on cold start it shows the last track, paused. |
| "Other ways in" | The bottom bar does the same job. |
| "Recent finds" | Saved gets two segments: **Loved / Recent**. |

The first-launch intro is shown once, full screen, then Preferences opens, as on desktop. After that, the app opens on the last destination used.

| Surface | Form | Why |
|---|---|---|
| Song ⋯ menu (About, Full song, Spotify, Skip/OK) | Modal bottom sheet | Hover-pinned popovers don't work on touch |
| Pick one slots (decade / place / genre) | One bottom sheet per slot | See risk 3 |
| Tree Grow settings | Bottom sheet | It is already a disclosure on desktop |
| Adventure slider | Inline under the record | It is the Blind Test's one dial. A sheet (doc 13) hides it. |
| Expanded player | Full-height sheet, opened by swiping up on the mini-player | Standard pattern |
| Tree search, Preferences, Browse → song list | Full screen | Typing, long forms, list-detail |

Predictive back works everywhere. Back closes an open sheet before it leaves the screen.

## 2. Screens (at 360 dp, about 40 columns)

Touch targets are at least 48 dp. Track rows are 64 dp tall: a 44 dp cover, a 48 dp hit area around the 34 dp play disc, and a 48 dp ⋯. Rate buttons are 56 dp tall, each a third of the width.

### Blind Test

```
 BLIND TEST                         [⚙]
┌──────────────────────────────────────┐
│        ╭──────────╮   ╱ tonearm      │
│       │  ((  ▶  )) │ ╱               │  record = play/pause
│        ╰──────────╯                  │  (≥ 200 dp)
│  Mystery #14                         │
│ ┌──────────┐┌──────────┐┌──────────┐ │
│ │   Skip   ││    OK    ││  ♥ Love  │ │  56 dp, thumb zone
│ └──────────┘└──────────┘└──────────┘ │
└──────────────────────────────────────┘
  Adventure  comfort ●━━━━━━━○ stranger
  TONIGHT'S REVEALS (3)            [v]  ← collapsed strip
 [▣ mini-player ......... ▶  ♥ ]
 [ Blind ][ Crate ][ Tree ][ Saved ]
```

After rating, the sleeve slides over the record and "You said Love" is stamped on it, as on desktop. The reveal replaces the rate row in place, so the card does not jump. It shows the artist in Big Shoulders, year and place in mono, the sound reason and a "why" sticker. A full-width "Next mystery" button takes the buttons' place. There is no swipe-to-rate in v1 (risk 2). Haptics: a light tick on Skip and OK, a heavier press on Love.

### Crate Dig: Roll

```
 CRATE DIG                          [⚙]
 ( Roll )( Browse )
 SURPRISE ME
 ┌──────────────────────────────────┐
 │▒▒▒▒▒ NORTHERN SOUL · 1960s ▒▒▒▒▒│  reel, 56 dp
 └──────────────────────────────────┘
 [      ROLL      ]   ☐ Adventurous
 ─────────────── PICK ONE ──────────
 Play me  90s̲  Japanese̲  rock̲   [▶ Play]
 ─────────────────────────────────────
 Northern Soul · 10 songs
 ▣ Title / Artist          ▶   ♥   ⋯
 ▣ ...
 [ More songs ]   [ Export to Spotify ]
```

Songs appear below the reel in the same scroll, so rolling again stays one thumb-move away. Once the reel scrolls off screen, Roll pins above the mini-player as a bar (not a FAB). Three inline rate buttons would squeeze the title at 360 dp. So **rows show play, title/artist, ♥ and ⋯, and Skip/OK move into the ⋯ sheet**. Wider screens keep them inline.

### Crate Dig: Browse

```
 ( Roll )( Browse )
 ( Scenes )( Genres 1,142 )
 [🔍 Search genres: zeuhl, shoegaze... ]   ← pinned
 Family: All̲   Depth: Any̲
 ── ROCK ──────────────────── sticky ──
 ■ Shoegaze          UK · 1988      ›
 ■ Space rock        ...            ›
```

A `LazyColumn` with sticky family headers and the search field pinned, as in doc 13. Scenes keep the continent ink square (`INK`) as each row's leading mark. The app remembers whether you were on Roll or Browse.

### Family Tree

```
 FAMILY TREE                   [≡][⚙]
 From Saved: Wonderwall̲   [ Grow ]
 [🔍 Or any song                    ]
 ◉─┬ ▣ Wonderwall · Oasis    ♥ ⋯
   │  ┌ MEMBER ┐ (sticker, -2°)
   │  ├─ 1.1 ▣ Song · Artist  ♥ ⋯
   │  └─ 1.2 ▣ ...
 ①─┼ ▣ Next stop · Artist    ♥ ⋯
   │  SAME SCENE  [+ More]
 ②─┼ ...
```

This is desktop's existing *narrow* layout, not a new outline: an amber trail down a gutter, indented branches, sticker signs in edge ink, and step markers. Connection labels are **always visible**. Doc 13's long-press "why" is dropped, because meaning that only appears on long-press is invisible to TalkBack users. `[≡]` opens Grow settings.

### Saved

```
 SAVED                     [⇪][⚙]
 ( Loved 42 )( Recent )
 ▣ Title / Artist   Love · 2d     ▶ ⋯
```

Swipe to remove, with an undo snackbar (as in doc 13). `[⇪]` exports to Spotify.

### Preferences

One scroll in desktop order. Scheme swatches in a 2-column grid, each in its own scheme; light/dark/system. The Spotify Client ID gets a Paste button.

## 3. Identity in Compose

**Carry over:** all 8 schemes × light/dark, generated into `Schemes.kt` from `styles.css` by a small script so the two can't drift. Also spacing (4/8/12/16/20/26 dp), the 6 dp radius and the 140 ms base duration.

| M3 role | Token |
|---|---|
| background / surface / surfaceContainer | `--color-bg` / `--color-surface` / `--color-surface-2` |
| primary / onPrimary | `--color-accent` / `--color-on-accent` |
| onSurface / onSurfaceVariant / outline | `--color-text` / `--color-muted` / `--color-border` |
| error / errorContainer | `--color-error` / `--color-error-bg` |

Tokens with no M3 role go in a `StumbleColors` CompositionLocal: love, the 10 `edge-*` inks, sticker and sticker-ink, vinyl and groove, and the live cover tint.

**Rules against the stock M3 look:**
- **Dynamic colour (Material You) is off.** The scheme is the brand.
- `tonalElevation = 0`. Depth comes from hairline borders and `--shadow`, not tinted surfaces.
- 6 dp corners everywhere, sheets included (M3's default is 28 dp).
- The NavigationBar's pill indicator is removed. The selected label is Big Shoulders 700 with an accent underline.
- No FAB and no collapsing large titles. Screen titles are Big Shoulders uppercase, 28 sp, in a plain 56 dp bar. Ripples use the accent at 12%.
- Stickers are drawn in house (sticker paper, dark ink, tilted -2° on tree signs), not built from `AssistChip`.

**Type:** Big Shoulders Display (variable TTF, ship the OFL licence) for display, headline and title styles. Body text uses the system sans, as on desktop. `FontFamily.Monospace` is only for years, counts, times and steps.

**Texture:** `--grain` and `--paper` become two static 180 px `ImageBitmap` tiles, drawn with `ShaderBrush(ImageShader(…, TileMode.Repeated))`.

**Cover tint:** port `tint.js`. It samples the cover at 24×24 for hue and saturation, and fixes lightness per theme (66% dark, 27% light), which keeps text at AA contrast.

**Duotone:** past covers get a per-scheme `ColorMatrix`, and their colour comes back while they play.

## 4. Mini-player and notification

```
 ┌──────────────────────────────────────┐
 │▣ Title – Artist         From Tree ›  │ 64 dp, surface-2,
 │━━━━━━━━━━━━○──────────    ▶     ♥    │ 2 dp seek line
 └──────────────────────────────────────┘
```

- **Idle:** 44 dp, muted "Nothing playing". Hidden on the intro and in Preferences.
- **Unrated mystery:** reads "Mystery track", with a vinyl label in the accent colour instead of a cover. ♥ rates it Love, as on desktop, so nothing leaks.
- **"From …"** stays a quiet text link back to where the song came from.
- **Expanded sheet:** big cover (or the spinning record for a mystery), seek bar with mono times, rate row, "why" sticker, Full song and Spotify.
- **Notification and lock screen:**
  - On Android 13+ the media notification takes its colours from the artwork, so the artwork is our only styling lever.
  - Mysteries get a generated 512 px artwork: the record label in the scheme accent, with a "?" in Big Shoulders.
  - Title "Mystery track", subtitle "Stumble · Blind Test".
  - Custom buttons are **Love** and **Skip**. OK stays in the app, because a third custom button crowds the compact view.

## 5. Tablet and landscape

Layouts switch on `WindowSizeClass`:
- **Medium (≥ 600 dp):** a NavigationRail replaces the bottom bar, and the mini-player spans only the content area.
- **Expanded (≥ 840 dp):** the desktop layouts come back: Tonight's reveals as a right rail, Crate Dig as list-detail, and the Tree as the *winding* snake (desktop's `min-width: 820px` rules).
- **Phone landscape:** in Blind Test the record sits left and rate/reveal sits right. Other screens just scroll.

## 6. Accessibility

- **TalkBack:**
  - Port the desktop labels word for word ("Love Oasis – Wonderwall", "More from this branch: …", "Go back to …").
  - The record has `Role.Button` with a Play/Pause state.
  - The reel is hidden from TalkBack. A polite live region says "Rolled: Northern Soul, 1960s", as `#roll-said` does.
  - Rows offer `customActions`: Love, Skip, OK, About, Full song, and Remove in Saved.
  - Tree cards are read as "Step 2, connected by: same scene".
- **Contrast:** a JVM test in `:core` checks all 16 scheme/theme pairs and fails the build below 4.5:1: text and muted on bg/surface, accent on bg, on-accent on accent, each `edge-*` on bg, sticker-ink on sticker, love on surface, and the tint across hues.
- **Dynamic type:** sp throughout, tested at 200%. The reel and rate buttons use `heightIn(min=…)`, never a fixed height; the Pick one sentence wraps; above 1.5× the bottom bar shows icons only.
- **Motion:** when animations are off (animator scale 0 or reduce motion), the record doesn't spin, the tonearm moves in steps and the reel lands at once.
- **Hardware keyboard:** Space / 1 / 2 / 3 / Enter / R keep working, through `onKeyEvent`.

## 7. The five riskiest translations

1. **The reveal leaks through Android itself.**
   - *Risk:* the notification, lock screen, Bluetooth, Android Auto, Wear and "what's playing" all read the MediaSession metadata, and so does the recents thumbnail, which shows the screen.
   - *Handle:* keep the metadata at "Mystery track" plus the generated artwork until `rate()` runs. Mark the Blind Test window secure so the recents thumbnail stays blank. Test on a car display and a watch, not just the notification shade.
2. **Swipe-to-rate.**
   - *Risk:* a rating is final (`rated = true`) and teaches the taste model. OK has no natural swipe, so swipes push people to the extremes and skew the model. Edge swipes also clash with system back.
   - *Handle:* v1 ships with three big buttons plus Love and Skip in the notification. Add swipe in a later version only if testers ask for it: on the record only, with a 40% threshold and snap-back.
3. **The Pick one sentence.**
   - *Risk:* three dropdowns, one listing 1,142 genres, are unusable on a phone. Doc 13's chip sheet fixes that but loses the sentence, which is the feature's voice.
   - *Handle:* keep "Play me [90s] [Japanese] [rock]" with the three choices as underlined amber words. Each opens its own sheet: decades as a grid, places grouped by continent, genres with the Browse search. The hint line stays under the sentence.
4. **Tree lines in a lazy list.**
   - *Risk:* desktop draws every line on one canvas from measured card positions (`drawLines`). A `LazyColumn` doesn't measure off-screen cards, so lines break while scrolling.
   - *Handle:* each item draws its own segments in `drawBehind` (trail in, trail out, elbow to its sign), so they always line up. Only the expanded-width snake needs a measured overlay.
5. **Hover and keyboard cues with no phone equivalent.**
   - *Risk:* duotone-until-hover, hover-opened ⋯ menus, tooltips (Adventurous) and key hints.
   - *Handle:* duotone lifts on play; menus become sheets; tooltips become a first-time hint line; key hints show only with a hardware keyboard.
