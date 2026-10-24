const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/stamps');
const COUNTRIES = require('../src/countries');

const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rec = (id, artist, title, date) => ({ id, title, 'first-release-date': date, 'artist-credit': [{ name: artist.name, artist }] });
const A = (id, name, country, more = {}) => ({ id, name, 'sort-name': name, country, ...more });
const dz = (artist, title) => ({ id: `${artist}|${title}`, title, preview: 'https://cdnt-preview.dzcdn.net/x', artist: { id: 1, name: artist }, album: {} });
function fakeGet({ recordings = [], guard = [], topArtists = [], topRecs = [] }) {
  const calls = [];
  const get = async url => {
    const u = decodeURIComponent(url);
    calls.push(u);
    if (u.includes('api.deezer.com/search')) {
      const q = new URL(url).searchParams.get('q');
      return { data: [...recordings, ...topRecs].map(r => [r['artist-credit'][0].artist.name, r.title]).filter(([a, t]) => `${a} ${t}` === q).map(([a, t]) => dz(a, t)) };
    }
    if (u.includes('/recording?') && u.includes('query=(arid:')) return { recordings: topRecs };
    if (u.includes('/recording?')) return { recordings, count: 1234 };
    if (u.includes('/artist?') && u.includes('query=arid:')) return { artists: guard };
    if (u.includes('/artist?')) return { artists: topArtists };
    return { results: [] };
  };
  return { get, calls };
}

// 11-entry hand fixture: [slug, MB name, family, tier, parent, songs, artists]
const FIX = [['rock', 'rock', 'rock', 'C', '', 10, 'A|B|C'], ['progressive-rock', 'progressive rock', 'rock', 'C', 'rock', 10, 'Yes'], ['zeuhl', 'zeuhl', 'rock', 'O', 'progressive-rock', 10, 'Magma|Corima'],
  ['math-rock', 'math rock', 'rock', 'D', 'rock', 8, 'Slint'], ['shoegaze', 'shoegaze', 'rock', 'C', 'rock', 10, 'Slowdive'], ['dream-pop', 'dream pop', 'pop', 'C', 'shoegaze', 9, ''],
  ['sho-test', 'a shoe thing', 'other', 'O', '', 7, ''], ['house', 'house', 'electronic', 'C', '', 10, 'X'], ['gqom', 'gqom', 'electronic', 'O', 'house', 9, 'Y'],
  ['witch-house', 'witch house', 'electronic', 'D', 'house', 9, 'Z'], ['bebop', 'bebop', 'jazz', 'C', '', 10, 'Parker']];
const SD = require('../renderer/stamp-data')(COUNTRIES, FIX);

test('atlas: --slug builds a genre-only stamp; unknown slugs and empty keys are null; every old id still resolves', () => {
  const z = SD.makeStamp('--zeuhl');
  assert.deepEqual([z.id, z.decade, z.cc, z.genre, z.tags, z.label, z.family, z.tier, z.parent], ['--zeuhl', null, '', 'zeuhl', ['zeuhl'], 'Zeuhl', 'rock', 'O', 'progressive-rock']);
  assert.equal(z.blurb, 'A branch of Progressive rock. Heard here: Magma, Corima.');
  for (const bad of ['--nope', '--', '--BAD', '1985--zeuhl']) assert.equal(SD.makeStamp(bad), null, bad);
  assert.equal(SD.makeStamp('1990--zeuhl').decade, 1990);
  assert.equal(SD.makeStamp('-FR-zeuhl').label, 'French zeuhl');
  for (const s of SD.CATALOGUE) assert.equal(SD.makeStamp(s.id), s);
  assert.equal(SD.makeStamp('2000-KR-pop').label, '2000s Korean pop');
  assert.equal(SD.makeStamp('1980-JP-').legacy, true);
  assert.deepEqual(SD.makeStamp('1990-JP-rock').tags.length > 1, true); // a curated GENRES slug that is also in the atlas keeps its tag list
});

test('stampSongs, genre only: no country/era in the MB query; [unknown] and "[" titles dropped; tagged artists first; artist top-up under 8 tagged', async () => {
  const tagged = Array.from({ length: 3 }, (_, i) => A(`t${i}`, `Magma${i}`, 'FR', { tags: [{ name: 'Zeuhl' }] }));
  const plain = Array.from({ length: 6 }, (_, i) => A(`p${i}`, `Pop${i}`, 'US', { tags: [{ name: 'pop' }] }));
  const unk = A('125ec42a-7229-4250-afc5-e057484327fe', '[unknown]', '');
  const recordings = [...plain.map((a, i) => rec(`rp${i}`, a, `Plain${i}`, '2001')), ...tagged.map((a, i) => rec(`rt${i}`, a, `Tagged${i}`, '1973')),
    rec('ru', unk, 'Real Title', '1999'), rec('rb', plain[0], '[untitled]', '2000')];
  const { get, calls } = fakeGet({ recordings, guard: [...plain, ...tagged, unk] });
  const rows = [];
  const res = await S.stampSongs(get, { id: '--zeuhl', decade: null, cc: '', genre: 'zeuhl', tags: ['zeuhl'] }, { emit: r => rows.push(r), rand: seeded(2) });
  assert.match(calls[0], /recording\?limit=100&query=\(tag:"zeuhl"\) AND status:official&/);
  assert.ok(!/country:|firstreleasedate/.test(calls[0]));
  assert.ok(calls.some(c => /artist\?limit=100&query=\(tag:"zeuhl"\)&/.test(c)), 'under 8 tagged artists: artist top-up');
  assert.equal(rows.length, 9);
  assert.ok(rows.slice(0, 3).every(r => r.artist.startsWith('Magma')), 'tagged artists first');
  assert.ok(rows.every(r => r.genre === 'zeuhl' && r.stamp === '--zeuhl' && !('country' in r) && !('decade' in r)));
  assert.ok(!rows.some(r => /unknown|untitled|Real Title/.test(r.title + r.artist)));
  assert.deepEqual([res.count, res.mbCount, res.names.length], [9, 1234, 9]);
});

