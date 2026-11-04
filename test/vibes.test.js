const test = require('node:test');
const assert = require('node:assert');
const V = require('../renderer/vibes'), F = require('../renderer/features'), S = require('../src/vibes');

const row = (id, artistId, artist, lists = [{ title: 'Cozy', genre: null }]) => ({ id, title: `Song ${id}`, artist, artistDzId: artistId, previewUrl: 'x', lists });
const profile = (o = {}) => ({ likes: [], heard: [], ratings: [], back: { ok: [] }, prefs: { genres: [], artists: [] }, ...o });
const taste = (p, o) => V.makeTaste(p, { F, ...o });
const rank = (rows, t, adv = 50) => V.rank(rows, t, adv, () => 0);

test('vibe list: 40 unique vibes in the four groups', () => {
  assert.equal(V.VIBES.length, 40);
  assert.equal(new Set(V.VIBES.map(v => v.id)).size, 40);
  assert.ok(V.VIBES.every(v => V.GROUPS.includes(v.group) && v.q.length));
});

test('isEditorial / badTitle: editors pass, user lists and junk titles do not', () => {
  for (const n of ['Georges - Deezer Folk Editor', 'Rudy - Deezer Moods Editor', 'Deezer Moods Brasil']) assert.ok(V.isEditorial({ user: { name: n } }), n);
  for (const n of ['Tribute Corner', 'Lofi Universe', '']) assert.ok(!V.isEditorial({ user: { name: n } }), n);
  assert.ok(!V.isEditorial({}));
  for (const t of ['100% Terrace Martin', 'Christmas Hits', 'Disney Classics', 'Rock setlist', 'Karaoke Kids']) assert.ok(V.badTitle(t), t);
  for (const t of ['Cozy Coffeeshop', 'Soul Coffee', 'The Indie Café']) assert.ok(!V.badTitle(t), t);
});

test('editorGenre maps the editor name, Moods is null', () => {
  assert.equal(V.editorGenre('Georges - Deezer Folk Editor'), 'folk');
  assert.equal(V.editorGenre('Ann - Deezer Soul & Funk Editor'), 'soul');
  assert.equal(V.editorGenre('Rudy - Deezer Moods Editor'), null);
});

test('genreWeights: a picked genre is 1, tags give a share of the top genre, no taste is all 0', () => {
  const g = V.genreWeights([{ id: 466 }], { jazz: 6, rock: 3 });
  assert.equal(g.folk, 1); assert.equal(g.jazz, 1); assert.equal(g.rock, 0.5); assert.equal(g.moods, 0.4);
  assert.ok(Object.values(V.genreWeights([], {})).every(x => x === 0));
});

test('rank: loved > related > unknown; cooled sinks; unknown tags are not penalised', () => {
  const rows = [row(1, 10, 'Stranger'), row(2, 11, 'Loved One'), row(3, 12, 'Neighbour'), row(4, 13, 'Cooled')];
  const t = taste(profile({ likes: [{ source: 'dz', id: '99', artist: 'Loved One', artistDzId: 11 }], heard: ['dz:13'] }), { near: { 12: { k: 1, by: 'Loved One' } } });
  const r = rank(rows, t, 0);
  assert.deepEqual(r.map(i => i.row.id), [2, 3, 1, 4]);
  assert.equal(r[1].near, 0.6);
  assert.ok(r.find(i => i.row.id === 4).cooled);
  assert.ok(!rank([row(4, 13, 'Cooled')], taste(profile({ heard: ['dz:13'], back: { ok: [13] } })))[0].cooled); // OK-rated artists are not cooled
  assert.equal(r[2].tagFit, r[2].genreFit); // no tags known: falls back to genreFit
});

test('rank: a skipped track is dropped; genre fit and several lists lift a row', () => {
  const t = taste(profile({ ratings: [{ id: 'dz:1', rating: 'skip' }], prefs: { genres: [{ id: 466, name: 'Folk' }], artists: [] } }));
  const rows = [row(1, 10, 'A'), row(2, 11, 'B', [{ title: 'x', genre: 'folk' }]), row(3, 12, 'C', [{ title: 'x', genre: 'rock' }]), row(4, 13, 'D', [{ title: 'x', genre: 'rock' }, { title: 'y', genre: 'rock' }])];
  assert.deepEqual(rank(rows, t).map(i => i.row.id), [2, 4, 3]);
});

