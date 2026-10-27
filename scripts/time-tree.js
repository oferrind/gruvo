// Times a real Family Tree grow + More through src/ with a temp cache. Usage: node scripts/time-tree.js [cold|warm] [cacheFile]
// Real network. MB stays paced by src/net.js. Logs per-host calls, network time, and when each node appears.
const fs = require('fs'), path = require('path'), os = require('os');
const net = require('../src/net'), Tree = require('../src/tree');
const SONGS = [['Pulp', 'Common People'], ['Radiohead', 'Karma Police'], ['Les Négresses Vertes', "Voilà l'été indien"]];
const file = process.argv[3] || path.join(os.tmpdir(), 'gruvo-time-cache.json');
if (process.argv[2] !== 'warm') try { fs.unlinkSync(file); } catch {}
net.initCache({ read: () => JSON.parse(fs.readFileSync(file, 'utf8')), write: t => fs.writeFileSync(file, t) });
let t0, stat;
const real = globalThis.fetch;
net.configure({ fetch: async (u, o) => {
  const host = new URL(u).hostname, s = Date.now();
  try { return await real(u, o); } finally { const h = stat[host] ||= { n: 0, ms: 0 }; h.n++; h.ms += Date.now() - s; }
} });
(async () => {
  for (const [artist, title] of SONGS) {
    stat = {}; t0 = Date.now();
    const first = {};
    const T = Tree.newTree(net.get, { source: 'x', id: null, artist, title }, { settings: {},
      emit: n => { const k = n.depth === 1 ? 'firstFamily' : n.depth === 2 ? 'firstGrand' : 'root'; first[k] ??= Date.now() - t0; } });
    await Tree.growTree(T, { background: true }); const ret = Date.now() - t0; await T.deep;
    const grow = Date.now() - t0, counts = JSON.stringify(stat), nodes = T.nodes.length;
    const leaf = T.nodes.find(n => n.depth === 2 && !n.kids);
    let more = '';
    if (leaf) { stat = {}; const m = Date.now(); const r = await Tree.moreTree(T, leaf.id); more = ` | More(leaf) ${Date.now() - m}ms +${r.added} ${JSON.stringify(stat)}`; }
    console.log(`${artist} - ${title}: grow returns ${ret}ms, all ${grow}ms nodes=${nodes} first=${JSON.stringify(first)} calls=${counts}${more}`);
  }
  net.flushCache();
})();
