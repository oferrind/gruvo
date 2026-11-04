// Times a real Mood Shelf pull (src/vibes.js + renderer/vibes.js) for a sample taste with a cold temp cache. Usage: node scripts/time-vibe.js [vibeId ...]
// Real network. The page is ranked the way the tab does it (pool + neighbour map in parallel, no tags yet), so "first row" = when the tab can draw.
const net = require('../src/net'), Vibes = require('../src/vibes'), V = require('../renderer/vibes'), F = require('../renderer/features');
const IDS = process.argv.slice(2).length ? process.argv.slice(2) : ['coffee-shop', 'rainy-window', 'workout', 'deep-focus', 'dinner-party'];
const LOVED = ['Radiohead', 'Khruangbin', 'Fleetwood Mac', 'Portishead', 'Bon Iver'];
(async () => {
  net.initCache({ read: () => ({}), write: () => {} });
  const dz = await Promise.all(LOVED.map(async n => ((await net.get(`https://api.deezer.com/search/artist?q=${encodeURIComponent(n)}&limit=1`)).data || [])[0]));
  const profile = { likes: dz.map(a => ({ source: 'dz', id: `t${a.id}`, artist: a.name, artistDzId: a.id })), heard: dz.map(a => `dz:${a.id}`), ratings: [], back: { ok: [] },
    prefs: { genres: [{ id: 85, name: 'Alternative' }, { id: 466, name: 'Folk' }], artists: [] }, adventure: 50 };
  const lovedTags = {};
  for (const a of dz) for (const [k, n] of Object.entries(await require('../src/music').flows.artistTags(net.get, a.name) || {})) lovedTags[k] = (lovedTags[k] || 0) + n;
  for (const id of IDS) {
    net.initCache({ read: () => ({}), write: () => {} }); // cold Deezer per vibe
    const t0 = Date.now();
    const [pool, near] = await Promise.all([Vibes.flows.vibePool(net.get, id), Vibes.flows.relatedMap(net.get, dz.map(a => ({ id: a.id, name: a.name })))]);
    if (pool.error) { console.log(id, 'ERROR', JSON.stringify(pool.error)); continue; }
    const taste = V.makeTaste(profile, { lovedTags, near, F }), vibe = V.VIBES.find(x => x.id === id);
    const { page, more } = V.pickPage(V.rank(pool.rows, taste, profile.adventure), taste, new Set(), profile.adventure);
    const first = Date.now() - t0;
    const whys = page.map(i => V.why(i, vibe, taste)[2]);
    const by = {}; whys.forEach(k => { by[k] = (by[k] || 0) + 1; });
    console.log(`${id}: first/total ${first}ms pool=${pool.rows.length} page=${page.length} playable=${page.filter(i => i.row.previewUrl).length} more=${more} ` +
      `taste-reasons=${whys.filter(k => k !== 'source').length}/${page.length} ${JSON.stringify(by)} artists=${new Set(page.map(i => i.row.artistDzId)).size} neverHeard=${page.filter(i => !i.loved && !i.heard).length}`);
  }
})();
