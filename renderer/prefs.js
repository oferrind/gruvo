// ---------- Preferences (first-launch step + tab) ----------
// Seed ratings are 'seed:<artistDzId>:<trackId>': a favourite artist's top track, fingerprinted and kept as a Love.
const seedArtist = r => r.id.split(':')[1];
const seedNames = () => Object.fromEntries(profile.ratings.filter(r => r.seed).map(r => {
  const a = profile.prefs.artists.find(x => String(x.dzId) === seedArtist(r));
  return [r.id, a ? `${a.name}, one of your favourites` : 'one of your favourite artists'];
}));
let genreList = null, seeding = false, seedAgain = false, prefsTimer = null, artistQ = 0;

// Background: drop seeds of removed artists, fetch + fingerprint 2 top tracks per new artist. Never blocks the Blind Test.
async function seedTaste() {
  if (seeding) { seedAgain = true; return; }
  seeding = true;
  try {
    const listed = () => new Set(profile.prefs.artists.map(a => String(a.dzId)));
    profile.ratings = profile.ratings.filter(r => !r.seed || listed().has(seedArtist(r)));
    const done = new Set(profile.ratings.filter(r => r.seed).map(seedArtist));
    const todo = profile.prefs.artists.filter(a => !done.has(String(a.dzId)));
    if (!todo.length) return;
    const tracks = (await call('seedTracks', plain(todo))) || [];
    for (const [i, t] of tracks.entries()) {
      prefStatus(`Listening to your favourites… ${i + 1} of ${tracks.length}`);
      const v = await fingerprint(t);
      if (!v || !listed().has(String(t.artistDzId))) continue;
      profile.ratings = [...profile.ratings.filter(r => r.id !== t.seedId), { id: t.seedId, rating: 'love', features: v, seed: true }].slice(-500);
      save();
    }
    prefStatus();
  } finally {
    seeding = false;
    if (seedAgain) { seedAgain = false; seedTaste(); }
  }
}
function prefStatus(msg) {
  const n = profile.ratings.filter(r => r.seed).length;
  $('#pref-status').textContent = msg || (n ? `Learned the sound of ${n} track${n > 1 ? 's' : ''} by your favourite artists.` : '');
}

// Any change: save now; after a pause, re-seed and drop queued picks that were found before the change.
function prefsChanged() {
  save();
  clearTimeout(prefsTimer);
  prefsTimer = setTimeout(() => {
    seedTaste();
    queue.length = 0;
    if (mystery && !rated && current !== mystery) { mystery = null; showMystery(); } else fill();
  }, 1200);
}

