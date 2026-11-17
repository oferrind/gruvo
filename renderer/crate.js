// ---------- B. Genre Stamps (docs/06) ----------
let SD, stRun = 0, stDone = false, stOpen = null, stSongs = [], nextRoll = null;
const stState = (kind, msg, opts) => setState($('#stamp-state'), kind, msg, opts);
// Per-viewer conveniences only (last rolls, combos that came back thin); losing them is harmless. Rarity lives in the profile.
const ls = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch { return null; } };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const INK = { Africa: 1, Asia: 2, Europe: 3, 'North America': 4, 'Latin America & Caribbean': 5, Oceania: 6 };
// A like's stamp: new likes carry it (null = none); an old Passport like (country + decade) counts toward its legacy stamp.
const stampOf = e => ('stamp' in e ? e.stamp : e.country && e.decade ? `${e.decade}-${e.country}-` : null);
// Re-loving keeps the stamp. A saved like with no stamp field is an old Passport like: it re-earns its legacy stamp, as unloving took it away.
const extraOf = t => (t.country || t.stamp ? { country: t.country, decade: t.decade, genre: t.genre, stamp: 'stamp' in t ? t.stamp : t.ts ? stampOf(t) : null } : undefined);
function buildStamps(regions) {
  SD = StampData(regions, window.GENRE_DATA);
  for (const list of Object.values(regions)) Object.assign(countryNames, list);
  const opt = (value, text) => el('option', { value, textContent: text });
  $('#b-decade').append(opt('', 'any decade'), ...SD.DECADES.map(d => opt(d, SD.decadeName(d))));
  $('#b-place').append(opt('', 'anywhere'), ...SD.CONTINENTS.map(c => el('optgroup', { label: c }, ...Object.keys(SD.ALL_CC).filter(cc => SD.continentOf(cc) === c)
    .sort((a, b) => SD.DEMONYM[a].localeCompare(SD.DEMONYM[b])).map(cc => opt(cc, SD.DEMONYM[cc])))));
  $('#b-genre').append(...Object.entries(SD.GENRES).sort((a, b) => a[1][0].localeCompare(b[1][0])).map(([g, [name]]) => opt(g, name)));
  $('#cat-filter').append(...SD.CONTINENTS.map(c => opt(c, c)));
  syncBuilder(SD.makeStamp('1990-JP-rock'));
  $('#builder').classList.toggle('has-sheet', SD.ATLAS.size > 0);
  $('#genre-family').append(...Object.entries(SD.FAMILIES).filter(([f]) => [...SD.ATLAS.values()].some(e => e.family === f)).map(([f, n]) => opt(f, n)));
  $('#genre-tier').append(...Object.entries(SD.TIERS).map(([t, n]) => opt(t, n)));
  $('#genre-total').textContent = SD.ATLAS.size ? `(${SD.ATLAS.size.toLocaleString()})` : '';
  $('#br-genres').hidden = !SD.ATLAS.size;
  const m = ls('stampMode');
  setMode(m === 'browse' ? ls('stampBrowse') : m); // 'browse' + stampBrowse: the two switches before they became one
}
// One switch for the left column: Roll (Surprise me + Pick one), or the catalogue by Scenes or by Genres.
function setMode(mode) {
  if (mode === 'genres' && !SD.ATLAS.size) mode = 'scenes';
  if (mode !== 'scenes' && mode !== 'genres') mode = 'roll';
  $('#stamps').dataset.mode = mode;
  $('#roll-pane').hidden = mode !== 'roll'; $('#browse-pane').hidden = $('#browse-find').hidden = mode === 'roll';
  $('#browse-q').placeholder = mode === 'genres' ? 'Search genres: zeuhl, shoegaze…' : 'Search scenes: Lagos, city pop…';
  $('#browse-q').setAttribute('aria-label', mode === 'genres' ? 'Search genres' : 'Search scenes');
  $('#scenes-view').hidden = mode !== 'scenes'; $('#genres-view').hidden = mode !== 'genres';
  for (const [id, m] of [['mode-roll', 'roll'], ['br-scenes', 'scenes'], ['br-genres', 'genres']]) $(`#${id}`).setAttribute('aria-pressed', String(mode === m));
  ls('stampMode', mode);
  if (mode === 'genres') renderGenreList(); else if (mode === 'scenes') renderCatalogue();
  renderStampHead(); // its empty line speaks to the chosen mode
}
$('#mode-roll').onclick = () => setMode('roll');
$('#br-scenes').onclick = () => setMode('scenes');
$('#br-genres').onclick = () => setMode('genres');
// Phone: the songs sit under the Roll and the sentence; bring them up once a pick is made (after the reel lands, for a Roll).
const toResults = (delay = 0) => { if (PHONE.matches) setTimeout(() => $('#stamp-head').scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }), delay); };
const STACKED = matchMedia('(max-width: 899px)'); // one column: a search hides the last pick (CSS), so opening a result clears it
const pick = s => { if (STACKED.matches && $('#browse-q').value) { $('#browse-q').value = ''; renderBrowse(); } openStamp(s); toResults(); };

