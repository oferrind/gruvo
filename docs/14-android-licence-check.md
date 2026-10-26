# 14 - Android licence and store check

Strategist, 2026-10-26. This doc covers what each data source allows if Stumble ships on Android. I read it against `src/net.js`, `src/music.js`, `src/stamps.js`, `src/tree.js`, `src/spotify.js` and `main.js`. It is not legal advice. Before any paid or ads release, email each provider.

## What the code actually does

- **Deezer** (`api.deezer.com`): search, top tracks and metadata. The 30 s previews are played. `net.audio()` also downloads up to 2 MB of each preview into memory to compute the Sound Fingerprint. Only the features are stored, never the audio. JSON responses are disk-cached.
- **iTunes Search** (`itunes.apple.com`): this is the fallback for search and previews. Its previews are played and analysed the same way as Deezer's.
- **MusicBrainz** (`/ws/2`): artist and recording search by **tag**, artist-rels, aliases and country. Requests are paced at 1.5 s and cached on disk. The bundled `renderer/genre-data` / `stamp-data` atlas is derived from MusicBrainz tags.
- **Wikidata**: `wbgetentities` claims and labels, used for genre and origin facts.
- **Wikipedia** (`en.wikipedia.org`): page summaries and search. This source was missing from the brief.
- **Spotify**: PKCE login with these scopes: `user-read-playback-state user-modify-playback-state playlist-modify-private`. Stumble starts a track on the user's device and exports private playlists. Spotify audio is never analysed.
- **User-Agent**: `MusicDiscovery/0.1 (you@example.com)`. It contains the owner's personal email.

## Source-by-source

| Source | What Stumble does | Personal sideloaded APK | Free public Play release | Paid / ads release | What clears it |
|---|---|---|---|---|---|
| **Deezer API** | Metadata, plays 30 s previews, downloads previews into memory to analyse them, caches JSON | OK | **Risk.** Terms say "strictly limited for a non-commercial purpose". A free app with no ads fits that. Audio analysis is not mentioned. Offline storage of audio is "strictly forbidden", and the in-memory analysis is a grey area. | **Blocked.** The developer may not receive "any moneys, incomes, revenues", and other uses need Deezer's prior approval. | Free, no ads, no IAP. Show the Deezer logo per the trademark guidelines. Never write preview bytes to disk. For money, get written approval from Deezer. |
| **iTunes Search API** | Fallback search; plays previews and analyses them | OK (low volume) | **Risk to blocked.** Previews must be "streamed only, and not downloaded, saved, cached". They may be used "only to promote store content and not for entertainment purposes", must sit beside an iTunes/Apple Music badge and must link to the store. Stumble's analysis downloads the preview, and the app has no badge or link. Limit is about 20 calls/min per IP. | Blocked as for free. Affiliate links are the only sanctioned money path. | **Drop iTunes from fingerprint analysis.** Play iTunes previews only beside a "Listen on Apple Music" badge and link, with the "provided courtesy of iTunes" credit. Simplest fix: drop iTunes entirely in v1. |
| **MusicBrainz, core** (artists, recordings, rels, genre *names*) | Lookups and search | OK | OK. Core data is CC0. | OK under the licence. | A User-Agent with a project contact. |
| **MusicBrainz, tags** (genre *associations*) | Tag search, risk guard, the bundled genre atlas | OK | **Risk.** Tags are supplementary data under CC BY-NC-SA 3.0. A free app is non-commercial, so this works with attribution. Share-alike applies to the bundled atlas. | **Blocked** under NC. MetaBrainz expects commercial users to sign up as paying supporters. | Free: an attribution screen, and publish the atlas data as CC BY-NC-SA. Paid: a MetaBrainz commercial supporter agreement. |
| **MusicBrainz API rate** | Each device calls `/ws/2` directly at a 1.5 s pace | OK | **Risk at scale.** The limit is 1 req/s *per IP*; going over returns 503 for that IP. Many phones behind one carrier NAT share an IP. The guide asks widely distributed apps to spread their load. | Same, worse | Up to about 1k users: direct calls, the per-device cache and a proper UA. Beyond that, a small caching proxy (one IP, one UA, its own 1 req/s queue) or a MusicBrainz mirror. Paying supporters can agree higher rates. |
| **Wikidata** | Claims and labels | OK | OK (CC0) | OK | A UA with contact, per the Wikimedia UA policy |
| **Wikipedia** | Artist summaries | OK | OK if credited. Text is CC BY-SA 4.0. | OK if credited | "From Wikipedia" plus a link next to each summary |
| **Spotify Web API** | PKCE, play on a device, export playlists | **OK for up to 5 allowlisted users.** The owner needs Premium (Feb 2026 change). | **Blocked.** Development mode is capped at 5 users, and extended quota is only for "organizations (not individuals)" with **250k MAU**. Developer Policy III.5 also bans a product "integrated with streams or content from another service", and Stumble plays Deezer previews. | Blocked. Streaming SDAs may not sell ads. | Ship the public build **without Spotify login**. Use an "Open in Spotify" deep link or search URL instead, which needs no API and no quota. Keep Spotify in the personal/dev build. |
| **Spotify Android SDK / App Remote** | Not used yet (proposed for Android playback) | Same 5-user cap. The SHA-1 and package name must be registered. | Blocked, same quota | Blocked | As above. Do not build on it for public. |
| **Last.fm** | Not used | n/a | n/a | n/a | Leave it out |
| **Google Play** | Store | n/a (sideload) | **OK with work.** A privacy policy is required even if the app collects no data. Data safety form. New personal accounts need a closed test of **12 testers opted in for 14 consecutive days**. IP policy: no download of copyrighted audio, and no confusing use of others' marks. | Same, plus the provider approvals above | Privacy policy URL, Data safety form, 12-tester closed test, and no "Spotify"/"Deezer" in the app name or icon. |

