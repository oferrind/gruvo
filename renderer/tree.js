// ---------- C. Family Tree ----------
// main builds the tree (src/tree.js) and streams nodes over 'tree:node'; a newer tree's run number drops the old one's.
// The view is a dig: one record in focus, its family under it grouped by relation, and the way back up as a row of sleeves.
let trRun = 0, trSearch = 0, trBusy = 0, trNodes = [], trFocus = 0, trFull = false;
const trDigging = new Set(); // ids with a More in flight
const trState = (kind, msg, opts) => setState($('#tree-state'), kind, msg, opts);
const trWork = d => { trBusy += d; if (trBusy) trState('loading', 'Searching…'); };
const kinOf = id => trNodes.filter(n => n && n.parentId === id);
const treeFrom = n => ({ tab: 'tree', label: n.parentId == null ? tabName('tree') : `Tree, via ${cleanTitle(trNodes[n.parentId].track.title)}` });
const TREE_MORE = 3; // songs one More adds (src/tree.js MORE)

// A 48px "Dig ›" / "Grow ›": the one way into a record.
function digBtn(text, label, onclick) {
  const b = el('button', { type: 'button', className: 'dig-go', onclick }, text, icon('chevron'));
  b.setAttribute('aria-label', label);
  return b;
}

// Start: search any song, or tap one of your saved sleeves. With a tree already grown, the way back to it.
function showStart(on) {
  $('#tree-start').hidden = !on;
  $('#tree-dig').hidden = on || !trNodes.length;
  $('#tree-new').hidden = on || !trNodes.length;
  if (!on) return;
  const saved = profile.likes.slice().reverse(); // newest first
  $('#tree-saved-box').hidden = !saved.length;
  $('#tree-saved').replaceChildren(...saved.map(t => el('li', {}, el('button', { type: 'button', className: 'sleeve-pick', onclick: () => growTree(t), ariaLabel: `Grow a tree from ${t.artist} – ${t.title}` },
    t.cover ? el('img', { src: t.cover, alt: '', width: 96, height: 96 }) : el('span', { className: 'cover-ph' }),
    el('span', { className: 'sleeve-title', textContent: cleanTitle(t.title) }), el('span', { className: 'sleeve-artist', textContent: t.artist })))));
  $('#tree-saved').scrollLeft = 0;
  const f = trNodes[trFocus];
  if (f) trState('done', '', { actions: [btn(`Back to “${cleanTitle(f.track.title)}”`, () => { trState('done', ''); showStart(false); })] });
  else if (!saved.length) trState('empty', 'Search any song to start digging. Songs you save in Blind Test or Crate Dig wait here too.', { art: 'empty-deck' });
  else trState('done', '');
}
$('#tree-new').onclick = () => { showStart(true); $('#tree-q').focus(); };
$('#tree-search').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('#tree-q').value.trim();
  if (!q) return $('#tree-q').focus();
  const run = ++trSearch;
  trState('loading', 'Searching…');
  $('#tree-saved-box').hidden = true; // the answer (or the no-match line) must not sit under the carousel, off-screen
  const hits = await call('searchTracks', q);
  if (run !== trSearch) return;
  if (!hits) return trState('error', "Couldn't search right now. Check your connection.", { art: 'empty-unknown', actions: [btn('Try again', () => $('#tree-search').requestSubmit(), 'primary')] });
  trState(hits.length ? 'done' : 'empty', hits.length ? '' : `No songs found for "${q}". Try artist and title, e.g. "Oasis Wonderwall".`, { art: hits.length ? null : 'empty-unknown' });
  $('#tree-hits').replaceChildren(...hits.map(t => {
    const row = trackRow(t);
    row.append(digBtn('Grow', `Grow a tree from ${t.artist} – ${t.title}`, () => growTree(t)));
    return row;
  }));
});

// Tune (profile.prefs.tree): five plain switches, the rest under "More ways", then the filters. Saved on change, applied on close.
const GROW_EDGES = [ // [edge, hint], in the order they are listed
  ['scene', 'Same genre, years and country'], ['related', 'What fans of the artist also play'], ['era', 'Any genre, the same years'],
  ['place', 'Same city or country, any genre'], ['soundtrack', 'Songs from the same film'], ['producer', 'Records the same producer made'],
  ['label', 'Signed to the same label then'], ['member', 'Bands a member went on to or came from'],
  ['builton', 'Songs it samples or is based on'], ['roots', 'Artists it names as an influence']];
