# StoryStrand — Project Context for Grok Bot v6.1

Oct 2, 2026 · @Omar Jallow

## What changed from v6

v6.1 fixes nine problems found in review. Everything else is unchanged from v6, and nothing in Section 17 changed. Changed spots are marked **(v6.1)**.

| # | Section | Problem in v6 | Fix in v6.1 |
| --- | --- | --- | --- |
| 1 | 7, 14 | Onboarding and the curiosity pin need book vectors, clusters and 3D positions, but v6 only built books in step 7 | Books are embedded in step 2 and clustered, projected and labeled in step 3. Steps renumbered so the full demo is finished before taste routes |
| 2 | 7 | HDBSCAN ran on raw 1024-d vectors. In high dimensions all distances look alike, so density clusters collapse or most points become noise | Cluster on a 12-d UMAP reduction; a separate 3D UMAP is for display only; noise points join their nearest cluster |
| 3 | 9.3 | "Never drop back, never skip a level" was only a cost penalty, so Dijkstra could still choose a downhill step | Hard rule: only edges that stay level or climb one level. The v6 soft costs are a labeled fallback |
| 4 | 9.1 | Under the hard rule, an item may have no next-level item among its 10 nearest neighbors, leaving no way up | Every item below level 5 gets one extra edge to its nearest item one level up |
| 5 | 9.3 | Trimming a route to max\_stops by even spacing can remove the only stop at a level, so the route skips a level | Trimming keeps at least one stop per level, then spaces the rest evenly |
| 6 | 8 | Continuous aggregates return only refreshed data by default (TimescaleDB 2.13+), so the newest traffic lags | Real-time aggregation turned on (`materialized_only = false`) |
| 7 | 8 | Search filtered by map was never checked to return a full result list | StreamingDiskANN keeps fetching until LIMIT is met; step 2 now checks that each map returns 10 rows. Partial per-map indexes only if that check fails |
| 8 | 13 | Free ngrok can serve an HTML warning page instead of JSON, and the browser blocks cross-origin calls without CORS | Static ngrok domain, `ngrok-skip-browser-warning` header on every fetch, FastAPI CORS for the Vercel origins |
| 9 | 12 | The bridge response example jumped from difficulty 1 to 3, which the climb rule forbids | Level-2 stop added to the example; `relaxed` field added to route responses |

## For Grok Bot: your job

Use this document to plan the build. Produce:

1. A task breakdown sized for one Cursor Agent session each, in the order of Section 14.
2. A short `.cursor/rules` file that gives Cursor the essentials of Sections 2–13.
3. A time plan against the hackathon clock, marking the minimum complete demo.
4. A list of questions for Omar where this document leaves a decision open (Section 16).

Keep plans concrete: file names, endpoints, done-when checks. Do not change anything in Section 17 without asking.

## 1. The product

StoryStrand is **Google Maps for your curiosity**: two separate 3D maps that share one underlying meaning space, with bridges between them. It is a mobile-first website built in Cursor at Big Red Hacks 2026 (about 40 hours), targeting the SpaceX track and Best Use of Tiger Data.

- **Book Map (reading taste).** Books are points grouped into vibe neighborhoods (Space Opera, Cozy & Domestic, Grimdark…). Routes move your taste from one vibe to another in small steps.
- **Knowledge Map (SpaceX-eligible).** Space knowledge from three resource types: encyclopedia articles, NASA technical reports and research papers, grouped into topic neighborhoods (Exoplanets, Mars Exploration, Cosmology…). Every resource has a difficulty level 1–5, treated as elevation. Learning routes climb from approachable to advanced, one level at a time.
- **Bridges.** Your book taste places a curiosity pin on the Knowledge Map. “Learn the real science” turns a book into a learning route. Portals link a book and a resource that match each other best.

**Format:** a mobile-first website (Next.js), opened full-screen on a phone in the judge's hand. Not a native app: three.js and react-three-fiber are mature on the web and shaky in React Native, and Cursor is stronger with web React. The phone still delivers the “in their hand” moment: thumb-driven 3D map, voice guide, haptics on Android.

**Event:** Big Red Hacks 2026, about 40 hours. Judged on technical skill, design, creativity, impact and theme fit. Frame impact as “a guided path from fiction you love to the real science behind it,” not as book recommendations.

A user picks 5 books they loved and their pin drops: you are here. A voice tour guide narrates every route, and a live traffic layer shows where people are exploring right now on each map.

**Pitch:** “Google Maps for your curiosity. See where your interests live, and get turn-by-turn directions to where you want them to go — from the stories you love to the science behind them.”

**Hackathon theme:** navigation. Positions, routes, elevation, portals and traffic make it literal.

**Originality check (done):** semantic book recommenders and book maps are common on Devpost and GitHub. Step-by-step routes between interests appeared only in a developer library and a feature request. Learning routes with difficulty as elevation, cross-map portals and the traffic layer are the differentiators.

## 2. Sponsor tracks and how each requirement is met

| Track | Requirement | How StoryStrand meets it |
| --- | --- | --- |
| SpaceX | Built with Cursor; more use scores higher | All implementation in Cursor (Agent, Composer, rules file). Frequent Cursor-authored commits. |
| SpaceX | Real space data goes in | The Knowledge Map: Wikipedia astronomy/spaceflight articles, NASA Technical Reports Server, arXiv astro-ph papers. |
| SpaceX | Grok Imagine or Voice API (mandatory) | Both: Grok Voice narrates route stops; Grok Imagine makes Knowledge Map neighborhood art and route postcards. |
| SpaceX | Bonus: Grok Bot for planning/collaboration | This document is the planning input; Grok Bot produces the task plan and rules file. |
| Tiger Data | Innovative, performance-driven use | One Postgres database holds both maps' vectors, cross-map portals, guests, routes and time-series events powering the live traffic layer. Portal candidates are computed in SQL with vector joins. |
| Tiger Data | Showcase features | Hypertable, continuous aggregates (real-time), compression on events, StreamingDiskANN vector index with filtered search, hybrid keyword + vector search for title lookup. |

