const test = require('node:test');
const assert = require('node:assert');
const t = require('../src/tree');
const { norm } = require('../src/music');
const fx = name => require(`./fixtures/${name}.json`);

const OASIS = '39ab1aed-75e0-4140-bd47-540276886b60';
const tags = (...xs) => xs.map(([name, count]) => ({ name, count }));
const row = (id, name, extra = {}) => ({ id, name, score: 90, country: 'GB', type: 'Group', 'life-span': { begin: '1990' },
  tags: tags(['britpop', 5], ['alternative rock', 3]), ...extra });
const oasis = row(OASIS, 'Oasis', { score: 100, 'life-span': { begin: '1991' }, tags: tags(['britpop', 17], ['alternative rock', 12], ['rock', 8]) });
const SCENE = ['Blur', 'The Verve', 'Suede', 'Supergrass', 'Pulp', 'Elastica', 'Ash', 'Kula Shaker', 'Shed Seven', 'Echobelly', 'Sleeper', 'Menswear',
  'Dodgy', 'Gene', 'Mansun'].map((n, i) => row(`mb${i}`, n, { score: 99 - i }));
SCENE.push(row('met', 'Metallica', { score: 100, country: 'US', tags: tags(['thrash metal', 20], ['heavy metal', 10], ['britpop', 1]) }),
  row('cast1', 'Cast'), row('cast2', 'Cast'));
// Each level-1 node has its own scene: Blur / The Verve (formed 1990) and Beady Eye (2009) query their own era.
const EARLY = ['Ride', 'Lush', 'Slowdive', 'Chapterhouse', 'Moose', 'Swervedriver'].map((n, i) => row(`e${i}`, n, { score: 90 - i }));
const LATE = ['Kasabian', 'The Enemy', 'The Twang', 'Razorlight'].map((n, i) => row(`l${i}`, n, { score: 90 - i, 'life-span': { begin: '2005' } }));
const BEADY = row('a0e10984-0eca-4920-a171-5fd7a62ee069', 'Beady Eye', { 'life-span': { begin: '2009' }, relations: [] });
const DZ_NAMES = [...SCENE.map(a => a.name), ...EARLY.map(a => a.name), ...LATE.map(a => a.name), 'Oasis', 'Beady Eye', 'The Kinks', 'Boo Radleys', 'Liam Gallagher'];
const dzId = n => DZ_NAMES.indexOf(n) + 1;

// A tiny recorded-shape world behind a fake `get`: no network.
function world() {
  const calls = [];
  const get = async url => {
    calls.push(url);
    const u = decodeURIComponent(url);
    let m;
    if (u.includes('/ws/2/artist?query=artist:"Oasis"')) return { artists: [oasis] };
    if (u.includes('/ws/2/artist?query=tag:') && u.includes('begin:[1984 ')) return { artists: EARLY };
    if (u.includes('/ws/2/artist?query=tag:') && u.includes('begin:[2003 ')) return { artists: LATE };
    if (u.includes('/ws/2/artist?query=tag:')) return { artists: SCENE };
    if (u.includes(`/ws/2/artist/${BEADY.id}`)) return BEADY;
    if (u.includes('/ws/2/artist?query=')) return { artists: [] };
    if (u.includes(`/ws/2/artist/${OASIS}`)) return fx('mb_artist_oasis_rels');
    if (u.includes('/ws/2/artist/1f2345fa')) return fx('mb_artist_liam_rels');
    if (u.includes('/ws/2/recording?query')) return { recordings: [] };
    if (u.includes('/ws/2/release?query=label:"Creation Records"')) return { releases: [{ 'artist-credit': [{ name: 'Boo Radleys' }] }] };
    if (u.includes('wikidata') && u.includes('props=claims'))
      return { entities: { Q382890: { claims: { P737: ['Q1', 'Q2'].map(id => ({ mainsnak: { datavalue: { value: { id } } } })) } } } };
    if (u.includes('wikidata')) return { entities: { Q1: { labels: { en: { value: 'The Kinks' } } }, Q2: { labels: { en: { value: 'The Who' } } } } };
    if ((m = u.match(/search\/artist\?q=artist:"(.+?)"/)))
      return { data: m[1] === 'Cast' ? [{ id: 900, name: 'Cast', nb_fan: 5000 }, { id: 901, name: 'Cast', nb_fan: 900 }] // two live bands: ambiguous
        : m[1] === 'Beady Eye' ? [{ id: 999, name: 'Beady Eye', nb_fan: 2 }, { id: dzId(m[1]), name: m[1], nb_fan: 61170 }] // a dead duplicate entry
        : DZ_NAMES.includes(m[1]) ? [{ id: dzId(m[1]), name: m[1] }] : [] };
    if ((m = u.match(/artist\/(\d+)\/top/))) {
      const artist = { id: +m[1], name: DZ_NAMES[m[1] - 1] };
      return { data: [{ id: m[1] * 10, title: 'Hit (Live)', preview: 'https://x.dzcdn.net/l.mp3', artist, album: {} },
        { id: m[1] * 10 + 1, title: 'Hit (2011 Remaster)', preview: 'https://x.dzcdn.net/p.mp3', artist, album: {} }] };
    }
    if ((m = u.match(/artist\/(\d+)\/related/))) return { data: +m[1] === dzId('Oasis') ? [{ id: dzId('Blur'), name: 'Blur' }, { id: dzId('Liam Gallagher'), name: 'Liam Gallagher' }] : [] };
    return { error: { message: 'no route' } };
  };
  return { get, calls };
}
const ROOT = { source: 'dz', id: 5, title: 'Wonderwall', artist: 'Oasis', artistDzId: dzId('Oasis') };
const SOURCE_WORDS = /musicbrainz|deezer|wikidata|wikipedia/i;

