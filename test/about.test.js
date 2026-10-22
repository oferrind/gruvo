const test = require('node:test');
const assert = require('node:assert');
const m = require('../src/music');
const F = require('../renderer/features');
const { ttlFor } = require('../src/cache');
const { safeExternal } = require('../src/links');

const wp = (title, description, extract, type = 'standard') => ({ type, title, description, extract });

test('Wikipedia disambiguation: music page naming the artist only', () => {
  assert.ok(m.wikiAccept(wp('Nirvana (band)', 'American rock band', 'Nirvana was an American rock band formed in 1987.'), 'Nirvana'));
  assert.ok(!m.wikiAccept(wp('Nirvana', 'Concept in Indian religions', 'Nirvana is the extinguishing of the passions.'), 'Nirvana'), 'same name, not music');
  assert.ok(!m.wikiAccept(wp('Mercury Rev', 'American rock band', 'Mercury Rev is an American rock band.'), 'Mercury'), 'music page, different artist');
  assert.ok(!m.wikiAccept(wp('Mercury', 'Topics referred to by the same term', 'Mercury may refer to: a band', 'disambiguation'), 'Mercury'));
  assert.ok(m.wikiAccept(wp('Creep (Radiohead song)', '1992 single by Radiohead', '"Creep" is the debut single by Radiohead.'), 'Radiohead', 'Creep'));
  assert.ok(!m.wikiAccept(wp('Creep (TLC song)', '1994 single by TLC', '"Creep" is a song by TLC.'), 'Radiohead', 'Creep'), 'same title, other artist');
  assert.ok(!m.wikiAccept(wp('Pablo Honey', '1993 album by Radiohead', 'Pablo Honey is the debut album by Radiohead.'), 'Radiohead'), 'artist step never shows an album page');
});

test('trimSentences cuts at a real sentence end', () => {
  assert.equal(m.trimSentences('A b. C d. E f.'), 'A b. C d.');
  assert.equal(m.trimSentences('Dr. John was a singer from St. Louis. He played piano. Third.'), 'Dr. John was a singer from St. Louis. He played piano.');
  assert.equal(m.trimSentences('One. ' + 'X'.repeat(400) + '.'), 'One.', 'a long second sentence is dropped, not cut');
  assert.equal(m.trimSentences(''), '');
});

test('fact sentence states only the fields it has', () => {
  const a = { type: 'Group', area: { name: 'Brazil' }, 'begin-area': { name: 'São Paulo' }, 'life-span': { begin: '1972-05' },
    tags: [{ name: 'samba rock', count: 2 }, { name: 'mpb', count: 5 }] };
  assert.equal(m.factSentence(a, { album: 'X', year: '1975', label: 'Som Livre', kind: 'album' }),
    'A band from Brazil, formed in São Paulo in 1972, known for mpb and samba rock. This track is from the 1975 album “X” on Som Livre.');
  assert.equal(m.factSentence({ type: 'Person', area: { name: 'Mali' } }, {}), 'An artist from Mali.');
  assert.equal(m.factSentence({ type: 'Person', area: { name: 'Vietnam' }, tags: [{ name: 'film composer', count: 1 }] }, {}), 'A film composer from Vietnam.');
  assert.equal(m.factSentence({ type: 'Group' }, { album: 'Y', kind: 'single' }), 'From the single “Y”.', 'no artist facts: album line only');
  assert.equal(m.factSentence(null, {}), '');
});

test('about: Wikipedia when a page passes, else MusicBrainz facts; same-name artists say nothing', async () => {
  const pages = { Nirvana: wp('Nirvana', 'Concept in Indian religions', 'Nirvana is a concept.'),
    'Nirvana_(band)': { ...wp('Nirvana (band)', 'American rock band', 'Nirvana was an American rock band. It was formed in 1987. More.'),
      content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Nirvana_(band)' } } } };
  const get = async url => {
    if (url.includes('/album/7')) return { title: 'Nevermind', release_date: '1991-09-24', label: 'DGC', genres: { data: [{ name: 'Rock' }] }, record_type: 'album' };
    if (url.includes('srsearch=')) return { query: { search: url.includes('song') ? [] : [{ title: 'Nirvana (band)' }] } };
    if (url.includes('/page/summary/')) return pages[decodeURIComponent(url.split('/summary/')[1])] || { error: { status: 404 } };
    if (url.includes('musicbrainz')) return { artists: [{ id: 'a', name: 'Sol', score: 100, type: 'Person', area: { name: 'Ghana' } }, { id: 'b', name: 'Sol', score: 100 }] };
    return { error: {} };
  };
  const r = await m.flows.about(get, { title: 'Lithium', artist: 'Nirvana', albumId: 7 });
  assert.equal(r.text, 'Nirvana was an American rock band. It was formed in 1987.');
  assert.match(r.url, /Nirvana_\(band\)/);
  assert.deepEqual([r.facts.album, r.facts.year, r.facts.label, r.facts.genre], ['Nevermind', '1991', 'DGC', 'Rock']);
  assert.equal((await m.flows.about(get, { title: 'T', artist: 'Sol', albumId: 7 })).text, 'From the 1991 album “Nevermind” on DGC.');
});

test('Wikipedia allowlists: cache TTL and the source link (look-alikes refused)', () => {
  assert.equal(ttlFor('https://en.wikipedia.org/api/rest_v1/page/summary/X'), 30 * 86400000);
  assert.equal(safeExternal('https://en.wikipedia.org/wiki/Nirvana_(band)'), 'https://en.wikipedia.org/wiki/Nirvana_(band)');
  for (const bad of ['http://en.wikipedia.org/wiki/X', 'https://de.wikipedia.org/wiki/X', 'https://en.wikipedia.org.evil.com/x'])
    assert.equal(safeExternal(bad), null, bad);
});

test('why line rotates phrasings, never the same template twice in a row, and never names a data source', () => {
  const whys = [{ kind: 'trip', place: 'Mali' }, { kind: 'near', artist: 'Björk' }, { kind: 'genre', genre: 'Jazz' },
    { kind: 'trail', person: 'Nigel Godrich', role: 'producer', loved: 'Creep', also: '' }];
  let prev, last = '';
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const [text, key] = F.whyLine(whys[i % 8 < 4 ? 0 : i % 4], '', prev);
    assert.notEqual(key, prev, `repeat at ${i}`);
    assert.notEqual(text, last);
    assert.doesNotMatch(text, /Deezer|MusicBrainz|iTunes|Wikipedia/);
    prev = key; last = text; seen.add(key);
  }
  assert.ok(seen.size >= 10, 'all phrasings get used');
  assert.equal(F.whyLine({ kind: 'near', artist: 'X' }, 'Same deep low end as “Y”', undefined, () => 0)[0], 'Because you loved X · same deep low end as “Y”');
  assert.equal(F.whyLine(undefined, 'Same deep low end as “Y”')[0], 'Same deep low end as “Y”');
});

test('explain close: drops the sound clause when the match is weak', () => {
  const R = (id, rating, features) => ({ id, rating, features });
  const loved = F.vector({ bpm: 120, rms: 0.2, rmsCV: 0.3, centroid: 600, flatness: 0.01, onsetRate: 4, bands: [5, 5, 2, 1, 1, 0.5, 0.2, 0.1] });
  const far = loved.map(x => 1 - x);
  assert.ok(F.explain(far, [R('dz:1', 'love', loved)], {}));
  assert.equal(F.explain(far, [R('dz:1', 'love', loved)], {}, { close: true }), '');
  assert.ok(F.explain(loved, [R('dz:1', 'love', loved)], {}, { close: true }));
});
