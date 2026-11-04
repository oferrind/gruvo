const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/stamps');

const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const A = (id, name, country, more = {}) => ({ id, name, 'sort-name': name, country, ...more });
const tg = pairs => pairs.map(([name, count]) => ({ name, count }));
const fit = (stampId, a) => S.addGuard(new Map(), [a], a.country, [], S.sceneOf(S.makeStamp(stampId))).size === 1;

test('alias pool: a stamp also searches the tags of same-place, same-genre scenes; a different genre or place never gets them', () => {
  const q = id => S.sceneOf(S.makeStamp(id)).q;
  assert.ok(['j-rock', 'visual kei'].every(t => q('1980-JP-rock').includes(t)), '1980 JP rock borrows the 1990 scene tags');
  assert.ok(!q('1990-JP-metal').includes('j-rock') && !q('1990-DE-rock').includes('visual kei'), 'metal stays metal, Germany stays Germany');
  assert.deepEqual(q('--krautrock'), ['krautrock']);
});

test('scene fit: top tags must name the genre (as the tag head); soundtrack/game/anime and off-era artists are dropped', () => {
  const jp = (name, tags, ls = { begin: '1985' }) => A('x', name, 'JP', { tags: tg(tags), 'life-span': ls });
  assert.ok(fit('1990-JP-rock', jp('X JAPAN', [['heavy metal', 3], ['visual kei', 3], ['metal', 2]])), 'visual kei is a scene alias');
  assert.ok(!fit('1990-JP-rock', jp('Shiro S', [['japanese', 3], ['composer', 2], ['rock', 1]])), 'composer in the top 2');
  assert.ok(!fit('1990-JP-rock', jp('Nobuo U', [['rock', 6], ['video game music', 5], ['soundtrack', 4], ['jazz', 1]])), 'game music share');
  assert.ok(!fit('1990-JP-rock', jp('Idol', [['pop', 9], ['idol', 5], ['kawaii', 4], ['rock', 1]])), 'rock is not a top tag');
  assert.ok(fit('1990-JP-rock', A('n', 'Untagged', 'JP')), 'no tags: not judged');
  assert.ok(fit('1970-IN-filmi', A('f', 'Playback', 'IN', { tags: tg([['filmi', 5], ['soundtrack', 4]]) })), 'a soundtrack stamp keeps soundtrack artists');
  const rap = (name, tags, ls) => A('r', name, 'US', { tags: tg(tags), 'life-span': ls });
  assert.ok(fit('1990-US-hip-hop', rap('Nas', [['east coast hip hop', 9], ['hip hop', 8], ['rap', 3]], { begin: '1991' })));
  assert.ok(!fit('1990-US-hip-hop', rap('RATM', [['alternative metal', 13], ['rap metal', 10], ['funk metal', 5], ['rap rock', 5]], { begin: '1991' })));
  assert.ok(!fit('--krautrock', A('d', 'DIIV', 'US', { tags: tg([['dream pop', 5], ['indie rock', 4], ['shoegaze', 2], ['krautrock', 1]]) })), 'genre only in the 4th tag');
  assert.ok(!fit('1970-DE-krautrock', A('l', 'Later', 'DE', { tags: tg([['krautrock', 3]]), 'life-span': { begin: '2011' } })), 'began after the decade');
  assert.ok(!fit('2010-NG-afrobeats', A('o', 'Gone', 'NG', { tags: tg([['afrobeat', 3]]), 'life-span': { begin: '1965', end: '1997', ended: true } })), 'ended before the decade');
  assert.ok(fit('1970-DE-krautrock', A('k', 'Can', 'DE', { tags: tg([['krautrock', 3]]), 'life-span': { begin: '1968', end: '1979' } })));
});

test('early stop: a Roll that fills from the first ranked artists never ranks the rest of the pool or calls MusicBrainz for recordings', async () => {
  const arts = Array.from({ length: 60 }, (_, i) => A(`x${i}`, `Act${i}`, 'JP', { tags: tg([['rock', 60 - i]]) }));
  const calls = [];
  const get = async url => {
    const u = decodeURIComponent(url); calls.push(u);
    if (u.includes('/search/artist')) { const n = new URL(url).searchParams.get('q'); return { data: [{ id: n, name: n, nb_fan: 5 }] }; }
    if (u.includes('/albums')) return { data: [{ id: u.split('/artist/')[1].split('/')[0], title: 'Album', release_date: '1995-01-01' }] };
    if (u.includes('/album/')) { const n = u.split('/album/')[1].split('/')[0]; return { data: [1, 2].map(k => ({ id: `${n}${k}`, title: `Song${k}`, preview: 'p', artist: { id: 1, name: n } })) }; }
    if (u.includes('/artist?')) return { artists: u.includes('offset') ? [] : arts };
    return { recordings: [] };
  };
  const rows = [];
  await S.stampSongs(get, S.makeStamp('1990-JP-rock'), { emit: r => rows.push(r), rand: seeded() });
  assert.equal(rows.length, 15);
  const ranked = calls.filter(c => c.includes('/search/artist')).length;
  assert.ok(ranked <= 18, `ranked ${ranked} of 60`); // 6 + 12 at most, not the whole pool
  assert.ok(!calls.some(c => c.includes('/recording?') && c.includes('arid:')), 'no MusicBrainz recording call once Deezer filled the Roll');
});