const TUNE_MAIN = { scene: 'Same scene', member: 'Band members', builton: 'Samples and covers', roots: 'Influences', related: 'Fans also play' };
let trRoot = null, trUsed = '';
const growSet = () => profile.prefs.tree;
function renderGrowSettings() {
  const s = growSet(), sw = ([e, hint]) => el('label', { className: 'grow-edge' },
    el('span', { className: 'grow-name', textContent: TUNE_MAIN[e] || EDGE_NAMES[e] }), TUNE_MAIN[e] ? null : el('span', { className: 'grow-hint', textContent: hint }),
    el('input', { type: 'checkbox', role: 'switch', value: e, checked: s.edges.includes(e) }));
  $('#grow-edges').replaceChildren(...Object.keys(TUNE_MAIN).map(e => sw(GROW_EDGES.find(g => g[0] === e))));
  $('#grow-edges-more').replaceChildren(...GROW_EDGES.filter(([e]) => !TUNE_MAIN[e]).map(sw));
  $('#grow-era').value = s.era; $('#grow-place').value = s.place; $('#grow-width').value = String(s.width); $('#grow-fame').value = s.fame;
}
$('#tree-tune').addEventListener('change', e => {
  const on = $$('#tree-tune input[type=checkbox]').filter(b => b.checked).map(b => b.value);
  if (!on.length) { e.target.checked = true; return toast('Keep at least one way to connect songs.'); } // the last one stays on
  profile.prefs.tree = { edges: on, era: $('#grow-era').value, place: $('#grow-place').value, fame: Number($('#grow-fame').value), width: Number($('#grow-width').value) };
  save();
});
$('#tree-tune-open').onclick = () => { renderGrowSettings(); $('#tree-tune').showModal(); };
$('#grow-done').onclick = () => $('#tree-tune').close();
$('#tree-tune').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); }); // a tap on the backdrop
$('#tree-tune').addEventListener('close', () => {
  if (!trRoot || JSON.stringify(growSet()) === trUsed) return;
  toast('Regrowing with your new settings.');
  growTree(trRoot);
});

// Back (Android's button via api.onBack; Esc passes sheets only): an open sheet first, then the previous tab. False = nothing left, Android leaves the app.
function goBack(leave = true) {
  const menus = $$('.node-menu:not([hidden])');
  if (menus.length) { menus.forEach(m => m.parentElement.close()); return true; }
  if (!gSheet.hidden) { gSheet.hidden = true; return true; }
  if ($('#tree-tune').open) { $('#tree-tune').close(); return true; }
  if (!leave || !tabHist.length) return false;
  goingBack = true; showTab(tabHist.pop()); goingBack = false;
  return true;
}
api.onBack?.(() => goBack());
document.addEventListener('keydown', e => { if (e.key === 'Escape') goBack(false); });
// Phone sheets follow a downward drag from their top and close past 80px. Every sheet already closes on a click on itself (the scrim).
{
  let drag = null;
  document.addEventListener('touchstart', e => {
    const s = e.target.closest?.('#main :is(.node-menu, .sheet, .tune)');
    if (s && PHONE.matches && s.scrollTop <= 0 && getComputedStyle(s).position === 'fixed') drag = { s, y: e.touches[0].clientY, dy: 0 };
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!drag) return;
    drag.dy = Math.max(0, e.touches[0].clientY - drag.y);
    drag.s.style.transition = 'none';
    drag.s.style.translate = `0 ${drag.dy}px`;
  }, { passive: true });
  const end = () => {
    if (!drag) return;
    const { s, dy } = drag; drag = null;
    s.style.transition = 'translate 200ms cubic-bezier(.16,1,.3,1)';
    s.style.translate = '';
    if (dy > 80) s.click();
  };
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);
}

