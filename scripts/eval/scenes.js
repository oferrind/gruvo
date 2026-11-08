#!/usr/bin/env node
// Crate Dig against an outside reference (docs/21): for each scene, the 10 most-listened artists on ListenBrainz (MLHD+
// listeners) that MusicBrainz places in its country and decade with a matching top-3 tag (scene-ref.json, built by
// scripts/data/graph.py). Rolls a real Crate Dig (first page + More, live network, paced) and reports how many of those
// 10 it reaches, and what share of its artists are among the scene's 50 most-listened.
//   node scripts/eval/scenes.js <scene-ref.json> [cache.json] [stampId ...]
const fs = require('fs');
const net = require('../../src/net'), Stamps = require('../../src/stamps');
const { norm } = require('../../src/music');
const [refFile, cacheFile = require('path').join(require('os').tmpdir(), 'gruvo-scenes-cache.json'), ...ids] = process.argv.slice(2);
const IDS = ids.length ? ids : ['1990-JP-rock', '1980-JP-city-pop', '1970-TR-psych', '1970-BR-mpb', '1980-US-hip-hop', '1990-GB-britpop',
  '1970-DE-krautrock', '1990-US-grunge', '1990-NO-black-metal', '1970-NG-afrobeat', '1980-GB-post-punk', '1960-US-soul', '2000-SE-indie-pop'];
const ref = JSON.parse(fs.readFileSync(refFile, 'utf8')); // [name, listeners, country, begin, end, tags]

// In the scene: from its country, active during its decade (unknown end = still active), a top-3 tag among the stamp's tags.
const inScene = st => ([, , cc, b, e, tags]) => cc === st.cc && b != null && b <= st.decade + 9 && (e == null || e >= st.decade)
  && tags.slice(0, 3).some(t => st.tags.includes(t.toLowerCase()));
let cache = {};
try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch {}
net.initCache({ read: () => cache, write: t => fs.writeFileSync(cacheFile, t) });

(async () => {
  const rows = [];
  for (const id of IDS) {
    const st = Stamps.makeStamp(id);
    if (!st) { console.log(id, 'no such stamp'); continue; }
    const scene = ref.filter(inScene(st)).sort((a, b) => b[1] - a[1]);
    const top10 = scene.slice(0, 10).map(r => norm(r[0])), top50 = new Set(scene.slice(0, 50).map(r => norm(r[0])));
    const who = [];
    const res = await Stamps.stampSongs(net.get, st, { paged: true, emit: r => who.push(r.artist) });
    if (res && res.next) await Stamps.stampMore(net.get, st, res.next, { emit: r => who.push(r.artist) }).catch(() => {}); // the More button: the next 15
    const dug = [...new Set(who.map(norm))];
    const hits = top10.filter(a => dug.includes(a)).length, inTop50 = dug.filter(a => top50.has(a)).length;
    rows.push({ id, scene: scene.length, top10: Math.min(10, scene.length), hits, dug: dug.length, inTop50 });
    console.log(`${id}: reference ${scene.length} artists; Crate Dig reached ${hits}/${Math.min(10, scene.length)} of the top 10; ${inTop50}/${dug.length} of its artists are in the top 50
  reference top 10: ${scene.slice(0, 10).map(r => `${r[0]}${dug.includes(norm(r[0])) ? '*' : ''}`).join(', ')}
  dug: ${[...new Set(who)].join(', ')}`);
  }
  net.flushCache && net.flushCache();
  const sum = k => rows.reduce((a, r) => a + r[k], 0);
  console.log(`\nALL: top-10 recall ${sum('hits')}/${sum('top10')} = ${(sum('hits') / sum('top10')).toFixed(2)}; precision vs top 50 ${sum('inTop50')}/${sum('dug')} = ${(sum('inTop50') / sum('dug')).toFixed(2)}`);
  console.log(JSON.stringify(rows));
})().catch(e => { console.error(e); process.exit(1); });