// ---- Genres view: search + family/tier filters over the atlas (docs/12) ----
let gShown = 60, gDig = null, gTimer = 0;
function genreItem(s) {
  const b = el('button', { type: 'button', className: `cat-item ink-g`, onclick: () => pick(s) },
    el('span', { className: 'cat-label', textContent: s.label }),
    el('span', { className: 'cat-blurb', textContent: `${SD.FAMILIES[s.family].toLowerCase()} · ${SD.TIERS[s.tier]}` }));
  if (stOpen && stOpen.id === s.id) b.setAttribute('aria-current', 'true');
  return el('li', {}, b);
}
function renderGenreList() {
  if ($('#genres-view').hidden) return;
  const q = $('#browse-q').value, family = $('#genre-family').value, gTier = $('#genre-tier').value, none = !q.trim() && !family && !gTier;
  let stamps, total;
  if (none) { // "Dig somewhere new": 12 random uncollected Deep/Obscure genres
    gDig ??= [...SD.ATLAS.values()].filter(e => e.tier !== 'C' && !profile.stamps[`--${e.slug}`]).sort(() => Math.random() - .5).slice(0, 12).map(e => SD.makeStamp(`--${e.slug}`));
    stamps = gDig; total = stamps.length;
  } else ({ stamps, total } = SD.searchGenres(q, { family, tier: gTier }, gShown));
  $('#genre-dig').textContent = none ? 'Dig somewhere new' : `${total} genre${total === 1 ? '' : 's'}`;
  $('#genre-list').replaceChildren(...(stamps.length ? stamps.map(genreItem) : [noMatch('genre')]));
  $('#genre-more').hidden = none || total <= stamps.length;
  $('#genre-more').textContent = `Show more (${total - stamps.length})`;
}
// One search field over both lists (Scenes and Genres), kept across the switch. On a phone it stays under the top bar,
// and typing brings the list up under it, past an open pick's songs.
function renderBrowse() {
  $('#browse-clear').hidden = !$('#browse-q').value;
  gShown = 60; catAll = false;
  renderGenreList(); renderCatalogue();
  const f = $('#browse-find'), under = parseFloat(getComputedStyle(f).top) + f.offsetHeight; // where the field's bottom sits once stuck
  const d = $('#browse-pane').getBoundingClientRect().top - under;
  if (PHONE.matches && Math.abs(d) > 1) scrollBy(0, d);
}
// No match: the "?" sleeve and a way back.
const noMatch = (what, offer) => {
  const q = $('#browse-q').value.trim();
  return el('li', { className: 'cat-empty' }, el('img', { className: 'state-art', src: 'img/empty-unknown.png', alt: '' }),
    el('p', { textContent: q ? `No ${what} matches "${q}".` : `No ${what} matches these filters.` }), offer || null, q ? btn('Clear search', clearBrowse) : null);
};
const clearBrowse = () => { $('#browse-q').value = ''; renderBrowse(); $('#browse-q').focus(); };
$('#browse-q').addEventListener('input', () => { clearTimeout(gTimer); gTimer = setTimeout(renderBrowse, 150); });
$('#browse-q').addEventListener('keydown', e => {
  if (e.key === 'Escape' && e.target.value) { e.preventDefault(); return clearBrowse(); }
  if (e.key !== 'Enter') return;
  e.preventDefault(); clearTimeout(gTimer); renderBrowse();
  const top = $('#browse-pane > :not([hidden]) .cat-item'); if (top) top.click();
});
$('#browse-clear').onclick = clearBrowse;
$$('#genre-family, #genre-tier').forEach(s => s.addEventListener('change', () => { gShown = 60; renderGenreList(); }));
$('#genre-more').onclick = () => { gShown += 60; renderGenreList(); $$('#genre-list .cat-item')[gShown - 60]?.focus(); };
function syncBuilder(s) {
  $('#b-decade').value = s.decade || ''; $('#b-place').value = s.cc || ''; // the builder mirrors what was opened or rolled
  const e = SD.ATLAS.get(s.genre), sel = $('#b-genre');
  if (s.genre && !$$('#b-genre option').some(o => o.value === s.genre) && e) sel.append(el('option', { value: s.genre, textContent: e.label })); // an atlas slug: makeStamp takes it in any combo
  if (!s.genre) sel.value = ''; else if ($$('#b-genre option').some(o => o.value === s.genre)) sel.value = s.genre;
  syncGenreBtn();
}
// Phone: the genre select is replaced by a button that opens a searchable sheet over every atlas genre (CSS shows it only on phones).
const syncGenreBtn = () => { $('#b-genre-btn').textContent = $('#b-genre').selectedOptions[0]?.textContent || 'any genre'; };
const gSheet = el('div', { className: 'sheet', id: 'genre-sheet', role: 'dialog', ariaLabel: 'Pick a genre', hidden: true });
const gSheetQ = el('input', { type: 'search', placeholder: 'Search genres: zeuhl, shoegaze...', autocomplete: 'off', spellcheck: false, ariaLabel: 'Search genres' });
const gSheetList = el('ul', { className: 'cat-list' });
function fillGenreSheet() {
  const { stamps } = SD.searchGenres(gSheetQ.value, {}, 60);
  gSheetList.replaceChildren(...stamps.map(s => el('li', {}, el('button', { type: 'button', className: 'cat-item ink-g', onclick: () => {
    const sel = $('#b-genre');
    if (!$$('#b-genre option').some(o => o.value === s.genre)) sel.append(el('option', { value: s.genre, textContent: s.label })); // an atlas slug: makeStamp takes it in any combo
    sel.value = s.genre; syncGenreBtn(); gSheet.hidden = true; $('#b-genre-btn').focus();
  } }, el('span', { className: 'cat-label', textContent: s.label }), el('span', { className: 'cat-blurb', textContent: `${SD.FAMILIES[s.family].toLowerCase()} · ${SD.TIERS[s.tier]}` })))));
  if (!stamps.length) gSheetList.append(el('li', { className: 'muted cat-empty', textContent: 'No genre matches.' }));
}
gSheetQ.addEventListener('input', fillGenreSheet);
gSheet.append(gSheetQ, gSheetList);
gSheet.addEventListener('click', e => { if (e.target === gSheet) gSheet.hidden = true; }); // the scrim
$('#main').append(gSheet);
$('#b-genre-btn').onclick = () => { gSheetQ.value = ''; fillGenreSheet(); gSheet.hidden = false; gSheetQ.focus(); };
$('#builder').addEventListener('submit', e => {
  e.preventDefault();
  // A catalogue combo opens that entry; "any decade" / "anywhere" give a decade + genre, place + genre or bare genre stamp.
  const d = $('#b-decade').value, cc = $('#b-place').value, g = $('#b-genre').value;
  const ALIAS = { psych: 'psychedelic-rock', prog: 'progressive-rock', indie: 'indie-rock', chanson: 'chanson-francaise' }; // builder genre -> atlas slug
  const s = SD.makeStamp(`${d}-${cc}-${d && cc ? g : ALIAS[g] || g}`);
  $('#builder-note').textContent = s ? '' : `${SD.GENRES[g][0]} needs a decade and a place.`;
  if (s) pick(s);
});
$('#cat-filter').addEventListener('change', () => renderCatalogue());

