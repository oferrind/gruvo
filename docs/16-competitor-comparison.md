# 16 - Competitor comparison

Strategist, 2026-10-26. Facts were checked on the web today. Each claim carries a source and a date. Where I could not confirm something, it is marked *unverified*. Read this alongside `14-android-licence-check.md`; the audio sources that could stand in for Deezer are in `17-preview-sources.md`.

## 1. Landscape

| App | What it does | How it gets/plays music | Cost / model | Platforms | Status (Oct 2026) |
|---|---|---|---|---|---|
| **Radiooooo** | Pick a country and a decade (1900 to now) and hear what played there | Own licensed catalogue that users submit and curators moderate | Free tier; unlimited plan $4.49/mo or $45.99/yr (IAP) [A1] | Web, iOS, Android | Active (App Store © 2026) [A1] |
| **Radio Garden** | Spin a globe and tune into live stations | Live station streams | Free; third-party listings mention a $2-3/mo tier (*unverified*) [A2] | Web, iOS, Android | Active, 40k+ stations [A3] |
| **Every Noise at Once** | Map of about 6,300 Spotify genres, each with audio samples | Spotify previews and data | Free | Web | **Frozen** since its creator was laid off by Spotify on 4 Dec 2023. Still online, no new data [A4][A5] |
| **Music-map / Gnoosic** (Gnod) | Artist similarity map, and a "give 3 artists, rate the suggestion" loop | Crowd data; Gnoosic offers a Spotify sample, Music-map has no playback | Free, ads [A6] | Web | Active |
| **Last.fm** | Scrobbling, charts, similar artists, recommendations | No licence of its own. Track pages link out or embed third-party players (*unverified for 2026*). The Spotify playback deal of 2014 is gone [A7] | Free + Pro | Web, iOS, Android | Active, in maintenance mode (Android 2.6, Oct 2025) [A8] |
| **Maroofy** | Pick a song, get songs that sound alike (audio embeddings over 120M iTunes tracks) | iTunes previews [A9] | Free | Web | **Likely offline.** maroofy.com returned HTTP 402 on 2026-10-26 |
| **Chosic** | Similar songs, genre finder, mood playlists | Spotify data and embeds | Free, ads | Web | Active (blocks fetchers). Its Spotify-derived features were hit by the 2024 and 2026 API cuts (*inferred*) |
| **Spotalike** | Turns one seed track into a Spotify playlist of similar songs | Last.fm similarity data, exports to Spotify [A10] | Free with ads; Pro tier | Web | Active |
| **Bandcamp Discover** | Browse by genre, subgenre and format; buy | Own licence: artists upload full streams | Store cut; free listening with play caps | Web, iOS, Android | Active. Owned by Songtradr since Oct 2023; banned AI-made music in Jan 2026 [A11][A12] |
| **RateYourMusic / Sonemic** | Huge user-rated genre taxonomy, charts by genre, year and country | Links and embeds (YouTube, Spotify etc.) | Free + subscriber tier | Web | Active. Sonemic is being folded into RYM and is still in progress [A13] |
| **Shazam** | Identify a song, then charts and concerts | Apple Music previews and links | Free | iOS, Android, web | Active. Concerts tab via Bandsintown [A14] |
| **Spotify** (Discover Weekly, daylist, AI DJ, Prompted Playlists, **SongDNA**) | Algorithmic plus prompt-based discovery. SongDNA maps collaborators, samples and covers | Own licence | Free with ads / Premium | All | Active. DJ takes requests (2025) [A15]; Prompted Playlists in US/CA early 2026 [A16]; SongDNA global on Premium from Mar 2026, built on WhoSampled data [A17] |
| **Apple Music** (Discovery Station) | Endless station of songs you have never played | Own licence | Subscription | All | Active since Aug 2023 [A18] |
| **Deezer** (Flow, Flow Moods, Flow Tuner) | Endless personal mix. Flow Tuner (Feb 2026) toggles genres on and off | Own licence | Free / Premium | All | Active [A19] |
| **YouTube Music** (Ask Music AI radio) | Describe a vibe, get a station; AI hosts in Labs (Sep 2025) | Own licence | Free / Premium | All | Active [A20] |
| **Musicmap** | Hand-drawn genealogy of about 230 popular genres, with history text | YouTube playlists plus Spotify links [A21] | Free | Web | Active, slow updates (v1.2.1, Feb 2026) |
| **WhoSampled** | Samples, covers, remixes | Embeds and links | Made free after Spotify bought it in Nov 2025 [A22] | Web, iOS, Android | Active, now Spotify-owned |
| **Unknown Band** | **Blind listening**: no name, no cover. A high rating reveals the artist | Artists supply the tracks (*unverified*) | Free | iOS (v1.8.0, Oct 2026), Android | Active, new [A23] |
| **Kapsule** | Swipe-to-reveal blind listening of uploads | Artist uploads | Free, "fan support" IAP | iOS | Active [A24] |
| **Discogs** | Release database, credits, marketplace | YouTube videos | Marketplace fees | Web, iOS, Android | Active |

