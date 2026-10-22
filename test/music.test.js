const test = require('node:test');
const assert = require('node:assert');
const m = require('../src/music');
const { isFresh, prune, ttlFor } = require('../src/cache');
const fx = name => require(`./fixtures/${name}.json`);

// Fake `get` that serves recorded JSON by URL substring; no network.
const fakeGet = routes => async url => {
  const hit = Object.keys(routes).find(k => url.includes(k));
  return hit ? routes[hit] : { error: { message: 'no fixture' } };
};
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('norm and artist matching are strict', () => {
  assert.equal(m.norm('Ed O’Brien'), 'edobrien');
  assert.equal(m.norm('Beyoncé'), 'beyonce');
  assert.ok(m.artistMatch('Hailu Mergia & The Walias', 'Hailu Mergia'));
  assert.ok(m.artistMatch('RADIOHEAD', 'radiohead'));
  assert.ok(!m.artistMatch('Seifu Yohannes', 'Misread'));
  assert.ok(!m.artistMatch('Abba', 'Abbas Kiarostami')); // short names need exact match
  assert.ok(!m.artistMatch('', 'x'));
});

test('pickDeezer prefers title match, rejects wrong artist', () => {
  const rows = fx('dz_search_creep').data;
  assert.equal(m.pickDeezer(rows, 'Radiohead', 'Creep').title, 'Creep');
  assert.equal(m.pickDeezer(rows, 'Glee Cast', 'Creep').artist.name, 'Glee Cast');
  assert.equal(m.pickDeezer(rows, 'Coldplay', 'Creep'), null);
  assert.equal(m.pickDeezer(rows, 'Radiohead', 'Paranoid Android', true), null);
  assert.ok(m.pickDeezer(rows, 'Radiohead', 'Paranoid Android'));
});

test('name-only pick refuses an ambiguous artist (live: Trinidad "Atlantik" revealed as the German band)', () => {
  const row = (id, name, title, rank) => ({ id: title, title, rank, preview: 'p', artist: { id, name } });
  // Real Deezer "Atlantik" search: two different artists share the name.
  const atl = [row(1462393, 'Ardian Bujupi', 'Atlantik', 238198), row(254159, 'Atlantik', 'Gezeitenkoenig', 158056), row(10024010, 'Atlantik', 'All Aboard', 118048)];
  assert.equal(m.pickDeezer(atl, 'Atlantik', ''), null);
  // A more popular substring-name artist must not beat the exact one.
  const mario = [row(1, 'Mario Lanza', 'Be My Love', 900), row(2, 'Mario', 'Let Me Love You', 100)];
  assert.equal(m.pickDeezer(mario, 'Mario', '').artist.id, 2);
  const it = [{ artistId: 1, artistName: 'Atlantik', trackName: 'A', previewUrl: 'p' }, { artistId: 2, artistName: 'Atlantik', trackName: 'B', previewUrl: 'p' }];
  assert.equal(m.pickItunes(it, 'Atlantik', ''), null);
});

test('search hits: named song first, then most popular, one row per song', async () => {
  const get = fakeGet({ 'api.deezer.com/search': fx('dz_search_creep') });
  const hits = await m.flows.searchTracks(get, 'radiohead creep');
  assert.deepEqual(hits.slice(0, 3).map(h => `${h.artist} – ${h.title}`),
    ['Radiohead – Creep', 'Glee Cast – Creep (Cover of Radiohead)', 'Thom Yorke – Creep (Very 2021 Rmx)']);
  assert.ok(!hits.some(h => h.title === 'Creep (Acoustic)')); // same song, other version
  const pop = m.sortHits(fx('dz_search_creep').data, 'xyz').map(r => r.rank);
  assert.deepEqual(pop, pop.slice().sort((a, b) => b - a));
});

test('resolvePreview falls back to iTunes', async () => {
  const get = fakeGet({ 'api.deezer.com/search': { data: [] }, 'itunes.apple.com/search': fx('it_search_tezeta') });
  const t = await m.flows.resolvePreview(get, 'Hailu Mergia', 'Tezeta');
  assert.equal(t.source, 'it');
  assert.equal(t.title, 'Tezeta');
  assert.ok(t.previewUrl);
  assert.equal(await m.flows.resolvePreview(fakeGet({}), 'Nobody', 'Nothing'), null);
});

