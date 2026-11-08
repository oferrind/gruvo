#!/usr/bin/env python3
"""Co-listening artist embeddings from raw ListenBrainz MLHD+ listens (CC0), named via the MusicBrainz canonical dump (CC0).

  python -I scripts/data/colisten.py <mlhdplus-complete-X.tar> <musicbrainz-canonical-dump-*.tar.zst> <out dir>
                                     [--users 30000] [--dims 48] [--keep 40000]

1. Stream the tar (never unpacked): per user, distinct artists with play counts and the time each was first heard.
2. Hold out 10% of users: their last-discovered 20% of artists are the targets (docs/20 step 5 benchmark).
3. Implicit ALS (Hu, Koren, Volinsky 2008) on log-scaled plays of the rest.
4. Benchmark: recall/NDCG@50 of held-out discoveries, ALS vs popularity vs random.
5. Export the `keep` most-listened artists: renderer/colisten-data.js (int8 vectors, base64) + a full JSON for the harness.
Inputs and outputs stay outside the repo except the compact table; no personal data is read.
"""
import io, json, math, sys, tarfile, time, unicodedata, base64
import numpy as np, pandas as pd, scipy.sparse as sp, zstandard

args = sys.argv[1:]
opt = lambda k, d: type(d)(args[args.index(k) + 1]) if k in args else d
TAR, CANON, OUT = args[0], args[1], args[2]
MAX_USERS, DIMS, KEEP, MIN_USERS = opt('--users', 30000), opt('--dims', 48), opt('--keep', 40000), 15
rng = np.random.default_rng(1)

def norm(s):  # = src/music.js norm(): NFKD, lower case, letters and digits only
    return ''.join(c for c in unicodedata.normalize('NFKD', str(s)).lower() if unicodedata.category(c)[0] in 'LN')

# ---- 1. listens -> (user, artist, plays, first_ts)
aid, U, A, P, T = {}, [], [], [], []
dctx, t0, users = zstandard.ZstdDecompressor(), time.time(), 0
with tarfile.open(TAR, 'r|') as tf:
    for m in tf:
        if not m.isfile() or not m.name.endswith('.zst'): continue
        raw = dctx.stream_reader(tf.extractfile(m)).read()
        if not raw: continue
        df = pd.read_csv(io.BytesIO(raw), sep='\t', header=None, usecols=[0, 1], names=['ts', 'a'], dtype={'ts': 'float64', 'a': 'string'}, on_bad_lines='skip')
        df = df.dropna()
        if len(df) < 20: continue
        g = df.groupby('a', sort=False)['ts'].agg(['size', 'min'])
        ids = np.fromiter((aid.setdefault(a.split(',', 1)[0], len(aid)) for a in g.index), np.int64, len(g))
        U.append(np.full(len(g), users, np.int32)); A.append(ids); P.append(g['size'].to_numpy(np.int32)); T.append(g['min'].to_numpy())
        users += 1
        if users % 2000 == 0: print(f'{users} users, {len(aid)} artists, {time.time() - t0:.0f}s', flush=True)
        if users >= MAX_USERS: break
U, A, P, T = map(np.concatenate, (U, A, P, T))
print(f'read {users} users, {len(P)} user-artist pairs, {int(P.sum())} listens, {len(aid)} artists')

# keep artists heard by >= MIN_USERS listeners; reindex
lis = np.bincount(A, minlength=len(aid))
JUNK = {aid.get(j, -1) for j in ('89ad4ac3-39f7-470e-963a-56509c546377', '125ec42a-7229-4250-afc5-e057484327fe')}  # Various Artists, [unknown]
ok = (lis[A] >= MIN_USERS) & ~np.isin(A, list(JUNK))
U, A, P, T = U[ok], A[ok], P[ok], T[ok]
keep_ids = np.unique(A); remap = np.full(len(aid), -1, np.int64); remap[keep_ids] = np.arange(len(keep_ids)); A = remap[A]
mbid = np.empty(len(aid), object)
for k, v in aid.items(): mbid[v] = k
mbid = mbid[keep_ids]; nA = len(keep_ids)