## 3. What already exists

- **No code exists.** Create a fresh repo at kickoff; only planning documents exist before the event. Last year's rules disqualified pre-built projects, so nothing from before kickoff goes into the submission repo. Ask an organizer whether pre-made design docs and data preparation are allowed.
- Earlier planning drafts included an API contract (v1); Section 12 (v2) supersedes it.
- **Python:** use the existing conda env `SCIENCE-env` (Python 3.12, arm64); Python 3.14 had wheel problems. Installed: mlx 0.32.0, mlx-lm 0.31.3. mlx-embeddings still needs a pip install inside SCIENCE-env.
- **Ollama** installed with the qwen3.5 family (2b / 9b / 27b). Default 9b.
- **Brand:** tagline “Your reading DNA,” teal #136E6F, coral #FF7B67, Bricolage Grotesque + Work Sans. Style: “Modern Dark (Cinema)” — deep gradient background, glass panels, spring interactions.
- Older docs (features.md, pages.md, StoryStrand\_Sitemap.md, iterations.md) describe the “Letterboxd for books” plan. Archive cut sections; do not delete.
- A ui-ux-pro-max design skill lives in `.claude/skills/`; Cursor will not read it automatically. Reference it from the rules file if useful.
- **Decided:** ChromaDB and Claude Code are replaced by Tiger Data (storage) and Cursor (building). MLX still computes all embeddings. The client is a mobile-first website; a native Expo app was considered and rejected.

## 4. Features

| Tier | Map | Feature | What the user sees |
| --- | --- | --- | --- |
| Core | Both | The Map + switcher | Items as points in 3D, colored and labeled by neighborhood; one control flips between maps. |
| Core | Both | You Are Here | Pick 5 books; pin drops with a DNA panel (share per neighborhood). |
| Core | Both | Routes | Start + destination (item or typed text) → 4–6 stops drawn as a line. |
| Core | Both | Voice tour guide | One note per stop; Grok Voice reads it aloud. |
| Core | Both | Live traffic | Neighborhoods pulse with recent activity, per map. |
| Core | Web | Thumb-driven map | Drag to spin, pinch to zoom, tap a point to open it, in the phone browser. |
| Core | Web | Full-screen | Web app manifest; “Add to Home Screen” opens without browser bars. |
| Core | Web | Bottom sheets | Item details, routes and DNA panel slide up over the map. |
| Bonus | Web | Haptics | Vibration at each route stop; Android Chrome only (not iPhone Safari). |
| Core | Knowledge | Learning routes | Climb encyclopedia → NASA report → paper; never drop back, never skip a level (enforced as a hard rule, Section 9.3). |
| Core | Knowledge | Difficulty as elevation | Each resource shows level 1–5; the route line shows the climb. |
| Core | Bridge | Curiosity pin | Your 5 book picks also place you on the Knowledge Map. |
| Core | Bridge | Learn the real science | On a book: concepts extracted, learning route starts from them. |
| Next | Bridge | Portals | Glowing links between a book and its best-matching resource; click to fly across. |
| Next | Bridge | Stories set here | From a knowledge topic, related books. |
| Next | Book | Scenic routes, Steer | Detour through another neighborhood; “like this, but more of that.” |
| Next | Both | Search as destination, Explore nearby | Results pinned on the map; unvisited neighborhoods near you. |
| Next | Web | Voice destinations | Hold a button, say “take me to black holes” (needs Grok Voice speech input; confirm). |
| Next | Knowledge | Neighborhood art, postcards | Grok Imagine images (papers have no covers). |
| Stretch | Bridge | Cross-map routes | Books → portal → learning route in one path. |
| Stretch | Both | Trail, meet in the middle, popular routes | From event data. |

## 5. Data sources

No scraping: datasets and official APIs only (rule carried over from the original plan).

| Map | Item type | Source | Notes |
| --- | --- | --- | --- |
| Books | book | Existing Kaggle books dataset | Covers via Google Books / Open Library by ISBN. About 10k books; 2–3k for the smallest demo. |
| Knowledge | encyclopedia | Wikipedia API (official) | Astronomy and spaceflight categories. About 3k articles. Text = lead section. |
| Knowledge | report | NASA Technical Reports Server API | Confirm terms and rate limits. About 2k reports. Text = title + abstract. Fallback: drop this type. |
| Knowledge | paper | Kaggle arXiv metadata snapshot | Stream JSON lines; keep astro-ph.\* (weight toward astro-ph.EP). About 5k papers. Text = title + abstract. |
| — | film | Reserved | Not ingested. |

## 6. Item schema

One model, `Item`, for everything. `map` decides which map an item lives on; `type` says what kind of resource it is; `difficulty` is set only on the Knowledge Map.

`backend/models/item.py`

```python
from typing import Literal, Optional
from pydantic import BaseModel, Field

MapName = Literal["books", "knowledge"]
ItemType = Literal["book", "encyclopedia", "report", "paper", "film"]  # film reserved

MAP_OF_TYPE = {"book": "books", "film": "books",
               "encyclopedia": "knowledge", "report": "knowledge", "paper": "knowledge"}

class Item(BaseModel):
    id: str                  # "<type>:<source_id>", e.g. "paper:2301.01234"
    type: ItemType
    map: MapName
    slug: str                # URL-safe, unique across all items
    title: str
    creators: list[str]      # authors / NASA centers / paper authors
    year: Optional[int] = None
    description: str         # book blurb, article lead, or abstract
    tags: list[str] = []     # genres, wiki categories, arXiv categories (readable)
    cover_url: Optional[str] = None
    rating: Optional[float] = None
    difficulty: Optional[int] = None   # 1-5, knowledge map only
    attributes: dict = Field(default_factory=dict)
    # book: isbn, page_count | encyclopedia: page_id, url
    # report: ntrs_id, center | paper: arxiv_id, categories, doi
    cluster_id: Optional[int] = None
    cluster_label: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    z: Optional[float] = None
```