test('rank: tag fit uses the percentile among known rows', () => {
  const tg = { 1: { jazz: 5 }, 2: { metal: 5 } };
  const t = taste(profile(), { lovedTags: { jazz: 4 }, tagsOf: r => tg[r.id] || null });
  const r = rank([row(1, 10, 'A'), row(2, 11, 'B'), row(3, 12, 'C')], t);
  assert.equal(r[0].row.id, 1); assert.equal(r[0].tagFit, 0.75); assert.equal(r.find(i => i.row.id === 2).tagFit, 0.25);
});

test('adventure: it scales the near term, and caps loved artists per page at 5 (0) and 1 (100)', () => {
  const likes = Array.from({ length: 8 }, (_, i) => ({ source: 'dz', id: `l${i}`, artist: `Love${i}`, artistDzId: 100 + i }));
  const rows = [...likes.map((l, i) => row(100 + i, l.artistDzId, l.artist)), ...Array.from({ length: 20 }, (_, i) => row(i, i, `New${i}`))];
  const t = taste(profile({ likes }));
  for (const [adv, cap] of [[0, 5], [100, 1]]) {
    const { page } = V.pickPage(rank(rows, t, adv), t, new Set(), adv);
    assert.equal(page.filter(i => i.loved).length, cap, `adventure ${adv}`);
  }
  assert.ok(rank(rows, t, 0)[0].score > rank(rows, t, 100)[0].score);
});

test('pickPage: max 2 per artist never back to back, 2 loved tracks, discovery floor, short pool', () => {
  const fan = [0, 1, 2, 3].map(i => ({ source: 'dz', id: `${100 + i}`, artist: 'Fan', artistDzId: 5 }));
  const rows = [...Array.from({ length: 4 }, (_, i) => row(100 + i, 5, 'Fan')), ...Array.from({ length: 6 }, (_, i) => row(50 + i, 8, 'Heard')),
    ...Array.from({ length: 30 }, (_, i) => row(200 + i, 300 + (i >> 1), `New${i >> 1}`))];
  const t = taste(profile({ likes: fan, heard: ['dz:8'] }));
  const { page, more } = V.pickPage(rank(rows, t, 50), t, new Set(), 50);
  assert.equal(page.length, 20); assert.ok(more);
  const per = {}; page.forEach(i => { per[i.row.artistDzId] = (per[i.row.artistDzId] || 0) + 1; });
  assert.ok(Object.values(per).every(n => n <= 2));
  page.slice(1).forEach((i, k) => assert.notEqual(i.row.artistDzId, page[k].row.artistDzId));
  assert.ok(page.filter(i => !i.loved && !i.heard).length >= 10);
  assert.ok(page.filter(i => i.lovedTrack).length <= 2);
  const small = V.pickPage(rank(rows.slice(0, 2), t), t, new Set(), 50);
  assert.equal(small.page.length, 2); assert.ok(!small.more && small.short); // only 2 rows exist
});

test('pickPage: More excludes what was shown', () => {
  const rows = Array.from({ length: 30 }, (_, i) => row(i, i, `A${i}`)), t = taste(profile()), ranked = rank(rows, t);
  const one = V.pickPage(ranked, t, new Set(), 50), shown = new Set(one.page.map(i => `dz:${i.row.id}`));
  const two = V.pickPage(ranked, t, shown, 50);
  assert.equal(two.page.length, 10); assert.ok(!two.more && two.short);
  assert.ok(two.page.every(i => !shown.has(`dz:${i.row.id}`)));
});