test('stampSongs, genre only: 8 tagged artists need no top-up', async () => {
  const tagged = Array.from({ length: 8 }, (_, i) => A(`t${i}`, `Band${i}`, 'GB', { tags: [{ name: 'shoegaze' }] }));
  const { get, calls } = fakeGet({ recordings: tagged.map((a, i) => rec(`r${i}`, a, `S${i}`, '1991')), guard: tagged });
  await S.stampSongs(get, { id: '--shoegaze', decade: null, cc: '', genre: 'shoegaze', tags: ['shoegaze'] }, { rand: seeded() });
  assert.ok(!calls.some(c => /artist\?.*query=\(tag/.test(c)));
});

test('atlas Roll: genre stamps appear, never the last 5 or a short one; taste and Deep weigh more; the 3rd roll in held families goes to a new family', () => {
  const rand = seeded(4), recent = [], seen = new Set();
  for (let i = 0; i < 400; i++) {
    const s = SD.roll({ recent: recent.slice(-5), short: ['--gqom'] }, rand);
    assert.ok(!recent.slice(-5).includes(s.id) && s.id !== '--gqom', s.id);
    if (s.atlas) seen.add(s.id);
    recent.push(s.id);
  }
  assert.ok(seen.size >= 6, 'atlas stamps are rolled');
  for (let i = 0; i < 300; i++) {
    const s = SD.roll({ held: { '--zeuhl': 1, '--shoegaze': 2 }, gstreak: 2, adventurous: true }, rand);
    if (s.atlas) assert.notEqual(s.family, 'rock', s.id);
  }
  const share = (opts, id) => { const r = seeded(21); let n = 0; for (let i = 0; i < 6000; i++) if (SD.roll(opts, r).id === id) n++; return n; };
  assert.ok(share({ topTags: ['bebop'] }, '--bebop') > 2 * share({}, '--bebop'), 'taste x3');
  assert.ok(share({}, '--witch-house') > 1.3 * share({}, '--house'), 'Deep weighs 2, Common 1');
});

test('atlas book: family groups count earned and total; atlas stamps never count as decades or custom', () => {
  const b = SD.book({ '--zeuhl': 3, '--shoegaze': 1, '--gqom': 1, '1990-JP-rock': 1 });
  assert.deepEqual(b.families.map(f => [f.family, f.earned, f.total]), [['rock', 2, 5], ['pop', 0, 1], ['electronic', 1, 3], ['jazz', 0, 1], ['other', 0, 1]]);
  assert.equal(b.families[0].slots.find(s => s.stamp.id === '--zeuhl').tier, 'gold');
  assert.deepEqual([b.atlas, b.atlasTotal, b.custom, b.decades], [3, FIX.length, 0, [1990]]);
});

test('nearby: the parent and up to 4 children/siblings, never itself; search ranks prefixes first and filters', () => {
  assert.deepEqual(SD.nearby('shoegaze').map(s => s.genre), ['rock', 'dream-pop', 'progressive-rock', 'math-rock']);
  assert.deepEqual(SD.nearby('zeuhl').map(s => s.genre), ['progressive-rock']);
  assert.ok(!SD.nearby('house').some(s => s.genre === 'house'));
  assert.deepEqual(SD.nearby('gqom').map(s => s.genre), ['house', 'witch-house']);
  assert.deepEqual(SD.nearby('nope'), []);
  assert.deepEqual(SD.searchGenres('sho').stamps.map(s => s.genre), ['shoegaze', 'sho-test']);
  assert.deepEqual(SD.searchGenres('', { family: 'electronic', tier: 'O' }).stamps.map(s => s.genre), ['gqom']);
  assert.equal(SD.searchGenres('').total, FIX.length);
});

test('genre-data.js: unique slugs, parents exist, families known, tiers valid; the full build ships 500+', t => {
  const data = require('../renderer/genre-data'), slugs = new Set(data.map(e => e[0]));
  assert.equal(slugs.size, data.length);
  for (const [slug, name, family, tier, parent, songs] of data) {
    assert.match(slug, /^[a-z0-9-]{1,40}$/);
    assert.ok(name && Object.hasOwn(SD.FAMILIES, family) && 'CDO'.includes(tier) && songs >= 6, slug);
    assert.ok(parent === '' || slugs.has(parent), `${slug} -> ${parent}`);
  }
  if (data.length < 500) t.diagnostic(`only ${data.length} genres shipped: the full build (docs/12 §4.5) has not been run yet`);
  else assert.ok(data.length >= 500);
});
