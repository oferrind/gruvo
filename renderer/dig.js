// Family Tree "Dig": the reason line and the dig path, pure. Works in the renderer (window.Dig) and in node tests (require).
(function (root) {
  // One full sentence that names the parent, from the label src/tree.js wrote for the child.
  function reason(n, parent) {
    if (!parent || !n.label) return '';
    const P = parent.track.artist, L = n.label.replace(/[.\s]+$/, '');
    const dot = s => `${s}.`;
    // "Same scene: britpop, UK, formed 1989 · fans of Pulp play them too" -> "Same scene as Pulp: britpop, UK, formed 1989; fans of Pulp play them too."
    const same = L.match(/^Same (\w+): (.*?)(?: · fans of (.+) play them too)?$/);
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
  const api = { reason, path };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Dig = api;
})(this);