test('why: priority order and the vibe prefix on every line', () => {
  const vibe = V.VIBES[0], likes = [{ source: 'dz', id: '1', artist: 'Norah Jones', artistDzId: 5 }];
  const tg = { 4: { 'trip hop': 5, downtempo: 4 }, 6: { metal: 5 } };
  const t = taste(profile({ likes, prefs: { genres: [{ id: 466, name: 'Folk' }], artists: [] } }), { lovedTags: { 'trip hop': 3, downtempo: 2 }, near: { 6: { k: 1, by: 'Norah Jones' } }, tagsOf: r => tg[r.id] || null });
  const rows = [row(1, 5, 'Norah Jones'), row(2, 5, 'Norah Jones'), row(3, 6, 'Near'), row(4, 7, 'Tagged'), row(5, 8, 'Folky', [{ title: 'Z', genre: 'folk' }]), row(9, 9, 'Plain', [{ title: 'Cozy Coffeeshop', genre: null }]), row(6, 6, 'Odd')];
  const kinds = Object.fromEntries(rank(rows, t).map(i => [i.row.id, V.why(i, vibe, t)]));
  assert.deepEqual([1, 2, 3, 4, 5, 9].map(id => kinds[id][2]), ['love', 'artist', 'near', 'tags', 'genre', 'source']);
  for (const w of Object.values(kinds)) assert.ok(w[0].startsWith('Coffee shop · '), w[0]);
  assert.match(kinds[2][0], /more from Norah Jones, a love of yours/); assert.match(kinds[4][0], /trip hop and downtempo/); assert.match(kinds[9][0], /“Cozy Coffeeshop”/);
});

// ---- src/vibes.js with a mocked get ----
const pl = (id, title, user) => ({ id, title, user: { name: user } });
const tr = (id, aid, title, o = {}) => ({ id, title, readable: true, preview: 'https://p/' + id, artist: { id: aid, name: 'A' + aid }, album: { cover_medium: 'c' }, ...o });

test('vibePool: editorial lists only, previews only, genre attached', async () => {
  const seen = [];
  const get = async url => {
    seen.push(url);
    if (url.includes('/search/playlist')) return { data: [pl(1, 'Cozy Coffeeshop', 'Ann - Deezer Folk Editor'), pl(2, 'Tribute Corner', 'bob'), pl(3, 'Christmas Cafe', 'Deezer Moods Editor'), pl(4, '100% Norah', 'X - Deezer Artist Editor')] };
    if (url.includes('/playlist/1/tracks')) return { data: [tr(10, 1, 'One'), tr(11, 2, 'Two (2011 Remaster)'), tr(12, 3, 'Locked', { readable: false }), tr(13, 4, 'No preview', { preview: '' })] };
    return { data: [] };
  };
  const r = await S.flows.vibePool(get, 'coffee-shop');
  assert.deepEqual(r.rows.map(x => x.id), [10, 11]);
  assert.equal(r.rows[1].title, 'Two'); assert.equal(r.rows[0].lists[0].genre, 'folk'); assert.equal(r.rows[0].previewUrl, 'https://p/10');
  assert.ok(seen.every(u => !/playlist\/[234]\//.test(u)));
});

test('vibePool: the same song on two lists counts once, with both lists', async () => {
  const r = await S.flows.vibePool(async u => (u.includes('/search/playlist') ? { data: [pl(1, 'A', 'x - Deezer Pop Editor'), pl(2, 'B', 'y - Deezer Rock Editor')] }
    : { data: [tr(10, 1, 'Same'), tr(20, 1, 'Same')] }), 'sleep');
  assert.equal(r.rows.length, 1); assert.equal(r.rows[0].lists.length, 2);
});

test('vibePool: unknown vibe and failed searches give {error}', async () => {
  assert.ok((await S.flows.vibePool(async () => ({}), 'nope')).error);
  assert.ok((await S.flows.vibePool(async () => ({ error: { status: 500 } }), 'study')).error);
});

test('relatedMap: counts loved artists listing each artist; empty related lists are fine', async () => {
  const r = await S.flows.relatedMap(async u => ({ data: u.includes('/artist/1/') ? [{ id: 9 }, { id: 8 }] : u.includes('/artist/2/') ? [{ id: 9 }] : [] }),
    [{ id: 1, name: 'One' }, { id: 2, name: 'Two' }, { id: 3, name: 'Three' }, { id: 'x' }]);
  assert.equal(r[9].k, 2); assert.equal(r[8].k, 1); assert.ok(['One', 'Two'].includes(r[9].by)); assert.equal(Object.keys(r).length, 2);
});
