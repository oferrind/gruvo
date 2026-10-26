// Search links for "listen to the full song" (shared by the renderer as window.Links and by node tests).
(function (root) {
  const q = t => encodeURIComponent(`${t.artist} ${t.title}`);
  const api = { youtube: t => `https://www.youtube.com/results?search_query=${q(t)}`, spotify: t => `https://open.spotify.com/search/${q(t)}` };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Links = api;
})(typeof window === 'object' ? window : globalThis);
