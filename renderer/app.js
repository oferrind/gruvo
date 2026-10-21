// Renderer: UI only. All network/logic runs in main via window.api; profile via window.store.
const $ = s => document.querySelector(s);
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids.filter(k => k != null)); return e; };
const norm = s => String(s || '').normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const DECADES = [1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010];

let profile, countryNames = {};

function save() { store.save(profile).catch(e => toast('Could not save: ' + e.message)); }
function toast(msg) {
  $('#toast').textContent = msg;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { $('#toast').textContent = ''; }, 4000);
}
const call = (name, ...args) => api.call(name, ...args).catch(e => { console.error(name, e); return null; });

// ---------- player (one <audio> for the whole app) ----------
const audio = $('#audio');
let current = null, retried = false, onFail = null;

async function play(item, label, failCb) {
  current = item; retried = false; onFail = failCb || null;
  $('#now-playing').textContent = label || `${item.artist} – ${item.title}`;
  // Saved likes have no preview URL (they expire); fetch one at play time.
  const url = item.previewUrl || await call('freshPreview', plain(item));
  if (current !== item) return;
  if (!url) return unavailable();
  audio.src = url;
  audio.play().catch(() => {});
}
function unavailable() {
  toast('Preview unavailable');
  if (onFail) onFail();
}
audio.addEventListener('error', async () => {
  const item = current;
  if (!item || !audio.getAttribute('src')) return;
  if (retried) return unavailable();
  retried = true;
  const url = await call('freshPreview', plain(item), true); // bypass cache: token likely expired
  if (current !== item) return;
  if (!url) return unavailable();
  audio.src = url;
  audio.play().catch(() => {});
});
const plain = o => JSON.parse(JSON.stringify(o));

// ---------- likes / rows ----------
const likeKey = t => `${t.source}:${t.id}`;
const isLiked = t => profile.likes.some(l => likeKey(l) === likeKey(t));

function like(t, extra = {}) {
  if (isLiked(t)) return;
  const { source, id, title, artist, artistDzId, cover, isrc } = t;
  const entry = { source, id, title, artist, artistDzId, cover, isrc, ...extra, ts: Date.now() };
  profile.likes.push(entry);
  if (entry.country && entry.decade) profile.stamps[`${entry.country}-${entry.decade}`] = (profile.stamps[`${entry.country}-${entry.decade}`] || 0) + 1;
  if (!profile.heard.includes(norm(artist))) profile.heard.push(norm(artist));
  save();
  renderStamps();
}
function unlike(t) {
  profile.likes = profile.likes.filter(l => likeKey(l) !== likeKey(t));
  save();
}

function loveButton(t, extra) {
  const b = el('button', { type: 'button', className: 'love' });
  const sync = () => { b.textContent = isLiked(t) ? '★ Saved' : '☆ Love'; b.setAttribute('aria-pressed', isLiked(t)); };
  b.onclick = () => { isLiked(t) ? unlike(t) : like(t, extra); sync(); };
  sync();
  return b;
}

// One track row: cover, artist – title, optional reason, play, love. onOpen makes the title a link.
function trackRow(t, { extra, reason, onOpen } = {}) {
  const name = `${t.artist} – ${t.title}`;
  const label = onOpen ? el('button', { type: 'button', className: 'link', textContent: name, onclick: onOpen }) : el('span', { textContent: name });
  return el('li', { className: 'track' },
    t.cover ? el('img', { src: t.cover, alt: '', width: 56, height: 56 }) : null,
    el('div', { className: 'meta' }, label, reason ? el('small', { className: 'reason', textContent: reason }) : null),
    el('button', { type: 'button', className: 'play', textContent: '▶ Play', onclick: () => play(t) }),
    loveButton(t, extra));
}

