// Mood Shelf (docs/19): the vibe list, editorial-playlist filters and the taste scoring. Shared by src/vibes.js, the renderer (window.Vibes) and node tests.
// No Features/profile globals in here: makeTaste gets them passed in.
(function (root) {
  'use strict';
  const norm = s => String(s || '').normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const v = (group, id, label, ...q) => ({ id, label, group, q });
  const VIBES = [
    v('Places', 'coffee-shop', 'Coffee shop', 'coffee shop', 'cafe'), v('Places', 'rainy-window', 'Rainy window', 'rainy day', 'rain'),
    v('Places', 'late-night-drive', 'Late-night drive', 'late night', 'night drive'), v('Places', 'road-trip', 'Road trip', 'roadtrip', 'driving'),
    v('Places', 'by-the-fire', 'By the fire', 'fireplace', 'cosy'), v('Places', 'jazz-bar', 'Jazz bar', 'jazz bar', 'lounge'),
    v('Places', 'beach-bar', 'Beach bar', 'beach bar', 'tropical'), v('Places', 'poolside', 'Poolside', 'pool', 'sunny day'),
    v('Places', 'dinner-party', 'Dinner party', 'dinner party', 'dinner'), v('Places', 'city-break', 'City break', 'city sounds'),
    v('Places', 'picnic', 'Picnic', 'picnic', 'bloom'), v('Places', 'commute', 'Commute', 'commute'),
    v('Doing', 'study', 'Study', 'study'), v('Doing', 'deep-focus', 'Deep focus', 'focus'), v('Doing', 'reading', 'Reading', 'reading'),
    v('Doing', 'cooking', 'Cooking', 'cooking', 'apero'), v('Doing', 'workout', 'Workout', 'workout'), v('Doing', 'running', 'Running', 'running'),
    v('Doing', 'yoga', 'Yoga', 'yoga', 'meditation'), v('Doing', 'cleaning', 'Cleaning', 'cleaning', 'motivation'), v('Doing', 'sleep', 'Sleep', 'sleep'),
    v('Doing', 'pre-party', 'Pre-party', 'pregame', 'party'), v('Doing', 'gaming', 'Gaming', 'gaming'),
    v('Moods', 'melancholy', 'Melancholy', 'sad', 'melancholy'), v('Moods', 'feel-good', 'Feel good', 'feel good', 'happy'),
    v('Moods', 'romantic', 'Romantic', 'romantic'), v('Moods', 'dreamy', 'Dreamy', 'dreamy'), v('Moods', 'chill', 'Chill', 'chill', 'mellow'),
    v('Moods', 'heartbreak', 'Heartbreak', 'heartbreak', 'breakup'), v('Moods', 'euphoric', 'Euphoric', 'euphoria'),
    v('Moods', 'angry', 'Angry', 'rage', 'angry'), v('Moods', 'throwback', 'Throwback', 'throwback'), v('Moods', 'cinematic', 'Cinematic', 'cinematic'),
    v('Times', 'slow-morning', 'Slow morning', 'morning', 'brunch'), v('Times', 'golden-hour', 'Golden hour', 'sunset'),
    v('Times', 'summer', 'Summer', 'summer'), v('Times', 'autumn', 'Autumn', 'autumn', 'cosy'), v('Times', 'winter', 'Winter', 'fireplace', 'winter'),
    v('Times', 'spring', 'Spring', 'spring', 'bloom'), v('Times', 'friday-night', 'Friday night', 'party', 'dance'),
  ];
  const GROUPS = ['Places', 'Doing', 'Moods', 'Times'];

  // Deezer editor word (from "Georges - Deezer Folk Editor") -> Deezer genre id and the MusicBrainz tags that count as that genre.
  const EG = (name, re, dz, tags) => ({ name, re, dz, tags });
  const EDITOR_GENRE = {
    folk: EG('Folk', /folk/, 466, ['folk', 'singer-songwriter', 'americana', 'indie folk']),
    alternative: EG('Alternative', /alternative|indie/, 85, ['alternative rock', 'indie rock', 'indie', 'alternative', 'shoegaze', 'post-punk']),
    soul: EG('Soul & Funk', /soul|funk/, 169, ['soul', 'funk', 'neo-soul', 'disco']),
    jazz: EG('Jazz & Blues', /jazz|blues/, 129, ['jazz', 'blues', 'swing', 'bossa nova']),
    rock: EG('Rock', /\brock\b/, 152, ['rock', 'classic rock', 'hard rock', 'punk', 'psychedelic rock']),
    pop: EG('Pop', /\bpop\b/, 132, ['pop', 'synth-pop', 'dance-pop']),
    dance: EG('Dance & EDM', /dance|edm/, 113, ['dance', 'house', 'techno', 'edm']),
    electronic: EG('Electronic', /electro/, 106, ['electronic', 'ambient', 'downtempo', 'trip hop', 'idm', 'electronica']),
    rap: EG('Rap', /\brap\b|hip/, 116, ['hip hop', 'rap', 'trap']),
    rnb: EG('R&B', /r&b|rnb/, 165, ['r&b', 'rnb', 'contemporary r&b']),
    classical: EG('Classical', /classical/, 98, ['classical', 'baroque', 'orchestral']),
    latin: EG('Latin', /latin/, 197, ['latin', 'salsa', 'bossa nova', 'reggaeton']),
    reggae: EG('Reggae', /reggae/, 144, ['reggae', 'dub', 'ska']),
    metal: EG('Metal', /metal/, 464, ['metal', 'heavy metal', 'death metal']),
    soundtracks: EG('Soundtracks', /soundtrack|film|score/, 173, ['soundtrack', 'score']),
  };
  // Key of the shelf an editor's name stands for, or null ("Moods", unknown: mixed genres).
  const editorGenre = name => {
    const s = String(name || '').toLowerCase(), i = s.indexOf('deezer'), rest = i >= 0 ? s.slice(i + 6) : s;
    return Object.keys(EDITOR_GENRE).find(k => EDITOR_GENRE[k].re.test(rest)) || null;
  };

  const isEditorial = p => /deezer.*editor|^deezer /i.test((p && p.user && p.user.name) || '');
  const badTitle = t => /^100% |setlist|\btour\b|christmas|xmas|noël|navidad|weihnacht|\bjul\b|halloween|disney|karaoke|\bkids?\b/i.test(t || '');

  // Per editor genre 0..1: 1 if the user picked that Deezer genre, else its share of the loved tags over the biggest genre's share.
  // moods (mixed lists / unknown) is a neutral 0.4, or 0 with no taste at all (cold start = the editors' order).
  function genreWeights(prefsGenres, lovedTags) {
    const picked = new Set((prefsGenres || []).map(g => g.id)), tags = lovedTags || {}, total = Object.values(tags).reduce((s, x) => s + Math.max(0, x), 0);
    const share = Object.fromEntries(Object.entries(EDITOR_GENRE).map(([k, g]) => [k, total ? g.tags.reduce((s, t) => s + Math.max(0, tags[t] || 0), 0) / total : 0]));
    const top = Math.max(0, ...Object.values(share));
    const G = Object.fromEntries(Object.keys(EDITOR_GENRE).map(k => [k, picked.has(EDITOR_GENRE[k].dz) ? 1 : top ? share[k] / top : 0]));
    G.moods = picked.size || top ? 0.4 : 0;
    return G;
  }

  // Everything scoring reads, from the profile and the session's lookups. near: {artistId: {k, by}}; tagsOf(row) -> tags or null; F = window.Features.
  function makeTaste(profile, { lovedTags, near, tagsOf, F } = {}) {
    const likes = profile.likes || [], prefs = profile.prefs || {}, arts = prefs.artists || [];
    return { F, near: near || {}, tags: lovedTags || {}, tagsOf: tagsOf || (() => null), G: genreWeights(prefs.genres, lovedTags),
      loved: new Set([...likes.map(l => l.artistDzId), ...arts.map(a => a.dzId)].filter(x => x != null).map(String)),
      names: new Set([...likes.map(l => l.artist), ...arts.map(a => a.name)].map(norm)),
      lovedKeys: new Set(likes.map(l => `${l.source}:${l.id}`)),
      skipped: new Set((profile.ratings || []).filter(r => r.rating === 'skip').map(r => r.id)),
      heard: new Set(profile.heard || []), ok: new Set(((profile.back || {}).ok || []).map(String)) };
  }

  // Pool rows -> scored items, best first. A row keeps its random nudge (row.r) so re-ranking after new tags is stable.
  function rank(rows, t, adventure = 50, rand = Math.random) {
    const cos = t.F && t.F.tagCos, hasTags = !!cos && Object.keys(t.tags).length > 0;
    const items = rows.filter(r => !t.skipped.has(`dz:${r.id}`)).map(row => {
      const id = String(row.artistDzId), loved = t.loved.has(id) || t.names.has(norm(row.artist)), n = t.near[id] || {}, k = n.k || 0;
      const fits = row.lists.map(l => [t.G[l.genre || 'moods'] ?? t.G.moods, l.genre]).sort((a, b) => b[0] - a[0])[0] || [0, null];
      const tags = hasTags ? t.tagsOf(row) : null;
      const heard = t.heard.has(`dz:${id}`) || t.heard.has(norm(row.artist));
      row.r ??= rand();
      return { row, loved, k, by: n.by, near: loved || k >= 2 ? 1 : k === 1 ? 0.6 : 0, genreFit: fits[0], genre: fits[1], T: tags ? cos(tags, t.tags) : null,
        heard, cooled: !loved && heard && !t.ok.has(id), lovedTrack: t.lovedKeys.has(`dz:${row.id}`) };
    });
    const known = items.filter(i => i.T != null).map(i => i.T);
    for (const i of items) {
      i.tagFit = i.T == null ? i.genreFit : known.reduce((s, x) => s + (x < i.T ? 1 : x === i.T ? 0.5 : 0), 0) / known.length;
      i.score = 2 * i.near * (1 - adventure / 200) + 1.5 * i.genreFit + 2 * i.tagFit - 1.5 * i.cooled + 0.25 * Math.min(2, i.row.lists.length - 1) + 0.4 * i.row.r;
    }
    return items.sort((a, b) => b.score - a.score);
  }

  // One page: <= 2 per artist (never back to back), <= 2 already-loved tracks, a loved-artist cap that shrinks with Adventure,
  // and 10 of 20 by artists never heard (relaxed when the pool lacks them, but the artist cap never is).
  function pickPage(ranked, t, shown = new Set(), adventure = 50, size = 20) {
    const pool = ranked.filter(i => !shown.has(`dz:${i.row.id}`)), cap = 1 + Math.round(4 * (1 - adventure / 100));
    const picked = new Set(), per = new Map();
    let lovedTr = 0, lovedAr = 0;
    const take = i => {
      const a = i.row.artistDzId;
      if ((per.get(a) || 0) >= 2 || (i.lovedTrack && lovedTr >= 2) || (i.loved && lovedAr >= cap)) return false;
      per.set(a, (per.get(a) || 0) + 1); lovedTr += +i.lovedTrack; lovedAr += +i.loved; picked.add(i);
      return true;
    };
    let fresh = 0;
    for (const i of pool) if (fresh < Math.min(10, size / 2) && !i.loved && !i.heard && take(i)) fresh++;
    for (const i of pool) if (picked.size < size && !picked.has(i)) take(i);
    const rest = pool.filter(i => picked.has(i)), page = [];
    while (rest.length) { // rank order, but the same artist never twice in a row unless nothing else is left
      const j = rest.findIndex(i => !page.length || i.row.artistDzId !== page[page.length - 1].row.artistDzId);
      page.push(...rest.splice(j < 0 ? 0 : j, 1));
    }
    return { page, more: pool.length > page.length, short: page.length < size };
  }

  // "<Vibe> · <reason>", first match wins. Returns [text, key, kind]; key rotates Features.whyLine phrasings.
  function why(item, vibe, t, prev) {
    const r = item.row, p = s => `${vibe.label} · ${s}`, F = t.F;
    if (item.lovedTrack) return [p('one of your loves'), prev, 'love'];
    if (item.loved) return [p(`more from ${r.artist}, a love of yours`), prev, 'artist'];
    if (item.near > 0 && item.by) { const [h, k] = F.whyLine({ kind: 'near', artist: item.by }, '', prev); return [p(h), k, 'near']; }
    if (item.T != null && item.tagFit >= 0.75) {
      const top = Object.entries(t.tagsOf(r) || {}).filter(([k]) => t.tags[k] > 0).sort((a, b) => b[1] * t.tags[b[0]] - a[1] * t.tags[a[0]]).slice(0, 2).map(e => e[0]);
      if (top.length) return [p(`shares the ${top.join(' and ')} of your loves`), prev, 'tags'];
    }
    if (item.genreFit >= 0.8 && EDITOR_GENRE[item.genre]) { const [h, k] = F.whyLine({ kind: 'genre', genre: EDITOR_GENRE[item.genre].name }, '', prev); return [p(h), k, 'genre']; }
    return [p(`from Deezer’s “${r.lists[0].title}”`), prev, 'source'];
  }

  const api = { VIBES, GROUPS, EDITOR_GENRE, editorGenre, isEditorial, badTitle, genreWeights, makeTaste, rank, pickPage, why };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Vibes = api;
})(typeof window === 'object' ? window : globalThis);
