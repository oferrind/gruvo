# Spotify setup

After Hours can play the full song in your Spotify app (after the reveal) and save playlists to your account
(Saved, a Family Tree, later Genre Stamps). You create a small Spotify "app" once; it takes about three minutes.

## Steps

1. Open https://developer.spotify.com/dashboard and log in with your Spotify account.
2. **Create app.** Any name and description (e.g. "After Hours"). Under *Which API/SDKs are you planning to use?* tick **Web API**.
3. **Redirect URI:** add exactly

   `http://127.0.0.1:47813/callback`

   (Spotify does not accept `localhost`; plain http is allowed only for the loopback IP `127.0.0.1`.) Save.
4. **User Management:** add the name and email of the Spotify account you will log in with. In development mode,
   accounts not on this list can log in but every request then fails with 403.
5. Copy the app's **Client ID** (32 letters and digits). You do not need the Client secret: the app uses PKCE.
6. In After Hours open **Preferences → Spotify**, paste the Client ID, press **Connect**, log in in the browser
   window that opens, then come back. The section shows "Connected as …".

Disconnect any time in the same section. To revoke fully, remove the app at https://www.spotify.com/account/apps/.

## What the app asks for

Scopes (minimal): `user-read-playback-state` (list your devices), `user-modify-playback-state` (start a song),
`playlist-modify-private` (create private playlists). Your name comes from `GET /me`, which needs no extra scope.

## Limits

- **Premium:** starting playback needs Spotify Premium, and a development-mode app only works if its owner has Premium.
- **Development mode:** up to 5 users, each listed under User Management.
- **A Spotify app must be open** on this PC or your phone for "Play in Spotify". If several are idle, After Hours asks which one.
- **Matching:** songs are found by ISRC first, then by exact artist + title. Songs Spotify doesn't have are listed after an export.
- **Port 47813** must be free during login (only open for up to 5 minutes, then closed).
- Spotify audio is never analysed: the Sound Fingerprint keeps using Deezer/iTunes previews.

## Where things are stored

`spotify.json` in the app's user-data folder holds the Client ID, your display name and the refresh token
**encrypted with the OS (Electron safeStorage)**. `spotify-matches.json` caches song matches. Neither is in the
profile, and tokens never reach the app window.

Sources: [PKCE flow](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow),
[redirect URIs](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri),
[quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes),
[Feb 2026 changes](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide).