test('tree: 3 + 9 children, one artist once, tag guard, homonyms dropped, labels explain without naming a source', async () => {
  const { get, calls } = world();
  const emitted = [];
  const T = t.newTree(get, ROOT, { emit: n => emitted.push({ ...n, at: calls.length }) });
  await t.growTree(T);
  assert.equal(T.nodes.length, 13);
  assert.ok(T.nodes.every(n => n.kids <= 3 && n.depth <= 2));
  const names = T.nodes.map(n => norm(n.artist));
  assert.equal(new Set(names).size, names.length);
  for (const bad of ['metallica', 'cast', 'liamgallagher']) assert.ok(!names.includes(bad), bad);
  assert.ok(T.nodes.slice(1).every(n => n.label && !SOURCE_WORDS.test(n.label) && n.track.title === 'Hit')); // no live cut, no "(Remaster)"
  const kids = T.nodes.filter(n => n.parent === 0);
  assert.equal(emitted[0].edgeType, 'root');
  assert.ok(emitted.slice(1).every(n => ['scene', 'member'].includes(n.edgeType) && n.parentId != null));
  assert.equal(kids[0].artist, 'Blur');
  assert.equal(kids[0].label, 'Same scene: britpop, UK, formed 1990 · fans of Oasis play them too');
  assert.equal(kids[2].label, 'Liam Gallagher (lead vocals) went on to Beady Eye');
  // Streaming: the first two children arrive before any member / relation lookups.
  const firstRels = calls.findIndex(u => u.includes(`/artist/${OASIS}?`));
  const firstScene = calls.findIndex(u => decodeURIComponent(u).includes('query=tag:'));
  assert.ok(firstScene >= 0 && firstScene < firstRels, 'the scene query is queued first');
  // Level 2 comes from each level-1 node's own scene, not the root's.
  const under = id => T.nodes.filter(n => n.parent === id && n.label.startsWith('Same scene')).map(n => n.artist);
  for (const k of kids.slice(0, 2)) assert.ok(under(k.id).length && under(k.id).every(a => EARLY.some(e => e.name === a)), `${k.artist}: ${under(k.id)}`);
  assert.ok(under(kids[2].id).length && under(kids[2].id).every(a => LATE.some(e => e.name === a)), `Beady Eye: ${under(kids[2].id)}`);
  assert.ok(T.nodes.filter(n => n.parent === kids[2].id)[0].label.includes('formed 2005'));
});

test('tree: More adds 3 (label + roots + scene), roots capped at 2 per tree', async () => {
  const { get } = world();
  const T = t.newTree(get, ROOT);
  await t.growTree(T);
  const r = await t.moreTree(T, 0);
  assert.equal(r.added, 3);
  const added = T.nodes.slice(13).map(n => n.label);
  assert.deepEqual(added.slice(0, 2), ['Also on Creation Records, 1989–93', 'Oasis named The Kinks as an influence']);
  assert.match(added[2], /^Same scene/);
  assert.equal(T.nodes.filter(n => n.parent === 0).length, 6);

  const w2 = world();
  const T2 = t.newTree(w2.get, ROOT);
  await t.growTree(T2);
  T2.roots = 2; // the tree already used its 2 Roots nodes
  await t.moreTree(T2, 0);
  assert.ok(!T2.nodes.some(n => n.artist === 'The Kinks'));
});

