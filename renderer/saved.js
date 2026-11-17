// ---------- Saved ----------
// Loved | Recent.
function setSeg(seg) {
  $('#saved').dataset.seg = seg;
  $('#seg-loved').setAttribute('aria-pressed', String(seg === 'loved')); $('#seg-recent').setAttribute('aria-pressed', String(seg === 'recent'));
  ls('savedSeg', seg);
}
$('#seg-loved').onclick = () => setSeg('loved');
$('#seg-recent').onclick = () => setSeg('recent');
function renderSaved() {
  setSeg(ls('savedSeg') === 'recent' ? 'recent' : 'loved');
  fillCrate($('#saved-recent'), $('#saved-recent-count'));
  $('#saved-like-count').textContent = profile.likes.length;
  $('#saved-export').parentElement.hidden = !profile.likes.length;
  // Lately: one sentence from your loves and picks, not a stats table.
  $('#lately').textContent = Dig.lately(profile.likes, c => countryNames[c] || c, profile.prefs.genres.map(g => Dig.shopGenre(g.name)).filter(Boolean)) || 'Love a few records and your taste starts to show here.';
  const list = $('#saved-list');
  list.replaceChildren(...profile.likes.slice().reverse().map((t, i) => {
    const row = trackRow(t, { extra: extraOf(t), full: true, // re-loving keeps the stamp
      reason: [t.country && `${countryNames[t.country] || t.country}, ${t.decade}s`, t.ts && `Loved ${day(t.ts)}`].filter(Boolean).join(' · ') });
    row.append(el('div', { className: 'node-actions' }, moreMenu(row, `saved-menu-${i}`, `${t.artist} – ${t.title}`))); // About and Full song behind ⋯, as on the Tree
    return row;
  }));
  if (!profile.likes.length) list.append(el('li', { className: 'state empty' }, el('img', { className: 'state-art', src: 'img/empty-crate.png', alt: '' }),
    el('p', { textContent: 'Nothing saved yet. Press Love on any track to keep it here.' }),
    el('div', { className: 'row' }, btn('Start a Blind Test', () => showTab('blind'), 'primary'), btn('Open Crate Dig', () => showTab('stamps')))));
}

// One short date everywhere: "26 Oct", with the year only when it is not this year ("26 Oct 2025").
const day = ts => { const d = new Date(ts); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }); };
// Recent finds: tonight's reveals and your newest loves, one crate of sleeves (Saved > Recent).
function fillCrate(list, count) {
  const seen = new Set(), finds = [];
  for (const { t, kind, extra } of tonight) finds.push({ t, extra, reason: `You said ${VERDICT[kind]} tonight` });
  for (const t of profile.likes.slice().reverse()) finds.push({ t, extra: extraOf(t), reason: t.ts ? `Loved ${day(t.ts)}` : 'Loved' });
  const crate = finds.filter(({ t }) => !seen.has(likeKey(t)) && seen.add(likeKey(t))).slice(0, 8);
  count.textContent = crate.length || '';
  list.replaceChildren(...(crate.length ? crate.map(({ t, extra, reason }) => trackRow(t, { extra, reason }))
    : [el('li', { className: 'state empty' }, el('p', { textContent: 'Nothing in the crate yet. Rate a mystery or love a track anywhere and it lands here.' }))]));
}