## Minimal changes for a viable free public release

1. **Remove Spotify from the public flavour.** Drop OAuth, play-on-device and playlist export. Replace them with "Open in Spotify" links. Export can become a plain track list to share or copy. The dev flavour keeps the current code.
2. **Fingerprint uses Deezer previews only.** Analyse in memory, never write audio to disk (net.js already does this), and store features only. Drop iTunes as an analysis source.
3. **iTunes:** remove it in v1. Alternatively, keep it as a playback fallback with a badge, a store link, the "courtesy of iTunes" credit and an attempt budget of 20 calls/min.
4. **Keep the app free:** no ads, no IAP and no donations inside the app. That keeps both Deezer's terms and MusicBrainz's NC licence satisfied.
5. **Attribution screen** (About > Data sources): Deezer logo; "Data from MusicBrainz (CC0 core; tags CC BY-NC-SA 3.0)" with a link; "Wikidata (CC0)"; "Wikipedia text CC BY-SA 4.0" next to each summary.
6. **Share-alike for the atlas:** state in the repo/about screen that `genre-data` / `stamp-data` are derived from MusicBrainz tags under CC BY-NC-SA 3.0.
7. **User-Agent:** `Stumble/<version> (+https://<project page or contact alias>)`. Replace the personal Gmail.
8. **MusicBrainz load:** keep the 1.1 s+ per-device pace and the disk cache. Add a jittered retry on 503. Plan a caching proxy (or mirror) before passing about 1k daily users or before any marketing push. The proxy also becomes the single place to add rate limits.
9. **Play hygiene:** neutral name and icon, a store listing that says "30-second previews", and the closed test with 12 testers for 14 days.

## Privacy-policy outline (public flavour)

1. **Who we are:** the developer's name and a contact email (an alias, not a personal address).
2. **What stays on the device:** loved/skipped tracks, Sound Fingerprint features, crate-dig rolls, settings and the response cache. Nothing is uploaded to us. There are no accounts, analytics or ads.
3. **What goes to third parties:** search terms and artist/track names are sent to Deezer, MusicBrainz, Wikidata and Wikipedia (and Apple, if iTunes is kept) to fetch results and previews. Those requests carry the device IP. Link to each provider's privacy policy. If the proxy exists, say that it logs IP and query for N days only, for rate limiting.
4. **Audio:** previews are streamed. The app computes audio features in memory and never stores audio.
5. **Spotify:** none in the public flavour. If it comes back: the tokens stored, the scopes, how to revoke access, and that no data is sold or shared.
6. **Children:** not directed at under-13s.
7. **Deletion:** uninstalling or using "Clear data" removes everything. There is nothing held on a server.
8. **Changes and contact.** The Data safety form must match this: "No data collected / no data shared". The one exception is the proxy: if it logs IPs, declare that.

## Go / no-go

| Release | Verdict | Why |
|---|---|---|
| Personal sideloaded APK (owner plus up to 4 friends) | **GO** | Everything works as on desktop. Spotify needs the owner's Premium and an allowlist (5 users max). Low volume keeps all rate limits safe. |
| Free public Play release | **GO with conditions** | Drop Spotify login, drop iTunes analysis (or all of iTunes), add the attribution screen, no money anywhere, add a privacy policy and Data safety form, and run the 12-tester / 14-day closed test. Plan the MusicBrainz proxy before growth. |
| Paid or ad-supported release | **NO-GO** | Deezer's non-commercial clause, MusicBrainz tag NC, Apple's promotional-only rule and Spotify's 250k MAU / organization gate all block it. It only opens up with written Deezer approval plus a MetaBrainz commercial agreement, and still without Spotify. |

## Sources

- Deezer guidelines: https://developers.deezer.com/guidelines
- Deezer terms of use: https://developers.deezer.com/termsofuse
- Apple Search API (promo use, streaming-only previews, about 20 calls/min): https://performance-partners.apple.com/search-api
- MusicBrainz data licence: https://musicbrainz.org/doc/About/Data_License
- Core vs supplementary data (tags are supplementary): https://musicbrainz.org/doc/MusicBrainz_Database
- MusicBrainz rate limiting: https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
- MetaBrainz supporters: https://metabrainz.org/supporters
- Wikidata licensing (CC0): https://www.wikidata.org/wiki/Wikidata:Licensing
- Spotify Developer Terms: https://developer.spotify.com/terms
- Spotify Developer Policy (III.5, III.13, IV.2, I.1.1): https://developer.spotify.com/policy
- Spotify quota modes (5 users, Premium, organizations only, 250k MAU): https://developer.spotify.com/documentation/web-api/concepts/quota-modes
- Spotify Feb 2026 update: https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security
- Play user data / privacy policy: https://support.google.com/googleplay/android-developer/answer/10144311
- Play testing requirements for new personal accounts: https://support.google.com/googleplay/android-developer/answer/14151465
- Play intellectual property policy: https://support.google.com/googleplay/android-developer/answer/9888072