let catAll = false; // the catalogue shows 8 rows until "Show all"
function renderCatalogue() {
  const q = $('#browse-q').value, list = SD.searchScenes(q, $('#cat-filter').value), all = catAll || !!q.trim(); // a search shows every match
  if (!list.length) {
    $('#cat-more').hidden = true;
    const g = q.trim() && SD.ATLAS.size ? SD.searchGenres(q, {}, 1).stamps[0] : null; // "shoegaze" is a genre, not a scene: offer it in Genres
    return $('#catalogue').replaceChildren(noMatch('scene', g && btn(`See ${g.label} in Genres`, () => { setMode('genres'); pick(g); }, 'primary')));
  }
  $('#catalogue').replaceChildren(...(all ? list : list.slice(0, 8)).map(s => {
    const b = el('button', { type: 'button', className: `cat-item ink-${INK[SD.continentOf(s.cc)]}`, onclick: () => pick(s) },
      el('span', { className: 'cat-label', textContent: s.label }),
      el('span', { className: 'cat-blurb', textContent: s.blurb }));
    if (stOpen && stOpen.id === s.id) b.setAttribute('aria-current', 'true');
    return el('li', {}, b);
  }));
  $('#cat-more').hidden = all || list.length <= 8;
  $('#cat-more').textContent = `Show all ${list.length}`;
}
$('#cat-more').onclick = () => { catAll = true; renderCatalogue(); $$('#catalogue .cat-item')[8]?.focus(); };