function toggleChip(label, on, onToggle) {
  const b = btn(label, () => { const v = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', v); onToggle(v); prefsChanged(); }, 'chip');
  b.setAttribute('aria-pressed', on);
  return b;
}
const setIn = (list, x, on, same = (a, b) => a === b) => (on ? [...list.filter(y => !same(y, x)), x] : list.filter(y => !same(y, x)));

function renderPickedArtists() {
  const p = profile.prefs;
  $('#pref-artists').replaceChildren(...p.artists.map(a => el('li', {}, el('button', { type: 'button', className: 'chip picked-chip', ariaLabel: `Remove ${a.name}`,
    onclick: () => { p.artists = p.artists.filter(x => x.dzId !== a.dzId); renderPickedArtists(); prefsChanged(); $('#pref-artist-q').focus(); } },
  a.name, icon('close')))));
  if (!p.artists.length) $('#pref-artists').append(el('li', { className: 'hint', textContent: 'None yet.' }));
}
function addArtist(a) {
  const p = profile.prefs;
  if (!p.artists.some(x => x.dzId === a.dzId)) p.artists = [...p.artists, { dzId: a.dzId, name: a.name }].slice(0, 30);
  $('#pref-artist-q').value = '';
  $('#pref-artist-hits').replaceChildren();
  renderPickedArtists();
  prefsChanged();
}
const fans = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M fans` : n >= 1e3 ? `${Math.round(n / 1e3)}K fans` : `${n} fans`;
let hits = [];
$('#pref-artist-q').addEventListener('input', e => {
  const q = e.target.value.trim(), my = ++artistQ;
  clearTimeout(e.target.t);
  if (q.length < 2) { hits = []; return $('#pref-artist-hits').replaceChildren(); }
  e.target.t = setTimeout(async () => {
    const res = (await call('searchArtists', q)) || [];
    if (my !== artistQ) return; // a newer keystroke won
    hits = res.slice(0, 6);
    $('#pref-artist-hits').replaceChildren(...(hits.length ? hits.map(a => el('li', {}, el('button', { type: 'button', className: 'suggest-row', onclick: () => addArtist(a) },
      el('span', { textContent: a.name }), el('small', { className: 'muted', textContent: fans(a.fans) })))) : [el('li', { className: 'hint', textContent: `No artist called “${q}” found.` })]));
  }, 250);
});
$('#pref-artist-q').addEventListener('keydown', e => { if (e.key === 'Enter' && hits[0]) { e.preventDefault(); addArtist(hits[0]); } });

async function renderGenres() {
  const box = $('#pref-genres');
  genreList ??= await call('genres');
  if (!genreList || !genreList.length) {
    genreList = null;
    return setState(box, 'error', "Couldn't load the genre list.", { actions: [btn('Try again', renderGenres)] });
  }
  box.className = 'chips';
  const p = profile.prefs;
  box.replaceChildren(...genreList.filter(g => Dig.shopGenre(g.name)).map(g => toggleChip(Dig.shopGenre(g.name), p.genres.some(x => x.id === g.id),
    on => { p.genres = setIn(p.genres, { id: g.id, name: g.name }, on, (a, b) => a.id === b.id); })));
}

// Colour scheme (profile.prefs.scheme): applied at once; mirrored in localStorage so a launch paints it before the profile loads.
const SCHEMES = { shop: 'Record shop', mixtape: 'Mixtape' };
function applyScheme(s) { document.documentElement.dataset.scheme = s; try { localStorage.setItem('scheme', s); } catch {} }
function renderSchemes() {
  $('#pref-scheme').replaceChildren(...Object.entries(SCHEMES).map(([id, label]) => {
    const sw = el('span', { className: 'swatch' }, ...Array.from({ length: 6 }, () => el('span')));
    sw.dataset.scheme = id;
    sw.setAttribute('aria-hidden', 'true');
    return el('label', { className: 'scheme' },
      el('input', { type: 'radio', name: 'scheme', value: id, checked: profile.prefs.scheme === id, onchange: () => { profile.prefs.scheme = id; applyScheme(id); save(); } }),
      el('span', { className: 'scheme-name', textContent: label }), sw);
  }));
}

let prefsBuilt = false;
// Blind A/B (docs/21): Love rate of the mysteries each picker chose. Neither is named while you rate.
function abLine() {
  const n = { ship: [0, 0], hyb: [0, 0] };
  for (const e of profile.events) if (e.k === 'rate' && n[e.alg]) { n[e.alg][1]++; if (e.v === 'love') n[e.alg][0]++; }
  const part = (label, [l, t]) => `${label}: ${l} loved of ${t}${t ? ` (${Math.round(100 * l / t)}%)` : ''}`;
  return n.ship[1] + n.hyb[1] ? `Each mystery is secretly picked by the old or the new picker. ${part('New', n.hyb)}; ${part('old', n.ship)}.`
    : 'Each mystery is secretly picked by the old or the new picker; their Love rates show here once you rate some.';
}
function renderPrefs() {
  $('#prefs-ab').textContent = abLine();
  ['#ab-title', '#prefs-ab', '#src-lb'].forEach(s => { $(s).hidden = !HYBRID_AB; });
  const p = profile.prefs;
  renderPickedArtists();
  prefStatus();
  renderGenres();
  if (prefsBuilt) return;
  prefsBuilt = true;
  renderSchemes();
  $('#pref-decades').append(...DECADES.map(d => toggleChip(`${d}s`, p.decades.includes(d), on => { profile.prefs.decades = setIn(profile.prefs.decades, d, on); })));
  $('#pref-bringback').checked = p.bringBack;
  $('#pref-bringback').onchange = e => { profile.prefs.bringBack = e.target.checked; save(); };
  $('#pref-regions').append(...Object.keys(regionList).map(r => toggleChip(r, p.regions.includes(r), on => { profile.prefs.regions = setIn(profile.prefs.regions, r, on); })));
}

// First launch: this step comes before the intro; Continue and Skip both lead there. Later it opens from the header gear.
let regionList = {};
function prefsMode(first) {
  $('#prefs-title').textContent = first ? 'First, what do you already love?' : 'Your taste';
  $('#prefs-skip').hidden = !first;
  prefsFirst = first;
  const back = prefsFrom && prefsFrom !== 'prefs' && $(`#tab-${tabOf(prefsFrom)}`) ? prefsFrom : null;
  $('#prefs-done').textContent = first ? 'Continue' : back ? `Back to ${tabName(back)}` : 'Done';
  $('#prefs-done').onclick = () => (first ? openIntro() : showTab(back || 'blind'));
}
function openPrefs(first) {
  prefsMode(first);
  showTab('prefs');
  if (first) $('#pref-artist-q').focus();
}
prefsMode(false);
$('#prefs-skip').onclick = () => openIntro();

// ---------- Spotify (options A + C; tokens stay in main) ----------
let sp = { connected: false };
function renderSpotifyPrefs(msg) {
  $('#sp-redirect').textContent = sp.redirectUri || '';
  if (!$('#sp-client').value) $('#sp-client').value = sp.clientId || '';
  $('#sp-connect').hidden = !!sp.connected;
  $('#sp-off').hidden = !sp.connected;
  $('#sp-setup').open = !sp.clientId && !sp.connected;
  $('#sp-status').textContent = msg ?? (sp.connected ? `Connected as ${sp.name || 'your Spotify account'}.` : 'Not connected.');
}
function openSpotifyPrefs() {
  showTab('prefs');
  $('#spotify-prefs').scrollIntoView({ block: 'start' });
  (sp.connected ? $('#sp-off') : $('#sp-client')).focus();
}
$('#sp-connect').addEventListener('submit', async e => {
  e.preventDefault();
  $('#sp-go').disabled = true;
  renderSpotifyPrefs('Log in to Spotify in your browser, then come back here…');
  const r = await spotify.connect($('#sp-client').value).catch(() => ({ error: 'Spotify login failed. Try again.' }));
  $('#sp-go').disabled = false;
  if (r.error) return renderSpotifyPrefs(r.error);
  sp = r;
  renderSpotifyPrefs();
});
$('#sp-off').onclick = async () => { sp = await spotify.disconnect(); renderSpotifyPrefs(); $('#sp-client').focus(); };
document.querySelectorAll('#sources [data-url]').forEach(b => { b.onclick = () => api.open(b.dataset.url).catch(() => toast('Could not open the browser')); });
$('#sp-dash').onclick =() => api.open('https://developer.spotify.com/dashboard').catch(() => toast('Could not open the browser'));

// Plays that exact track on the user's Spotify device; several idle devices: ask which, next to the button.
async function playInSpotify(t, b, deviceId) {
  b.disabled = true;
  const r = await spotify.play(plain(t), deviceId).catch(() => ({ error: 'Spotify failed. Try again.' }));
  b.disabled = false;
  b.parentElement.querySelector('.sp-devices')?.remove();
  if (r.devices) return b.after(el('span', { className: 'sp-devices' }, el('span', { className: 'full-label', textContent: 'Play on:' }),
    ...r.devices.map(d => btn(d.name, () => playInSpotify(t, b, d.id), 'ext'))));
  if (r.error) return toast(r.error);
  audio.pause();
  toast(`Playing “${cleanTitle(t.title)}” in Spotify${r.name ? ` on ${r.name}` : ''}`);
}

// Private playlist from tracks (in order); reports matches and the songs Spotify doesn't have. Genre Stamps can call it too.
async function exportToSpotify(name, tracks, out, b) {
  if (!sp.connected) return openSpotifyPrefs();
  if (!tracks.length) return out.replaceChildren('Nothing to export yet.');
  if (b) b.disabled = true;
  out.replaceChildren(`Finding ${tracks.length} songs on Spotify…`);
  const r = await spotify.exportPlaylist(name, plain(tracks)).catch(() => ({ error: 'Spotify failed. Try again.' }));
  if (b) b.disabled = false;
  const miss = r.unmatched?.length ? ` Not on Spotify: ${r.unmatched.map(u => `${u.artist} – ${u.title}`).join(', ')}.` : '';
  if (r.error) return out.replaceChildren(r.error + miss);
  out.replaceChildren(`Added ${r.added} of ${r.total} songs to the private playlist “${name}”.${miss} `,
    btn('Open in Spotify', () => api.open(r.url).catch(() => toast('Could not open the browser')), 'ext'));
}
$('#saved-export').onclick = e => exportToSpotify('Gruvo: Loved', profile.likes.slice().reverse(), $('#saved-export-status'), e.currentTarget);
$('#tree-export').onclick = e => {
  const steps = trNodes.filter(Boolean).map(n => n.track); // arrival order: the root, its family, theirs
  exportToSpotify(steps.length ? `Gruvo: ${steps[0].title} family tree` : 'Gruvo', steps, $('#tree-export-status'), e.currentTarget);
};

