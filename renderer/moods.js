// ---------- B2. Mood Shelf (docs/19) ----------
// A vibe -> Deezer editors' playlists (src/vibes.js) -> 20 songs re-ranked to your taste (renderer/vibes.js). "More" pages through the same pool.
const vbState = (kind, msg, opts) => setState($('#vibe-state'), kind, msg, opts);
const POOL_TTL = 10 * 60 * 1000; // Deezer preview tokens die after ~15 min
let vbRun = 0, vbCur = null, vbOpen = null, vbShown = new Set(), vbRows = [], vbWhy, vbNear = null, vbShelfDone = false;
const vbPools = new Map(), vbTags = new Map(); // vibe id -> {t, rows}; normalised artist name -> MusicBrainz tags | null (looked up, none)

// Which of your loved artists list each artist as related: asked once per session (the 15 newest loves, then Preferences artists).
function vbNearMap() {
  vbNear ??= (async () => {
    const ids = [...profile.likes].reverse().map(l => ({ id: l.artistDzId, name: l.artist })).concat(profile.prefs.artists.map(a => ({ id: a.dzId, name: a.name })))
      .filter((a, i, all) => a.id != null && all.findIndex(b => b.id === a.id) === i).slice(0, 15);
    return ids.length ? (await call('relatedMap', ids)) || {} : {};
  })();
  return vbNear;
}
async function vbPool(v) {
  const c = vbPools.get(v.id);
  if (c && Date.now() - c.t < POOL_TTL) return c;
  const res = await call('vibePool', v.id);
  if (!res || res.error) return { error: true };
  const p = { t: Date.now(), rows: res.rows };
  vbPools.set(v.id, p);
  return p;
}
function renderVibeHead() {
  const last = Vibes.VIBES.find(v => v.id === ls('vibeLast'));
  $('#vibe-head').replaceChildren(vbOpen ? el('div', { className: 'stamp-info' }, el('h2', { textContent: `${vbOpen.label}, pulled for you` }))
    : el('p', { className: 'stamp-empty' }, 'Pick a vibe from the shelf. ', last ? btn(`Last time: ${last.label}`, () => pullVibe(last), 'chip') : null));
}
function renderShelf() {
  const chip = v => { const b = btn(v.label, () => pullVibe(v), 'chip'); b.dataset.vibe = v.id; b.setAttribute('aria-pressed', false); return b; };
  const pickAny = () => Vibes.VIBES[Math.floor(Math.random() * Vibes.VIBES.length)];
  $('#vibe-shelf').replaceChildren(el('div', { className: 'chips' }, btn('Surprise me', () => pullVibe(pickAny()), 'chip')),
    ...Vibes.GROUPS.map(g => el('section', { className: 'vibe-crate' }, el('h2', { textContent: g }),
      el('div', { className: 'chips', role: 'group', ariaLabel: g }, ...Vibes.VIBES.filter(v => v.group === g).map(chip)))));
}
function renderMoods() {
  if (!vbShelfDone) { vbShelfDone = true; renderShelf(); renderVibeHead(); }
  vbNearMap(); // started on first open, shared by every vibe
}
async function pullVibe(v) {
  const run = ++vbRun;
  vbOpen = v; vbCur = null; vbShown = new Set(); vbRows = [];
  ls('vibeLast', v.id);
  $('#vibe-songs').replaceChildren(); $('#vibe-more').replaceChildren(); $('#vibe-export-status').replaceChildren(); $('#vibe-export-box').hidden = true; $('#vibe-note').hidden = true;
  renderVibeHead(); $$('#vibe-shelf [data-vibe]').forEach(b => {
    b.setAttribute('aria-pressed', b.dataset.vibe === v.id);
    if (b.dataset.vibe === v.id) b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); // Surprise me / Last time: show the card in its swipe row
  });
  vbState('loading', 'Pulling the shelf…');
  const [pool, near] = await Promise.all([vbPool(v), vbNearMap()]);
  if (run !== vbRun) return;
  if (pool.error) return vbState('error', "Couldn't reach Deezer's playlists. Check your connection and try again.", { art: 'empty-unknown', actions: [btn('Try again', () => pullVibe(v), 'primary')] });
  if (!pool.rows.length) return vbState('empty', 'No songs came through for this vibe.', { art: 'empty-unknown', actions: [btn('Try again', () => pullVibe(v), 'primary')] });
  vbCur = { v, rows: pool.rows, near };
  vbPage(run);
}
function vbPage(run) {
  if (run !== vbRun || !vbCur) return;
  const { v, rows, near } = vbCur, adv = profile.adventure;
  const t = Vibes.makeTaste(profile, { lovedTags: lovedTags(), near, tagsOf: r => vbTags.get(norm(r.artist)) || null, F: Features });
  const ranked = Vibes.rank(rows, t, adv), { page, more, short } = Vibes.pickPage(ranked, t, vbShown, adv);
  const from = { tab: 'moods', label: `Mood Shelf · ${v.label}` };
  for (const i of page) {
    const [text, key] = Vibes.why(i, v, t, vbWhy);
    vbWhy = key; vbShown.add(likeKey(i.row)); vbRows.push(i.row);
    $('#vibe-songs').append(trackRow(i.row, { reason: text, from }));
  }
  vbState(page.length ? 'done' : 'empty', short ? 'This shelf ran short.' : '');
  $('#vibe-more').replaceChildren(...(more ? [btn('More', () => vbPage(run))] : []));
  $('#vibe-export-box').hidden = !vbRows.length; $('#vibe-note').hidden = !vbRows.length;
  vbWarm(run, ranked.filter(i => !vbShown.has(likeKey(i.row))));
}
// Tags for the next 30 best-scored unseen artists, one at a time on the shared MusicBrainz queue; stops when the tab is left. Shown rows never re-sort.
async function vbWarm(run, ranked) {
  if (!profile.likes.length) return;
  const names = [...new Set(ranked.map(i => i.row.artist))].filter(n => !vbTags.has(norm(n))).slice(0, 30);
  for (const n of names) {
    if (run !== vbRun || $('#moods').hidden) return;
    vbTags.set(norm(n), (await call('artistTags', n)) || null);
  }
}
$('#vibe-export').onclick = e => vbCur && exportToSpotify(`Gruvo: ${vbCur.v.label}`, vbRows, $('#vibe-export-status'), e.currentTarget);
$('#vibe-shelf').addEventListener('keydown', e => {
  const cs = $$('#vibe-shelf .chip'), i = cs.indexOf(document.activeElement), to = { ArrowRight: i + 1, ArrowLeft: i - 1 }[e.key];
  if (to !== undefined && i >= 0) { e.preventDefault(); cs[(to + cs.length) % cs.length].focus(); }
});
$('#moods').addEventListener('keydown', e => { // M = More
  if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.closest('input, textarea')) $('#vibe-more button')?.click();
});

