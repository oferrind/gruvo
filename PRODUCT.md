# Product

<!-- impeccable:product-schema 1 -->

> Written by Agent 6 without a live interview (no answer mechanism in this subagent run).
> Every fact below is inferred from `docs/01-ideas.md`, `docs/02-evaluation.md` and the code; items marked *(inferred)* need user confirmation.

## Platform

web

(An Electron desktop app for Windows; the UI is a single HTML/CSS/JS renderer, so the design language is web.)

## Users

A curious listener on their own computer, usually with headphones, who is bored of "people who liked X also liked Y", genre radio and charts, and wants to find music they would never have searched for. *(inferred)* Sessions are short and playful: a few mysteries, a trip to one country and decade, or one credits trail from a song they already love.

## Product Purpose

Help a listener find new music through routes that are explainable and fun, not popularity. Success means the listener presses Love on something they had never heard of, and can say why they reached it.

## Positioning

Three discovery mechanisms that a similarity-based streaming app can't truthfully copy:
- **Blind Test**: a 30-second preview with no artist, title, cover or genre. The listener rates it, and only then sees who it was. An Adventure slider sets how far from their taste the picks go.
- **Passport**: pick a country and a decade, get playable tracks from there and then. Loving a track collects that country-decade stamp.
- **Family Tree**: start from a song you saved (or search one); grow a small explained tree of songs from its scene, members who moved on, what it is built on and its roots. Every step says why it is there.

## Operating Context

- Free, key-less public APIs only (Deezer, iTunes Search, MusicBrainz). Previews are 30 seconds, and Deezer preview URLs expire after about 15 minutes.
- Offline-capable shell: no remote fonts or scripts (a CSP blocks them); assets ship with the app.
- Keyboard use is first-class in Blind Test (Space, 1/2/3, Enter).
- Album cover art is the only imagery, and it comes from third parties in every style and colour.

## Capabilities and Constraints

- Tabs: Blind Test, Passport, Family Tree, Saved; one global now-playing bar.
- Saved holds loved tracks and collected stamps, stored locally.
- No accounts, no social features, no full-length playback.
- Never depend on BPM or audio features (the APIs don't provide them reliably).

## Evidence on Hand

No testimonials, user counts or press exist. Do not fabricate any.

## Product Principles

1. Judge the sound, not the name: hide identity until the listener has committed to an opinion.
2. Every discovery explains itself (a place and a time, a shared person, a cover of a known song).
3. Collecting is the reward: stamps and loves are the visible record of exploration.
4. No algorithmic fog: the listener chooses the route; the app never pretends to know them better.

## Accessibility & Inclusion

WCAG 2.1 AA contrast, full keyboard operation, visible focus, screen-reader labels for icon buttons, and respect for `prefers-reduced-motion` and forced-colors. *(inferred: carried over from Agent 5's baseline)*
