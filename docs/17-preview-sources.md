# 17 - Preview and audio sources for a free Play release

Strategist, 2026-10-26. This companion to docs 14 and 16 asks one question: which sources could a free Android app with no ads legally use to play audio in-app, and which of them allow Stumble's Sound Fingerprint analysis? Each claim is checked on the web today and cited. *Unverified* marks anything I could not confirm. This is not legal advice.

## Table

| Source | Catalogue | Preview or full | Free for a free app? | Analysis allowed? | Attribution / link rules | Verdict for Stumble |
|---|---|---|---|---|---|---|
| **Deezer API** | Mainstream, major labels (tens of millions of tracks) | 30-s previews only; full-length URLs "must never be accessible" [D2] | **Yes, if non-commercial.** Use is "strictly limited for a non-commercial purpose", and you may not "receive, generate… any moneys" [D1] | **Silent.** No ML, analysis or derived-data clause. It bans reverse-engineering the API, bypassing protection "for the purpose of downloading the Content", and "Local Storage/Offline Storage of audio data" [D1][D2]. In-memory analysis is a grey area, so ask Deezer | Logo per trademark guidelines [D1][D2] | **Primary.** Get a written OK for the analysis |
| **Apple iTunes Search API** | Mainstream (Apple catalogue) | 30-s previews | Only as promotion: "only to promote store content and not for entertainment purposes" [A1] | **Effectively no.** Previews must be "streamed only, and not downloaded, saved, cached" [A1]. Analysis is not mentioned, but downloading into memory is risky | Must sit near an Apple badge that links to the store; credit "provided courtesy of iTunes"; about 20 calls/min [A1] | **Fallback for the reveal and Saved screens only**, with badge and link. Never in Blind Test (no badge during blind play) or the fingerprint |
| **Apple Music API / MusicKit for Android** | Same catalogue | Previews; full tracks for subscribers | Needs the $99/yr Apple Developer membership and a signed JWT; preview-only use without a user login is an open question on Apple's forums [A2][A3] | Not stated | Apple Music identity rules (*unverified*) | Skip for v1 |
| **Spotify Web API** | Mainstream | `preview_url` empty for apps created after 27 Nov 2024 [S1]; no sign it will return [S2] | Dev mode is capped at 5 users with a Premium owner (Mar 2026) [S3] | Audio Features and Analysis were removed for new apps [S1] | Spotify branding rules | **Links only** ("Open in Spotify"). Scraping embed-page MP3s, as some third-party tools do, breaks the ToS. Don't |
| **YouTube IFrame player / Data API** | Practically everything | Full videos | Free within quota (10k units/day default, *not on page*); quota beyond that needs an audit [Y1] | **No.** You may not "separate, isolate, or modify the audio or video components" [Y1 III.I.7]; no "background player" [III.I.9]; no caching [III.E.1]; no "new or derived data" from API data [III.E.4.h] | Player at least 200×200 px, no overlays obscuring it, autoplay only when more than half the player is visible [Y2] | **Not for Blind Test.** A hidden or covered player is banned, and a visible one shows the title. OK as a visible "Watch on YouTube" player after the reveal |
| **SoundCloud API** | UGC, indie, DJ mixes | Full streams (rights depend on each uploader) | Registering an app needs an **Artist Pro** subscription (paid) [SC1] | API terms not read (*unverified*) | Per SoundCloud buttons and logos | Not worth the paywall and per-track rights uncertainty. The public embed widget is fine for links |
| **Jamendo API** | Indie, Creative Commons (*about 600k tracks, unverified*) | **Full tracks** | **Yes, non-commercial**, up to 35,000 requests/month [J1]; commercial needs licensing@jamendo.com [J2] | Not addressed; each track's CC licence applies [J2] | Credit artist and Jamendo, plus a **backlink per track**; no app "specifically designed to cache" [J2] | **Good optional source** for an "underground" crate or blind mode. Analysis is probably fine where the CC licence allows derivatives (ND licences are a question) |
| **Audius API** | Indie, artist-uploaded (crypto-native) | Full streams | Free plan: 10 req/s, 500k/month, API key [AU1] | ToS not found (*unverified*) | *Unverified* | Optional extra for electronic and hip-hop indie; low priority |
| **Free Music Archive** | CC indie (owned by Tribe of Noise since 2019) | Full | No public API found (freemusicarchive.org/api returns 404, 2026-10-26) [F1] | n/a | n/a | Not usable |
| **Bandcamp** | Indie, large | Full streams on Bandcamp's own player | No documented public API; only iframe embeds and an undocumented oEmbed endpoint [B1] | No | Embed as-is | Links and visible embeds after the reveal only |
| **7digital (Songtradr)** | 80M+ licensed tracks, B2B APIs [L1] | Previews and full (licensed) | **Paid B2B, quote only** (pricing not public) | Contract-dependent | Contract | Only if Stumble ever goes commercial |
| **MediaNet (now Audible Magic)** | Major + indie, B2B [L2] | Licensed | Paid B2B, quote only | Contract | Contract | Same as 7digital |
| **Napster API** | n/a | n/a | Consumer streaming shut down after Infinite Reality's 2025 purchase [N1]; API presumed dead (*unverified*) | n/a | n/a | Dead |