test('tree: saved songs are skipped (by id, or artist + base title) and the next candidate fills the gap', async () => {
  const { get } = world();
  const saved = [ROOT, { source: 'dz', id: dzId('Blur') * 10 + 1, artist: 'Blur', title: 'whatever' },
    { source: 'it', id: 1, artist: 'The Verve', title: 'Hit (Remastered)' }, { source: 'dz', artist: 'The Kinks', title: 'Hit' }];
  const T = t.newTree(get, ROOT, { saved });
  await t.growTree(T);
  assert.equal(T.nodes.length, 13);
  assert.equal(T.nodes[0].artist, 'Oasis'); // the root itself is still shown
  const names = () => T.nodes.slice(1).map(n => n.artist);
  for (const gone of ['Blur', 'The Verve']) assert.ok(!names().includes(gone), gone);
  assert.equal((await t.moreTree(T, 0)).added, 3); // More skips The Kinks' saved hit and still adds 3
  assert.ok(!names().includes('The Kinks'));
});

test('tree: a cancelled build stops making calls', async () => {
  const { get, calls } = world();
  let n = 0, cut;
  const T = t.newTree(get, ROOT, { emit: () => { if (++n === 2) cut = calls.length; }, live: () => n < 2 }); // root + one child, then a newer tree took over
  await t.growTree(T);
  const after = calls.length;
  assert.equal(T.nodes.length, 2);
  assert.ok(!calls.slice(cut).map(decodeURIComponent).some(u => /inc=artist-rels&|query=tag:|\/top\?/.test(u)), 'no member, scene or track lookups after the cut');
  assert.deepEqual(await t.moreTree(T, 0).then(r => r.added), 0);
  assert.ok(calls.length - after <= 3, 'More on a dead tree does nothing heavy');
});

test('scene guard: 2 shared top tags, or the top tag plus the country', () => {
  assert.deepEqual(t.topTags(oasis), ['britpop', 'alternative rock']); // "rock" says nothing
  assert.ok(t.sceneGuard(oasis, row('x', 'X')));
  assert.ok(t.sceneGuard(oasis, row('x', 'X', { tags: tags(['britpop', 2], ['shoegaze', 1]) })));
  assert.ok(!t.sceneGuard(oasis, row('x', 'X', { country: 'IE', tags: tags(['britpop', 2], ['shoegaze', 1]) })));
  assert.ok(!t.sceneGuard(oasis, SCENE.find(a => a.name === 'Metallica')));
  assert.equal(t.sceneQuery(oasis), 'tag:"britpop" AND begin:[1985 TO 1995] AND country:GB AND type:group');
});

test('member moved: singers first, "went on to" vs "came from", era guard', () => {
  const members = t.parseMembers(fx('mb_artist_oasis_rels').relations);
  assert.equal(members[0].name, 'Liam Gallagher');
  assert.equal(members[0].role, 'lead vocals');
  assert.equal(new Set(members.map(m => m.id)).size, members.length);
  const band = { id: OASIS, begin: 1991 };
  assert.deepEqual(t.otherBands(fx('mb_artist_liam_rels').relations, members[0], band).map(b => b.label), ['Liam Gallagher (lead vocals) went on to Beady Eye']);
  const rel = (id, begin, end) => ({ type: 'member of band', direction: 'forward', artist: { id, name: id }, begin, end });
  const out = t.otherBands([rel('Ride', '1988', '1990'), rel('Late', '2010', null)], { name: 'Andy Bell', role: 'guitar', joined: 1999 }, band);
  assert.deepEqual(out.map(b => b.label), ['Andy Bell (guitar) came from Ride']);
});

test('built on looks back only: samples it uses and works it is based on, never the mashups built on it', () => {
  const back = t.lookBack(fx('mb_recording_bss'), fx('mb_work_bss'));
  assert.deepEqual(back.map(b => b.label), ['Samples The Andrew Oldham Orchestra\'s “The Last Time”']); // the work rel names the same song
  assert.deepEqual(t.lookBack(null, fx('mb_work_bss')).map(b => b.title), ['The Last Time']);
  assert.equal(t.originalRecording(fx('mb_recsearch_bss').recordings, 'The Verve', 'Bitter Sweet Symphony').id, '8b6d9029-1990-4660-bd57-24b5bc0fb626');
});

test('built on by title only: the work\'s first studio recording names the artist, so a namesake song never wins', () => {
  const rec = (date, name, disambiguation = '') => ({ title: 'The Last Time', 'first-release-date': date, disambiguation, 'artist-credit': [{ name }] });
  assert.equal(t.firstPerformer([rec('1967', 'The Who'), rec('1966-12-10', 'The Rolling Stones', 'live: Royal Albert Hall'),
    rec('', 'Nobody'), rec('1965', 'The Rolling Stones')]), 'The Rolling Stones');
  assert.equal(t.firstPerformer([]), null);
  assert.deepEqual(t.lookBack(null, fx('mb_work_bss')).map(b => b.work), ['d12cf1ae-7feb-3f04-88e9-c4d7df3ff754']);
});
