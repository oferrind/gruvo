const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'styles.css'), 'utf8');
// Each colour scheme is one `[data-scheme=x] {` block of `--token: light-dark(#light, #dark)` values.
const schemes = {};
for (const [, name, body] of css.matchAll(/\[data-scheme=(\w+)\] \{([^}]*)\}/g)) {
  for (const [, tok, light, dark] of body.matchAll(/--([\w-]+):\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/gi)) {
    (schemes[`${name} light`] ??= {})[tok] = light;
    (schemes[`${name} dark`] ??= {})[tok] = dark;
  }
}
const lum = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)); return .2126 * r + .7152 * g + .0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
// Tree relation inks double as the continent stamp inks (--ink-1..4), so both are small text on the page and the card.
const EDGES = ['scene', 'member', 'builton', 'roots', 'producer', 'label', 'related', 'era', 'place', 'soundtrack'].map(e => `edge-${e}`);
const PAIRS = [
  ...['color-text', 'color-muted'].flatMap(f => ['color-bg', 'color-surface', 'color-surface-2'].map(b => [f, b])),
  ...['color-accent', 'color-love', 'color-error', ...EDGES].flatMap(f => ['color-bg', 'color-surface'].map(b => [f, b])),
  ['color-on-accent', 'color-accent'], ['color-error', 'color-error-bg'], ['sticker-ink', 'sticker'],
];

test('the four colour schemes exist, each with a light and a dark variant', () => {
  assert.deepEqual(Object.keys(schemes).sort(), ['bluelabel dark', 'bluelabel light', 'riso dark', 'riso light', 'shop dark', 'shop light', 'tuner dark', 'tuner light']);
  const keys = Object.keys(schemes['shop dark']).sort();
  for (const [name, s] of Object.entries(schemes)) assert.deepEqual(Object.keys(s).sort(), keys, `${name} overrides a different set of tokens`);
});

test('every scheme, light and dark: body text, muted text, accent and every ink are AA (4.5:1) on the surfaces they sit on', () => {
  for (const [name, s] of Object.entries(schemes)) for (const [fg, bg] of PAIRS) {
    assert.ok(s[fg] && s[bg], `${name}: --${fg} / --${bg} not found`);
    const r = ratio(s[fg], s[bg]);
    assert.ok(r >= 4.5, `${name}: --${fg} ${s[fg]} on --${bg} ${s[bg]} is ${r.toFixed(2)}:1`);
  }
});