`frontend/lib/types.ts`

```typescript
export type MapName = "books" | "knowledge";
export type ItemType = "book" | "encyclopedia" | "report" | "paper" | "film";

export interface Item {
  id: string; type: ItemType; map: MapName; slug: string; title: string;
  creators: string[]; year?: number; description: string; tags: string[];
  coverUrl?: string; rating?: number; difficulty?: number;
  attributes: Record<string, string | number | boolean | string[]>;
  clusterId?: number; clusterLabel?: string; x?: number; y?: number; z?: number;
}
```

**Embedding text:** title + tags + description, with no type word (“Book:”, “Paper:”) prefixed. Both maps share the BGE-M3 space, which is what lets bridges compare a book with a paper.

```python
def embedding_text(item: Item) -> str:
    return f"{item.title}. {', '.join(item.tags)}. {item.description}".strip()
```

### Difficulty scoring (Knowledge Map)

`data/scripts/score_difficulty.py`

```python
import textstat  # pip install textstat

BASE = {"encyclopedia": 1.5, "report": 3.5, "paper": 4.5}

def difficulty(item: Item) -> int:
    d = BASE[item.type]
    grade = textstat.flesch_kincaid_grade(item.description)
    d += 0.5 * max(-1.0, min(1.0, (grade - 12) / 6))   # nudge by readability
    if item.type == "paper" and "review" in item.title.lower():
        d -= 0.5                                          # reviews are gentler entry points
    return int(round(max(1, min(5, d))))
```

## 7. Offline pipeline

Runs once, in batch, on the M5. Embedding and loading are shared. **(v6.1)** Books go through the shared stage and the clustering/3D/labeling stage at the same time as knowledge items, because onboarding needs book vectors, neighborhoods and positions. Only the book road network waits.

```text
PIPELINE

SHARED  (build step 2: both maps)
  clean_books.py / fetch_wiki.py / fetch_ntrs.py / clean_papers.py
        -> Item records with type + map, prefixed ids, deduped
  fetch_covers.py          books only, by ISBN
  score_difficulty.py      knowledge items only -> difficulty 1-5
  embed_items.py           BGE-M3 on MLX -> 1024-d vector per item
  load_tiger.py            INSERT into Tiger items table

PER MAP  (build step 3: run --map knowledge, then --map books)
  cluster_items.py         UMAP -> 12-d, then HDBSCAN -> cluster_id        (v6.1)
  project_3d.py            separate UMAP -> (x, y, z), per map, display only
  label_clusters.py        anchor match + LLM fallback -> cluster_label

ROAD NETWORKS
  build_graph.py --map knowledge   step 3: directed, strict climb rule + uphill links (v6.1)
  build_graph.py --map books       step 9: undirected
        -> data/processed/graph_<map>.npz

BRIDGES
  build_portals.py         SQL vector join + mutual-match filter -> portals table
```

### Clustering (v6.1)

v6 ran HDBSCAN on the raw 1024-d vectors. That fails because of distance concentration: as dimension d grows, the gap between a point's nearest and farthest neighbor shrinks relative to the distances themselves (roughly as 1/√d). HDBSCAN finds clusters by density contrast, and that contrast disappears. The usual results are one giant cluster or most points labeled noise (−1).

The fix is to reduce to about 12 dimensions with UMAP first. UMAP keeps each point's local neighborhood, and `min_dist=0.0` packs neighbors tightly, which is exactly the density HDBSCAN needs. Use scikit-learn's HDBSCAN (1.3+), not the standalone `hdbscan` package, which has had arm64 build problems.

`data/scripts/cluster_items.py`

```python
import numpy as np, umap
from sklearn.cluster import HDBSCAN

def normalize(v): return v / np.linalg.norm(v, axis=-1, keepdims=True)

X = normalize(vectors)                       # one map, 1024-d, from Tiger
Z = umap.UMAP(n_components=12, n_neighbors=15, min_dist=0.0,
              metric="cosine", random_state=42).fit_transform(X)
labels = HDBSCAN(min_cluster_size=40, min_samples=10).fit_predict(Z)

# noise (-1) joins the nearest cluster centroid, measured in full 1024-d
centroids = {c: normalize(X[labels == c].mean(0)) for c in set(labels) - {-1}}
for i in np.where(labels == -1)[0]:
    labels[i] = max(centroids, key=lambda c: X[i] @ centroids[c])
```

- **Tuning:** adjust `min_cluster_size` until the cluster count is near the anchor count (about 18 for books, 12 for knowledge). Larger values give fewer, bigger neighborhoods.
- `project_3d.py` runs its own UMAP with `n_components=3, min_dist=0.1` (a little spacing so points stay tappable) and the same `random_state`.
- The 12-d and 3-d reductions are only for grouping and drawing. Routes, search and bridges still use the full 1024-d vectors (Section 17).

### Neighborhood naming vocabulary

Each cluster is named by cosine-matching its centroid to an anchor name (embedded once). Clusters with no good match get an LLM-generated name under the tour guide's banned-word guardrails.