function renderStampHead() {
  const s = stOpen, head = $('#stamp-head');
  $('#stamp-export-box').hidden = !(stSongs.length && stDone); // only once the Roll has finished
  if (!s) return head.replaceChildren(el('p', { className: 'stamp-empty', textContent: { scenes: 'Pick a scene: a place, a decade and its sound. Up to fifteen songs from it.',
    genres: 'Search or pick a genre, from the well-known to the deeply obscure.' }[$('#stamps').dataset.mode] || 'Roll, or pick a genre. Add a decade or a place if you like.' }));
  head.replaceChildren(el('div', { className: 'stamp-info' },
    el('h2', { textContent: s.label }), s.blurb ? el('p', { className: 'stamp-blurb', textContent: s.blurb }) : null,
    s.atlas && SD.nearby(s.genre).length ? el('div', { className: 'chips nearby' }, el('span', { className: 'nearby-lead', textContent: 'Nearby' }),
      ...SD.nearby(s.genre).map(x => btn(x.label, () => openStamp(x), 'chip'))) : null));
}
function renderStamps() {
  if (!SD) return;
  renderCatalogue(); renderGenreList(); renderStampHead();
}
let stMenu = 0;
const PHONE = matchMedia('(max-width: 840px), (pointer: coarse) and (max-height: 500px)'); // the phone layout, a landscape phone included (styles.css)
PHONE.addEventListener('change', () => $$('#stamp-songs .track').forEach(r => r.fit?.()));
function songRow(t) {
  const row = trackRow(t, { extra: extraOf(t), full: true });
  if (t.year) row.querySelector('.artist').textContent = `${t.artist}, ${t.year}`;
  // At rest: ▶, Skip / OK / Love (as in the Blind Test and the Tree) and ⋯ for About and Full song, as on the Tree cards.
  const group = rateGroup(t, row.querySelector('.love')), more = moreMenu(row, `stamp-menu-${++stMenu}`, `${t.artist} – ${t.title}`);
  row.append(el('div', { className: 'node-actions' }, group, more));
  fitPhone(row, group, more);
  return row;
}
api.onStampRow((run, row) => {
  if (run !== stRun) return;
  stSongs.push(row);
  if (!stDone) stState('loading', `Found ${stSongs.length}…`); // not a stale "Searching…" over songs already arriving
  $('#stamp-songs').append(songRow(row));
});