async function growTree(root) {
  const run = ++trRun;
  trSearch++; // a search still out must not paint its hits over this tree
  trNodes = []; trBusy = 0; trFocus = 0; trFull = false; trDigging.clear(); $('#tree-export').parentElement.hidden = true;
  trRoot = root; trUsed = JSON.stringify(growSet());
  $('#tree-hits').replaceChildren(); $('#tree-start').hidden = true;
  trWork(1);
  const ok = await api.tree(plain(root), profile.heard, run, profile.likes.map(({ source, id, artist, title }) => ({ source, id, artist, title })), plain(growSet())).catch(e => { console.error('tree', e); return null; });
  if (run !== trRun) return;
  trBusy--;
  if (ok === null) { if (!trNodes.length) showStart(true); return trState('error', "Couldn't grow the tree right now. Check your connection.", { art: 'empty-unknown', actions: [btn('Try again', () => growTree(root), 'primary')] }); }
  if (trBusy) return;
  const seen = new Set(trNodes.map(n => n && n.edgeType)), none = growSet().edges.filter(e => !seen.has(e)).map(e => EDGE_NAMES[e]);
  if (trNodes.length > 1) trState('done', none.length ? `Nothing found for: ${none.join(', ')}.` : '');
  else trState('empty', `No family found${none.length ? ` for: ${none.join(', ')}` : ' yet'}. Try More, or Tune for other ways to connect.`, { art: 'empty-unknown' });
  if (trFocus && !kinOf(trFocus).length) moreTree(trNodes[trFocus], true); // dug into a song the build left bare
  kinNote();
}
api.onTreeNode((run, n) => {
  if (run !== trRun) return;
  trNodes[n.id] = n;
  if (n.parentId == null) renderDig(); else if (n.parentId === trFocus) addKin(n, true);
  $('#tree-export').parentElement.hidden = false;
  const k = trNodes.filter(Boolean).length - 1; // a live count instead of a "Searching…" that sits over a tree already growing; cleared when the grow ends
  if (trBusy && k > 0) trState('loading', `Growing… ${k} song${k > 1 ? 's' : ''} so far`);
});

// The dig: path (root .. focus) as sleeves, the focus as a full card, its family grouped under one sign per relation.
// model nodes: {id, parentId, depth, edgeType, label, track}. The first grow brings root, children and grandchildren,
// so the first Dig is instant; a record with no family yet gets a More.
const EDGE_NAMES = { era: 'Same era', place: 'Same place', soundtrack: 'Same soundtrack', scene: 'Same scene', member: 'Member moved', builton: 'Built on', roots: 'Roots', producer: 'Same producer', label: 'Same label', related: 'Fans also play' };
function renderDig() {
  const f = trNodes[trFocus], parent = trNodes[f.parentId];
  $('#tree-start').hidden = true; $('#tree-dig').hidden = false; $('#tree-new').hidden = false;
  $('#tree-path').replaceChildren(...Dig.path(trNodes, trFocus).map(n => {
    const b = el('button', { type: 'button', className: 'crumb', onclick: () => n !== f && dig(n.id) },
      n.track.cover ? el('img', { src: n.track.cover, alt: '', width: 40, height: 40 }) : el('span', { className: 'cover-ph' }),
      el('span', { className: 'crumb-title', textContent: cleanTitle(n.track.title) }));
    b.setAttribute('aria-label', n === f ? `${n.track.title}, in focus` : `Back to ${n.track.artist} – ${n.track.title}`);
    if (n === f) b.setAttribute('aria-current', 'step');
    return el('li', {}, b);
  }));
  $('#tree-path').scrollLeft = 1e5; // phone: a long path scrolls sideways; keep the record in focus (the last sleeve) in view
  const row = trackRow(f.track, { tag: 'div', full: true, reason: Dig.reason(f, parent) || 'Where this dig started.', from: treeFrom(f) });
  const love = row.querySelector('.love');
  if (parent) row.append(rateGroup(f.track, love));
  $('#tree-focus').replaceChildren(row);
  $('#tree-family-h').textContent = `The family of “${cleanTitle(f.track.title)}”`;
  $('#tree-family').replaceChildren();
  kinOf(trFocus).forEach(n => addKin(n, false));
  kinNote();
}
function dig(id) {
  trFocus = id;
  renderDig();
  if ($('#tree-dig').getBoundingClientRect().top < 0) $('#tree-dig').scrollIntoView({ block: 'start' }); // from deep in the list: back up to the new focus
  $('#tree-focus .play')?.focus({ preventScroll: true });
  if (!kinOf(id).length && !trBusy) moreTree(trNodes[id], true);
}
function addKin(n, fresh) {
  const fam = $('#tree-family');
  let group = [...fam.children].find(g => g.dataset.edge === n.edgeType);
  if (!group) {
    const base = Dig.shared(n.label).join(' · '); // the scene / era facts every row of this group shares, shown once on its sign
    fam.append(group = el('section', { className: 'kin' }, el('h3', { className: 'kin-sign' }, edgeIcon(n.edgeType), (EDGE_NAMES[n.edgeType] || n.edgeType) + (base ? ` · ${base[0].toUpperCase()}${base.slice(1)}` : '')), el('ol', { className: 'tracks kin-rows' })));
    group.dataset.edge = n.edgeType; group.dataset.base = JSON.stringify(Dig.shared(n.label));
  }
  const row = trackRow(n.track, { reason: Dig.reason(n, trNodes[n.parentId], true, JSON.parse(group.dataset.base || '[]')), from: treeFrom(n) });
  row.append(digBtn('Dig', `Dig into ${n.track.artist} – ${n.track.title}`, () => dig(n.id)));
  if (fresh) { row.classList.add('grow'); row.addEventListener('animationend', () => row.classList.remove('grow'), { once: true }); }
  group.lastElementChild.append(row);
  kinNote();
}
// The family's last line: "+ 3 more like …", or what is happening while it is still empty.
function kinNote() {
  const f = trNodes[trFocus], b = $('#tree-more'), busy = trDigging.has(trFocus), none = !kinOf(trFocus).length;
  if (!f) return;
  b.textContent = trFull ? 'This tree is full' : busy ? 'Digging…' : `+ ${TREE_MORE} more like this`;
  b.disabled = trFull || busy;
  let p = $('#tree-family .kin-wait');
  if (!none) return p?.remove();
  if (!p) $('#tree-family').append(p = el('div', { className: 'kin-wait' }, el('img', { className: 'state-art', src: 'img/empty-deck.png', alt: '' }), el('p', {}, el('span', { className: 'kin-disc', ariaHidden: 'true' }), el('span', { className: 'kin-msg' }))));
  const wait = busy || trBusy > 0;
  p.classList.toggle('is-busy', wait); p.querySelector('.state-art').hidden = !wait;
  p.querySelector('.kin-msg').textContent = wait ? 'Digging for its family…' : 'No family found for this one yet. Try More, or Tune for other ways to connect.';
}
$('#tree-more').onclick = () => trNodes[trFocus] && moreTree(trNodes[trFocus]);