| Map | Anchor names |
| --- | --- |
| Books (18) | Classical/Canon, Western Frontier, Cozy & Domestic, Grimdark, Space Opera, Cyberpunk Noir, Cottagecore Fantasy, Political Intrigue, Psychological Thriller, Slow Burn Romance, Epic Quest, Post-Apocalyptic, Hard Sci-Fi, Gothic & Macabre, Coming of Age, Heist & Caper, Mythic Retelling, War & Survival |
| Knowledge (12) | Exoplanets, Mars Exploration, Planetary Geology, Astrobiology, Small Bodies & Comets, Solar Physics, Stellar Evolution, Black Holes & Compact Objects, Gravitational Waves, Galaxies, Cosmology, Instruments & Missions |

## 8. Tiger Data schema

Tiger Cloud (free plan) holds everything. Exact syntax for compression/columnstore, BM25 (pg\_textsearch) and partial DiskANN indexes depends on the TimescaleDB version, so confirm it in Tiger docs. Do not use the pgai vectorizer or in-database LLM calls (deprecated as of June 30, 2026); MLX computes embeddings.

`backend/db/schema.sql`

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS vectorscale;

CREATE TABLE items (
  id text PRIMARY KEY, type text NOT NULL,
  map text NOT NULL CHECK (map IN ('books', 'knowledge')),
  slug text UNIQUE NOT NULL, title text NOT NULL, creators text[], year int,
  description text, tags text[], cover_url text, rating real,
  difficulty smallint CHECK (difficulty BETWEEN 1 AND 5),
  attributes jsonb DEFAULT '{}',
  cluster_id int, cluster_label text, x real, y real, z real,
  embedding vector(1024) NOT NULL
);
CREATE INDEX items_embedding_idx ON items USING diskann (embedding vector_cosine_ops);
CREATE INDEX items_map_idx ON items (map);

CREATE TABLE portals (
  book_id text REFERENCES items(id), knowledge_id text REFERENCES items(id),
  similarity real NOT NULL, PRIMARY KEY (book_id, knowledge_id)
);

CREATE TABLE book_concepts (   -- cache for "Learn the real science"
  book_id text REFERENCES items(id), concept text NOT NULL,
  knowledge_id text REFERENCES items(id), similarity real,
  created_at timestamptz DEFAULT now(), PRIMARY KEY (book_id, concept)
);

CREATE TABLE guests (
  guest_id uuid PRIMARY KEY, created_at timestamptz DEFAULT now(),
  picks text[] NOT NULL, centroid vector(1024)
);

CREATE TABLE guest_positions (
  guest_id uuid REFERENCES guests(guest_id), map text NOT NULL,
  x real, y real, z real, home_cluster text, PRIMARY KEY (guest_id, map)
);

CREATE TABLE routes (
  route_id text PRIMARY KEY, created_at timestamptz DEFAULT now(), guest_id uuid,
  map text NOT NULL, kind text NOT NULL,   -- taste | learning | bridge | cross
  stops text[] NOT NULL, notes jsonb, postcard_url text,
  relaxed boolean DEFAULT false            -- (v6.1) true if strict climb rule had no path
);

CREATE TABLE events (
  time timestamptz NOT NULL, guest_id uuid, map text NOT NULL,
  kind text NOT NULL,   -- search | route | stop_click | portal_jump | learn | read
  item_id text, cluster_label text, route_id text, simulated boolean DEFAULT false
);
SELECT create_hypertable('events', by_range('time'));

-- (v6.1) materialized_only = false: real-time aggregation, so the newest events
-- show up immediately instead of waiting for the next refresh
CREATE MATERIALIZED VIEW neighborhood_traffic
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket('5 minutes', time) AS bucket, map, cluster_label, count(*) AS visits
FROM events GROUP BY bucket, map, cluster_label;

