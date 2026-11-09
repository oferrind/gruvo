#!/usr/bin/env python3
"""Artist relationship graph for personalised PageRank (docs/21): MusicBrainz artist-artist relationships (members,
collaborations, supporting musicians, ...) from the core dump (CC0), plus co-credits found by colisten.py, among the artists
of the co-listening table. Appends the edges to colisten-data.js and colisten-full.json.

  python -I scripts/data/graph.py <mbdump.tar.bz2> <mbdump-derived.tar.bz2> <colisten out dir>

Also writes scene-ref.json (name, listeners, country, begin and end year, top tags per table artist) for the Crate Dig
outside check (scripts/eval/scenes.js).
"""
import base64, json, os, sys, tarfile
import numpy as np

MB, DERIVED, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
full = json.load(open(os.path.join(OUT, 'colisten-full.json'), encoding='utf8'))
row = {m: i for i, m in enumerate(full['mbids'])}
NULL = b'\\N'  # Postgres COPY text null
num = lambda b: None if b == NULL else int(b)

# Postgres COPY text: tab-separated, one row per line. artist: id, gid, name, ..., begin year 4, end year 7, area 11, begin area 17;
# l_artist_artist / l_area_area: id, link, entity0, entity1, ...; iso_3166_1: area, code.
need = {'mbdump/artist', 'mbdump/l_artist_artist', 'mbdump/l_area_area', 'mbdump/iso_3166_1'}
gid_of, links, info, area_parent, iso = {}, [], {}, {}, {}
with tarfile.open(MB, 'r|bz2') as tf:
    for m in tf:
        if m.name not in need: continue
        f = tf.extractfile(m)
        if m.name == 'mbdump/artist':
            for line in f:
                c = line.split(b'\t', 2)
                g = c[1].decode()
                if g in row:
                    gid_of[int(c[0])] = row[g]
                    c = line.rstrip(b'\n').split(b'\t')
                    info[row[g]] = (num(c[4]), num(c[7]), num(c[11]), num(c[17]))
        elif m.name == 'mbdump/l_artist_artist':
            for line in f:
                c = line.split(b'\t', 4)
                links.append((int(c[2]), int(c[3])))
        elif m.name == 'mbdump/l_area_area':  # entity0 contains entity1 ("part of")
            for line in f:
                c = line.split(b'\t', 4)
                area_parent.setdefault(int(c[3]), int(c[2]))
        else:
            for line in f:
                c = line.split(b'\t', 2)
                iso.setdefault(int(c[0]), c[1].decode().strip())  # the last column carries the line break
        need.discard(m.name)
        print(m.name, 'read', flush=True)
        if not need: break
# l_artist_artist may come before artist in the tar, so resolve ids only once both are read.
edges = {}
for a, b in links:
    if a in gid_of and b in gid_of and gid_of[a] != gid_of[b]:
        k = tuple(sorted((gid_of[a], gid_of[b]))); edges[k] = edges.get(k, 0) + 1
rel = len(edges)
for a, b, n in full.get('cocredit', []):
    if a != b: k = tuple(sorted((a, b))); edges[k] = edges.get(k, 0) + 1
pairs = np.array(sorted(edges), dtype=np.uint16).reshape(-1, 2)  # table rows < 65536
print(f'{rel} MusicBrainz relationship edges, {len(edges) - rel} more from co-credits, {len(edges)} total among {len(row)} artists')

def country(a):
    for _ in range(8):  # city -> region -> country
        if a is None or a in iso: return iso.get(a)
        a = area_parent.get(a)
    return None
# Tags (derived dump): tag id -> name, then each table artist's top 5 by votes.
tagname, votes = {}, {}
with tarfile.open(DERIVED, 'r|bz2') as tf:
    for m in tf:
        if m.name == 'mbdump/tag':
            for line in tf.extractfile(m): c = line.split(b'\t', 3); tagname[int(c[0])] = c[1].decode()
        elif m.name == 'mbdump/artist_tag':
            for line in tf.extractfile(m):
                c = line.split(b'\t', 3); r = gid_of.get(int(c[0]))
                if r is not None: votes.setdefault(r, []).append((int(c[2]), int(c[1])))
ref = []
for r in range(len(row)):
    b, e, a, ba = info.get(r, (None, None, None, None))
    ref.append([full['names'][r], full['listeners'][r], country(a) or country(ba), b, e, [tagname.get(t, '') for _, t in sorted(votes.get(r, []), reverse=True)[:5]]])
json.dump(ref, open(os.path.join(OUT, 'scene-ref.json'), 'w', encoding='utf8'))
print(f'scene-ref: {sum(1 for x in ref if x[2])} with a country, {sum(1 for x in ref if x[5])} with tags, of {len(ref)}')

full['edges'] = pairs.tolist()
json.dump(full, open(os.path.join(OUT, 'colisten-full.json'), 'w', encoding='utf8'))
p = os.path.join(OUT, 'colisten-data.js')
js = open(p, encoding='utf8').read()
js = js.replace('const T = { dims:', f'const T = {{ edges: "{base64.b64encode(pairs.tobytes()).decode()}", dims:', 1)
js = js.replace('// artist names from the MusicBrainz canonical dump (CC0).', '// artist names from the MusicBrainz canonical dump (CC0); edges: artist relationships + co-credits (MusicBrainz, CC0).', 1)
open(p, 'w', encoding='utf8').write(js)
print(f'colisten-data.js now {len(js) / 1e6:.1f} MB')
