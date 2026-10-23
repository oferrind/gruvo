const test = require('node:test');
const assert = require('node:assert');
const { tintOf } = require('../renderer/tint');

const img = (...px) => Uint8ClampedArray.from(px.flatMap(([r, g, b, n = 1]) => Array.from({ length: n }, () => [r, g, b, 255]).flat()));

test('the dominant colourful hue wins, saturation is clamped', () => {
  const t = tintOf(img([220, 30, 30, 10], [30, 60, 220, 4], [20, 20, 20, 30]));
  assert.ok(t.h < 10 || t.h > 350, `red expected, got ${t.h}`);
  assert.equal(t.s, 60);
  assert.ok(tintOf(img([120, 160, 90, 1])).s >= 30);
});

test('grey, black, white or empty covers fall back (null)', () => {
  assert.equal(tintOf(img([128, 128, 128, 50], [0, 0, 0, 50], [255, 255, 255, 50])), null);
  assert.equal(tintOf(new Uint8ClampedArray(0)), null);
});