// ---------- tabs ----------
function showTab(name) {
  document.querySelectorAll('#tabs [role=tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === name));
  document.querySelectorAll('.panel').forEach(p => { p.hidden = p.id !== name; });
  if (name === 'saved') renderSaved();
}
$('#tabs').addEventListener('click', e => { if (e.target.dataset.tab) showTab(e.target.dataset.tab); });

// ---------- A. Blind Taste Test ----------
const queue = [];
let mystery = null, rated = false, n = 0, fails = 0, filling = false;

async function fill() {
  if (filling) return;
  filling = true;
  $('#blind-error').hidden = true;
  while (queue.length < 3) {
    const exclude = [...queue, mystery].filter(Boolean).map(c => norm(c.artist));
    const c = await call('nextCandidate', { likes: plain(profile.likes), heard: profile.heard, exclude, adventure: profile.adventure });
    if (c && !profile.heard.includes(norm(c.artist)) && !exclude.includes(norm(c.artist))) {
      fails = 0;
      queue.push(c);
      if (!mystery) showMystery();
    } else if (++fails >= 5) {
      if (!mystery) { $('#blind-error').hidden = false; $('#mystery-title').textContent = 'No mystery yet'; }
      break;
    }
  }
  filling = false;
}

function showMystery() {
  mystery = queue.shift() || null;
  rated = false;
  $('#reveal').replaceChildren();
  $('#mystery-next').hidden = true;
  $('#mystery-progress').value = 0;
  if (!mystery) { $('#mystery-title').textContent = 'Loading…'; fill(); return; }
  n++;
  $('#mystery-title').textContent = `Mystery #${n}`;
  const m = mystery;
  play(m, `Mystery #${n}`, () => { // preview dead: drop silently, never offer this artist again
    if (mystery !== m || rated) return;
    profile.heard.push(norm(m.artist)); save(); showMystery();
  });
  fill();
}

function rate(kind) {
  if (!mystery || rated) return;
  rated = true;
  const m = mystery;
  if (!profile.heard.includes(norm(m.artist))) profile.heard.push(norm(m.artist));
  if (kind === 'love') like(m, m.country ? { country: m.country, decade: m.decade } : {});
  save();
  // Artist/title enter the DOM only now, after rating.
  $('#reveal').replaceChildren(
    m.cover ? el('img', { src: m.cover, alt: `Cover of ${m.title}`, width: 120, height: 120 }) : null,
    el('p', { className: 'reveal-name' }, el('strong', { textContent: m.artist }), ` – ${m.title}`),
    el('p', { className: 'reason', textContent: m.reason || '' }),
    el('p', { textContent: `You rated: ${kind}` }),
    loveButton(m, m.country ? { country: m.country, decade: m.decade } : {}));
  $('#now-playing').textContent = `${m.artist} – ${m.title}`;
  $('#mystery-next').hidden = false;
  $('#mystery-next').focus();
}

$('#rate').addEventListener('click', e => { if (e.target.dataset.rate) rate(e.target.dataset.rate); });
$('#mystery-next').onclick = () => showMystery();
$('#mystery-play').onclick = () => { if (current !== mystery) return; audio.paused ? audio.play().catch(() => {}) : audio.pause(); };
$('#blind-retry').onclick = () => { fails = 0; fill(); };
audio.addEventListener('timeupdate', () => { if (current === mystery && audio.duration) $('#mystery-progress').value = audio.currentTime / audio.duration; });
document.addEventListener('keydown', e => {
  if ($('#blind').hidden || e.target.matches('input, select, textarea')) return;
  if (e.key in { 1: 1, 2: 1, 3: 1 }) rate(['skip', 'ok', 'love'][e.key - 1]);
  else if (e.key === 'Enter' && rated && e.target === document.body) showMystery();
});
$('#adventure').addEventListener('input', e => { profile.adventure = Number(e.target.value); $('#adventure-value').textContent = profile.adventure; });
$('#adventure').addEventListener('change', save);

// ---------- B. Sonic Passport ----------
let ppRun = 0, ppDecade = 1970;

function buildPassport(countries) {
  const sel = $('#country');
  for (const [continent, list] of Object.entries(countries)) {
    const g = el('optgroup', { label: continent });
    for (const [cc, name] of Object.entries(list)) { countryNames[cc] = name; g.append(el('option', { value: cc, textContent: name })); }
    sel.append(g);
  }
  sel.value = 'NG';
  for (const d of DECADES) $('#decades').append(el('button', { type: 'button', textContent: `${d}s`, onclick: () => runPassport(sel.value, d) }));
}

async function runPassport(cc, decade) {
  const run = ++ppRun;
  ppDecade = decade;
  $('#country').value = cc;
  document.querySelectorAll('#decades button').forEach(b => b.setAttribute('aria-pressed', b.textContent === `${decade}s`));
  const list = $('#passport-results');
  list.replaceChildren();
  const status = $('#passport-status');
  status.textContent = `Asking MusicBrainz about ${countryNames[cc]} in the ${decade}s…`;
  const names = (await call('passportArtists', cc, decade)) || [];
  if (run !== ppRun) return;
  if (!names.length) {
    status.replaceChildren(`No recorded artists for ${countryNames[cc]} in the ${decade}s yet. Try a neighbouring decade: `,
      ...[decade - 10, decade + 10].filter(d => d >= 1900 && d <= 2020).map(d => el('button', { type: 'button', textContent: `${d}s`, onclick: () => runPassport(cc, d) })));
    return;
  }
  const misses = [];
  let found = 0, tried = 0;
  for (const name of names) {
    if (found >= 10 || tried >= 30) break;
    tried++;
    status.textContent = `Finding previews… ${found} found, ${tried} of ${Math.min(30, names.length)} tried`;
    const t = await call('resolvePreview', name);
    if (run !== ppRun) return;
    if (t) { found++; list.append(trackRow(t, { extra: { country: cc, decade } })); } else misses.push(name);
  }
  status.textContent = `${found} playable tracks from ${countryNames[cc]}, ${decade}s.`;
  if (found < 3) for (const name of misses) list.append(el('li', { className: 'track nopreview', textContent: `${name} (no preview)` }));
}

function renderStamps() {
  const keys = Object.keys(profile.stamps);
  $('#stamp-count').textContent = keys.length;
  $('#stamps').replaceChildren(...keys.sort().map(k => {
    const [cc, d] = k.split('-');
    return el('li', { className: 'stamp', textContent: `${countryNames[cc] || cc} · ${d}s` });
  }));
}

// ---------- C. Liner Notes Trail + Covers ----------
let lnRun = 0, crumbs = [], coverHits = [];
const status = msg => { $('#liner-status').textContent = msg; };

$('#liner-search').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('#liner-q').value.trim();
  if (!q) return;
  status('Searching Deezer…');
  const hits = (await call('searchTracks', q)) || [];
  status(hits.length ? '' : 'No tracks found.');
  $('#liner-hits').replaceChildren(...hits.map(t => trackRow(t, { onOpen: () => { crumbs = []; $('#liner-hits').replaceChildren(); openTrack(t); } })));
});
// Arrow keys move between results; Down from the search box enters the list.
$('#liner').addEventListener('keydown', e => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const links = [...document.querySelectorAll('#liner-hits .link')];
  if (!links.length) return;
  const i = links.indexOf(document.activeElement);
  if (i < 0 && e.target.id !== 'liner-q') return;
  e.preventDefault();
  links[Math.max(0, Math.min(links.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
});

function pushCrumb(label, fn) {
  crumbs.push({ label, fn });
  $('#crumbs').replaceChildren(...crumbs.map((c, i) => el('button', { type: 'button', className: 'crumb', textContent: c.label,
    onclick: () => { crumbs = crumbs.slice(0, i); c.fn(); } })));
}

async function openTrack(t) {
  const run = ++lnRun;
  pushCrumb(`${t.artist} – ${t.title}`, () => openTrack(t));
  $('#credits').replaceChildren(); $('#trail').replaceChildren(); $('#covers-list').replaceChildren();
  $('#trail-title').hidden = true; $('#liner-subtabs').hidden = true; showSub('credits');
  status('Asking MusicBrainz for credits… (each step takes ~1.5 s)');
  const c = await call('credits', { recId: t.recId, isrc: t.isrc, title: t.title, artist: t.artist });
  if (run !== lnRun) return;
  if (!c) { status('MusicBrainz has no record of this track yet.'); return; }
  status('');
  $('#liner-subtabs').hidden = !c.work;
  coverWork = c.work && { ...c.work, artist: c.artist, loaded: false };
  const box = $('#credits');
  box.append(el('h2', { textContent: `Credits: ${c.artist} – ${c.title}` }));
  if (!c.hasCredits) {
    box.append(el('p', { textContent: 'MusicBrainz has no credits for this recording yet.' }));
    if (c.country && countryNames[c.country]) box.append(el('button', { type: 'button', textContent: `Explore ${countryNames[c.country]} in Passport`,
      onclick: () => { showTab('passport'); runPassport(c.country, ppDecade); } }));
  }
  for (const g of c.groups) {
    box.append(el('h3', { textContent: g.role }),
      el('ul', { className: 'people' }, ...g.people.map(p => el('li', {}, el('button', { type: 'button', className: 'link', textContent: p.name,
        onclick: () => openPerson(p, g.role, c) })))));
  }
}

async function openPerson(p, role, ctx) {
  const run = ++lnRun;
  pushCrumb(p.name, () => openPerson(p, role, ctx));
  $('#credits').replaceChildren(); $('#liner-subtabs').hidden = true; showSub('credits');
  const list = $('#trail');
  list.replaceChildren();
  $('#trail-title').hidden = false;
  $('#trail-title').textContent = `Music ${p.name} worked on (${role}) beyond ${ctx.artist}`;
  status(`Asking MusicBrainz about ${p.name}…`);
  const picks = (await call('personTrail', p.id, ctx.artist, profile.heard)) || [];
  if (run !== lnRun) return;
  if (!picks.length) { status(`No other artists found for ${p.name}.`); return; }
  let found = 0;
  for (const [i, pick] of picks.entries()) {
    status(`Finding previews… ${i + 1}/${picks.length}`);
    const t = await call('resolvePreview', pick.artist, pick.title);
    if (run !== lnRun) return;
    if (!t) continue;
    found++;
    list.append(trackRow(t, { reason: `${p.name}, ${pick.role}, for ${pick.artist}`,
      onOpen: () => openTrack({ recId: pick.recId, title: pick.title, artist: pick.artist }) }));
  }
  status(`${found} playable of ${picks.length} artists.`);
}

let coverWork = null;
function showSub(name) {
  $('#credits').hidden = name !== 'credits';
  $('#covers').hidden = name !== 'covers';
  document.querySelectorAll('#liner-subtabs button').forEach(b => b.setAttribute('aria-pressed', b.dataset.sub === name));
  if (name === 'covers' && coverWork && !coverWork.loaded) loadCovers(coverWork);
}
$('#liner-subtabs').addEventListener('click', e => { if (e.target.dataset.sub) showSub(e.target.dataset.sub); });

async function loadCovers(w) {
  w.loaded = true;
  const run = lnRun;
  coverHits = [];
  const list = $('#covers-list');
  list.replaceChildren();
  status(`Asking MusicBrainz for covers of "${w.title}"…`);
  const names = (await call('covers', w.id, w.artist)) || [];
  if (run !== lnRun) return;
  let tried = 0;
  for (const name of names) {
    if (coverHits.length >= 8 || tried >= 25) break;
    tried++;
    status(`Finding cover previews… ${coverHits.length} found, ${tried} tried`);
    const t = await call('resolvePreview', name, w.title, true);
    if (run !== lnRun) return;
    if (t) { coverHits.push(t); list.append(trackRow(t, { reason: `Cover of ${w.artist}` })); }
  }
  status(names.length ? `${coverHits.length} playable covers.` : 'No covers recorded in MusicBrainz.');
}
$('#spin').onclick = () => coverHits.length ? play(coverHits[Math.floor(Math.random() * coverHits.length)]) : toast('No covers loaded yet');

// ---------- Saved ----------
function renderSaved() {
  const list = $('#saved-list');
  list.replaceChildren(...profile.likes.slice().reverse().map(t => trackRow(t, {
    reason: t.country ? `${countryNames[t.country] || t.country}, ${t.decade}s` : '' })));
  if (!profile.likes.length) list.append(el('li', { textContent: 'Nothing saved yet. Love a track to keep it here.' }));
}

// ---------- start ----------
(async () => {
  profile = await store.load();
  buildPassport(await api.countries());
  $('#adventure').value = profile.adventure;
  $('#adventure-value').textContent = profile.adventure;
  renderStamps();
  fill();
})();
