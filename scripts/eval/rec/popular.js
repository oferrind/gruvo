// Baseline: most popular first, by the artist's Deezer fans (nb_fan), the track's Deezer rank breaking ties. Unknown ranks last.
module.exports = { name: 'popular', score: c => (c.fans != null ? Math.log10(c.fans + 1) : -1) + (c.rank != null ? c.rank / 1e8 : 0) };