test('adventure slider mix', () => {
  assert.deepEqual(m.adventureMix(0), { pExplore: 0, fanCap: 1020000, hops: 1 });
  assert.deepEqual(m.adventureMix(50), { pExplore: 0.5, fanCap: 520000, hops: 1 });
  assert.deepEqual(m.adventureMix(100), { pExplore: 1, fanCap: 20000, hops: 2 });
  assert.equal(m.adventureMix(70).hops, 2);
  assert.equal(m.chooseSource(50, 2, 0.9), 'explore'); // fewer than 3 loves: always explore
  assert.equal(m.chooseSource(50, 3, 0.9), 'neighbour');
  assert.equal(m.chooseSource(50, 3, 0.1), 'explore');
  let n = 0; const r = seeded(7);
  for (let i = 0; i < 2000; i++) if (m.chooseSource(50, 5, r()) === 'neighbour') n++;
  assert.ok(n > 900 && n < 1100, `about half neighbour, got ${n}`);
});

test('pickRelated filters fan cap and heard', () => {
  const rel = fx('dz_related_radiohead').data;
  const out = m.pickRelated(rel, 520000, ['thomyorke']);
  assert.ok(out.length > 0);
  assert.ok(out.every(a => a.nb_fan < 520000 && a.name !== 'Thom Yorke'));
});

test('candidate selection never repeats a heard artist', async () => {
  const get = fakeGet({ 'musicbrainz.org/ws/2/artist?query': fx('mb_artist_query_ng'), 'api.deezer.com/search': {
    data: fx('mb_artist_query_ng').artists.map((a, i) => ({ id: i, title: 'Song', rank: 1, preview: 'https://x.dzcdn.net/p.mp3', artist: { id: i, name: a.name }, album: {} })) } });
  const heard = [];
  for (let i = 0; i < 30; i++) {
    const c = await m.flows.nextCandidate(get, { heard, likes: [], adventure: 50 });
    if (!c) continue;
    assert.ok(!heard.includes(m.norm(c.artist)), `repeat ${c.artist}`);
    assert.match(c.reason, /^Random trip: /);
    heard.push(m.norm(c.artist));
  }
  assert.ok(heard.length >= 25);
});

test('random trips lean toward chosen regions/decades but keep pure randomness', () => {
  const rand = seeded(7), prefs = { regions: ['Africa'], decades: [1970] };
  const africa = Object.keys(m.COUNTRIES.Africa);
  const trips = Array.from({ length: 2000 }, () => m.pickTrip(prefs, rand));
  const inRegion = trips.filter(t => africa.includes(t.cc)).length / trips.length;
  const inDecade = trips.filter(t => t.decade === 1970).length / trips.length;
  assert.ok(inRegion > 0.65 && inRegion < 0.9, `region share ${inRegion}`); // ~0.7 + a little chance on the random branch
  assert.ok(inDecade > 0.7 && inDecade < 0.85, `decade share ${inDecade}`);
  assert.ok(trips.some(t => !africa.includes(t.cc)) && trips.some(t => t.decade !== 1970));
  const free = Array.from({ length: 500 }, () => m.pickTrip({}, rand));
  assert.ok(free.filter(t => africa.includes(t.cc)).length < 0.35 * 500); // no prefs: no bias
});

test('artists listed in preferences are never recommended; they seed the neighbour source', async () => {
  const listed = { dzId: 27, name: 'Daft Punk' };
  const urls = [];
  const top = id => ({ data: [{ id: id * 10, title: 'T', preview: 'https://x.dzcdn.net/p.mp3', artist: { id, name: `A${id}` }, album: {} }] });
  const get = async url => {
    urls.push(url);
    if (url.includes('/artist/27/related')) return { data: [{ id: 27, name: 'Daft Punk', nb_fan: 10 }, { id: 5, name: 'A5', nb_fan: 10 }] };
    if (url.includes('/genre/152/artists')) return { data: [{ id: 27, name: 'Daft Punk' }, { id: 6, name: 'A6' }] };
    const t = url.match(/\/artist\/(\d+)\/top/);
    if (t) return t[1] === '27' ? { data: [{ id: 1, title: 'X', preview: 'https://x.dzcdn.net/p.mp3', artist: listed, album: {} }] } : top(Number(t[1]));
    return { error: { message: 'no fixture' } };
  };
  const prefs = { artists: [listed], genres: [{ id: 152, name: 'Rock' }] };
  for (const source of ['neighbour', 'genre']) for (let i = 0; i < 10; i++) {
    const c = await m.flows.nextCandidate(get, { likes: [], heard: [], adventure: 0, source, prefs });
    assert.ok(c && c.artistDzId !== 27 && c.artist !== 'Daft Punk', `${source} returned ${c && c.artist}`);
    assert.doesNotMatch(`${c.reason} ${c.via}`, /Deezer|MusicBrainz|iTunes/, 'reason text never names the data source');
  }
  assert.ok(urls.some(u => u.includes('/artist/27/related')), 'listed artist used as a neighbour source');
  assert.deepEqual(m.prefHeard(prefs), ['dz:27', 'daftpunk']);
});

