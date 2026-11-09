// Co-listening similarity (docs/21): artist vectors learned offline from ListenBrainz listens (scripts/data/colisten.py),
// shipped as renderer/colisten-data.js. Works offline; nothing is sent anywhere. UMD: the renderer and the eval harness share it.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.Colisten = factory(root.COLISTEN);
})(this, function make(T) {
  if (!T) return null;
  const D = T.dims;
  let vec = null, idx = null, len = null;
  function init() {
    if (vec) return;
    const bin = typeof atob === 'function' ? Uint8Array.from(atob(T.vec), ch => ch.charCodeAt(0)) : Buffer.from(T.vec, 'base64');
    vec = new Int8Array(bin.buffer, bin.byteOffset, bin.byteLength);
    const keys = T.keys.split('\n');
    idx = new Map(keys.map((k, i) => [k, i]));
    len = new Float32Array(keys.length);
    for (let i = 0; i < keys.length; i++) { let s = 0; for (let d = 0; d < D; d++) s += vec[i * D + d] ** 2; len[i] = Math.sqrt(s) || 1; }
  }
  const norm = s => String(s || '').normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); // = src/music.js norm
  const find = name => { init(); const i = idx.get(norm(name)); return i === undefined ? -1 : i; };
  function cos(i, j) {
    let s = 0;
    for (let d = 0; d < D; d++) s += vec[i * D + d] * vec[j * D + d];
    return s / (len[i] * len[j]);
  }
  // Mean of the k highest cosines from artist i to a set of artist indices (its nearest few, not the whole crowd).
  function near(i, set, k) {
    const c = set.filter(j => j !== i).map(j => cos(i, j)).sort((a, b) => b - a).slice(0, k);
    return c.length ? c.reduce((a, b) => a + b, 0) / c.length : null;
  }
  // Score for a candidate artist name: closeness to loved artists minus half its closeness to skipped ones (both: index
  // lists from indices()). null = the artist or every love is missing from the table.
  function score(name, loved, skipped = [], k = 3) {
    const i = find(name);
    if (i < 0) return null;
    const L = near(i, loved, k);
    if (L === null) return null;
    const S = near(i, skipped, k);
    return L - (S === null ? 0 : 0.5 * S);
  }
  // Relationship graph (members, collaborations, co-credits; scripts/data/graph.py) as adjacency lists, built on first use.
  let adj = null;
  function graph() {
    if (adj || !T.edges) return adj;
    init();
    const b = typeof atob === 'function' ? Uint8Array.from(atob(T.edges), ch => ch.charCodeAt(0)) : Buffer.from(T.edges, 'base64');
    const e = new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    adj = Array.from({ length: len.length }, () => []);
    for (let i = 0; i < e.length; i += 2) { adj[e[i]].push(e[i + 1]); adj[e[i + 1]].push(e[i]); }
    return adj;
  }
  // Personalised PageRank (Haveliwala 2002): a walk that hops along relationships and jumps back to your loved artists with
  // probability `restart`. A high score = close to many loves through members, collaborators and credits. PageRank is linear
  // in where the walk restarts, so a set of loves is the mean of each love's own vector: one walk per loved artist, cached.
  const single = new Map();
  function ppr1(s, iters = 20, restart = 0.15) {
    if (single.has(s)) return single.get(s);
    const g = graph(), n = g.length;
    let p = new Float32Array(n); p[s] = 1;
    for (let it = 0; it < iters; it++) {
      const q = new Float32Array(n);
      for (let i = 0; i < n; i++) if (p[i] && g[i].length) { const share = (1 - restart) * p[i] / g[i].length; for (const j of g[i]) q[j] += share; }
      q[s] += restart;
      p = q;
    }
    single.set(s, p);
    return p;
  }
  // PageRank mass at artist i from a set of seeds (null without a graph or seeds).
  function ppr(seeds, i) {
    if (!graph() || !seeds.length) return null;
    let m = 0;
    for (const s of seeds) m += ppr1(s)[i];
    return m / seeds.length;
  }
  // Graph score for a candidate artist: log PageRank mass from the loved seeds. null = no graph, or the artist isn't in it.
  function graphScore(name, loved) {
    const i = find(name), p = i < 0 ? null : ppr(loved, i);
    return p === null ? null : Math.log10(p + 1e-7);
  }
  // Artist names -> table indices, unknown ones dropped. Callers keep this per profile change, not per candidate.
  const indices = names => [...new Set(names.map(find).filter(i => i >= 0))];
  return { dims: D, size: () => (init(), len.length), find, cos, near, score, indices, ppr, graphScore };
});