### Spotify Web API, confirmed

- **27 Nov 2024:** new apps, and dev-mode apps without a pending extension, lost Recommendations, Related Artists, Audio Features, Audio Analysis, Featured and category playlists, algorithmic/editorial playlists, and **30-s preview URLs** in multi-get responses [A25]. Apps that already had extended access were not affected.
- **Feb/Mar 2026:** dev mode is limited to 1 client ID, 5 users and a Premium owner (new IDs from 11 Feb; all apps from 9 Mar) [A26]. Removed: artist top tracks, new releases, browse categories, several-items lookups, user profile, and the album/artist/track `popularity` fields. Search `limit` maximum cut from 50 to 10 [A27]. Endpoint cuts for existing integrations were postponed with no date [A26].

## 2. Feature by feature: who comes closest, and what Stumble adds

**Blind Test** (unnamed previews, Skip/OK/Love, reveal, sound-fingerprint model, Adventure slider)
- Closest: **Unknown Band** and **Kapsule** (blind, rate to reveal), **Gnoosic** (rate one suggestion at a time), **Maroofy** (audio-similarity), **Apple Discovery Station** and **Deezer Flow + Flow Tuner** (endless taste-driven radio).
- Stumble's edge: blind listening over the **mainstream catalogue** (Unknown Band and Kapsule use artist uploads), a **local audio fingerprint** learned from ratings, and an **Adventure slider**. No one else combines the three.
- Where others are better: Flow and Discovery Station play full tracks with a far bigger behavioural model. Unknown Band has polish, XP and streaks, plus a live-shows tab.

**Crate Dig** (genre / decade+genre / place+genre / scene, 10 songs)
- Closest: **Radiooooo** (place × decade, its core idea), **Every Noise at Once** (genre atlas with samples), **RYM charts** (genre × year × country), **Musicmap** (genre lineage), **Bandcamp Discover** (genre × format).
- Stumble's edge: one roll combines genre, decade, place and scene, built on an open (MusicBrainz) atlas, and it is **still maintained**, while Every Noise is frozen.
- Where others are better: Radiooooo's human-picked tracks beat tag search for charm; RYM's taxonomy is deeper; Every Noise (even frozen) has 6,000 genres to our 1,142; Musicmap tells history better.

**Family Tree** (related songs, each step says *how* they are related)
- Closest: **Spotify SongDNA** (collaborators, samples, covers inside Now Playing), **WhoSampled**, **Discogs** credits, **Music-map** (similar, with no reason given), **Last.fm** similar artists.
- Stumble's edge: it **mixes relation types** (scene, membership, producer, sample, label, soundtrack, influence) into one walk you can grow, with a short preview at every node.
- Where others are better: **SongDNA is the direct threat**: full playback, WhoSampled's 622k samples and label credits, inside the app people already use. Stumble wins only on scene/label/influence links and on being free with no account.

**Saved**: table stakes; public export is links only.

**What nobody else does, honestly:** one free, account-less app that gives you a blind test, then a structured crate, then an explained family tree, all on previews, with a taste model that stays on the device. Each piece exists elsewhere. The combination, and the explanations, do not.

## 3. Risks and lessons

| Who | What happened | Lesson for Stumble |
|---|---|---|
| Every Noise at Once | Data access belonged to an employee of the platform. The layoff froze the site (Dec 2023) | Don't depend on a single person's privileged access. Stumble uses public APIs, which is good |
| Spotify-API discovery tools (Chosic-type, the "thousands of third-party apps" in the Feb 2026 reports [A28]) | Recommendations, audio features and previews were cut in Nov 2024. Top tracks, popularity and search size were cut in Feb 2026 | Any feature built on one platform's convenience endpoints can vanish with 2-10 weeks' notice. Stumble already computes its own fingerprint instead of using Spotify audio features, which is the right call |
| Maroofy | Built on iTunes previews and indexing; appears to be down now | The Apple Search API forbids caching and analysis (doc 14). Don't make iTunes load-bearing |
| Last.fm | Lost its Spotify playback deal | Playback deals are revocable; "Open in" links last |
| WhoSampled | Bought by Spotify; now feeds SongDNA | Data can become a competitor's moat. MusicBrainz (CC0 core) can't be bought |

**What it means for Stumble:**
1. **Deezer previews are the single point of failure.** Spotify cut preview URLs overnight [A25]. Mitigations: keep audio behind one adapter (`net.audio`) so another source can be swapped in; never persist preview URLs or audio (Deezer links appear to expire, *unverified*); keep "Open in" links as the fallback that always works; write to Deezer before any growth push.
2. **MusicBrainz is the safest part**: open licence, non-profit, self-hostable dumps. The risk is the 1 req/s per-IP limit, not disappearance; doc 14's proxy/mirror plan covers it. The bundled atlas keeps Crate Dig alive if `/ws/2` is slow.
3. **Don't build on Spotify for anything public** (5 users, Premium owner).

## 4. Positioning

