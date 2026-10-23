// Genre Stamps data shared by main (src/stamps.js) and the renderer (no bundler, so a factory over the country list):
// catalogue, builder genres, labels, Roll and the stamp book. docs/06.
(function (root) {
function StampData(COUNTRIES) {
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

// id -> stamp, or null. Catalogue first, then a builder combo; "1980-JP-" is a legacy Passport stamp (no genre).
function makeStamp(id) {
  if (BY_ID.has(id)) return BY_ID.get(id);
  const m = /^(\d{4})-([A-Z]{2})-([a-z-]*)$/.exec(String(id));
  if (!m || !Object.hasOwn(ALL_CC, m[2])) return null;
  const decade = Number(m[1]), cc = m[2], genre = m[3];
  if (!genre) return decade >= 1900 && decade % 10 === 0 ? { id, decade, cc, genre, tags: [], label: `${decadeName(decade)} ${ALL_CC[cc]}`, legacy: true } : null;
  if (!DECADES.includes(decade) || !Object.hasOwn(GENRES, genre)) return null;
  return { id, decade, cc, genre, tags: GENRES[genre][1], label: `${decadeName(decade)} ${DEMONYM[cc]} ${GENRES[genre][0]}`, custom: true };
}

// ---------- Roll ----------
// 70% catalogue, 30% builder combo. Weights: taste-tag overlap x3, uncollected x2; the last 5 rolls never repeat.
// Adventurous: after 2 rolls in a row on continents you already hold, the 3rd is forced onto one you don't.
function roll({ held = {}, recent = [], topTags = [], adventurous = true, streak = 0, short = [] } = {}, rand = Math.random) {
  const heldCont = new Set(Object.keys(held).map(k => continentOf(k.split('-')[1])));
  const fresh = CONTINENTS.filter(c => !heldCont.has(c));
  const only = adventurous && streak >= 2 && fresh.length ? new Set(fresh) : null;
  const ok = s => s && !recent.includes(s.id) && (!only || only.has(continentOf(s.cc)));
  const taste = new Set(topTags.map(norm));
  if (rand() < 0.3) {
    const ccs = Object.keys(ALL_CC), gs = Object.keys(GENRES);
    for (let i = 0; i < 30; i++) {
      const s = makeStamp(`${DECADES[Math.floor(rand() * 7)]}-${ccs[Math.floor(rand() * ccs.length)]}-${gs[Math.floor(rand() * gs.length)]}`);
      if (ok(s) && !short.includes(s.id)) return s;
    }
  }
  const pool = CATALOGUE.filter(ok);
  const w = pool.map(s => (s.tags.some(t => taste.has(norm(t))) ? 3 : 1) * (held[s.id] ? 1 : 2));
  let r = rand() * w.reduce((a, b) => a + b, 0);
  return pool.find((s, i) => (r -= w[i]) < 0) || pool[pool.length - 1] || CATALOGUE[0];
}


// ---------- collection ----------
const tier = n => (n >= 3 ? 'gold' : n >= 1 ? 'bronze' : null); // 1 love earns a stamp, 3 make it gold

// profile.stamps -> the book: catalogue slots per continent (earned or empty), custom stamps beside them, legacy apart.
function book(held = {}) {
  const ids = Object.keys(held).filter(k => held[k] > 0), stamps = ids.map(makeStamp).filter(Boolean);
  const slot = s => ({ stamp: s, count: held[s.id] || 0, tier: tier(held[s.id] || 0) });
  const groups = CONTINENTS.map(continent => {
    const cat = CATALOGUE.filter(s => continentOf(s.cc) === continent);
    const own = stamps.filter(s => s.custom && continentOf(s.cc) === continent);
    const earned = stamps.filter(s => continentOf(s.cc) === continent).length; // legacy counts toward the continent, not the genre
    return { continent, slots: [...cat, ...own].map(slot), earned, total: cat.length };
  });
  return { groups, legacy: stamps.filter(s => s.legacy).map(slot), catalogue: stamps.filter(s => BY_ID.has(s.id)).length,
    custom: stamps.filter(s => s.custom).length, decades: [...new Set(stamps.map(s => s.decade))].sort() };
}

return { GENRES, DEMONYM, CATALOGUE, CONTINENTS, DECADES, ALL_CC, continentOf, decadeName, makeStamp, roll, tier, book };
}
if (typeof module === 'object' && module.exports) module.exports = StampData;
else root.StampData = StampData;
})(this);
