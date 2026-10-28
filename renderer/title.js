// Store-junk off the end of a song title (shared by src/music.js and the renderer as window.cleanTitle; node tests require it).
// Strips "(2011 Remaster)", "- Remastered 2011", "(From "Film")", "(Original Mix)", "- Single Version"; keeps "(Live)", "(feat. X)", in-word hyphens.
(function (root) {
  const JUNK = /(?:\s+-\s+|\s*[([])(?:[^)\]]*remaster[^)\]]*|from\s[^)\]]*|original mix|[^)\]]*single version)[)\]]?\s*$/i;
  const clean = t => { let s = String(t == null ? '' : t); for (let p; (p = s.replace(JUNK, '')) !== s && p;) s = p; return s; };
  if (typeof module === 'object' && module.exports) module.exports = clean; else root.cleanTitle = clean;
})(typeof window === 'object' ? window : globalThis);