# ---- 2. held-out users: oldest 80% of their artists are history, the newest-discovered 20% the targets
test_users = set(rng.choice(users, max(1, users // 10), replace=False).tolist())
is_test = np.isin(U, list(test_users))
target = np.zeros(len(U), bool)
for u in test_users:
    ix = np.flatnonzero(U == u)
    if len(ix) < 10: continue
    order = ix[np.argsort(T[ix])]
    target[order[int(len(order) * 0.8):]] = True
tr = ~target
w = np.log1p(P[tr]).astype(np.float32)
X = sp.csr_matrix((w, (U[tr], A[tr])), shape=(users, nA))

# ---- 3. implicit ALS
from implicit.als import AlternatingLeastSquares
from threadpoolctl import threadpool_limits
with threadpool_limits(1, 'blas'):
    als = AlternatingLeastSquares(factors=DIMS, regularization=0.05, alpha=8.0, iterations=20, random_state=1)
    als.fit(X, show_progress=False)
V = np.asarray(als.item_factors)[:, :DIMS] if hasattr(als, 'item_factors') else None
V = V / (np.linalg.norm(V, axis=1, keepdims=True) + 1e-9)

# ---- 4. benchmark on held-out discoveries (artist level): score = mean cosine to the user's history artists
pop = np.bincount(A[tr], minlength=nA).astype(float)
def evaluate(score_fn, K=50):
    rec, ndcg, n = 0.0, 0.0, 0
    for u in test_users:
        ix = np.flatnonzero(U == u); tg = set(A[ix[target[ix]]].tolist()); hist = A[ix[~target[ix]]]
        if not tg or len(hist) < 5: continue
        s = score_fn(hist).copy(); s[hist] = -np.inf
        top = np.argpartition(-s, K)[:K]; top = top[np.argsort(-s[top])]
        hits = [1.0 if a in tg else 0.0 for a in top]
        rec += sum(hits) / min(len(tg), K)
        ndcg += sum(h / math.log2(i + 2) for i, h in enumerate(hits)) / sum(1 / math.log2(i + 2) for i in range(min(len(tg), K)))
        n += 1
    return {'recall@50': round(rec / n, 4), 'ndcg@50': round(ndcg / n, 4), 'users': n}
bench = {
    'random': evaluate(lambda h: rng.random(nA)),
    'popular': evaluate(lambda h: pop),
    'als co-listening': evaluate(lambda h: V @ V[h].mean(0)),
}
print(json.dumps(bench, indent=1))

# ---- names from the canonical dump: single-artist credits give mbid -> name
class Stream(io.RawIOBase):  # pandas asks a file if it can seek; a tar stream member can't answer, so wrap it
    def __init__(self, f): self.f = f
    def readable(self): return True
    def readinto(self, b): d = self.f.read(len(b)); b[:len(d)] = d; return len(d)
# The dump is a .tar.zst holding canonical/canonical_musicbrainz_data.csv; read it straight from the stream.
# Multi-artist credits ("A feat. B") also give co-credit pairs for the relationship graph (scripts/data/graph.py).
want, name, cocredit = set(mbid.tolist()), {}, {}
with tarfile.open(fileobj=zstandard.ZstdDecompressor().stream_reader(open(CANON, 'rb')), mode='r|') as tf:
    for m in tf:
        if not m.name.endswith('canonical_musicbrainz_data.csv'): continue
        for chunk in pd.read_csv(io.BufferedReader(Stream(tf.extractfile(m)), 1 << 20), usecols=['artist_credit_id', 'artist_mbids', 'artist_credit_name'], dtype='string', chunksize=2_000_000):
            chunk = chunk.dropna().drop_duplicates('artist_credit_id')
            multi = chunk['artist_mbids'].str.contains(',')
            for a, n in zip(chunk.loc[~multi, 'artist_mbids'], chunk.loc[~multi, 'artist_credit_name']):
                if a in want and a not in name: name[a] = n
            for ids in chunk.loc[multi, 'artist_mbids']:
                ids = [x for x in ids.split(',') if x in want]
                for i in range(len(ids)):
                    for j in range(i + 1, len(ids)):
                        k = tuple(sorted((ids[i], ids[j]))); cocredit[k] = cocredit.get(k, 0) + 1
        break
for junk in ('89ad4ac3-39f7-470e-963a-56509c546377', '125ec42a-7229-4250-afc5-e057484327fe'): name.pop(junk, None)  # Various Artists, [unknown]

# ---- 5. export: the KEEP most-listened named artists; a duplicate normalised name keeps its most-listened artist
listeners = np.bincount(A[tr], minlength=nA)
rows, seen = [], set()
for i in np.argsort(-listeners):
    n = name.get(mbid[i]); k = n and norm(n)
    if not k or k in seen: continue
    seen.add(k); rows.append(i)
    if len(rows) >= KEEP: break
rows = np.array(rows)
q = np.clip(np.round(V[rows] * 127 / np.abs(V[rows]).max(1, keepdims=True)), -127, 127).astype(np.int8)
keys = [norm(name[mbid[i]]) for i in rows]
pos = {mbid[i]: r for r, i in enumerate(rows)}
import os; os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, 'colisten-full.json'), 'w', encoding='utf8') as f:
    json.dump({'dims': DIMS, 'keys': keys, 'names': [name[mbid[i]] for i in rows], 'mbids': [mbid[i] for i in rows],
               'listeners': listeners[rows].tolist(), 'vectors': np.round(V[rows], 4).tolist(), 'bench': bench,
               'cocredit': [[pos[a], pos[b], n] for (a, b), n in cocredit.items() if a in pos and b in pos],
               'users': users, 'artists_total': len(aid), 'artists_kept': nA}, f)
js = ('// Generated by scripts/data/colisten.py: co-listening artist vectors (implicit ALS) from ListenBrainz MLHD+ (CC0),\n'
      '// artist names from the MusicBrainz canonical dump (CC0). keys: normalised names (src/music.js norm), one per line.\n'
      f'(function (root) {{ const T = {{ dims: {DIMS}, keys: {json.dumps(chr(10).join(keys), ensure_ascii=False)},\n'
      f'  vec: "{base64.b64encode(q.tobytes()).decode()}" }};\n'
      '  if (typeof module === "object" && module.exports) module.exports = T; else root.COLISTEN = T; })(this);\n')
with open(os.path.join(OUT, 'colisten-data.js'), 'w', encoding='utf8') as f: f.write(js)
print(f'exported {len(rows)} artists x {DIMS} dims, {len(js) / 1e6:.1f} MB; named {len(name)}/{nA}')
