const test = require('node:test');
const assert = require('node:assert');
const { reason, path } = require('../renderer/dig');

const pulp = { id: 0, parentId: null, track: { artist: 'Pulp', title: 'Common People' } };
const kid = (edgeType, label, artist = 'Blur') => ({ id: 1, parentId: 0, edgeType, label, track: { artist, title: 'Song 2' } });

test('the scene label names the parent, with or without the fans clause', () => {
  assert.equal(reason(kid('scene', 'Same scene: britpop, UK, formed 1989'), pulp), 'Same scene as Pulp: britpop, UK, formed 1989.');
  assert.equal(reason(kid('scene', 'Same scene: britpop, UK · fans of Pulp play them too'), pulp), "Same scene as Pulp: britpop, UK; fans of Pulp play them too.");
  assert.equal(reason(kid('era', 'Same era: UK, 1990s'), pulp), 'Same era as Pulp: UK, 1990s.');
});

test('every other label becomes one sentence that names the parent', () => {
  assert.equal(reason(kid('related', 'Fans of Pulp also play'), pulp), 'Fans of Pulp also play Blur.');
  assert.equal(reason(kid('roots', 'Pulp named Scott Walker as an influence'), pulp), 'Pulp named Scott Walker as an influence.');
  assert.equal(reason(kid('place', 'Also from Sheffield'), pulp), 'Also from Sheffield, like Pulp.');
  assert.equal(reason(kid('builton', 'Samples James Brown\'s “Funky Drummer”'), pulp), '“Common People” samples James Brown\'s “Funky Drummer”.');
  assert.equal(reason(kid('builton', 'Built on Bach\'s “Air”'), pulp), '“Common People” is built on Bach\'s “Air”.');
  assert.equal(reason(kid('member', 'Jarvis Cocker (vocals) went on to Relaxed Muscle'), pulp), 'Jarvis Cocker (vocals), of Pulp, went on to Relaxed Muscle.');
});

test('a row inside its relation group keeps only the specific facts', () => {
  assert.equal(reason(kid('scene', 'Same scene: britpop, UK, formed 1989 · fans of Pulp play them too'), pulp, true), 'Britpop, UK, formed 1989.');
  assert.equal(reason(kid('era', 'Same era: UK, 1990s'), pulp, true), 'UK, 1990s.');
  assert.equal(reason(kid('related', 'Fans of Pulp also play'), pulp, true), '');
  assert.equal(reason(kid('place', 'Also from Sheffield'), pulp, true), 'Also from Sheffield, like Pulp.');
});

test('the root has no reason; a missing label gives none', () => {
  assert.equal(reason(pulp, null), '');
  assert.equal(reason(kid('scene', ''), pulp), '');
});

test('the dig path runs from the root down to the node', () => {
  const nodes = [pulp, { id: 1, parentId: 0 }, { id: 2, parentId: 1 }, { id: 3, parentId: 0 }];
  assert.deepEqual(path(nodes, 2).map(n => n.id), [0, 1, 2]);
  assert.deepEqual(path(nodes, 0).map(n => n.id), [0]);
  assert.deepEqual(path(nodes, 9), []);
});

// Renderer guards that have no DOM harness: pinned at the source so a refactor cannot drop them silently.
const read = f => require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'renderer', f), 'utf8');
test('the tree renderer guards a second More on a leaf and stale searches', () => {
  const src = read('app.js');
  assert.match(src, /if \(quiet && r && !r\.error && r\.added\) return;/); // a Dig into a bare record fills in without the More toast
  assert.match(src, /async function moreTree\(n, quiet\) \{[^\n]*\r?\n  if \(trDigging\.has\(n\.id\)\) return;/);
  assert.match(src, /const run = \+\+trRun;\r?\n  trSearch\+\+;/);
});
test('landscape touch keeps the logo, theme switch and search button at touch size', () => {
  const css = read('styles.css');
  for (const re of [/\.touch \.brand \{ min-height: 48px/, /\.touch \.theme-toggle \{ min-width: 48px/, /\.touch \.search button \{ min-height: 48px/]) assert.match(css, re);
});