test('artist search: highest-fan exact match wins, a tiny exact match does not beat a big partial; seeds take top tracks with previews', async () => {
  const rows = [{ id: 1, name: 'Daft Punk Tribute', nb_fan: 900 }, { id: 2, name: 'Daft Punk', nb_fan: 50 }, { id: 3, name: 'daft punk', nb_fan: 400 }];
  assert.deepEqual(m.rankArtists(rows, 'Daft Punk').map(a => a.dzId), [3, 1, 2]);
  assert.deepEqual(m.rankArtists([{ id: 1, name: 'NIRV', nb_fan: 3 }, { id: 2, name: 'Nirvana', nb_fan: 1e7 }], 'Nirv').map(a => a.name), ['Nirvana', 'NIRV']);
  const get = async () => ({ data: [{ id: 9, title: 'a', artist: { id: 2, name: 'B' }, album: {} },
    { id: 10, title: 'b', preview: 'https://x.dzcdn.net/1.mp3', artist: { id: 2, name: 'B' }, album: {} },
    { id: 11, title: 'c', preview: 'https://x.dzcdn.net/2.mp3', artist: { id: 2, name: 'B' }, album: {} },
    { id: 12, title: 'd', preview: 'https://x.dzcdn.net/3.mp3', artist: { id: 2, name: 'B' }, album: {} }] });
  assert.deepEqual((await m.flows.seedTracks(get, [{ dzId: 2, name: 'B' }])).map(t => t.seedId), ['seed:2:10', 'seed:2:11']);
});

test('trail source: producer of a loved track -> another artist they worked with, never a heard one', async () => {
  const urls = [];
  const get = async url => {
    urls.push(url);
    if (url.includes('/recording/70595637')) return fx('mb_recording_creep');
    if (url.includes('/work/')) return fx('mb_work_creep_artists');
    if (url.includes('inc=recording-rels')) return fx('mb_artist_kolderie');
    const q = decodeURIComponent(url.split('q=')[1] || '').replace(/&limit.*/, '');
    if (url.includes('api.deezer.com/search')) return { data: [{ id: 5, title: q, rank: 1, preview: 'https://x.dzcdn.net/p.mp3', artist: { id: q.length, name: q }, album: {} }] };
    return { error: { message: 'no fixture' } };
  };
  const likes = [{ recId: '70595637-9310-45f2-a266-58f8de4874a7', title: 'Creep', artist: 'Radiohead' }];
  const c = await m.flows.nextCandidate(get, { likes, heard: [], adventure: 50, source: 'trail' });
  assert.ok(c && !m.artistMatch(c.artist, 'Radiohead'));
  assert.match(c.via, /^(Paul Q\. Kolderie|Sean Slade), (producer|engineer) on “Creep”, who /);
  assert.ok(!urls.some(u => u.includes('itunes')));
  const again = await m.flows.nextCandidate(get, { likes, heard: [m.norm(c.artist)], adventure: 50, source: 'trail' });
  assert.ok(!again || m.norm(again.artist) !== m.norm(c.artist));
});

test('credits grouping for Creep', () => {
  const g = m.groupCredits(fx('mb_recording_creep'), fx('mb_work_creep_artists'));
  assert.equal(g[0].role, 'producer');
  const producers = g[0].people.map(p => p.name);
  assert.deepEqual(producers.sort(), ['Paul Q. Kolderie', 'Sean Slade']);
  assert.ok(g.find(x => x.role === 'composer'));
  assert.equal(g[g.length - 1].role, 'artist');
  assert.equal(m.bestRecording([{ relations: [] }, fx('mb_recording_creep'), { error: {} }]).id, fx('mb_recording_creep').id);
});

