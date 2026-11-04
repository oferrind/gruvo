const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/stamps');

const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rec = (id, artist, title, date) => ({ id, title, 'first-release-date': date, 'artist-credit': [{ name: artist.name, artist }] });
const A = (id, name, country) => ({ id, name, 'sort-name': name, country });
const dz = (artist, title) => ({ id: `${artist}|${title}`, title, preview: 'https://cdnt-preview.dzcdn.net/x', artist: { id: 1, name: artist }, album: {} });

test('lookup: an empty free search falls back to the artist top list; an artist not on Deezer is tried once, then skipped', async () => {
  const on = A('on', 'Number Girl', 'JP'), off = A('off', 'Ghost Band', 'JP');
  const recs = [rec('1', on, '透明少女', '1998'), rec('2', on, 'Omoide', '1998'), rec('3', off, '残酷な夜', '1997'), rec('4', off, 'Another', '1997'), rec('5', off, 'Third', '1997')];
  const calls = [];
  const get = async url => {
    const u = decodeURIComponent(url); calls.push(u);
    if (u.includes('/search/artist')) return { data: u.includes('q=Number Girl') ? [{ id: 7, name: 'Number Girl' }] : [] };
    if (u.includes('/artist/7/top')) return { data: [dz('Number Girl', '透明少女'), dz('Number Girl', 'Omoide')] };
    if (u.includes('api.deezer.com/search')) return { data: [] };
    if (u.includes('/artist?')) return { artists: [on, off] };
    return { recordings: recs };
  };
  const rows = [];
  await S.stampSongs(get, S.makeStamp('1990-JP-rock'), { emit: r => rows.push(r.title), rand: seeded() });
  assert.deepEqual(rows.sort(), ['Omoide', '透明少女']);
  assert.equal(calls.filter(c => c.includes('/artist/7/top')).length, 1, 'top list fetched once per artist');
  assert.equal(calls.filter(c => c.includes('Ghost Band')).length, 2, 'one free search + one artist search, then the artist is skipped');
});
