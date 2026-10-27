const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/stamps');

const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rec = (id, artist, title, date, more = {}) => ({ id, title, 'first-release-date': date, 'artist-credit': [{ name: artist.name, artist }], ...more });
const A = (id, name, country, more = {}) => ({ id, name, 'sort-name': name, country, ...more });
const dz = (artist, title) => ({ id: `${artist}|${title}`, title, preview: 'https://cdnt-preview.dzcdn.net/x', artist: { id: 1, name: artist }, album: {} });

// Routes by the decoded MB query; Deezer echoes back one exact hit per search (the strict match is tested on its own).
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
    if (u.includes('/recording?')) return { recordings };
    if (u.includes('/artist?') && u.includes('query=arid:')) return { artists: guard };
    if (u.includes('/artist?')) return { artists: topArtists };
    return { results: [] };
  };
  return { get, calls };
}

test('recording-first query carries tags, country, era and official status; the artist guard drops other countries', async () => {
  const jp = Array.from({ length: 8 }, (_, i) => A(`j${i}`, `Band${i}`, 'JP'));
  const uk = A('u1', 'Squeeze', 'GB');
  const recordings = [...jp.map((a, i) => rec(`r${i}`, a, `Song${i}`, '1994-03-01')), rec('ru', uk, 'Tempted', '1992')];
  const { get, calls } = fakeGet({ recordings, guard: [...jp, uk] });
  const rows = [];
  const res = await S.stampSongs(get, S.makeStamp('1990-JP-rock'), { emit: r => rows.push(r), rand: seeded() });
  assert.match(calls[0], /recording\?limit=100&query=\(tag:"rock" OR tag:"j-rock".*\) AND country:JP AND firstreleasedate:\[1990 TO 1999\] AND status:official/);
  assert.match(calls[1], /artist\?limit=100&query=arid:j0 OR arid:j1/);
  assert.equal(rows.length, 8);
  assert.ok(rows.every(r => r.artist.startsWith('Band') && r.year === 1994 && r.stamp === '1990-JP-rock' && r.country === 'JP'));
  assert.ok(!calls.some(c => c.includes('Squeeze')), 'the UK import is never searched');
  assert.ok(!calls.some(c => /artist\?.*query=\(tag/.test(c)), 'no top-up with 8 guarded artists');
  assert.deepEqual([res.count, res.artists, res.rarity, res.short], [8, 8, 'Rare', false]);
});

test('client guards: era is the recording year, no live/remix/video/disambiguation; dedupe; max 2 per artist', async () => {
  const a = A('a', 'Fela Kuti', 'NG'), others = Array.from({ length: 7 }, (_, i) => A(`o${i}`, `Other${i}`, 'NG'));
  const recordings = [rec('1', a, 'Zombie', '1976'), rec('2', a, 'Zombie', '1977'), rec('3', a, 'Lady', '1972'), rec('4', a, 'Gentleman', '1973'),
    rec('5', a, 'Water No Get Enemy', '1975'), rec('6', a, 'Expensive Shit (Live)', '1975'), rec('7', a, 'Sorrow', '1981'),
    rec('8', a, 'Shufferin', '1979', { video: true }), rec('9', a, 'Roforofo', '1972', { disambiguation: 'edit' }),
    ...others.map((o, i) => rec(`o${i}`, o, `Tune${i}`, '1974'))];
  const songs = S.songsFrom(recordings, S.addGuard(new Map(), [a, ...others], 'NG'), 1970);
  assert.deepEqual(songs.filter(s => s.artistId === 'a').map(s => s.title).sort(), ['Gentleman', 'Lady', 'Water No Get Enemy', 'Zombie']);
  const rows = [];
  const { get } = fakeGet({ recordings, guard: [a, ...others] });
  await S.stampSongs(get, S.makeStamp('1970-NG-afrobeat'), { emit: r => rows.push(r), rand: seeded(3) });
  assert.equal(rows.length, 9); // 7 others + Fela x2: a 3rd only while under 8
  assert.equal(rows.filter(r => r.artist === 'Fela Kuti').length, 2);
});

test('artist-first top-up: under 8 guarded artists, tagged artists from the country add their in-era recordings', async () => {
  const ok = Array.from({ length: 6 }, (_, i) => A(`t${i}`, `Mulatu${i}`, 'ET', { tags: [{ name: 'Ethio-Jazz' }] }));
  const topArtists = [...ok, A('x', 'Wrong Country', 'US', { tags: [{ name: 'jazz' }] }), A('y', 'No Tag', 'ET', { tags: [{ name: 'pop' }] })];
  const topRecs = [...ok.map((o, i) => rec(`a${i}`, o, `Yekermo Sew ${i}`, '1972')), rec('late', ok[0], 'Later', '1985'), rec('wr', topArtists[6], 'Nope', '1972')];
  const { get, calls } = fakeGet({ recordings: [], topArtists, topRecs });
  const rows = [];
  const res = await S.stampSongs(get, S.makeStamp('1970-ET-jazz'), { emit: r => rows.push(r), rand: seeded() });
  assert.ok(calls.some(c => /artist\?limit=100&query=\(tag:"ethio-jazz".*\) AND country:ET&/.test(c)));
  assert.ok(calls.some(c => /recording\?limit=100&query=\(arid:t0 OR .*arid:t5\) AND firstreleasedate:\[1970 TO 1979\]/.test(c)));
  assert.equal(rows.length, 6);
  assert.ok(rows.every(r => r.artist.startsWith('Mulatu') && r.year === 1972));
  assert.equal(res.rarity, 'Legendary');
});

test('Roll streams the first page before the top-up, and skips the top-up once 10 songs are in', async () => {
  const jp = Array.from({ length: 6 }, (_, i) => A(`j${i}`, `Band${i}`, 'JP', { tags: [{ name: 'rock' }] }));
  const recordings = jp.flatMap((a, i) => [rec(`r${i}`, a, `One${i}`, '1994'), rec(`s${i}`, a, `Two${i}`, '1994')]);
  const { get, calls } = fakeGet({ recordings, guard: jp, topArtists: jp });
  const rows = [], at = [];
  await S.stampSongs((u, o) => (at.push(rows.length), get(u, o)), S.makeStamp('1990-JP-rock'), { emit: r => rows.push(r), rand: seeded() });
  assert.equal(rows.length, 10);
  assert.ok(!calls.some(c => /artist\?limit=100&query=\(tag/.test(c)), 'full Roll: no top-up');
  assert.ok(at.some(n => n > 0 && n < 10), 'rows arrived while lookups were still going');
});

test('fewer than 5 songs is thin, never an empty success', async () => {
  const a = A('a', 'Solo', 'MN');
  const { get } = fakeGet({ recordings: [rec('1', a, 'One', '2012')], guard: [a] });
  assert.deepEqual(await S.stampSongs(get, { id: 'x', decade: 2010, cc: 'MN', tags: ['folk'] }), { thin: true, count: 1 });
});

test('strict preview match: name or alias, title prefix either way, a preview; nothing fuzzy', () => {
  const g = S.addGuard(new Map(), [A('k', '吉田拓郎', 'JP', { 'sort-name': 'Yoshida, Takuro', aliases: [{ name: 'Takuro Yoshida' }] })], 'JP').get('k');
  assert.equal(g.name, 'Takuro Yoshida'); // search with the Latin alias: kanji names return 0 hits
  const pick = rows => S.strictPick(rows, g.names, '結婚しようよ', r => r.artist.name, r => r.title, r => r.preview);
  const row = (name, title, preview = 'p') => ({ artist: { name }, title, preview });
  assert.ok(pick([row('Takuro Yoshida', '結婚しようよ (Remastered)')]));
  assert.ok(pick([row('吉田拓郎', '結婚しよう')]), 'Deezer title a prefix of the MB title');
  assert.equal(pick([row('Takuro Yoshida Band', '結婚しようよ')]), null, 'no substring artist match');
  assert.equal(pick([row('Takuro Yoshida', '旅の宿')]), null, 'wrong title');
  assert.equal(pick([row('Takuro Yoshida', '結婚しようよ', '')]), null, 'no preview');
});

test('catalogue: 43 stamps on every continent; builder ids rebuild with labels; legacy ids carry no genre', () => {
  assert.equal(S.CATALOGUE.length, 43);
  assert.equal(new Set(S.CATALOGUE.map(s => s.id)).size, 43);
  assert.deepEqual([...new Set(S.CATALOGUE.map(s => S.continentOf(s.cc)))].sort(), [...S.CONTINENTS].sort());
  assert.equal(S.makeStamp('2000-KR-pop').label, '2000s Korean pop');
  assert.ok(S.makeStamp('2000-KR-pop').custom);
  assert.deepEqual([S.makeStamp('1980-JP-').label, S.makeStamp('1980-JP-').legacy], ['80s Japan', true]);
  for (const bad of ['1980-XX-rock', '1985-JP-rock', '1980-JP-nope', '../x']) assert.equal(S.makeStamp(bad), null, bad);
  for (const [, [, tags]] of Object.entries(S.GENRES)) assert.ok(!tags.some(t => /japanese|french|mexican|australian|british|israeli/.test(t)), 'no nationality tags');
});

test('Roll: never one of the last 5; uncollected and taste-matched stamps weigh more', () => {
  const rand = seeded(7), recent = [];
  for (let i = 0; i < 300; i++) {
    const s = S.roll({ recent: recent.slice(-5) }, rand);
    assert.ok(!recent.slice(-5).includes(s.id), `repeat of ${s.id}`);
    recent.push(s.id);
  }
  const count = (opts, pred) => { const r = seeded(11); let n = 0; for (let i = 0; i < 2000; i++) if (pred(S.roll(opts, r))) n++; return n; };
  const metal = s => s.id === '1990-NO-black-metal';
  assert.ok(count({ topTags: ['Black Metal'] }, metal) > 2 * count({}, metal));
  const held = Object.fromEntries(S.CATALOGUE.filter(s => s.id !== '1990-NO-black-metal').map(s => [s.id, 1]));
  assert.ok(count({ held }, metal) > 1.5 * count({ held: { ...held, '1990-NO-black-metal': 1 } }, metal));
});

test('Roll, Adventurous: after 2 rolls on held continents, the 3rd lands on a continent with no stamp', () => {
  const held = { '1990-JP-rock': 1, '1970-NG-afrobeat': 2, '1980-JP-': 1 };
  const heldC = new Set(['Asia', 'Africa']), rand = seeded(5);
  let streak = 0;
  for (let i = 0; i < 200; i++) {
    const s = S.roll({ held, streak, adventurous: true }, rand);
    if (streak >= 2) assert.ok(!heldC.has(S.continentOf(s.cc)), `roll ${i}: ${s.label}`);
    streak = heldC.has(S.continentOf(s.cc)) ? streak + 1 : 0;
  }
  const off = seeded(5); let longest = 0; streak = 0;
  for (let i = 0; i < 300; i++) { const s = S.roll({ held, streak, adventurous: false, topTags: ['rock', 'afrobeat'] }, off); streak = heldC.has(S.continentOf(s.cc)) ? streak + 1 : 0; longest = Math.max(longest, streak); }
  assert.ok(longest >= 3, 'without Adventurous nothing forces a new continent');
});

test('collection: 1 love earns, 3 is gold; the book groups by continent, legacy apart and counted toward its continent', () => {
  assert.deepEqual([0, 1, 2, 3, 7].map(S.tier), [null, 'bronze', 'bronze', 'gold', 'gold']);
  const b = S.book({ '1990-JP-rock': 3, '1970-NG-afrobeat': 1, '2000-KR-pop': 1, '1980-JP-': 2, 'junk': 4 });
  const asia = b.groups.find(g => g.continent === 'Asia');
  assert.equal(asia.total, 7);
  assert.equal(asia.earned, 3); // JP rock, KR pop (custom), legacy JP
  assert.equal(asia.slots.find(s => s.stamp.id === '1990-JP-rock').tier, 'gold');
  assert.equal(asia.slots.find(s => s.stamp.id === '1980-JP-city-pop').tier, null);
  assert.ok(asia.slots.some(s => s.stamp.id === '2000-KR-pop'));
  assert.deepEqual(b.legacy.map(s => [s.stamp.label, s.count]), [['80s Japan', 2]]);
  assert.deepEqual([b.catalogue, b.custom, b.decades], [2, 1, [1970, 1980, 1990, 2000]]);
});

test('Roll: a combo that came back thin is never rolled again, catalogue or builder', () => {
  const rand = seeded(9), spare = '1990-NO-black-metal';
  const short = S.CATALOGUE.map(s => s.id).filter(id => id !== spare);
  for (let i = 0; i < 400; i++) {
    const s = S.roll({ short }, rand);
    assert.ok(!short.includes(s.id), `re-rolled thin ${s.id}`);
  }
});

test('runner: a finished prefetch opens instantly (rows replayed, no new requests); opening another stamp drops it', async () => {
  const a = Array.from({ length: 9 }, (_, i) => A(`j${i}`, `Band${i}`, 'JP'));
  const { get, calls } = fakeGet({ recordings: a.map((x, i) => rec(`r${i}`, x, `Song${i}`, '1994')), guard: a });
  const run = S.stampRunner(get), wait = () => new Promise(r => setTimeout(r, 50));
  run.prefetch('1990-JP-rock');
  await wait();
  const before = calls.length, rows = [];
  const res = await run.open('1990-JP-rock', r => rows.push(r));
  assert.equal(calls.length, before, 'no request after opening a prefetched stamp');
  assert.deepEqual([rows.length, res.count], [9, 9]);
  run.prefetch('1990-JP-rock');
  await wait();
  const n = calls.length;
  await run.open('1990-JP-pop', () => {}); // a different stamp: the prefetch is dropped and this one runs fresh
  assert.ok(calls.length > n);
  assert.equal(await run.open('1980-JP-', () => {}).catch(e => e.message), 'bad stamp');
});

test('runner: a stale open sends nothing and returns null; a replaced prefetch is not reused',async () => {
  const a = Array.from({ length: 9 }, (_, i) => A(`j${i}`, `Band${i}`, 'JP'));
  const { get, calls } = fakeGet({ recordings: a.map((x, i) => rec(`r${i}`, x, `Song${i}`, '1994')), guard: a });
  const slow = async u => { await new Promise(r => setTimeout(r, 5)); return get(u); };
  const run = S.stampRunner(slow), rows = [];
  const first = run.open('1990-JP-rock', r => rows.push(r));
  const second = run.open('1990-JP-pop', () => {});
  assert.equal(await first, null);
  assert.equal(rows.length, 0);
  assert.ok((await second).count > 0);
  run.prefetch('1990-JP-rock');
  run.prefetch('1990-JP-punk'); // replaces it: the first stops
  await new Promise(r => setTimeout(r, 300));
  const n = calls.length;
  await run.open('1990-JP-rock', () => {}); // its prefetch was replaced, so this runs fresh
  assert.ok(calls.length > n);
});

test('runner: prefetch resolves with its result; a thin prefetch is discarded, never replayed', async () => {
  const { get, calls } = fakeGet({ recordings: [], guard: [] });
  const run = S.stampRunner(get);
  const res = await run.prefetch('1960-KR-jazz');
  assert.equal(res.thin, true);
  const n = calls.length;
  await run.open('1960-KR-jazz', () => {});
  assert.ok(calls.length > n, 'thin prefetch was dropped, so open runs fresh');
});

// 130 artists with one song each, served 100 per MB page (offset honoured), so a genre stamp has 3 pages of 10 and then runs dry.
function pagedWorld(n = 130) {
  const arts = Array.from({ length: n }, (_, i) => A(`p${i}`, `Act${i}`, 'JP', { tags: [{ name: 'shoegaze' }] }));
  const recordings = arts.map((a, i) => rec(`r${i}`, a, `Tune${i}`, '1994-01-01'));
  const inner = fakeGet({ recordings, guard: arts });
  const get = async url => {
    const u = decodeURIComponent(url), m = u.match(/\/recording\?.*&offset=(\d+)/), off = m ? +m[1] : 0;
    if (u.includes('/recording?') && !u.includes('query=(arid:')) return { recordings: recordings.slice(off, off + 100), count: n };
    return inner.get(url);
  };
  return { get, stamp: S.makeStamp('--shoegaze') || { id: '--shoegaze', genre: 'shoegaze', tags: ['shoegaze'], atlas: true } };
}

test('More songs: cursor pages on, never repeats a song, then reports done', async () => {
  const { get, stamp } = pagedWorld();
  const shown = [], emit = r => shown.push(r.title);
  const first = await S.stampSongs(get, stamp, { emit, rand: seeded(), paged: true });
  assert.equal(shown.length, 10);
  assert.equal(first.next.done, false);
  let next = first.next, rounds = 0;
  while (!next.done && rounds++ < 20) ({ next } = await S.stampMore(get, stamp, next, { emit, rand: seeded(rounds) }));
  assert.equal(new Set(shown).size, shown.length, 'no duplicates across pages');
  assert.equal(shown.length, 130, 'every playable song is reached');
  assert.equal(next.done, true);
  const end = await S.stampMore(get, stamp, next, { emit });
  assert.equal(end.added, 0);
});

test('More songs: the first fetch keeps its shape without paged; a failed page keeps the cursor for a retry', async () => {
  const { get, stamp } = pagedWorld();
  const plain = await S.stampSongs(get, stamp, { rand: seeded() });
  assert.ok(!('next' in plain));
  const { next } = await S.stampSongs(get, stamp, { rand: seeded(), paged: true });
  let fail = true;
  const flaky = url => (fail && /offset=/.test(decodeURIComponent(url)) ? { error: { status: 503 } } : get(url));
  const bad = await S.stampMore(flaky, stamp, next, {});
  assert.ok(bad.error);
  assert.deepEqual(bad.next.seen, next.seen);
  fail = false;
  const rows = [];
  const ok = await S.stampMore(flaky, stamp, bad.next, { emit: r => rows.push(r) });
  assert.equal(ok.added, 10);
  assert.equal(rows.length, 10);
});

test('More songs: max 2 songs per artist across pages', async () => {
  const a = A('solo', 'Solo', 'JP', { tags: [{ name: 'shoegaze' }] });
  const recordings = [1, 2, 3, 4].map(i => rec(`s${i}`, a, `Only${i}`, '1994-01-01'));
  const { get } = fakeGet({ recordings, guard: [a] });
  const stamp = S.makeStamp('--shoegaze') || { id: '--shoegaze', genre: 'shoegaze', tags: ['shoegaze'], atlas: true };
  const rows = [];
  const r = await S.stampMore(get, stamp, { offset: 0, seen: ['solo|only1'], per: { solo: 1 }, shown: 1, done: false }, { emit: x => rows.push(x) });
  assert.equal(rows.length, 1, 'one slot left for the artist');
  assert.equal(r.next.done, true);
});


test('a cancelled run is null, not thin (a dropped prefetch must not get its stamp marked short)', async () => {
  const a = A('a', 'Solo', 'MN');
  const { get } = fakeGet({ recordings: [rec('1', a, 'One', '2012')], guard: [a] });
  let n = 0;
  assert.equal(await S.stampSongs(get, { id: 'x', decade: 2010, cc: 'MN', tags: ['folk'] }, { live: () => ++n < 4 }), null);
});

test('a verified genre with 3-4 playable songs still shows them; a place stamp stays thin under 5', async () => {
  const a = A('a', 'Solo', ''), recs = ['One', 'Two', 'Three'].map((t, i) => rec(`r${i}`, a, t, '2012'));
  const { get } = fakeGet({ recordings: recs, guard: [{ ...a, tags: [{ name: 'zeuhl' }] }] });
  const res = await S.stampSongs(get, { id: '--zeuhl', decade: null, cc: '', genre: 'zeuhl', tags: ['zeuhl'], atlas: true }, { rand: seeded() });
  assert.ok(!res.thin && res.count === 3 && res.short);
});

test('Roll builder combos are sensible with or without Adventurous: a catalogue place and genre, one decade over', () => {
  for (const adventurous of [true, false]) {
    const rand = seeded(7), held = { '1990-JP-rock': 1 };
    for (let i = 0; i < 1500; i++) {
      const s = S.roll({ held, streak: i % 3, adventurous }, rand);
      assert.ok(s && s.id && !/undefined|NaN/.test(s.label), s.id);
      if (!s.custom) continue;
      assert.ok(S.CATALOGUE.some(c => c.cc === s.cc && c.genre === s.genre && Math.abs(c.decade - s.decade) === 10), `unplayable combo ${s.id}`);
    }
  }
});