## Recommendation for the Play release

- **Primary: Deezer 30-s previews**, unchanged. Keep the release free with no ads, and never write audio or preview URLs to disk. Show the Deezer logo. Send the email below before launch.
- **If Deezer says no to analysis:** keep Deezer playback, turn the in-memory fingerprint off in the public flavour, and learn taste from ratings plus MusicBrainz/Wikidata tags only. The fingerprint stays in the desktop/dev build.
- **Fallback when Deezer has no preview:** skip the track in Blind Test. Never fall back to YouTube there. After the reveal and in Saved, offer "Open in Spotify / YouTube / Apple Music" links. Optionally show an iTunes preview **beside** a badge and store link with the "courtesy of iTunes" line, never analysed.
- **Optional later:** add a Jamendo "unsigned / Creative Commons" crate (full tracks, with a backlink per track) as a second catalogue that is clearly licensed for non-commercial apps.
- **Don't:** use Spotify previews (gone, and scraping breaks the ToS), play YouTube hidden or audio-only, or pay for SoundCloud or B2B feeds in v1.

## Draft email to Deezer (developer support / partnerships)

> Subject: Free, ad-free app using Deezer API previews – is in-memory audio analysis permitted?
>
> Hello, I build Stumble, a free, ad-free, account-less music-discovery app for Android and desktop that plays 30-second previews via the Deezer API with your logo and links back to Deezer.
> To recommend songs, the app briefly analyses each preview in memory (tempo, loudness and timbre statistics) and keeps only those numbers on the user's device; no audio is ever stored, cached, or shared.
> Could you confirm whether this analysis is permitted under the API Terms of Use, or tell me what conditions or approval it needs?
> If it is not permitted, I will disable it and use the API only for playback and metadata.
> Thank you, [name], [project URL / contact alias]

## Sources (accessed 2026-10-26)

- D1 Deezer API terms of use (undated, "binding upon posting"): https://developers.deezer.com/termsofuse
- D2 Deezer guidelines: https://developers.deezer.com/guidelines
- A1 Apple Search API terms: https://performance-partners.apple.com/search-api
- A2 Apple, user authentication for MusicKit: https://developer.apple.com/tutorials/data/documentation/applemusicapi/user-authentication-for-musickit.md
- A3 Apple forums, preview-only playback question: https://developer.apple.com/forums/thread/836910
- S1 Spotify, 2024-11-27: https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api
- S2 Spotify community, missing preview_url: https://community.spotify.com/t5/Spotify-for-Developers/HTTP-API-Missing-preview-url-in-single-track-GET/m-p/6658823
- S3 Spotify, 2026-02-06: https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security
- Y1 YouTube API Developer Policies (updated 2026-10-15): https://developers.google.com/youtube/terms/developer-policies
- Y2 YouTube Required Minimum Functionality (updated 2026-10-15): https://developers.google.com/youtube/terms/required-minimum-functionality
- SC1 SoundCloud, register an app: https://developers.soundcloud.com/docs/api/register-app
- J1 Jamendo developer portal: https://developer.jamendo.com/v3.0
- J2 Jamendo API terms: https://devportal.jamendo.com/api_terms_of_use
- AU1 Audius SDK (free plan limits): https://docs.audius.org/sdk
- F1 FMA history: https://en.wikipedia.org/wiki/Free_Music_Archive
- B1 Bandcamp oEmbed, via a plugin listing: https://wordpress.org/plugins/del-embed-for-bandcamp/
- L1 7digital / Songtradr: https://www.musicbusinessworldwide.com/songtradr-closes-23-4m-acquisition-of-b2b-music-firm-7digital/
- L2 MediaNet to Audible Magic (2021): https://www.audiblemagic.com/2021/01/11/audible-magic-acquires-medianets-business-from-socan-integrating-ugc-premium-music-solutions/
- N1 Napster streaming shutdown: https://www.musicinafrica.net/node/380360
