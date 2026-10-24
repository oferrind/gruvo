const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'styles.css'), 'utf8');
// Token block that follows `header {`; the three theme blocks: dark default, forced light, and light via the OS preference.
const block = h => css.slice(css.indexOf(h) + h.length, css.indexOf('\n}', css.indexOf(h)));
const themes = { dark: block(':root {'), light: block(':root[data-theme=light] {'), 'light (OS)': block(':root:not([data-theme=dark]) {') };
const lum = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)); return .2126 * r + .7152 * g + .0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
const INKS = ['ink-1', 'ink-2', 'ink-3', 'edge-related', 'edge-label', 'ink-4', 'edge-era', 'edge-place', 'edge-soundtrack']; // Africa, Asia, Europe, N. America, Latin America, Oceania
const tok = (b, n) => (b.match(new RegExp(`--${n}:\\s*(#[0-9a-f]{6})`, 'i')) || [])[1];

test('continent stamp inks are readable as small text (4.5:1) on the page and the card, in both themes', () => {
  for (const [name, b] of Object.entries(themes)) for (const i of INKS) for (const bg of ['color-bg', 'color-surface']) {
    const [fg, back] = [tok(b, i), tok(b, bg)];
    assert.ok(fg && back, `${name}: --${i} / --${bg} not found`);
    const r = ratio(fg, back);
    assert.ok(r >= 4.5, `${name}: --${i} ${fg} on --${bg} ${back} is ${r.toFixed(2)}:1`);
  }
});
