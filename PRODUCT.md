# Gruvo

Hear it first. Find out later.

## What it is

Gruvo is a music-discovery app for Android and Windows. One HTML, CSS and JavaScript app runs in Electron on the desktop and in Capacitor on Android. It is free, has no ads and no accounts, and keeps everything it learns about you on your device.

## Who it is for

A curious listener who is tired of "people who liked X also liked Y", genre radio and charts, and wants music they would never have searched for. Sessions are short and playful: a few mysteries, one scene from one place and decade, or one song's family tree.

## What success looks like

You press Love on a song you had never heard, by an artist you would not have found yourself, and the app can tell you truthfully why it played it. docs/20 turns this into measures and a pass bar.

## The four tabs

- **Discover**: the Blind Test. A 30-second preview plays with no artist, title or cover. You rate it Love, OK or Skip, and only then see what it was and why it was picked. An Adventure slider sets how far from your taste it goes.
- **Dig**: two ways in. *Crate Dig* rolls a decade, a place and a genre ("70s Turkish psych") or opens one of over 1,100 genres. *Mood Shelf* offers about 40 moods (coffee shop, rainy window, late night) with 20 songs each, fitted to your taste.
- **Tree**: start from any song and grow its family: its scene, band members who moved on, what it is built on and its roots, one record at a time. Every step says why it is there.
- **Saved**: your loved songs, with optional export to a Spotify playlist through your own Spotify Client ID.

Preferences (taste, Adventure, colour scheme, data sources) open from the gear icon. One now-playing bar is shared by every tab.

## Sources and limits

- Deezer for 30-second previews, covers and editorial playlists; previews are streamed and never written to disk. MusicBrainz, Wikidata and Wikipedia for artists, scenes, tags and descriptions. ListenBrainz listening data (built into the app) for which artists the same people play.
- No full-length playback, no social features, no accounts.
- A strict content security policy: no remote scripts or fonts; everything ships with the app.

## Principles

1. **Judge the sound, not the name.** Identity stays hidden until you have an opinion.
2. **Every pick explains itself**: a place and a time, a shared person, listeners in common.
3. **Show what you found**: loves and scenes are the record of where you have been.
4. **Prove changes with evidence**: a new way of picking songs ships only after it is measured against the current one (docs/20, docs/21).

## Accessibility

WCAG 2.1 AA contrast in every scheme, full keyboard use (Space, 1, 2, 3 and Enter in the Blind Test), visible focus, labels on icon buttons, and support for reduced motion and forced colours.
