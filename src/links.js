// "Listen to the full song" links: the only URLs the app may hand to the default browser.
const HOSTS = new Set(['www.youtube.com', 'open.spotify.com', 'www.deezer.com', 'en.wikipedia.org', 'accounts.spotify.com', 'developer.spotify.com', 'musicbrainz.org', 'www.wikidata.org', 'creativecommons.org']); // Spotify login (PKCE) + app setup

// Returns the normalized https URL when it is on the allowlist, else null.
function safeExternal(url) {
  let u;
  try { u = new URL(String(url)); } catch { return null; }
  if (u.protocol !== 'https:' || !HOSTS.has(u.hostname) || u.port || u.username || u.password) return null;
  return u.href;
}

module.exports = { safeExternal };