// "More songs" under the list: idle button, busy, retry on failure, or the quiet end line. The cursor lives in main.
function showMore(s, run, doneMsg, mode = 'idle') {
  const box = $('#stamp-more');
  const go = () => {
    box.replaceChildren(el('button', { type: 'button', disabled: true, textContent: 'Finding more…' }));
    api.moreStamp(s.id, run).catch(() => ({ error: true })).then(res => {
      if (run !== stRun || !res) return;
      if (!res.error) stState('done', doneMsg(stSongs.length));
      showMore(s, run, doneMsg, res.error ? 'error' : res.more ? 'idle' : 'done');
    });
  };
  box.replaceChildren(...(mode === 'done' ? [el('p', { className: 'hint', textContent: `That's every song we could find for ${s.label}.` })]
    : mode === 'error' ? [el('p', { className: 'hint', textContent: "Couldn't load more songs." }), btn('Try again', go)] : [btn('More songs', go)]));
}
const markShort = id => ls('stampShort', [...new Set([...(ls('stampShort') || []), id])].slice(-200));
// Prefetch the next Roll; a thin one is remembered, discarded and replaced (3 tries at most), so the user never lands on it.
function prefetchNext(s, tries = 3) {
  const n = nextRoll = SD.roll({ ...rollState(), recent: [...(ls('stampRecent') || []), s.id].slice(-5) });
  api.prefetchStamp(n.id).then(res => {
    if (nextRoll !== n || !res || !res.thin) return;
    markShort(n.id); nextRoll = null;
    if (tries > 1) prefetchNext(s, tries - 1);
  }).catch(() => {});
}
async function openStamp(s, rerolls = 0) {
  const run = ++stRun;
  stOpen = s; stSongs = []; stDone = false; syncBuilder(s);
  $('#stamp-songs').replaceChildren(); $('#stamp-more').replaceChildren(); $('#stamp-export-status').replaceChildren();
  renderStampHead(); renderCatalogue(); renderGenreList();
  stState('loading', 'Searching…');
  const res = await api.stamp(s.id, run).catch(() => ({ error: true }));
  if (run !== stRun || !res) return;
  if (res.error) return stState('error', "Couldn't reach the record stacks. Check your connection and try again.", { art: 'empty-unknown', actions: [btn('Try again', () => openStamp(s), 'primary')] });
  if (res.thin) {
    markShort(s.id);
    if (rerolls > 0) return land(SD.roll(rollState()), rerolls - 1);
  }
  prefetchNext(s); // prefetched: the next dice landing is instant
  if (res.thin && s.atlas && !s.decade && !s.cc) {
    const near = SD.nearby(s.genre).slice(0, 3);
    return stState('empty', `Only ${res.count} song${res.count === 1 ? '' : 's'} tagged ${s.label.toLowerCase()} made it.${near.length ? ` Try ${near.map(x => x.label).join(' or ')}?` : ''}`,
      { actions: near.map(x => btn(x.label, () => openStamp(x))) });
  }
  if (res.thin) {
    const near = (s.atlas ? [SD.makeStamp(`--${s.genre}`)] : [s.decade - 10, s.decade + 10].map(d => SD.makeStamp(`${d}-${s.cc}-${s.genre}`))).filter(Boolean); // a genre with a place that is empty: the genre itself
    return stState('empty', `Only ${res.count} song${res.count === 1 ? '' : 's'} from ${s.label} made it.${near.length ? ` Try ${near.map(x => x.label).join(' or ')}?` : ''}`,
      { actions: near.map(x => btn(x.label, () => openStamp(x))) });
  }
  if (!stSongs.length) return stState('empty', 'No songs came through for this one.', { art: 'empty-unknown', actions: [btn('Try again', () => openStamp(s), 'primary')] }); // never a silent empty list
  stDone = true; $('#stamp-export-box').hidden = false;
  const doneMsg = n => (s.atlas ? `${n} songs tagged ${SD.ATLAS.get(s.genre).name}${s.decade ? `, first released in the ${SD.decadeName(s.decade)}` : ''}${s.cc ? `, by artists from ${countryNames[s.cc]}` : ''}.`
    : `${n} songs, every one first released in the ${SD.decadeName(s.decade)} by an artist from ${countryNames[s.cc]}.`);
  stState('done', doneMsg(res.count));
  if (res.more) showMore(s, run, doneMsg); else if (res.more === false) showMore(s, run, doneMsg, 'done');
  renderStamps();
}

