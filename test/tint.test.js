const test = require('node:test');
const assert = require('node:assert');
const { tintOf } = require('../renderer/tint');

const img = (...px) => Uint8ClampedArray.from(px.flatMap(([r, g, b, n = 1]) => Array.from({ length: n }, () => [r, g, b, 255]).flat()));

test('the dominant colourful hue wins, saturation is clamped', () => {
  const t = tintOf(img([220, 30, 30, 10], [30, 60, 220, 4], [20, 20, 20, 30]));
  assert.ok(t.h < 10 || t.h > 350, `red expected, got ${t.h}`);
  assert.equal(t.s, 35); // capped so tinted text stays AA (below)
  assert.ok(tintOf(img([120, 160, 90, 1])).s >= 30);
});

test('grey, black, white or empty covers fall back (null)', () => {
  assert.equal(tintOf(img([128, 128, 128, 50], [0, 0, 0, 50], [255, 255, 255, 50])), null);
  assert.equal(tintOf(new Uint8ClampedArray(0)), null);
});

// The bar's "From …" chip is 11.5px text in var(--tint): hsl(h s 66%) on the dark surfaces, hsl(h s 27%) on the light ones.
test('any cover hue keeps the tinted text AA (4.5:1) on both themes', () => {
  const lin = c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const hsl = (h, s, l) => { const a = s * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; };
  const hex = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16) / 255);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (let h = 0; h < 360; h += 5) {
    const t = tintOf(img([...hsl(h, 1, 0.5).map(c => Math.round(c * 255)), 10]));
    for (const [l, bgs] of [[0.66, ['#231b16', '#30261e']], [0.27, ['#f7f0e3', '#e0d2b9']]])
      for (const bg of bgs) assert.ok(ratio(hsl(t.h, t.s / 100, l), hex(bg)) >= 4.5, `hue ${h} (s ${t.s}) on ${bg}`);
  }
});
