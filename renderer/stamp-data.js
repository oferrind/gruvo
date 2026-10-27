// Genre Stamps data shared by main (src/stamps.js) and the renderer (no bundler, so a factory over the country list):
// catalogue, builder genres, labels, Roll and the stamp book. docs/06.
(function (root) {
function StampData(COUNTRIES, GENRE_DATA = []) {
const norm = s => String(s || '').normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const ALL_CC = Object.assign({}, ...Object.values(COUNTRIES));
const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

// Builder genres -> MB tags (OR). Never a nationality tag: country: already covers the place.
const GENRES = {
  rock: ['rock', ['rock', 'alternative rock', 'punk', 'hard rock']],
  pop: ['pop', ['pop', 'synthpop', 'dance-pop']],
  punk: ['punk', ['punk', 'punk rock', 'post-punk']],
  metal: ['metal', ['metal', 'heavy metal', 'thrash metal', 'death metal', 'power metal']],
  'black-metal': ['black metal', ['black metal']],
  grunge: ['grunge', ['grunge', 'alternative rock']],
  psych: ['psych', ['psychedelic rock', 'psychedelic', 'anatolian rock']],
  prog: ['prog', ['progressive rock', 'art rock']],
  'new-wave': ['new wave', ['new wave', 'post-punk', 'synthpop']],
  indie: ['indie', ['indie', 'indie rock', 'indie pop', 'post-rock']],
  jazz: ['jazz', ['jazz', 'ethio-jazz', 'jazz fusion', 'bebop']],
  soul: ['soul', ['soul', 'rhythm and blues', 'motown']],
  funk: ['funk', ['funk', 'afro-funk']],
  disco: ['disco', ['disco', 'italo-disco', 'italo disco']],
  'hip-hop': ['hip hop', ['hip hop', 'rap', 'old school hip hop']],
  electronic: ['electronic', ['electronic', 'techno', 'house']],
  'trip-hop': ['trip hop', ['trip hop', 'downtempo']],
  krautrock: ['krautrock', ['krautrock', 'kosmische musik']],
  folk: ['folk', ['folk', 'folk rock', 'singer-songwriter']],
  blues: ['blues', ['blues', 'desert blues']],
  country: ['country', ['country']],
  reggae: ['reggae', ['reggae', 'roots reggae', 'dub', 'dancehall']],
  ska: ['ska', ['ska', 'rocksteady']],
  afrobeat: ['Afrobeat', ['afrobeat', 'highlife', 'afro-funk']],
  afrobeats: ['Afrobeats', ['afrobeats', 'afropop']],
  highlife: ['highlife', ['highlife']],
  soukous: ['soukous', ['soukous', 'rumba']],
  cumbia: ['cumbia', ['cumbia', 'chicha']],
  salsa: ['salsa & son', ['salsa', 'son', 'mambo', 'son cubano']],
  mpb: ['MPB', ['mpb', 'tropicália', 'bossa nova', 'samba']],
  fado: ['fado', ['fado']],
  chanson: ['chanson', ['chanson', 'yé-yé']],
  filmi: ['filmi', ['filmi', 'bollywood', 'soundtrack']],
  'city-pop': ['city pop', ['city pop', 'aor']],
};

const DEMONYM = { NG: 'Nigerian', GH: 'Ghanaian', ET: 'Ethiopian', ML: 'Malian', SN: 'Senegalese', CD: 'Congolese', ZA: 'South African',
  KE: 'Kenyan', CM: 'Cameroonian', EG: 'Egyptian', MA: 'Moroccan', DZ: 'Algerian', ZW: 'Zimbabwean', AO: 'Angolan', CV: 'Cape Verdean',
  BJ: 'Beninese', JP: 'Japanese', KR: 'Korean', CN: 'Chinese', TW: 'Taiwanese', IN: 'Indian', ID: 'Indonesian', TH: 'Thai', VN: 'Vietnamese',
  PH: 'Filipino', TR: 'Turkish', IR: 'Iranian', IL: 'Israeli', LB: 'Lebanese', PK: 'Pakistani', GB: 'British', FR: 'French', DE: 'German',
  IT: 'Italian', ES: 'Spanish', PT: 'Portuguese', NL: 'Dutch', SE: 'Swedish', NO: 'Norwegian', FI: 'Finnish', IS: 'Icelandic', IE: 'Irish',
  PL: 'Polish', CZ: 'Czech', HU: 'Hungarian', GR: 'Greek', RS: 'Serbian', UA: 'Ukrainian', RU: 'Russian', US: 'US', CA: 'Canadian',
  MX: 'Mexican', JM: 'Jamaican', CU: 'Cuban', TT: 'Trinidadian', HT: 'Haitian', BR: 'Brazilian', AR: 'Argentine', CO: 'Colombian',
  PE: 'Peruvian', CL: 'Chilean', VE: 'Venezuelan', UY: 'Uruguayan', AU: 'Australian', NZ: 'NZ' };

// Live-verified 2026-10-23 (docs/06 §3): [decade, cc, genre slug, label, tags, blurb].
const CATALOGUE = [
  [1990, 'JP', 'rock', '90s Japanese rock', 'rock, j-rock, alternative rock, visual kei, punk', "X Japan's heirs: eyeliner, riffs, stadium drama"],
  [1980, 'JP', 'city-pop', '80s Japanese city pop', 'city pop, j-pop, funk, aor', 'Neon Tokyo nights, glossy and bittersweet'],
  [1970, 'JP', 'psych', '70s Japanese psych & folk', 'psychedelic rock, folk rock, progressive rock', "Happy End and Flower Travellin' Band rewire the West"],
  [1970, 'TR', 'psych', '70s Turkish psych', 'anatolian rock, psychedelic rock, rock', 'Saz meets fuzz pedal'],
  [1970, 'IN', 'filmi', '70s Indian filmi', 'filmi, bollywood, soundtrack', "Bollywood's golden orchestras"],
  [1980, 'IL', 'pop', '80s Israeli music', 'pop, rock, israeli, mizrahi, folk, new wave', 'Ofra Haza, Mashina, Rita: Tel Aviv goes electric'],
  [1980, 'PH', 'pop', '80s Filipino OPM', 'opm, pinoy rock, pop', 'Manila balladeers and the APO sound'],
  [1970, 'ET', 'jazz', '70s Ethiopian jazz', 'ethio-jazz, jazz, funk, soul', "Addis Ababa's swinging Éthiopiques years"],
  [1970, 'NG', 'afrobeat', '70s Nigerian Afrobeat', 'afrobeat, highlife, afro-funk, funk', 'Fela, Onyeabor and Lagos heat'],
  [2010, 'NG', 'afrobeats', '2010s Nigerian Afrobeats', 'afrobeats, afropop, afrobeat', 'Burna Boy and the export boom'],
  [1970, 'GH', 'highlife', '70s Ghanaian highlife', 'highlife, afrobeat', "Ebo Taylor's horn-driven Accra"],
  [1980, 'ML', 'blues', '80s Malian desert blues', 'desert blues, world, mandinka', 'Ali Farka Touré, Salif Keita, the Sahel guitar'],
  [1980, 'CD', 'soukous', '80s Congolese soukous', 'soukous, rumba', 'Kinshasa guitars that never stop dancing'],
  [1980, 'ZA', 'pop', '80s South African bubblegum', 'bubblegum, mbaqanga, disco', 'Township synth-pop: Yvonne Chaka Chaka, Harari'],
  [1960, 'BR', 'mpb', '60s Brazilian Tropicália', 'tropicália, tropicalia, mpb, bossa nova', 'Caetano, Gil and Gal blow up bossa'],
  [1970, 'BR', 'mpb', '70s Brazilian MPB', 'mpb, samba, bossa nova', 'Elis and Chico under the dictatorship'],
  [1980, 'AR', 'rock', '80s Argentine rock', 'rock nacional, rock, rock en español', 'Rock nacional after the junta'],
  [1970, 'CO', 'cumbia', '70s Colombian cumbia', 'cumbia, salsa, tropical', 'Coastal accordions and Medellín horns'],
  [1970, 'PE', 'cumbia', '70s Peruvian chicha', 'chicha, cumbia', 'Amazonian surf guitars over cumbia'],
  [1950, 'CU', 'salsa', '50s Cuban son & mambo', 'son, mambo, son cubano, bolero', 'Havana before the revolution'],
  [1960, 'JM', 'ska', '60s Jamaican ska', 'ska, rocksteady', "Kingston's offbeat, before reggae"],
  [1970, 'JM', 'reggae', '70s Jamaican reggae', 'reggae, roots reggae, dub', "Roots, dub and King Tubby's mixing desk"],
  [1980, 'MX', 'rock', '80s Mexican rock', 'rock en español, rock', 'Rock in Spanish breaks out of the underground'],
  [1970, 'CL', 'folk', '70s Chilean nueva canción', 'nueva canción, folk', "Violeta Parra's protest song"],
  [1960, 'US', 'soul', '60s US soul', 'soul, motown, rhythm and blues, northern soul', 'Detroit and Memphis on 45s'],
  [1990, 'US', 'grunge', '90s US grunge', 'grunge, alternative rock', 'Seattle flannel and feedback'],
  [1980, 'US', 'hip-hop', '80s US hip hop', 'hip hop, old school hip hop, rap', 'The golden-age boom-bap'],
  [1970, 'CA', 'folk', '70s Canadian folk', 'folk, singer-songwriter, folk rock', 'Lightfoot, Buffy Sainte-Marie, coffeehouse songs'],
  [1960, 'GB', 'rock', '60s British beat', 'merseybeat, british invasion, beat, rock and roll', 'Liverpool to London on a Vox amp'],
  [1990, 'GB', 'trip-hop', '90s British trip hop', 'trip hop, downtempo', "Bristol's slow, smoky beats"],
  [1970, 'DE', 'krautrock', '70s German krautrock', 'krautrock, kosmische musik, electronic, progressive rock', 'Motorik grooves and synth drones'],
  [1960, 'FR', 'chanson', '60s French yé-yé', 'yé-yé, chanson, french pop', 'Paris pop goes teenage'],
  [1980, 'IT', 'disco', '80s Italo disco', 'italo-disco, italo disco, synthpop, disco', 'Arpeggiators in broken English'],
  [2000, 'SE', 'metal', '2000s Swedish metal', 'metal, melodic death metal, death metal, heavy metal, power metal', 'The Gothenburg sound goes global'],
  [1990, 'NO', 'black-metal', '90s Norwegian black metal', 'black metal', 'Mayhem, Emperor: cold and lo-fi'],
  [2000, 'FI', 'metal', '2000s Finnish metal', 'metal, power metal, folk metal, symphonic metal', 'Nightwish and operatic thunder'],
  [1990, 'RU', 'rock', '90s Russian rock', 'russian rock, rock, alternative rock', "DDT and Kino's heirs after the USSR"],
  [1970, 'PT', 'fado', '70s Portuguese fado', 'fado', 'Amália and the Carnation Revolution'],
  [1980, 'ES', 'new-wave', '80s Spanish movida', 'new wave, pop rock, movida madrileña', 'Madrid after Franco, all night long'],
  [2000, 'IS', 'indie', '2000s Icelandic indie', 'indie, post-rock, electronic, indie pop', "Reykjavík's quiet experimentalists"],
  [1970, 'AU', 'rock', '70s Australian pub rock', 'pub rock, hard rock, rock', 'AC/DC and the beer-barn circuit'],
  [1980, 'AU', 'new-wave', '80s Australian new wave', 'new wave, post-punk, synthpop', 'Sydney synths and jangle'],
  [1980, 'NZ', 'indie', '80s NZ Flying Nun', 'dunedin sound, indie pop, jangle pop, indie rock', 'The Bats, Tall Dwarfs, the Dunedin sound'],
].map(([decade, cc, genre, label, tags, blurb]) => ({ id: `${decade}-${cc}-${genre}`, decade, cc, genre, label, tags: tags.split(', '), blurb }));
const BY_ID = new Map(CATALOGUE.map(s => [s.id, s]));

// The stamp book's continents: the Caribbean and Mexico read as Latin America here, not as "North America".
const LATIN = new Set([...Object.keys(COUNTRIES['South America']), 'MX', 'JM', 'CU', 'TT', 'HT']);
const CONTINENTS = ['Africa', 'Asia', 'Europe', 'North America', 'Latin America & Caribbean', 'Oceania'];
const continentOf = cc => (LATIN.has(cc) ? 'Latin America & Caribbean' : Object.keys(COUNTRIES).find(k => Object.hasOwn(COUNTRIES[k], cc)));

const decadeName = d => (d >= 2000 ? `${d}s` : `${d % 100}s`.padStart(3, '0'));

// ---------- genre atlas (docs/12): [slug, MB name, family, tier C/D/O, parent slug, songs, "artist|artist|artist"] ----------
const FAMILIES = { rock: 'Rock', metal: 'Metal', punk: 'Punk', pop: 'Pop', electronic: 'Electronic', 'hip-hop': 'Hip hop', 'rnb-soul': 'R&B / soul', jazz: 'Jazz',
  blues: 'Blues', folk: 'Folk', country: 'Country', reggae: 'Reggae', latin: 'Latin', classical: 'Classical', experimental: 'Experimental', ambient: 'Ambient', world: 'World', other: 'Other' };
const TIERS = { C: 'Common', D: 'Deep', O: 'Obscure' };
const caps = n => n.replace(/(^|[\s-])(uk|us|idm|edm|ebm|mpb|opm|nz|dj|r&b)(?=$|[\s-])/g, (m, p, w) => p + w.toUpperCase()); // MB names are lowercase
const ATLAS = new Map(GENRE_DATA.map(([slug, name, family, tier, parent, songs, artists, wiki = 1]) =>
  [slug, { slug, name, label: caps(name).charAt(0).toUpperCase() + caps(name).slice(1), family, tier, parent, songs, wiki, artists: artists ? artists.split('|') : [] }]));
const kids = new Map();
for (const e of ATLAS.values()) if (ATLAS.has(e.parent)) kids.set(e.parent, [...(kids.get(e.parent) || []), e.slug]);

// Key: "<decade>-<CC>-<genre>", each part optional but not all empty ("--zeuhl" is genre-only).
const KEY = /^(\d{4})?-([A-Z]{2})?-([a-z0-9-]{0,40})$/;
const atlasCache = new Map();
function atlasStamp(id, e, decade, cc) {
  if (atlasCache.has(id)) return atlasCache.get(id);
  const par = ATLAS.get(e.parent), heard = e.artists.length ? ` Heard here: ${e.artists.join(', ')}.` : '';
  const s = { id, decade: decade || null, cc, genre: e.slug, tags: [e.name], atlas: true, family: e.family, tier: e.tier, parent: e.parent, artists: e.artists,
    label: decade || cc ? `${decade ? `${decadeName(decade)} ` : ''}${cc ? `${DEMONYM[cc]} ` : ''}${caps(e.name)}` : e.label,
    blurb: `A branch of ${par ? par.label : FAMILIES[e.family].toLowerCase()}.${heard}` };
  atlasCache.set(id, s);
  return s;
}

// id -> stamp, or null. Catalogue first, then an atlas genre ("--zeuhl"), then a builder combo; "1980-JP-" is a legacy Passport stamp (no genre).
function makeStamp(id) {
  if (BY_ID.has(id)) return BY_ID.get(id);
  const m = KEY.exec(String(id));
  if (!m || (!m[1] && !m[2] && !m[3]) || (m[2] && !Object.hasOwn(ALL_CC, m[2]))) return null;
  const decade = Number(m[1] || 0), cc = m[2] || '', genre = m[3];
  if (genre && ATLAS.has(genre) && !(decade && cc && Object.hasOwn(GENRES, genre))) return !decade || DECADES.includes(decade) ? atlasStamp(id, ATLAS.get(genre), decade, cc) : null;
  if (!decade || !cc) return null;
  if (!genre) return decade >= 1900 && decade % 10 === 0 ? { id, decade, cc, genre, tags: [], label: `${decadeName(decade)} ${ALL_CC[cc]}`, legacy: true } : null;
  if (!DECADES.includes(decade) || !Object.hasOwn(GENRES, genre)) return null;
  return { id, decade, cc, genre, tags: GENRES[genre][1], label: `${decadeName(decade)} ${DEMONYM[cc]} ${GENRES[genre][0]}`, custom: true };
}

// ---------- Roll ----------
// One roller over every shape: 30% a bare genre ("Shoegaze"), 10% decade + genre ("1960s Classical"), 10% place + genre ("British shoegaze"),
// 10% a catalogue scene moved one decade, 40% a catalogue scene ("1990s Japanese city pop"). Partial shapes come from catalogue scenes, so they are real.
// Weights: taste-tag overlap x3, uncollected x2; the last 5 rolls never repeat. Atlas tiers weigh Common 4, Deep 2, Obscure 0 (1 when Adventurous).
// Adventurous: after 2 rolls in a row on continents (atlas: families) you already hold, the 3rd is forced onto one you don't.
function roll({ held = {}, recent = [], topTags = [], adventurous = false, streak = 0, gstreak = 0, short = [] } = {}, rand = Math.random) {
  const heldCont = new Set(Object.keys(held).map(k => continentOf(k.split('-')[1])));
  const fresh = CONTINENTS.filter(c => !heldCont.has(c));
  const only = adventurous && streak >= 2 && fresh.length ? new Set(fresh) : null;
  const ok = s => s && !recent.includes(s.id) && !short.includes(s.id) && (!only || only.has(continentOf(s.cc)));
  const taste = new Set(topTags.map(norm));
  const kind = rand();
  if (ATLAS.size && !only && kind < 0.3) {
    const heldFam = new Set(Object.keys(held).map(k => (ATLAS.get(k.replace(/^-+/, '')) || {}).family).filter(Boolean));
    const all = [...ATLAS.values()].filter(e => !recent.includes(`--${e.slug}`) && !short.includes(`--${e.slug}`));
    const newFam = all.filter(e => !heldFam.has(e.family));
    const pool = adventurous && gstreak >= 2 && newFam.length ? newFam : all;
    // Well-known genres roll most; tier O (under 100 MB recordings) only when Adventurous is on, and only with an English Wikipedia article.
    const tierW = { C: 4, D: 2, O: adventurous ? 1 : 0 };
    const w = pool.map(e => (tierW[e.tier] || 0) * (e.tier === 'O' && !e.wiki ? 0 : 1) * (taste.has(norm(e.name)) || taste.has(norm(e.parent)) ? 3 : 1) * (held[`--${e.slug}`] ? 1 : 2));
    let r = rand() * w.reduce((a, b) => a + b, 0);
    const e = r > 0 && pool.find((x, i) => (r -= w[i]) < 0);
    if (e) return makeStamp(`--${e.slug}`);
  }
  if (ATLAS.size && kind >= 0.3 && kind < 0.5) { // drop the place or the decade from a real scene whose genre is in the atlas
    for (let i = 0; i < 30; i++) {
      const c = CATALOGUE[Math.floor(rand() * CATALOGUE.length)];
      const s = ATLAS.has(c.genre) ? makeStamp(kind < 0.4 ? `${c.decade}--${c.genre}` : `-${c.cc}-${c.genre}`) : null;
      if (s && s.atlas && ok(s)) return s;
    }
  }
  if (kind >= 0.5 && kind < 0.6) {
    // A builder roll is a catalogue scene moved one decade: a real place and genre, never a random country x genre that cannot fill.
    for (let i = 0; i < 30; i++) {
      const c = CATALOGUE[Math.floor(rand() * CATALOGUE.length)], d = c.decade + (rand() < 0.5 ? -10 : 10);
      const s = Object.hasOwn(GENRES, c.genre) && DECADES.includes(d) ? makeStamp(`${d}-${c.cc}-${c.genre}`) : null;
      if (s && s.custom && ok(s)) return s;
    }
  }
  const pool = CATALOGUE.filter(ok);
  const w = pool.map(s => (s.tags.some(t => taste.has(norm(t))) ? 3 : 1) * (held[s.id] ? 1 : 2));
  let r = rand() * w.reduce((a, b) => a + b, 0);
  return pool.find((s, i) => (r -= w[i]) < 0) || pool[pool.length - 1] || CATALOGUE[0];
}


// Genres to browse: normalised substring match on the name, prefix hits first, then A-Z. {total, stamps}.
function searchGenres(q = '', { family = '', tier = '' } = {}, limit = 60) {
  const n = norm(q);
  const hits = [...ATLAS.values()].filter(e => (!family || e.family === family) && (!tier || e.tier === tier) && norm(e.name).includes(n));
  hits.sort((a, b) => (norm(b.name).startsWith(n) - norm(a.name).startsWith(n)) || a.name.localeCompare(b.name));
  return { total: hits.length, stamps: hits.slice(0, limit).map(e => makeStamp(`--${e.slug}`)) };
}
// Scenes to browse: every word of q, normalised (accents and case ignored), somewhere in the scene's name, blurb, tags, decade or place.
function searchScenes(q = '', continent = '') {
  const words = String(q).split(/\s+/).map(norm).filter(Boolean);
  return CATALOGUE.filter(s => (!continent || continentOf(s.cc) === continent) && words.every(w =>
    [s.label, s.blurb, ...s.tags, s.decade, ALL_CC[s.cc], DEMONYM[s.cc], continentOf(s.cc)].some(f => norm(f).includes(w))));
}
// The parent, then up to 4 more (2 children first, siblings fill the rest). Never the genre itself.
function nearby(slug) {
  const e = ATLAS.get(slug);
  if (!e) return [];
  const par = ATLAS.has(e.parent) ? e.parent : '', own = kids.get(slug) || [], sib = par ? (kids.get(par) || []).filter(x => x !== slug) : [];
  return [par, ...[...own.slice(0, 2), ...sib, ...own.slice(2)].slice(0, 4)].filter(Boolean).map(x => makeStamp(`--${x}`));
}

// ---------- collection ----------
const tier = n => (n >= 3 ? 'gold' : n >= 1 ? 'bronze' : null); // 1 love earns a stamp, 3 make it gold

// profile.stamps -> the book: catalogue slots per continent (earned or empty), custom stamps beside them, legacy apart.
function book(held = {}) {
  const ids = Object.keys(held).filter(k => held[k] > 0), stamps = ids.map(makeStamp).filter(Boolean);
  const slot = s => ({ stamp: s, count: held[s.id] || 0, tier: tier(held[s.id] || 0) });
  const groups = CONTINENTS.map(continent => {
    const cat = CATALOGUE.filter(s => continentOf(s.cc) === continent);
    const own = stamps.filter(s => (s.custom || s.atlas) && s.cc && continentOf(s.cc) === continent); // builder combos and place + genre stamps
    const earned = stamps.filter(s => continentOf(s.cc) === continent).length; // legacy counts toward the continent, not the genre
    return { continent, slots: [...cat, ...own].map(slot), earned, total: cat.length };
  });
  const atlas = stamps.filter(s => s.atlas && !s.decade && !s.cc), noPlace = stamps.filter(s => s.atlas && !s.cc); // decade + genre stamps sit with their family
  const families = Object.keys(FAMILIES).map(family => ({ family, slots: noPlace.filter(s => s.family === family).map(slot),
    earned: atlas.filter(s => s.family === family).length, total: [...ATLAS.values()].filter(e => e.family === family).length })).filter(f => f.total);
  return { groups, legacy: stamps.filter(s => s.legacy).map(slot), catalogue: stamps.filter(s => BY_ID.has(s.id)).length, families,
    atlas: atlas.length, atlasTotal: ATLAS.size, custom: stamps.filter(s => s.custom).length, decades: [...new Set(stamps.map(s => s.decade).filter(Boolean))].sort() };
}

return { ATLAS, FAMILIES, TIERS, nearby, searchGenres, searchScenes, GENRES, DEMONYM, CATALOGUE, CONTINENTS, DECADES, ALL_CC, continentOf, decadeName, makeStamp, roll, tier, book };
}
if (typeof module === 'object' && module.exports) module.exports = StampData;
else root.StampData = StampData;
})(this);
