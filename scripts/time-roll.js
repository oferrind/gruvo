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
const nm = x => x.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); // same-name artists: the biggest wins
(async () => {
  for (const id of IDS) {
    net.initCache({ read: () => ({}), write: t => fs.writeFileSync(file, t) }); // empty cache each stamp: cold
    const st = Stamps.makeStamp(id); if (!st) { console.log(id, 'no such stamp'); continue; }
    stat = {}; const t0 = Date.now(), at = [], who = [];
    const res = await Stamps.stampSongs(net.get, st, { paged: true, emit: r => (at.push(Date.now() - t0), who.push(r.artist)) });
    const total = Date.now() - t0, calls = JSON.stringify(stat);
    stat = {}; const t1 = Date.now(), more = res && res.next ? await Stamps.stampMore(net.get, st, res.next) : { added: 0 }; // the More button: the next 15
    console.log(`${id}: More +${more.added} in ${Date.now() - t1}ms ${JSON.stringify(stat)}`);
    const fans = {}; // fame of each distinct artist, looked up after the timing (not counted)
    for (const a of new Set(who)) { const j = await (await real(`https://api.deezer.com/search/artist?q=${encodeURIComponent(a)}&limit=10`)).json().catch(() => ({})); const m = (j.data || []).filter(x => nm(x.name) === nm(a)).sort((x, y) => y.nb_fan - x.nb_fan)[0]; fans[a] = m ? m.nb_fan : 0; }
    const big = who.filter(a => fans[a] > 1000).length;
    console.log(`${id}: total ${total}ms songs=${at.length} big(>1k fans)=${big} first=${at[0]}ms ${JSON.stringify(res && { thin: res.thin, error: res.error })} calls=${calls}
  ${[...new Set(who)].map(a => `${a}(${fans[a]})`).join(', ')}`);
  }
})();