test('trail picks exclude original artist, one per artist', () => {
  const picks = m.trailPicks(fx('mb_artist_kolderie').relations, 'Radiohead', [], 12, seeded(3));
  assert.ok(picks.length >= 8);
  assert.ok(picks.every(p => p.artist !== 'Radiohead' && p.title && p.recId));
  assert.equal(new Set(picks.map(p => p.artist)).size, picks.length);
  const covers = m.coverArtists(fx('mb_work_creep_recs').relations, 'Radiohead');
  assert.ok(covers.length > 5 && !covers.includes('Radiohead'));
});

test('heard is id-keyed: same-name artists stay apart, old name entries still match (R4)', async () => {
  const rel = [{ id: 1, name: 'Nirvana', nb_fan: 10 }, { id: 2, name: 'Nirvana', nb_fan: 10 }, { id: 3, name: 'Low', nb_fan: 10 }];
  assert.deepEqual(m.pickRelated(rel, 100, ['dz:1']).map(a => a.id), [2, 3]);
  assert.deepEqual(m.pickRelated(rel, 100, ['low']).map(a => a.id), [1, 2]);
  const rec = (name, id) => ({ type: 'producer', recording: { id: `r-${id}`, title: 'T', 'artist-credit': [{ name, joinphrase: '', artist: { id, name } }] } });
  for (let s = 1; s < 6; s++) {
    assert.equal(m.trailPicks([rec('A', 'a'), rec('B', 'b')], 'X', ['mb:a'], 12, seeded(s))[0].artist, 'B');
    assert.equal(m.trailPicks([rec('A', 'a'), rec('B', 'b')], 'X', ['a'], 12, seeded(s))[0].artist, 'B');
  }
  // Blind Test: an id-only heard list still never repeats an artist.
  const get = fakeGet({ 'musicbrainz.org/ws/2/artist?query': fx('mb_artist_query_ng'), 'api.deezer.com/search': {
    data: fx('mb_artist_query_ng').artists.map((a, i) => ({ id: i, title: 'Song', rank: 1, preview: 'https://x.dzcdn.net/p.mp3', artist: { id: i, name: a.name }, album: {} })) } });
  const heard = [];
  for (let i = 0; i < 30; i++) {
    const c = await m.flows.nextCandidate(get, { heard, likes: [], adventure: 50 });
    if (!c) continue;
    assert.ok(!heard.includes(`dz:${c.artistDzId}`), `repeat ${c.artist}`);
    heard.push(`dz:${c.artistDzId}`);
  }
  assert.ok(heard.length >= 10);
});

test('cache expiry per host and prune', () => {
  const now = 1e12;
  assert.equal(ttlFor('https://api.deezer.com/search?q=a'), 600000);
  assert.ok(isFresh({ t: now - 9 * 60000 }, 'https://api.deezer.com/x', now));
  assert.ok(!isFresh({ t: now - 11 * 60000 }, 'https://api.deezer.com/x', now));
  assert.ok(isFresh({ t: now - 29 * 86400000 }, 'https://musicbrainz.org/ws/2/x', now));
  assert.ok(!isFresh({ t: now - 2 * 86400000 }, 'https://itunes.apple.com/x', now));
  assert.ok(!isFresh(undefined, 'https://api.deezer.com/x', now));
  const u = k => `https://musicbrainz.org/${k}`;
  const c = { [u('a')]: { t: now - 3 }, [u('b')]: { t: now - 5 }, [u('c')]: { t: now - 4 } };
  assert.deepEqual(Object.keys(prune(c, 2, 1e9, now)).sort(), [u('a'), u('c')]);
});

test('prune drops expired entries and enforces a byte budget', () => {
  const now = 1e12, big = 'x'.repeat(1000);
  const c = {
    'https://api.deezer.com/search?q=old': { t: now - 11 * 60000, body: {} }, // expired: never served again
    'https://musicbrainz.org/1': { t: now - 3, body: big },
    'https://musicbrainz.org/2': { t: now - 2, body: big },
    'https://musicbrainz.org/3': { t: now - 1, body: big },
  };
  assert.deepEqual(Object.keys(prune(c, 5000, 2500, now)).sort(), ['https://musicbrainz.org/2', 'https://musicbrainz.org/3']);
});
