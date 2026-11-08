<p align="center"><img src="renderer/img/logo-512.png" alt="Gruvo logo" width="140"></p>

<h1 align="center">Gruvo</h1>
<p align="center"><b>Hear it first. Find out later.</b><br>A music-discovery app for Android and Windows.</p>

Gruvo plays you 30-second previews of songs you've never heard, with no name or artist shown, and lets your ears decide. From there you can dig through decades, countries, genres and moods, or follow one song's family tree to the next.

## Features

- **Blind Test.** A mystery song plays with its cover hidden. Rate it Love, OK or Skip, then see what it was and why it was picked. Your ratings teach Gruvo your taste.
- **Crate Dig.** Roll a decade, place and genre ("70s Turkish psych", "90s Japanese rock") or browse scenes and over 1,100 genres. Each Roll brings up to 15 playable songs, leaning toward the scene's well-known bands.
- **Mood Shelf.** Around 40 vibes (coffee shop, rainy window, late night, workout…). Each gives 20 songs that fit the mood *and* your taste, with a line saying why.
- **Family Tree.** Start from any song and grow its family: same scene, band members, artists it was built on, and its roots. Dig one record at a time.
- **Saved.** Your loved songs, with export to a Spotify playlist (optional, with your own Spotify Client ID).
- **8 colour schemes** in light and dark, a phone layout with a landscape rail, and keyboard support on desktop.

## Install

**Android:** download the latest `gruvo-x.y.z.apk` from [Releases](https://github.com/oferrind/gruvo/releases) and open it on your phone. Android will ask you to allow installs from your browser or file manager. Updating keeps your saved songs.

**Windows:** there's no installer yet. Run it from source (below).

Gruvo is an early, unofficial build. It isn't on Google Play yet.

## Run from source

Needs [Node.js](https://nodejs.org/) 20 or newer.

```sh
git clone https://github.com/oferrind/gruvo.git
cd gruvo
npm install
cp stumble.config.example.json stumble.config.json   # then put your email in it
npm start
```

`stumble.config.json` holds the contact email that MusicBrainz asks every app to send with its requests. It's git-ignored, so your email stays on your machine.

Run the tests with `npm test`.

### Android build

Needs Android Studio (for its JDK and the Android SDK).

```sh
npm run mobile:build     # copy the web app into the Android project
npm run mobile:apk       # debug APK
```

Release builds need your own signing key in `android/keystore.properties` (see `android/keystore.properties.example`). Never commit it.

## How it works

One HTML/CSS/JavaScript app (`renderer/`) runs twice: in Electron on the desktop, and in Capacitor on Android. The music logic in `src/` has no platform code, so both share it.

| Folder | What's in it |
|---|---|
| `renderer/` | The interface, the taste engine, and genre and vibe data |
| `src/` | Lookups and recommendations: Crate Dig, Family Tree, Mood Shelf, caching |
| `mobile/` | The Android bridge |
| `android/` | The Capacitor Android project |
| `test/` | `node:test` tests |
| `docs/` | Specs and decisions |

## Data sources and credits

- **[Deezer](https://www.deezer.com/)**: 30-second previews, covers and editorial playlists. Previews are streamed and never saved to disk.
- **[MusicBrainz](https://musicbrainz.org/)**: artists, scenes and tags (CC BY-NC-SA for tags).
- **[Wikidata](https://www.wikidata.org/) / [Wikipedia](https://www.wikipedia.org/)**: band members and short descriptions.
- **[Spotify](https://developer.spotify.com/)**: playlist export only, through your own Client ID with PKCE. No secret is ever used.

Gruvo is free, has no ads and no accounts, and keeps your profile on your device.

## Status

Version 0.2.0. Work in progress. A Google Play release waits on a reply from Deezer about API use, a privacy policy, and a closed test.

## License

No open-source licence has been chosen yet, so all rights are reserved for now.