Play Store one-liners (each is 80 characters or less, for the short description):
1. "Hear it before you know who it is. Blind-test songs and find what you really like."
2. "Roll a genre, a decade and a city. Dig 10 songs. Follow the family tree."
3. "Free music discovery, no account: blind tests, crate digs, and why songs connect."

Keep "30-second previews" in the long description (doc 14).

**Name check: "Stumble"**
- **StumbleUpon** shut down in 2018 and moved to Mix (since faded). It still owns marks such as "STUMBLE!" for software, filed in 2011; current status *unverified* [A29].
- A **US "STUMBLE" Class 9 (software) application** was filed on 19 Dec 2023 by an undisclosed LLC (serial 98321462). Its status beyond "new application" is *unverified*. Check TSDR [A30].
- **Stumble Guys** (Scopely) owns the word on Google Play search and is actively licensing the brand (CAA, 2025) [A31]. A plain "Stumble" listing would be buried under it, and Scopely could object to confusion in a games-adjacent store.
- I found no music app on Play named "Stumble" (only SongStumblr, iOS, 2010) [A32].

**Recommendation:** keep "Stumble" as the internal and desktop name, but don't ship a bare "Stumble" on Play. Use a compound that is searchable and distinct in Class 9: for example **"Stumble: Blind Music Discovery"** as the listing title, or rename to a coined word such as "Cratefall" or "Blindcrate". Before publishing, run a USPTO/EUIPO/WIPO search for the final name (doc 14 already bans "Spotify"/"Deezer" in the name).

## Sources (accessed 2026-10-26)

- A1 Radiooooo App Store https://apps.apple.com/app/id893151807 ; WRDW 2025-04-14 https://www.wrdw.com/2025/04/14/what-tech-app-day-radiooooo
- A2 https://www.alternativeto.net/software/radio-garden/about/
- A3 https://apps.apple.com/us/app/-/id1339670993 ; Gigazine 2026-01-27 https://gigazine.net/gsc_news/en/20260127-radio-garden
- A4 https://en.wikipedia.org/wiki/Every_Noise_at_Once
- A5 TechCrunch 2024-02-12 https://techcrunch.com/2024/02/12/every-noise-shut-down-spotify-layoffs
- A6 Fast Company https://www.fastcompany.com/91559138/spotify-alternatives ; https://www.music-map.com/
- A7 Engadget 2014 https://www.engadget.com/2014-01-29-spotify-last-fm-partnership.html
- A8 https://www.apkmirror.com/?p=1150888
- A9 Show HN 2023 https://hn.svelte.dev/item/34635352 ; https://gigazine.net/gsc_news/en/20230203-maroofy
- A10 https://spotalike.com/ ; https://www.producthunt.com/products/spotalike/launches/spotalike-2
- A11 https://en.wikipedia.org/wiki/Bandcamp ; https://www.hypebot.com/hypebot/2023/12/bandcamp-adds-discover-a-new-way-to-shop-for-indie-music-and-merch.html
- A12 TechCrunch 2026-01-14 https://techcrunch.com/2026/01/14/bandcamp-takes-a-stand-against-ai-music-banning-it-from-the-platform/
- A13 https://en.wikipedia.org/wiki/Rate_Your_Music
- A14 https://www.billboard.com/pro/shazam-concert-discovery-bandsintown
- A15 https://newsroom.spotify.com/2025/12/29/year-in-features/
- A16 https://parsers.vc/news/260126-spotify-unleashes-ai-playlist-power-in-us/
- A17 TechCrunch 2026-03-24 https://techcrunch.com/2026/03/24/spotifys-songdna-feature-lets-you-explore-the-connections-behind-your-favorite-songs/
- A18 https://appleinsider.com/articles/23/08/07/apple-music-debuts-new-algorithmic-discovery-station-radio
- A19 https://www.musicbusinessworldwide.com/deezer-launches-flow-tuner-to-give-users-more-control-over-algorithmic-playlists
- A20 TechCrunch 2025-09-26 https://techcrunch.com/2025/09/26/youtube-music-tests-ai-hosts-that-share-trivia-and-commentary
- A21 https://musicmap.info/
- A22 https://www.musicbusinessworldwide.com/spotify-acquires-song-sample-and-remix-database-whosampled/ ; https://ratingsgamemusic.com/2025/11/19/whosampled-officially-acquired-by-spotify-will-continue-operating-as-a-standalone-platform/
- A23 https://apps.apple.com/us/app/-/id6758047976
- A24 https://apps.apple.com/pl/app/kapsule/id6746036131
- A25 https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api
- A26 https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security
- A27 https://developer.spotify.com/documentation/web-api/references/changes/february-2026
- A28 Headphonesty 2026-02 https://www.headphonesty.com/2026/02/spotify-crackdown-thousands-third-party-music-apps/ (headline only, page blocked)
- A29 https://trademarks.justia.com/owners/stumbleupon-inc-1334329
- A30 https://trademarks.justia.com/983/21/stumble-98321462.html
- A31 https://www.licenseglobal.com/entertainment/-stumble-guys-signs-with-caa-brand-management
- A32 Play search via web, no "Stumble" music app found (not an exhaustive Play search)
