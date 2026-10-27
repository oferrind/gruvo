// Times a real Crate Dig Roll (stampSongs) through src/ with a temp cache. Usage: node scripts/time-roll.js [stampId ...]
// Real network, MB paced by src/net.js. Logs per-host calls and network time, and when each song appears.
const fs = require('fs'), path = require('path'), os = require('os');
const net = require('../src/net'), Stamps = require('../src/stamps');
const IDS = process.argv.slice(2).length ? process.argv.slice(2) : ['1980-JP-city-pop', '1970-TR-psych', '1990-JP-rock'];
const file = path.join(os.tmpdir(), 'gruvo-roll-cache.json');
let stat;
const real = globalThis.fetch;
net.configure({ fetch: async (u, o) => {
  const host = new URL(u).hostname, s = Date.now();
  try { return await real(u, o); } finally { const h = stat[host] ||= { n: 0, ms: 0 }; h.n++; h.ms += Date.now() - s; }
} });
(async () => {
  for (const id of IDS) {
    net.initCache({ read: () => ({}), write: t => fs.writeFileSync(file, t) }); // empty cache each stamp: cold
    const st = Stamps.makeStamp(id); if (!st) { console.log(id, 'no such stamp'); continue; }
    stat = {}; const t0 = Date.now(), at = [];
    const res = await Stamps.stampSongs(net.get, st, { emit: () => at.push(Date.now() - t0) });
    console.log(`${id}: total ${Date.now() - t0}ms songs=${at.length} first=${at[0]}ms ${JSON.stringify(res && { thin: res.thin, error: res.error })} calls=${JSON.stringify(stat)}`);
  }
})();