// ---- Roll: one reel spins to the stamp name (~1.1 s) while the playlist is already on its way ----
const rollState = () => ({ held: profile.stamps, recent: ls('stampRecent') || [], adventurous: $('#adventurous').checked, streak: ls('stampStreak') || 0, gstreak: ls('stampGStreak') || 0,
  short: ls('stampShort') || [], topTags: [...profile.prefs.genres.map(g => g.name), ...profile.likes.filter(l => l.genre && SD.GENRES[l.genre]).flatMap(l => SD.GENRES[l.genre][1])] });
function doRoll() {
  setMode('roll'); // R from Browse: show the reel it lands on
  const st = rollState();
  const s = nextRoll && !st.recent.includes(nextRoll.id) ? nextRoll : SD.roll(st);
  nextRoll = null;
  rolling = true;
  land(s, 2);
}
// Lands a rolled stamp; one that comes back thin is re-rolled (up to `left` times) before the suggestion screen shows.
function land(s, left) {
  const st = rollState();
  const keys = Object.keys(profile.stamps), heldC = new Set(keys.map(k => SD.continentOf(k.split('-')[1])));
  ls('stampRecent', [...st.recent, s.id].slice(-5));
  if (s.atlas && !s.cc) { // a genre roll counts toward the family streak only
    const heldF = new Set(keys.filter(k => k.startsWith('--')).map(k => (SD.ATLAS.get(k.slice(2)) || {}).family));
    ls('stampGStreak', heldF.has(s.family) ? st.gstreak + 1 : 0);
  } else ls('stampStreak', heldC.has(SD.continentOf(s.cc)) ? st.streak + 1 : 0);
  spinReels(s);
  openStamp(s, left);
}
let reelPool = null;
let rolling = false; // set by doRoll: only a Roll scrolls to the results, not a re-roll's reel
function spinReels(s) { // one reel: random stamp names spin past and the rolled one lands
  reelPool ??= [...SD.CATALOGUE.map(x => x.label), ...[...SD.ATLAS.values()].map(e => e.label)];
  $('#roll-said').textContent = `Rolled: ${s.label}`;
  const reel = $('#reels .reel'), strip = reel.firstElementChild, land = () => { strip.replaceChildren(el('span', { textContent: s.label })); if (rolling) { rolling = false; toResults(); } }; // scroll to the songs only once the reel has landed
  strip.getAnimations().forEach(a => a.cancel());
  if (reduced()) return land();
  const spin = Array.from({ length: 12 }, () => reelPool[Math.floor(Math.random() * reelPool.length)]);
  strip.replaceChildren(...[strip.lastElementChild.textContent, ...spin, s.label].map(v => el('span', { textContent: v })));
  strip.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${-(spin.length + 1) * reel.clientHeight}px)` }],
    { duration: 1100, easing: 'cubic-bezier(.25,.1,.25,1)', fill: 'forwards' })
    .finished.then(() => { strip.getAnimations().forEach(a => a.cancel()); land(); }, () => {});
}
$('#roll').onclick = doRoll;
$('#stamp-export').onclick = e => stOpen && exportToSpotify(`Gruvo: ${stOpen.label}`, stSongs, $('#stamp-export-status'), e.currentTarget);

