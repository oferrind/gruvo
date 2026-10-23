// Cover-art accent: the dominant hue of an album cover, as {h, s} for the --tint tokens (lightness comes from the theme, so
// text stays AA). Works in the renderer (window.Tint) and in node tests (require).
(function (root) {
  function hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  // data: RGBA bytes (canvas ImageData). Twelve 30° hue bins weighted by saturation; the heaviest bin wins.
  // Mostly grey, black or white covers return null, and the UI keeps its amber.
  function tintOf(data) {
    const bins = Array.from({ length: 12 }, () => ({ w: 0, h: 0, s: 0 }));
    let px = 0, total = 0;
    for (let i = 0; i + 3 < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      px++;
      const [h, s, l] = hsl(data[i], data[i + 1], data[i + 2]);
      if (l < 0.12 || l > 0.92 || s < 0.15) continue;
      const w = s * s, b = bins[Math.floor(h / 30) % 12];
      b.w += w; b.h += h * w; b.s += s * w; total += w;
    }
    if (!px || total / px < 0.03) return null;
    const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
    return { h: Math.round(best.h / best.w), s: Math.round(Math.min(0.35, Math.max(0.3, best.s / best.w)) * 100) };
  }
  const api = { tintOf };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Tint = api;
})(this);