SELECT add_continuous_aggregate_policy('neighborhood_traffic',
  start_offset => INTERVAL '1 hour', end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute');
-- + compression/columnstore policy on events (check docs for current syntax)
```

**Why the aggregate change (v6.1):** since TimescaleDB 2.13, continuous aggregates return only already-refreshed buckets by default. With `end_offset => 1 minute`, the most recent events would be missing from the traffic layer. Real-time mode adds the not-yet-refreshed rows from `events` at query time.

### Key queries

```sql
-- vibe search on one map: $1 = query vector from MLX, $2 = map
SELECT id, title, type, difficulty, x, y, z, 1 - (embedding <=> $1) AS similarity
FROM items WHERE map = $2 ORDER BY embedding <=> $1 LIMIT 10;

-- portal candidates: each book's 3 nearest knowledge items
SELECT b.id AS book_id, k.id AS knowledge_id, 1 - (b.embedding <=> k.embedding) AS sim
FROM items b
CROSS JOIN LATERAL (
  SELECT id, embedding FROM items WHERE map = 'knowledge'
  ORDER BY embedding <=> b.embedding LIMIT 3
) k
WHERE b.map = 'books';

-- traffic layer for one map
SELECT cluster_label, sum(visits) AS visits FROM neighborhood_traffic
WHERE map = $1 AND bucket > now() - INTERVAL '30 minutes' GROUP BY cluster_label;
```

### Filtered search check (v6.1)

Both the vibe search and the portal join filter by `map` on top of an approximate index. StreamingDiskANN is built for this: it keeps streaming candidates until the `WHERE` clause and `LIMIT` are satisfied. v6 never verified it, so build step 2 now includes this check:

```sql
-- must return 10 for both maps, using a random item's vector as the query
SELECT map, count(*) FROM (
  SELECT 'books' AS map, id FROM items WHERE map = 'books'
  ORDER BY embedding <=> (SELECT embedding FROM items WHERE map = 'knowledge' LIMIT 1) LIMIT 10
) a GROUP BY map
UNION ALL
SELECT map, count(*) FROM (
  SELECT 'knowledge' AS map, id FROM items WHERE map = 'knowledge'
  ORDER BY embedding <=> (SELECT embedding FROM items WHERE map = 'books' LIMIT 1) LIMIT 10
) b GROUP BY map;
```

If either count is below 10, or `EXPLAIN ANALYZE` shows slow queries, add one partial DiskANN index per map (`... USING diskann (embedding vector_cosine_ops) WHERE map = 'books'`, same for knowledge) if the installed version supports it.

**Event fields:** `map` and `cluster_label` are stored on each event so the continuous aggregate needs no join. **Simulated traffic:** `scripts/simulate_traffic.py` writes events with `simulated = true` so both maps have activity during judging; the UI labels it as simulated.

## 9. Routing

### 9.1 Road networks (`build_graph.py`, offline, per map)

1. Pull the map's vectors from Tiger; L2-normalize.
2. Link each item to its k = 10 nearest items on the same map by cosine similarity.
3. **(v6.1, Knowledge Map only) Uphill guarantee.** Every item at level 1–4 with no level+1 item among its 10 neighbors gets one extra edge to its nearest level+1 item. Without this, the strict climb rule (9.3) can strand items with no way up.
4. Check connected components; link each stray component to the main one through its closest pair.
5. Save as a SciPy sparse matrix + id index per map; FastAPI loads both into memory at startup. The Knowledge Map saves two graphs: `strict` (9.3 rule) and `soft` (v6 costs, fallback).

```python
# step 3, knowledge map: X = normalized vectors, diff = difficulty array, knn = neighbor ids
for lvl in range(1, 5):
    src = np.where(diff == lvl)[0]
    dst = np.where(diff == lvl + 1)[0]
    S = X[src] @ X[dst].T                       # cosine similarities, src x dst
    for row, i in enumerate(src):
        if not any(diff[j] == lvl + 1 for j in knn[i]):
            col = S[row].argmax()
            add_edge(i, dst[col], sim=S[row, col])
```

**Done when:** on 200 random (start level ≤ 2, goal level ≥ 4) pairs, at least 95% have a strict path.

### 9.2 Book Map: taste routes (undirected)

- Edge cost = (1 − s)², where s = cosine similarity. Squaring makes one big jump cost more than several small ones.
- Start: guest → item nearest the guest centroid; item → itself. Destination: item → itself; text → embed with BGE-M3, nearest book.
- Dijkstra; trim to max\_stops (default 6) keeping start, end and evenly spaced stops; avoid the guest's own picks as intermediate stops.
- Scenic: waypoint = most central item of an adjacent neighborhood the smooth route doesn't touch; route start → waypoint → destination.

### 9.3 Knowledge Map: learning routes (directed)

**(v6.1) The climb rule is now hard, not a penalty.** In v6, dropping one level cost α = 0.5. A smooth step at s = 0.6 costs (1 − 0.6)² = 0.16, so any time the best non-dropping path needed about 4 more steps than a path with one drop, Dijkstra took the drop. That broke the “never drop back, never skip a level” promise in Section 4.

The strict graph keeps only directed edges where the level change Δ = d\_to − d\_from is 0 or +1, with cost (1 − s)². The v6 cost function is kept for the soft fallback graph:

`backend/routing/knowledge_cost.py`

```python
def allowed(d_from: int, d_to: int) -> bool:          # strict graph (v6.1)
    return d_to - d_from in (0, 1)

def edge_cost(s: float, d_from: int, d_to: int,       # soft graph (v6, fallback only)
              alpha: float = 0.5, beta: float = 0.3) -> float:
    smooth = (1 - s) ** 2                             # small conceptual steps
    downhill = alpha * max(0, d_from - d_to)          # penalize dropping back
    skip = beta * max(0, d_to - d_from - 1)           # penalize climbing more than one level
    return smooth + downhill + skip
```

`backend/routing/learning.py`

```python
def learning_route(start, goal, max_stops=6):
    path = dijkstra(G_strict, start, goal)
    relaxed = path is None
    if relaxed:                                       # no strict path: use v6 soft costs
        path = dijkstra(G_soft, start, goal)
    return trim_by_level(path, max_stops), relaxed

def trim_by_level(path, max_stops):                   # (v6.1) never trims away a level
    if len(path) <= max_stops:
        return path
    keep = {0, len(path) - 1}
    for lvl in sorted({diff[p] for p in path}):       # first stop at each level
        keep.add(next(i for i, p in enumerate(path) if diff[p] == lvl))
    rest = [i for i in range(len(path)) if i not in keep]
    spare = max_stops - len(keep)
    if spare > 0:
        step = len(rest) / spare
        keep |= {rest[int(k * step)] for k in range(spare)}
    return [path[i] for i in sorted(keep)]
```

- **Why trimming changed (v6.1):** a strict path such as levels 1, 1, 2, 3, 3, 4, 4, 5 is trimmed by even spacing to, e.g., 1, 3, 4, 5, which skips level 2. Keeping the first stop at every level prevents that. A route spanning all 5 levels can return 6 stops even when max\_stops is 5; level coverage wins.
- **Relaxed routes:** if the strict graph has no path (for example, the goal is easier than the start), the soft graph is used and the response sets `relaxed: true`. Hand-checked demo routes must be strict.
- alpha and beta now only affect relaxed routes. Start at 0.5 / 0.3.
- Typed destinations on the Knowledge Map prefer high-difficulty matches (the goal is depth); starts prefer low difficulty.
- The route response includes each stop's difficulty so the UI can draw the climb.

### 9.4 Other math

- **Guest position:** centroid = mean of the 5 picks' vectors; pin = mean of their (x, y, z). No live UMAP.
- **DNA panel:** softmax over the guest's similarity to each neighborhood centroid, sorted.
- **Steer (books):** q = normalize(A + s × (B − A)); nearest items excluding A, B.
- **Explore nearby:** neighborhood centroids nearest the guest that contain none of their picks.
- Routes use full 1024-d similarity, never 3D distance. 3D is only for drawing; UMAP distortion can make routes look slightly jumpy.

## 10. Bridges between the maps

Both maps live in the same BGE-M3 space, so books and knowledge items can be compared directly. But book blurbs describe vibes and resources describe concepts, so raw similarity between them is weak. The bridges below use translation (concepts) or strict filters (mutual matches) to stay meaningful.

| Bridge | Tier | Mechanism |
| --- | --- | --- |
| Curiosity pin | Core | Guest's book centroid → 20 nearest knowledge items → pin = mean of their (x, y, z) on the Knowledge Map; home topic = most common neighborhood. Label it “suggested.” |
| Learn the real science | Core | LLM extracts 3–5 concrete concepts from a book (e.g. Mars surface conditions, growing crops in regolith). Each concept is embedded and snapped to its nearest knowledge item. Start = easiest of those items; destination = highest-difficulty item near the concepts' centroid. Learning route between them on the strict graph (Section 9.3). On demand, cached in `book_concepts`. |
| Portals | Next | Portal candidates from the SQL vector join (Section 8). Keep a pair only if each is in the other's top 3 and similarity clears a threshold; cap at about 300. Mutual matching stops generic books from linking to everything. |
| Stories set here | Next | From a knowledge neighborhood centroid, nearest books, filtered through portals and concepts first. |
| Cross-map routes | Stretch | Book taste route to a portal book → jump → learning route on the Knowledge Map. The UI animates the flight between maps. |

**Concept extraction prompt** (Ollama, JSON mode):

```text
SYSTEM: List 3-5 real-world scientific concepts this book draws on. Short noun phrases,
        no plot, no character names. Return JSON: {"concepts": ["...", "..."]}.
USER:   Title: {title}. Tags: {tags}. Description: {description}
```

## 11. Grok integration

| API | Use | Notes |
| --- | --- | --- |
| Grok Voice | Narrate the tour-guide note for each route stop, on both maps. If the API accepts speech input, also use it for spoken destinations. | Cache audio per route\_id. Confirm endpoint, voices, rate limits and audio format in xAI docs. |
| Grok Imagine | Knowledge Map neighborhood art (one image per cluster, offline) and route postcards on demand. | Encyclopedia articles, reports and papers have no covers: show their neighborhood art. |
| Grok Bot | Planning and team collaboration. | Bonus points; this brief is its input. |

### Tour-guide notes (text)

One LLM call per route returns all notes as JSON. Default: local Ollama qwen3.5:9b.

- Banned-word list (delve, tapestry, realm, embark, …).
- No plot or abstract summary; under two sentences per stop; explain the transition from the previous stop.
- On learning routes, also say what new idea this level adds.
- Regex filter after generation, retry on violation, fall back to a notes-free route on timeout.

## 12. API contract v2

| Endpoint | Purpose |
| --- | --- |
| GET /api/health | Health check. |
| GET /api/map?map= | All items on one map: {id, type, title, cover\_url, difficulty, cluster\_label, x, y, z}. Cache. |
| POST /api/guest | guest\_id + 5 book ids → centroid, Book Map pin, curiosity pin, DNA panels. |
| POST /api/search | Vibe search (vector) + title lookup (hybrid), on one map. |
| POST /api/route | Taste route (books) or learning route (knowledge); stops + notes + `relaxed` (v6.1). |
| GET /api/route/:id | Saved route for sharing. |
| POST /api/bridge/learn | “Learn the real science”: book\_id → concepts + learning route. |
| GET /api/portals?map= | Portal markers for one map. |
| POST /api/route/:id/voice | Grok Voice audio for a route's notes. |
| POST /api/voice/destination | Next tier, if supported: spoken request → text → destination for /api/route. |
| POST /api/route/:id/postcard | Grok Imagine postcard. |
| GET /api/traffic?map= | Visits per neighborhood, last 30 minutes. |
| GET /api/explore | Nearby unvisited neighborhoods for a guest, on one map. |
| POST /api/steer | Direction-based blend (books). |
| GET /api/items/:id | Item detail + nearest neighbors + portals. |

**Bridge contract:**

```json
// POST /api/bridge/learn request
{ "book_id": "book:9780553418026", "guest_id": "<uuid>", "max_stops": 5 }

// response
{ "route_id": "r_51c0de", "map": "knowledge", "kind": "bridge",
  "relaxed": false,
  "concepts": ["Mars surface conditions", "crops in regolith", "orbital rendezvous"],
  "stops": [
    { "item": { /* Item, type "encyclopedia", difficulty 1 */ }, "step_similarity": null,
      "guide_note": "Start with what the surface is actually like." },
    { "item": { /* Item, type "encyclopedia", difficulty 2 */ }, "step_similarity": 0.78,
      "guide_note": "Same ground, now in numbers: temperature, pressure, radiation." },
    { "item": { /* Item, type "report", difficulty 3 */ }, "step_similarity": 0.74,
      "guide_note": "Same soil, now measured: what the rovers found in it." },
    { "item": { /* Item, type "paper", difficulty 4 */ }, "step_similarity": 0.71,
      "guide_note": "Could anything grow there? The chemistry says maybe." } ] }
```

(v6.1) The v6 example jumped from difficulty 1 to 3, which the climb rule forbids; a level-2 stop is added. `relaxed` is true only when the soft fallback graph was used (Section 9.3).

**Guest identity:** random UUID in localStorage. No login, no passwords, no auth provider. The site reaches the API through a tunnel URL (Section 13).

## 13. Web architecture and pages

| Layer | Tool |
| --- | --- |
| Framework | Next.js (App Router) + TypeScript, mobile-first, hosted on Vercel |
| Styling / motion | Tailwind, Framer Motion |
| 3D map | react-three-fiber + drei (three.js); OrbitControls handle touch rotate and pinch |
| Browser features | Web Audio / HTMLAudioElement (Grok Voice), Vibration API (Android), localStorage, getUserMedia for voice input, web app manifest for full-screen |
| Backend reachability | FastAPI + MLX + Ollama run on the M5; **(v6.1)** ngrok with a free static domain exposes them over HTTPS. Tiger Cloud is already public. |

### Route tree

```text
app/  (Next.js App Router)
|-- layout.tsx                  Persistent 3D scene + bottom-sheet host
|-- page.tsx                    Redirect to last-used map
|-- map/[map]/page.tsx          /map/books, /map/knowledge (switcher, traffic)
|-- onboarding/page.tsx         Pick 5 books you loved
|-- onboarding/reveal/page.tsx  Both pins drop, DNA panels
|-- route/page.tsx              Start + destination, voice, haptics
|-- route/[routeId]/page.tsx    Shared route + postcard
|-- search/page.tsx             Results pinned on the map
|-- item/[slug]/page.tsx        Sheet: book -> "Learn the real science";
|                               resource -> difficulty, "Stories set here"
|-- explore/page.tsx            Nearby unvisited neighborhoods
`-- steer/page.tsx              Book Map only
```

### Mobile-browser 3D rules

- **One draw call:** render all points of a map as a single points/instanced object.
- **Tap picking:** project points to screen space and choose the nearest point to the touch within a radius, instead of raycasting tiny dots.
- **Labels:** neighborhood names as an HTML overlay positioned from projected centroids.
- **Detail on demand:** covers and art only for the tapped item and route stops.
- **Map switch = portal jump:** one camera-flight animation serves both.
- **Difficulty as elevation:** Knowledge Map points encode difficulty as size or brightness.
- **Sheets, not page loads:** item, route and DNA views are bottom sheets over the persistent scene, so the map never unmounts.
- **2D fallback:** if the step-0 spike stutters, render a flat 2D map; routes, pins and traffic still work.
- **iPhone audio:** Safari only plays sound after a user tap, so narration starts from the “Start route” button.

### Tunnel and cross-origin setup (v6.1)

Three problems with v6's tunnel plan:

- **URL changes.** A Cloudflare quick tunnel gets a new URL on every restart, which silently breaks the Vercel environment variable. A named Cloudflare tunnel needs a domain you own. ngrok's free static domain stays the same.
- **Warning page.** Free ngrok can answer with an HTML warning page instead of passing the request through. The `ngrok-skip-browser-warning` header skips it.
- **CORS.** The site (vercel.app) and the API (ngrok domain) are different origins, so the browser blocks responses unless FastAPI allows the site's origin.

```bash
ngrok http 8000 --url=<your-static-domain>.ngrok-free.app   # older ngrok: --domain=
```

`frontend/lib/api.ts`

```typescript
const API = process.env.NEXT_PUBLIC_API_URL!;   // the static ngrok URL (not a secret)

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "1",
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json() as Promise<T>;
}
```

`backend/main.py`

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://<project>.vercel.app", "http://localhost:3000"],
    allow_origin_regex=r"https://<project>-.*\.vercel\.app",   # preview deploys
    allow_methods=["*"],
    allow_headers=["*"],
)
```

All calls go through `api()`, never a bare `fetch`. Replace `<project>` with the Vercel project name.

### Demo infrastructure

- Start ngrok on the static domain; set it as `NEXT_PUBLIC_API_URL` in Vercel once.
- Test the demo phone on venue Wi-Fi early: `/api/health` returns JSON (not an ngrok page). Demo on an Android phone if haptics matter.
- Backups: phone hotspot for the laptop, and a recorded demo video (by Saturday night).

## 14. Build order

**(v6.1)** Books are embedded in step 2 and get neighborhoods and 3D positions in step 3, because onboarding (step 5) needs book vectors and the Book Map pin, and the curiosity pin (step 7) needs book vectors. The old “Book Map” step shrinks to the book road network and taste routes, and moves after the full demo. Steps are renumbered so the numbers match the order.

Hours are counted from kickoff (H0) across the roughly 40-hour event.

| # | Hours | Step | Done when | Demo? |
| --- | --- | --- | --- | --- |
| 0 | H0–3 | Fresh repo at kickoff; 3D spike: 20k random points in the demo phone's browser | Smooth rotate and pinch; if not, cap at 10k per map or use the 2D fallback | No |
| 1 | H3–5 | Tiger project + schema.sql; Item models (Py + TS); API contract v2; FastAPI `/api/health` | Tables exist; models validate one item of each type | No |
| 2 | H5–11 | Ingest Knowledge Map sources **and books**, score difficulty, embed on MLX, load | About 10k knowledge rows with difficulty + 2–3k book rows, all with vectors; filtered search check (Section 8) returns 10 rows per map | No |
| — | H6–11 | *In parallel:* frontend on mock coordinates (random points in a few blobs) | Map page, switcher, tap picking, bottom sheet work on mock data | No |
| 3 | H11–14 | Both maps: cluster (12-d UMAP → HDBSCAN), 3D, label. Knowledge Map: strict + soft road networks with uphill links | Every row labeled and placed; cluster counts near 12 / 18; 95% strict-path check passes; 3 learning routes hand-checked (no drop, no skip, not relaxed) | No |
| 4 | H14–16 | ngrok static domain + CORS + `api()` helper; Map page with switcher on real coordinates for both maps | Renders on the phone via Vercel + tunnel; tap opens an item sheet; no ngrok warning page | No |
| 5 | H16–18 | Onboarding → You Are Here | Book Map pin + DNA panel from 5 picks | Partial |
| 6 | H18–23 | Learning routes + notes + Grok Voice (+ haptics on Android) | Route climbs levels and is narrated | Yes — SpaceX-complete |
| — | H23–29 | Sleep. Before sleeping, start `build_graph.py --map books` | — | — |
| 7 | H29–32 | Curiosity pin + “Learn the real science” | Book → learning route works on The Martian and 4 other preset books, hand-checked | Yes — full demo |
| 8 | H32–33 | Events + traffic aggregate + simulated replay | Both maps pulse; newest events appear without waiting for a refresh | Yes |
| — | H33–34 | Record the backup demo video | Video saved on the demo phone | — |
| 9 | H34–37 | Book road network + taste routes | Taste routes work on the Book Map | Yes |
| 10 | H37–38 | Pick 1–2: portals (strongest Tiger showcase), Grok Imagine art, search, scenic, steer, explore, voice destinations | Each one works end to end | Yes |
| 11 | — | Cross-map routes, trail, meet in the middle, popular routes | Cut first | — |
| — | H38–40 | Freeze: README (Tiger features, Cursor and Grok usage), Devpost, rehearse the demo on venue Wi-Fi | Submitted; no new features after H38 | — |

The Knowledge Map is built first because it is what makes StoryStrand SpaceX-eligible. If time runs out after step 6, there is still a complete space-data product.

**Smallest version that still wins (40-hour scope):** the Knowledge Map, onboarding with 5 books, the curiosity pin, “Learn the real science” for The Martian and a few other preset books, a narrated learning route, and simulated traffic. That is the 60-second demo. Books in the smallest version: 2–3k, embedded and placed but without taste routes. Drop NASA reports unless their API works on the first try.

### Cursor workflow

- Save this brief as `docs/CONTEXT.md` and generate `.cursor/rules/storystrand.mdc` from it (Grok Bot output #2).
- One Cursor Agent session per build step: Plan mode first, then Agent mode. Commit at each “done when,” with Cursor writing the commit.
- **(v6.1)** Run long pipeline jobs (embedding, UMAP, graph builds) in your own terminal with `nohup`, not inside the Agent, so the Agent stays free for frontend work.
- Frontend work starts with the step-0 spike and continues on mock coordinates while the pipeline runs.
- Keep `iterations.md` as a running log of decisions.

## 15. 60-second demo

1. Hand the judge your phone: the Book Map spins under their thumb, traffic pulsing.
2. Pick 5 favorites. The pin drops, and a second pin appears on the Knowledge Map: “Your curiosity lives near Mars Exploration.”
3. Open The Martian; tap “Learn the real science.”
4. The view flies to the Knowledge Map. A route climbs one level at a time from an encyclopedia article through a NASA report to an arXiv paper; Grok Voice narrates each step and, on Android, the phone taps at each stop.
5. Close: one Tiger database held both maps, the portals and the live traffic.

## 16. Open decisions and risks

| Item | Default / mitigation |
| --- | --- |
| Scope vs. 40 hours | Build to the smallest winning version first (Section 14). |
| Pre-event work rules | Fresh repo at kickoff; confirm with organizers that planning docs and data prep are allowed. |
| Sponsor track details | MLH prize pages weren't public when this was written; confirm SpaceX and Tiger requirements at the opening ceremony. |
| 3D performance on the phone | Settled by the step-0 spike; 2D fallback. |
| BGE-M3 in mlx-embeddings (v6.1) | Verify before the event that it loads (XLM-RoBERTa architecture) and time 1k texts. Fallback: sentence-transformers on MPS. |
| Cluster count (v6.1) | Tune `min_cluster_size` until counts are near 12 (knowledge) and 18 (books). |
| Relaxed learning routes (v6.1) | Allowed only as a fallback and flagged `relaxed`; every demo route must be strict. |
| Tunnel on venue Wi-Fi | ngrok static domain; test early; hotspot backup; demo video recorded by Saturday night. |
| Haptics | Android Chrome only; treat as a bonus on iPhone. |
| Tour-guide and concept text model | Local Ollama 9b (default) vs. Grok text API. Ask Omar. |
| Corpus size | About 10k books; knowledge about 3k encyclopedia + 2k reports + 5k papers. Smallest version: 2–3k books. |
| Difficulty penalties (alpha, beta) | Now affect only relaxed routes. Start at 0.5 / 0.3. |
| Concept extraction quality | Hand-check “Learn the real science” on 5 well-known books before the demo. |
| NASA reports API | Drop unless it works on the first try; Wikipedia + arXiv suffice. If dropped, the climb goes encyclopedia → paper, and level 3 must come from hard encyclopedia articles and review papers. |
| Curiosity pin is noisy | Raw book → knowledge similarity is weak; label it “suggested.” Upgrade later to concept-based placement. |
| Empty traffic during judging | Simulated replay, labeled as simulated. |
| Free-tier storage | Vectors alone are 4 KB each (1024 × float32), so 20k items ≈ 82 MB before text and index. Check the cap. |
| Network latency to Tiger Cloud | Tens of ms per query; negligible next to LLM time. |
| Grok API specifics | Confirm endpoints, auth, limits, formats, and whether Voice accepts speech input, in xAI docs first. |
| Python version | SCIENCE-env (3.12); avoid 3.14. |

## 17. Do not change without asking Omar

Unchanged from v6.

- Two separate maps (Book Map, Knowledge Map) with bridges — not one merged map.
- Tiger Data as the only database; BGE-M3 on MLX for embeddings.
- A mobile-first website as the only client; no native app.
- The 18-name book anchor vocabulary.
- Brand tokens: teal #136E6F, coral #FF7B67, Bricolage Grotesque + Work Sans.
- The no-scrape rule (datasets and official APIs only).
- Routes computed in full 1024-d space; 3D used only for display.
