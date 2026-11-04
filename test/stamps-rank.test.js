const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/stamps');

const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rec = (id, artist, title, date) => ({ id, title, 'first-release-date': date, 'artist-credit': [{ name: artist.name, artist }] });
const A = (id, name, country, more = {}) => ({ id, name, 'sort-name': name, country, ...more });
const dz = (artist, title) => ({ id: `${artist}|${title}`, title, preview: 'https://cdnt-preview.dzcdn.net/x', artist: { id: 1, name: artist }, album: {} });

test('rank: top half by fans takes 2 of every 3 slots, the lesser half the third', () => {
  const list = Array.from({ length: 9 }, (_, i) => ({ id: `a${i}`, fan: i === 3 ? 0 : (i + 1) * 100 }));
  const ids = S.rank(list, seeded()).map(e => e.id);
  assert.equal(ids.length, 9);
  assert.deepEqual([ids[0], ids[1], ids[3], ids[4]], ['a8', 'a7', 'a6', 'a5']);
  assert.ok(['a3', 'a0', 'a1', 'a2'].includes(ids[2]), 'third slot is a lesser-known one');
});

test('album route: in-era albums only (no live/best-of), tracks need a preview and the right artist, no search needed', async () => {
  const a = A('x1', 'X JAPAN', 'JP', { tags: [{ name: 'rock' }] });
  const trk = (title, name = 'X JAPAN', preview = 'p') => ({ id: title, title, preview, artist: { id: 9, name } });
  const calls = [];
  const get = async url => {
    const u = decodeURIComponent(url); calls.push(u);
    if (u.includes('/search/artist')) return { data: [{ id: 9, name: 'X JAPAN', nb_fan: 36000 }] };
    if (u.includes('/artist/9/albums')) return { data: [{ id: 1, title: 'Jealousy', release_date: '1991-07-01' }, { id: 2, title: 'LIVE Tokyo', release_date: '1993-01-01' }, { id: 3, title: 'Best of X', release_date: '1995-01-01' }, { id: 4, title: 'Dahlia', release_date: '1996-11-04' }, { id: 5, title: 'Later', release_date: '2008-01-01' }] };
    if (u.includes('/album/1/tracks')) return { data: [trk('Silent Jealousy'), trk('No Preview', 'X JAPAN', ''), trk('Guest', 'Someone Else')] };
    if (u.includes('/album/4/tracks')) return { data: [trk('Forever Love')] };
    if (u.includes('/album/')) throw new Error('only Jealousy and Dahlia are in-era');
    if (u.includes('/recording?') && u.includes('arid:')) return { recordings: [] };
    if (u.includes('/recording?')) return { recordings: [] };
    return { artists: [a] };
  };
  const rows = [];
  await S.stampSongs(get, S.makeStamp('1990-JP-rock'), { emit: r => rows.push(r.title), rand: seeded() });
  assert.deepEqual(rows.sort(), ['Forever Love', 'Silent Jealousy']);
  assert.ok(!calls.some(c => c.includes('api.deezer.com/search?')), 'no title search for album-route songs');
});

test('artist-first: the biggest artists fill the Roll, an artist off Deezer is dropped, More continues down the ranking without repeats', async () => {
  const names = Array.from({ length: 24 }, (_, i) => `Act${i}`), arts = names.map((n, i) => A(`x${i}`, n, 'JP', { tags: [{ name: 'rock' }] }));
  const recs = arts.flatMap(a => [rec(`${a.id}a`, a, `${a.name} One`, '1995'), rec(`${a.id}b`, a, `${a.name} Two`, '1996')]);
  const fans = Object.fromEntries(names.map((n, i) => [n, 1000 * (24 - i)])); // Act0 biggest
  const get = async url => {
    const u = decodeURIComponent(url);
    if (u.includes('/search/artist')) { const n = new URL(url).searchParams.get('q'); return { data: n === 'Act5' ? [] : [{ id: n, name: n, nb_fan: fans[n] }] }; }
    if (u.includes('/top?')) { const n = u.split('/artist/')[1].split('/')[0]; return { data: recs.filter(r => r['artist-credit'][0].artist.name === n).map(r => dz(n, r.title)) }; }
    if (u.includes('api.deezer.com/search')) return { data: [] };
    if (u.includes('/recording?') && u.includes('arid:')) return { recordings: recs.filter(r => u.includes(`arid:${r['artist-credit'][0].artist.id} `) || u.endsWith(`arid:${r['artist-credit'][0].artist.id})`) || u.includes(`arid:${r['artist-credit'][0].artist.id})`)) };
    if (u.includes('/recording?')) return { recordings: [] };
    return { artists: arts };
  };
  const stamp = S.makeStamp('1990-JP-rock'), rows = [], more = [];
  const res = await S.stampSongs(get, stamp, { emit: r => rows.push(r), rand: seeded(), paged: true });
  assert.equal(rows.length, 15);
  assert.ok(new Set(rows.map(r => r.artist)).has('Act0'), 'the biggest artist is in');
  assert.ok(!rows.some(r => r.artist === 'Act5'), 'not on Deezer: dropped');
  assert.ok(res.next.q.length > 0, 'cursor keeps the ranked remainder');
  const r2 = await S.stampMore(get, stamp, res.next, { emit: r => more.push(r), rand: seeded() });
  assert.equal(r2.added, more.length);
  assert.ok(more.length >= 10 && more.every(m => !rows.some(r => r.title === m.title)));
});
