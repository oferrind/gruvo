// Store-junk off the end of a song title (shared by src/music.js and the renderer as window.cleanTitle; node tests require it).
// Strips "(2011 Remaster)", "- Remastered 2011", "(From "Film")", "(Original Mix)", "- Single Version"; keeps "(Live)", "(feat. X)", in-word hyphens.
(function (root) {
  // after " - " only whole store tags (so "Song - From Here to Eternity" and "- Remastered 2011 Live" keep their words); bounded classes, capped input
  const JUNK = /(?:\s+-\s+(?:(?:(?:\d{4}|digital(?:ly)?|mono|stereo)\s+){0,3}(?:remaster(?:ed)?(?:\s+(?:\d{4}|version|edition)){0,2}|single version)|original mix|from\s+["“][^"”]{1,80}["”])|\s*[([](?:[^)\]]{0,40}remaster[^)\]]{0,40}|from\s[^)\]]{1,80}|original mix|[^)\]]{0,40}single version)[)\]])\s*$/i;
  const clean = t => { let s = String(t == null ? '' : t); if (s.length > 300) return s; for (let p; (p = s.replace(JUNK, '')) !== s && p;) s = p; return s; };
  if (typeof module === 'object' && module.exports) module.exports = clean; else root.cleanTitle = clean;
})(typeof window === 'object' ? window : globalThis);
