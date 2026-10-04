# StoryStrand

**Google Maps for your curiosity.** See where your interests live, and get turn-by-turn
directions from the stories you love to the science behind them.

StoryStrand is a mobile-first website with two 3D maps that share one meaning space:

- **Book Map.** 9,814 popular books, grouped into 18 neighborhoods by what they feel like
  (Hard Sci-Fi, Psychological Thriller, Dragon Epic Fantasy, ...).
- **Knowledge Map.** 6,000 pieces of real space science: 3,000 Wikipedia articles on astronomy and
  spaceflight and 3,000 arXiv astro-ph papers, in 12 topic neighborhoods. Every item has a
  difficulty from 1 to 5, drawn as elevation.

Pick 5 books you loved (or tap a quick pick: Sci-fi fan, Thriller reader, Classics) and your pin
drops: you are here. Your reading DNA shows which neighborhoods you live in. If science fiction is
a real part of your mix, a second pin suggests where your curiosity lives on the Knowledge Map.
Open a book like *The Martian*, tap **Learn the real science**, and the view flies to the
Knowledge Map, where a route climbs like a mountain path, one difficulty level at a time, from an
encyclopedia article to research papers while a voice guide narrates each stop. Portals link
books and articles that are each other's best match, one tap away across the two maps from the
item sheet. Live traffic shows on the neighborhood labels: a visit count and a coral dot that is
brighter where people are exploring.

Built at Big Red Hacks 2026 for the SpaceX track and Best Use of Tiger Data.

## How it works

```
phone browser ── Next.js on Vercel ── ngrok static domain ── FastAPI on a MacBook (Apple Silicon)
                                                               ├── Tiger Data (Postgres + pgvector + pgvectorscale)
                                                               ├── BGE-M3 embeddings on MLX
                                                               ├── Ollama qwen3.5:9b (local LLM)
                                                               └── xAI Grok Voice (narration)
```

**One meaning space.** Every book, article and paper is embedded with BGE-M3 (1024 dimensions,
CLS pooling) from `title. tags. description`. Books and science sit in the same vector space, which
is what lets a book turn into a route through science.

**Neighborhoods and layout.** For each map, UMAP reduces the vectors to 12 dimensions and HDBSCAN
finds neighborhoods; a separate 3D UMAP is used only for drawing. On the Book Map that 3D UMAP is
supervised by the neighborhood labels (weight 0.05), so neighborhoods sit apart instead of
overlapping in the middle; outliers beyond 3 standard deviations are pulled in. Neighborhood names
come from a fixed vocabulary, matched by embedding similarity and checked by the local LLM.

**Difficulty as elevation.** Knowledge items are scored by type, readability and whether they are
review papers, then cut into five equal levels, so every rung of the climb exists. On an active
route each stop is lifted above its point by its level, and the route line draws itself upward as
the guide narrates, so the climb is something you can see.

**Learning routes.** A road network links every knowledge item to its 10 nearest neighbors by
cosine similarity, plus a guaranteed uphill edge for every item below level 5. Routes run Dijkstra
on the strict graph, where a step may only stay level or climb by one (never drop, never skip).
Edge cost is `(1 - similarity)^2`, always on the full 1024-d vectors, never on the 3D layout. In
testing, 100% of random (level 1-2 to level 4-5) pairs had a strict path.

