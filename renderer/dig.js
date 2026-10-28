// Family Tree "Dig": the reason line and the dig path, pure. Works in the renderer (window.Dig) and in node tests (require).
(function (root) {
  // One full sentence that names the parent, from the label src/tree.js wrote for the child.
  // `inGroup`: a family row already sits under its relation's sign, so it keeps only the specific facts.
  // `base`: the facts the group's sign already shows (see shared), so a row keeps only what differs ("formed 1983").
  const YEAR = /^(formed|born) \d/;
  // "Same scene: alternative rock, US, formed 1983" -> ["alternative rock", "US"]: what every row of the group shares.
  const shared = label => {
    const m = String(label || '').replace(/[.\s]+$/, '').match(/^Same (\w+): (.*?)(?: · fans of .+ play them too)?$/);
    return m ? m[2].split(', ').filter(p => p && !YEAR.test(p)) : [];
  };
  function reason(n, parent, inGroup, base = []) {
    if (!parent || !n.label) return '';
    const P = parent.track.artist, L = n.label.replace(/[.\s]+$/, '');
    const dot = s => `${s}.`;
    // "Same scene: britpop, UK, formed 1989 · fans of Pulp play them too" -> "Same scene as Pulp: britpop, UK, formed 1989; fans of Pulp play them too."
    const same = L.match(/^Same (\w+): (.*?)(?: · fans of (.+) play them too)?$/);
    if (same && inGroup) {
      const own = same[2].split(', ').filter(p => p && (YEAR.test(p) || !base.includes(p))).join(', ');
      return own ? dot(own[0].toUpperCase() + own.slice(1)) : '';
    }
    if (inGroup && /^Fans of .+ also play$/.test(L)) return '';
    if (same) return dot(`Same ${same[1]} as ${P}: ${same[2]}${same[3] ? `; fans of ${same[3]} play them too` : ''}`);
    if (/^Fans of .+ also play$/.test(L)) return dot(`${L} ${n.track.artist}`);
    // Built on: the parent song is the one that samples or borrows.
    if (n.edgeType === 'builton') return dot(`“${parent.track.title}” ${L.replace(/^Built on/, 'is built on').replace(/^Samples/, 'samples')}`);
    const moved = L.match(/^(.+?) (went on to|came from) (.+)$/);
    if (n.edgeType === 'member' && moved && !moved[1].includes(P)) return dot(`${moved[1]}, of ${P}, ${moved[2]} ${moved[3]}`);
    return dot(L.toLowerCase().includes(P.toLowerCase()) ? L : `${L}, like ${P}`);
  }
  // The parentId chain from the root down to node `id` (nodes indexed by id).
  function path(nodes, id) {
    const out = [];
    for (let n = nodes[id]; n && out.length < nodes.length; n = n.parentId == null ? null : nodes[n.parentId]) out.unshift(n);
    return out;
  }
  // Genres show in sentence case everywhere ("Alternative rock"); acronyms (R&B, IDM) keep theirs.
  const genre = g => {
    const s = String(g || '').trim().split(/\s+/).map(w => (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w) ? w : w.toLowerCase())).join(' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  // Deezer's genre name in the shop's voice ("Rap/Hip Hop" -> "Hip hop"); '' for the non-musical ones. Stored ids and names are untouched.
  const NOT_MUSIC = /^(all|films?\/games|kids|comedy|podcasts?|audiobooks?|spoken word)$/i;
  const SHOP = { 'rap/hip hop': 'Hip hop', 'soul & funk': 'Soul and funk', 'latin music': 'Latin', electro: 'Electronic' };
  const shopGenre = name => {
    const n = String(name || '').trim();
    return NOT_MUSIC.test(n) ? '' : SHOP[n.toLowerCase()] || n.replace(/\s+music$/i, '');
  };
  const top = (xs, n) => Object.entries(xs.reduce((a, x) => ((a[x] = (a[x] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]).slice(0, n).map(e => e[0]);
  const and = xs => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0]);
  // Home's "Lately" line from the loves ({country, decade}) and picked genre names: "Lately you've loved 80s Mexico and 90s India, mostly rock."
  function lately(likes, countryName, genres = []) {
    const dec = d => `${String(d).slice(2)}s`;
    let what = top(likes.filter(l => l.country && l.decade).map(l => `${dec(l.decade)} ${countryName(l.country)}`), 2);
    if (!what.length) what = top(likes.filter(l => l.country).map(l => countryName(l.country)), 2);
    if (!what.length) what = top(likes.filter(l => l.decade).map(l => `the ${dec(l.decade)}`), 2);
    const g = genres.length ? genre(genres[0]).replace(/^[A-Z][a-z]*(?=\s|$)/, w => w.toLowerCase()) : '';
    if (!what.length) return g ? `Lately you've leaned toward ${g}.` : '';
    return `Lately you've loved ${and(what)}${g ? `, mostly ${g}` : ''}.`;
  }
  const api = { reason, path, shared, genre, lately, shopGenre };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Dig = api;
})(this);
