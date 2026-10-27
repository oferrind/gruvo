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