**Taste routes, scenic detours and Steer.** The Book Map has its own road network: each book
linked to its 10 nearest books, cost `(1 - similarity)^2`, no levels. A taste route runs from a
book you love (or "You are here") to another book or a vibe, trimmed to evenly spaced stops and
never through your own picks. Ask for **scenic** on either map and the route detours through the
neighborhood it skips that is closest to it in meaning, via that neighborhood's most central
item; on the Knowledge Map the detour still obeys the climb rule. **Steer** ("like this, but more
of that") slides between two books: the nearest books to `normalize(A + s(B - A))`, leaving out
both books' authors so sequels and box sets don't fill the list.

**Learn the real science.** The local LLM lists 3 to 5 space-science concepts a book draws on
(for *The Martian*: planetary atmosphere, rocket propulsion, radiation shielding). Each concept is
embedded and snapped to its nearest knowledge item; weak matches are dropped. The route starts at
the easiest snapped item and ends at the hardest item near the concepts' centroid. Books with too
little space science get an honest "no route" instead of a stretched one.

**Narration.** One LLM call writes a short spoken note per stop, checked against length, count and
banned-word rules, then Grok Voice turns each note into audio. Clips are cached per route.

**Portals.** A book and a knowledge item form a portal only if each is in the other's top 3 by
cosine similarity and the similarity is at least 0.60. Mutual matching stops generic books from
linking to everything: 145 portals, from *A Universe from Nothing* to its article (0.87) to
*Mythology* and "Star lore" (0.60).

**Your pin.** The 5 picks' vectors are averaged into a taste centroid. The pin sits at the mean
position of the picks; reading DNA is a softmax over similarity to each neighborhood's centroid.
Books outside the dataset can be added: Open Library supplies metadata, the LLM writes a short
description and tags, and the book is placed among its 10 nearest real books.

**Built to survive venue Wi-Fi.** `scripts/bake_demo.py` ships the demo's data with the site:
both maps, portals, the quick-pick guests, and the five demo "Learn the real science" routes with
their narration audio. If a live call takes longer than about 3 seconds or fails, the site uses
the baked copy; with no backend at all, search falls back to the titles already on screen.

## Tiger Data features used

Tiger is the only database. It holds both maps, every vector, portals, guests, routes and the
event stream. The **Under the hood** panel on the map pages shows these numbers live, read from the
database every 4 seconds.

- **Hypertable with compression.** `events` is a TimescaleDB hypertable with columnar compression
  (segmented by map, hourly chunks, compressed after an hour): 6.9x smaller in our data. The API
  logs searches, item opens, route stops and "learn" taps from background tasks, after each
  response is sent.
- **Continuous aggregate.** `neighborhood_traffic` buckets events into 5-minute visit counts per
  neighborhood, with real-time aggregation (`materialized_only = false`) so the newest events count
  immediately. `GET /api/traffic` reads the last 30 minutes from it to drive the pulsing map; its
  refresh policy runs every minute in a few milliseconds.
- **DiskANN vector search.** pgvectorscale StreamingDiskANN indexes answer every nearest-neighbor
  query: matching typed route endpoints, the curiosity pin (20 nearest knowledge items to a
  reading centroid), snapping book concepts, and placing books from outside the dataset. One
  partial index per map matters: a filtered search ("knowledge items near this book") through a
  shared index streamed past thousands of books and took about 800 ms; with per-map indexes it
  takes about 2 ms.
- **SQL vector joins.** Similarity between consecutive route stops is computed in one query that
  joins the stop list to `items` twice and compares embeddings with `<=>`. Portals are served by a
  join of `portals` to `items` on both maps, and neighborhood centroids for reading DNA come from
  `avg(embedding)` grouped by neighborhood. `build_portals.py --in-db` also runs the portal
  candidates as a `CROSS JOIN LATERAL` in SQL; on our instance that takes about an hour (DiskANN
  rescans inside a lateral run out of memory), so the default build does the same exact math in
  numpy in seconds.

Simulated demo traffic is written with `simulated = true` and labeled "simulated" in the UI. A
hidden switch on the home page (bottom right) turns it on and off.

## How we used Cursor and Grok

**Cursor.** All code was written in Cursor's agent, one session per build step, with the project
brief (`docs/CONTEXT.md`) and an always-on rules file (`.cursor/rules/storystrand.mdc`) that pins
the stack, the data model and the routing rules. The agent wrote and ran the data pipeline, tuned
clustering against target counts, tested routes and book bridges against real data, checked the UI
in Cursor's built-in browser, and authored the commits. `utility/iterations.md` logs every change
and why it was made.

**Grok.** Grok Voice (`POST https://api.x.ai/v1/tts`, voice "ara") narrates every route stop.
Grok Bot turned the original idea into the project brief that planned the build.

## Run it

Requirements: an Apple Silicon Mac, conda env `SCIENCE-env` (Python 3.12), Node 20+, Ollama with
`qwen3.5:9b`, a Tiger Data service, an xAI API key, and an ngrok account with a static domain.

```bash
# secrets (never committed)
# backend/.env:        DATABASE_URL=postgres://...   XAI_API_KEY=...   CONTACT_EMAIL=you@example.com
# frontend/.env.local: NEXT_PUBLIC_API_URL=https://<your-static-domain>.ngrok-free.dev

# database schema
python -m backend.db.apply_schema
psql "$DATABASE_URL" -f backend/db/migrations/002_estimated_books.sql
psql "$DATABASE_URL" -f backend/db/migrations/003_events_compression.sql

# backend
ollama serve
uvicorn backend.main:app --port 8000
ngrok http 8000 --url=<your-static-domain>.ngrok-free.dev

# frontend
cd frontend && npm install && npm run dev

# refresh the offline copies after changing positions, portals or demo routes
python -m scripts.bake_demo
```

The data pipeline (fetching, difficulty scoring, embedding, clustering, 3D layout, labeling, the
road network and portals) lives in `data/scripts/`, outside this repository, because datasets must
not be committed. Its outputs are loaded into Tiger and `data/processed/graph_knowledge.npz` + `graph_books.npz`
(`python build_graph.py --map knowledge|books`).

## Repository

| Path | What's there |
|---|---|
| `frontend/` | Next.js App Router site: the persistent 3D scene, maps, onboarding, routes |
| `backend/` | FastAPI: search, maps, guests, routes, bridges, portals, narration, events, traffic, stats |
| `scripts/bake_demo.py` | Bakes the demo's data and narration into `frontend/public/demo/` |
| `scripts/simulate_traffic.py` | Command-line version of the demo traffic simulator |
| `docs/CONTEXT.md` | Original project brief |
| `utility/` | Change log (`iterations.md`) and a full project brief for other models (`CONTEXT_MODEL.md`) |