// Category icons: 16px stroke glyphs, so a branch reads by shape and label as well as colour.
const EDGE_ICONS = {
  scene: 'M8 14.5s-4.5-4.6-4.5-8a4.5 4.5 0 0 1 9 0c0 3.4-4.5 8-4.5 8zM8 8.2a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4z',
  member: 'M8 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 14c0-2.8 2.2-5 5-5s5 2.2 5 5',
  builton: 'M8 2 2 5l6 3 6-3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3',
  roots: 'M8 2v6M8 8c0 2-2 3-4 5M8 8c0 2 2 3 4 5M8 10v4',
  producer: 'M4 2v12M8 2v12M12 2v12M2.5 10h3M6.5 5h3M10.5 8h3',
  label: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  related: 'M6 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  era: 'M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3',
  place: 'M2 4l4-1.5 4 1.5 4-1.5v9.5L10 13.5 6 12 2 13.5zM6 2.5V12M10 4v9.5',
  soundtrack: 'M3 2.5h10v11H3zM6 2.5v11M10 2.5v11M3 6h3M10 6h3M3 10h3M10 10h3',
};
const edgeIcon = edge => { const s = svgEl('svg', { viewBox: '0 0 16 16', class: 'edge-icon', 'aria-hidden': 'true' }); s.append(svgEl('path', { d: EDGE_ICONS[edge] || EDGE_ICONS.related })); return s; };

async function moreTree(n, quiet) { // quiet: a Dig started it, the family just fills in; only the More button toasts
  if (trDigging.has(n.id)) return; // a second tap or a second Dig into the same leaf would add its three twice
  const run = trRun;
  trDigging.add(n.id); kinNote();
  const r = await api.treeMore(n.id).catch(() => null);
  if (run !== trRun) return;
  trDigging.delete(n.id);
  if (r && r.full) trFull = true;
  kinNote();
  if (quiet && r && !r.error && r.added) return;
  toast(!r || r.error ? "Couldn't reach the music services. Try again." : r.added ? `${r.added} more in the family of “${cleanTitle(n.track.title)}”.`
    : r.full ? 'This tree is full. Start a new one from any song.' : `No more family found for “${cleanTitle(n.track.title)}”.`);
}

