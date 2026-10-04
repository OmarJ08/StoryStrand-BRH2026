# StoryStrand context model

A self-contained brief so another model (or person) can understand and work on StoryStrand
without the chat history. Current as of the `cursor/any-book-and-branding` branch.
The original product spec is `docs/CONTEXT.md` (v6.1); this file describes what was actually
built, including deviations. The change history with reasons is `utility/iterations.md`.

---

## 1. What it is

**StoryStrand: "Google Maps for your curiosity". Tagline: _Your reading DNA_.**
Built for a hackathon (BRH 2026, SpaceX track).

Two 3D maps of meaning, where nearby points are similar in a 1024-d embedding space:

- **Book Map**: 9,814 popular books (goodbooks-10k + Open Library/Google Books blurbs), 18 neighborhoods.
- **Knowledge Map**: 6,000 space-science items: 3,000 Wikipedia articles (astronomy/spaceflight)
  + 3,000 arXiv astro-ph papers, 12 neighborhoods, each item has **difficulty 1–5** (1,200 per level).

Three experiences:

1. **Onboarding**: pick 5 books you loved (from the library, the most-read grid, or *any* book,
   estimated by qwen). You get a pin on the Book Map, a **reading DNA** breakdown across
   neighborhoods and, if at least 2 picks are sci-fi, a "suggested" curiosity pin on the Knowledge Map.
2. **Explore**: orbit/pinch the maps, tap points for details, search, open sources (arXiv, DOI,
   Wikipedia, Goodreads, Open Library). Visitors without a pin get "You are here" at the map centre.
3. **Learning routes**: start ("what is Mars like") → destination ("Martian atmospheric chemistry")
   on the Knowledge Map. The route only climbs by 0 or +1 difficulty per step and is narrated
   stop by stop (qwen-written notes, Grok Voice audio) while the camera flies to each stop.

## 2. Architecture

```
Phone/desktop browser
   │  Next.js 16 app on Vercel (frontend/)
   │  every request: lib/api.ts → NEXT_PUBLIC_API_URL + header "ngrok-skip-browser-warning: 1"
   ▼
ngrok static domain  https://remodeler-jitters-cradling.ngrok-free.dev
   ▼
FastAPI on the laptop (backend/, uvicorn :8000), Apple Silicon
   ├── Tiger Data cloud: TimescaleDB 2.30 / PostgreSQL 18 + pgvector + pgvectorscale (DiskANN)
   ├── BGE-M3 on MLX (mlx-community/bge-m3-mlx-fp16), CLS pooling, 1024-d, L2-normalized
   ├── Ollama qwen3.5:9b (localhost:11434): route notes, book estimates (labels offline)
   ├── xAI Grok TTS (api.x.ai/v1/tts, voice "ara") for narration, MP3 cache on disk
   ├── Open Library search API for estimated books
   └── data/processed/graph_knowledge.npz (strict + soft) and graph_books.npz (taste), loaded at
       startup; neighborhood centroids for scenic detours load from Tiger in a background thread
```

Why the backend is local: MLX needs Apple Silicon and Ollama runs locally; ngrok's static domain
keeps the Vercel env var stable.

## 3. Repository layout

```
storystrand-brh2026/            (git repo, GitHub OmarJ08/storystrand-brh2026)
  .cursor/rules/storystrand.mdc  always-on project rules for agents
  docs/CONTEXT.md                original v6.1 spec (sections referenced as "§n")
  scripts/simulate_traffic.py    demo traffic generator (simulated = true events)
  utility/                       iterations.md (history), CONTEXT_MODEL.md (this)
  backend/
    main.py                      FastAPI app, CORS, all endpoints
    db/schema.sql, apply_schema.py, conn.py, migrations/002_estimated_books.sql
    models/item.py               Pydantic models + embedding_text()
    embeddings.py                BGE-M3/MLX embed() with lock + warm-up
    guest.py                     onboarding: centroid, pins, DNA, sci-fi gate, popular books
    estimate.py                  any-book estimate (Open Library + qwen + BGE-M3 + kNN placement)
    bridge.py                    "Learn the real science": concepts -> snaps -> strict route
    events.py                    event logging + traffic query
    simulator.py                 simulated traffic (thread behind /api/simulation, also the CLI)
    voice.py                     Grok TTS + disk cache
    routing/
      knowledge_cost.py          allowed() strict rule, edge_cost() soft fallback
      graph.py                   loads graph_knowledge.npz + graph_books.npz
      learning.py                dijkstra, learning_route, trim_by_level
      taste.py                   trim_even (Book Map taste routes)
      scenic.py                  scenic detours on either map
      neighborhoods.py           per-map labels, centroids, centrality (background load)
      service.py                 resolve endpoints (id, text or guest) + plan_route (learning / taste)
      notes.py                   one-call Ollama tour-guide notes + transitions
  frontend/
    app/page.tsx                 home (stacked logo, CTAs)
    app/icon.png, apple-icon.png favicon/app icon from the design sheet
    app/(scene)/layout.tsx       shared 3D scene for all pages below
    app/(scene)/map/[map]/       Book/Knowledge map page
    app/(scene)/route/           learning route planner + climb panel; route/books/ = taste routes
    app/(scene)/steer/           Steer (Book Map)
    app/(scene)/onboarding/      picker, reveal/
    components/Logo.tsx          mark / horizontal / stacked lockups
    components/SearchBox.tsx     combobox (title/author + optional free-text row)
    components/map/*             MapExperience (Canvas), PointCloud (instanced), PointPicker,
                                 Labels (DOM overlay), GuestPin, RouteLine, CameraRig,
                                 ItemSheet, MapSwitcher, SceneContext, colors
    components/onboarding/*      OnboardingPicker, RevealFlow, BackButton
    components/route/*           RoutePlanner (both maps), ClimbPanel, TastePanel, useRoutePlayer, useNarration
    components/steer/SteerPanel  two book pickers + slider + results
    lib/api.ts, lib/types.ts, lib/guest.ts
    public/brand/mark*.png       logo mark: colour, ink (one-colour), white (reversed)

StoryStrand-BRH2026/data/       (outside git, never commit)
  raw/        goodbooks-10k CSVs, arXiv snapshot, API caches
  interim/    cleaned JSONL per source
  processed/  items.jsonl, embeddings.npy, graph_knowledge.npz, graph_books.npz, voice/<route_id>/<i>.mp3
  scripts/    pipeline (§5 below)
```

## 4. Data model (Tiger)

`items` is the single table for both maps:

| column | notes |
|---|---|
| `id` text PK | `book:<goodreads_id>`, `wiki:<pageid>`, `arxiv:<id>` |
| `type` | `book`, `encyclopedia`, `paper` (`film`, `report` reserved) |
| `map` | `books` or `knowledge` |
| `title`, `creators[]`, `year`, `description`, `tags[]`, `cover_url`, `attrs` jsonb | attrs holds source ids (arXiv id, DOI, ISBN, Goodreads id, ...) |
| `difficulty` smallint | knowledge only, 1–5 |
| `embedding vector(1024)` | BGE-M3, DiskANN index (`vectorscale`) |
| `cluster_id`, `cluster_label` | neighborhood |
| `x, y, z` | 3D display position (UMAP, radius ~10) |

Other tables: `guests` (id uuid, picks, centroid), `guest_positions` (guest × map pin + DNA),
`routes` (id `r_xxxxxx`, stops, notes), `estimated_books` (books outside the dataset, id `est:<slug>`,
same embedding space, never shown as map points), `portals`/`book_concepts` (spec'd, empty, unused),
`events` hypertable + continuous aggregate (spec'd).

Embedding text for every item: `embedding_text()` = `"{title}. {tags joined}. {description}"`.

## 5. Offline pipeline (`data/scripts/`, run in conda `SCIENCE-env`)

1. `clean_books.py`: goodbooks-10k → Items (English, TF-IDF tags).
2. `fetch_book_descriptions.py`: Open Library → Google Books blurbs (cached, resumable).
3. `fetch_wiki.py`: Wikipedia API category BFS, ranked by pageviews, lead sections; skips biographies/off-topic.
4. `clean_papers.py`: arXiv snapshot → astro-ph papers, spread by year, 40% astro-ph.EP, 15% reviews.
5. `score_difficulty.py`: type base + readability nudge − review bonus → **quantile bins** → 5 equal levels.
6. `embed_items.py`: BGE-M3 MLX CLS-pooled vectors → `processed/items.jsonl` + `embeddings.npy`.
7. `load_tiger.py`: COPY + upsert, rebuild DiskANN.
8. `cluster_items.py --map M`: UMAP 12-d + HDBSCAN **leaf** (knowledge mcs 180/ms 5, books mcs 120/ms 10).
9. `project_3d.py --map M`: separate 3-d UMAP, radius 10 at the 98th percentile.
10. `label_clusters.py --map M`: anchors (§7) + Ollama, snap paraphrases, unique names.
11. `build_graph.py --map knowledge`: kNN k=10, uphill guarantee, connect components,
    strict + soft graphs → `graph_knowledge.npz`; strict-path check was 100% on 200 pairs.
    `build_graph.py --map books`: kNN k=10, connect components, one undirected graph →
    `graph_books.npz` (9,814 nodes, 73,046 edges, 1 component; 200/200 pairs reachable).

Neighborhoods: **Books**: Psychological Thriller, Contemporary Literary Fiction, Paranormal Romance,
Contemporary YA & Chick Lit, Classic Picture Books, Dragon Epic Fantasy, New Adult Romance,
Dark Fae High Fantasy, Hard Sci-Fi, Victorian Historical Romance, Self-Help & Personal Growth,
Funny Memoir & Food, Theatrical Classics, Dark Superhero Comics, Post-Apocalyptic,
WWII Historical Fiction, American Political History, Christian Devotionals.
**Knowledge**: Exoplanets, Spaceflight & Exploration, Celestial Mechanics, Cosmology,
Black Holes & Compact Objects, Protoplanetary Disk Formation and Evolution, Galaxies,
Stars and Constellations, High Energy Astrophysics, Small Bodies & Comets, Deep Sky Objects,
Human Spaceflight Systems.

## 6. API (backend/main.py)

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Liveness check (`{"status": "ok"}`). |
| `GET /api/map?map=books\|knowledge` | All points: id, type, title, cover_url, difficulty, cluster_label, x, y, z (cached). |
| `POST /api/search {map, query, limit}` | Title/author ILIKE first, then semantic (BGE-M3 + DiskANN). |
| `GET /api/items/{id}` | Full item + source links. |
| `GET /api/books/popular?limit=` | Most-read books for the onboarding grid. |
| `POST /api/books/estimate {query}` | Any book → `EstimatedBook` (SearchHit + estimated, description, tags, nearest_titles, found_online). Takes ~5–13 s (qwen). |
| `POST /api/guest {guest_id, book_ids[5]}` | ids may be `book:*` or `est:*`. Returns picks, book_pin, curiosity_pin (null unless ≥ 2 sci-fi picks), DNA per map, scifi_picks. |
| `POST /api/route {map, start, destination, scenic?, guest_id?}` | Each endpoint is `{item_id}`, `{text}` or (book starts) `{guest: true}`. Knowledge: learning route, notes kicked off in the background. Books: `kind: "taste"`, `notes_status: "none"`. `scenic: true` adds a detour; the response's `scenic` is `{label, waypoint_id}` or null when none fits. |
| `POST /api/steer {a_id, b_id, s, k=8}` | Steer: nearest books to normalize(A + s(B − A)), excluding A, B and their authors. |
| `POST /api/bridge/learn {book_id, guest_id?, max_stops=5}` | "Learn the real science": same shape as /api/route with `kind: "bridge"`, `book`, `concepts`. 422 if the book draws on too little space science. |
| `GET /api/traffic?map=` | Visits per neighborhood (30 min, continuous aggregate), `recent` (15 s), `real_visits`, `simulated_visits`. Simulated events count only while the simulation is on. |
| `GET/POST /api/simulation {running}` | Demo switch for the in-API traffic simulator (hidden dot, bottom right of the home page). |
| `GET /api/portals?map=` | Portals on one map: `{similarity, here, there, there_map}` (145 mutual book <-> knowledge matches). |
| `GET /api/stats` | Live Tiger numbers for the "Under the hood" panel (vector search ms, counts, chunks, compression, cagg refresh). |
| `GET /api/route/{id}/notes` | Notes status/result. |
| `POST /api/route/{id}/voice` / `GET /api/route/{id}/voice/{i}.mp3` | Synthesize/cache and fetch narration clips. |

## 7. Core algorithms

- **Strict climb rule** (v6.1): on the Knowledge Map an edge u→v is allowed only if
  `difficulty(v) - difficulty(u) ∈ {0, 1}`. Cost `(1 - cosine)^2`. Dijkstra on the strict graph;
  if no path exists, the soft graph (all directions, penalties for downhill/skips), marked `relaxed: true`.
  `trim_by_level` shortens to ≤ 6 stops without removing any represented level.
- **Endpoint resolution**: free text is embedded; among the top 20 candidates within 0.05 similarity
  of the best, prefer low difficulty for a start and high for a destination.
- **Taste routes** (Book Map, `/route/books`): `graph_books.npz` (kNN k=10, undirected, cost (1−s)²);
  Dijkstra, evenly spaced trim, guest picks never middle stops; start may be `{guest: true}`; text =
  exact title, else nearest by meaning. No narration.
- **Topic pages** (Knowledge Map): a typed destination's route passes through its own encyclopedia
  article (title match among the 5 closest, else closest if ≥ 0.55) when the climb allows it.
- **One book per author** (taste routes): middle stops never repeat an author already on the route.
- **Scenic** (both maps, `scenic: true`): waypoint = most central item of the untouched neighborhood
  nearest the route; Knowledge waypoints stay within the start–goal levels and both halves strict.
- **Steer** (`/steer`, `POST /api/steer`): nearest books to normalize(A + s(B−A)), minus A, B and their authors.
- **Guest**: centroid = normalized mean of pick vectors. Book pin = mean x,y,z of picks.
  DNA = softmax(cosine(centroid, neighborhood centroid) / 0.05). Curiosity pin = mean position of
  20 nearest knowledge items; shown only if ≥ 2 picks are sci-fi (tags regex or Hard Sci-Fi/space neighborhood).
- **Estimated books**: Open Library metadata → qwen blurb + tags → embed with the same text recipe →
  x,y,z = similarity-weighted mean of 10 nearest real books; neighborhood = largest similarity weight.
- **Bridge ("Learn the real science")**: qwen lists 3–5 *space-science* concepts for the book →
  each embedded and snapped to its nearest knowledge item (kept only if cosine ≥ 0.58; need ≥ 2) →
  start = easiest snapped item, destination = hardest of the 20 items nearest the kept concepts'
  centroid → strict learning route (max 5 stops). Cached in `book_concepts`; identical routes with
  ready notes are reused. Notes get a context line naming the book.
  Demo books: The Martian, Ender's Game, Rendezvous with Rama, Contact, Red Mars.
- **Events / traffic**: search, stop_click (item sheet open), route (per stop) and learn events are
  written to `events` in background tasks. The simulator (`backend/simulator.py`, toggled by the
  hidden home-page switch) adds `simulated = true` events; each neighborhood label shows its
  30-min visit count and a coral dot (brighter = busier, flashes once per poll with fresh visits),
  plus a "simulated" badge. No glows, pings or portal rings in the scene.
- **Portals**: mutual top-3 by cosine between books and knowledge items, similarity ≥ 0.60, cap 300
  (`data/scripts/build_portals.py`, exact numpy by default, `--in-db` SQL lateral join optional).
- **Book Map layout**: 3D UMAP supervised by cluster labels (weight 0.05) + 3-SD outlier clip.
- **Elevation**: on an active route, stops are lifted by difficulty × 0.9 and the line draws upward
  as narration advances (`RouteLine.tsx`, `liftedPoint`).
- **Offline fallbacks**: `scripts/bake_demo.py` -> `frontend/public/demo/`; `liveOrBaked()` in
  `lib/api.ts` uses the baked copy after ~3 s or on error (maps, portals, popular books, quick-pick
  guests, the 5 demo bridge routes with narration MP3s).
- **Notes**: one Ollama JSON call for all stops, ≤ 2 sentences/240 chars, banned words
  (delve, tapestry, realm, embark, journey, ...), retry once, then spoken transitions added.

## 8. Frontend behaviour

- One persistent R3F Canvas (`app/(scene)/layout.tsx`) behind all map/route/onboarding pages.
- Points: one instanced mesh, neighborhood colours; knowledge points grow/brighten with difficulty.
- Picking in screen space (finger-friendly); labels are DOM elements projected each frame with
  collision avoidance; they dim under the cursor.
- `touch-none` only on the canvas so sheets scroll and text is selectable.
- Guest state: `localStorage` keys `storystrand.guestId` (UUID) and `storystrand.guest` (last
  GuestResponse); read via `useSyncExternalStore` (`useGuest`, `useHydrated`).
- Pins: guest pin per map; otherwise an explorer "You are here" pin at the cloud centre on map pages.
- Home button (logo mark) top-left on map pages. Onboarding pages have Back buttons.
- Audio is fetched as a Blob through `apiBlob()` (ngrok would serve an HTML warning to a bare `<audio src>`).

## 9. Brand

Colours: ink (dark background), teal, coral, gold (from §3; `globals.css` theme tokens).
Fonts: Bricolage Grotesque (display/wordmark), Work Sans (body).
Logo: open book (teal/coral/gold pages) with a DNA strand rising from it. Wordmark "Story" white +
"Strand" coral on dark (design: teal on light/primary), tagline "YOUR READING DNA" letter-spaced.
Assets: `frontend/public/brand/mark.png` (colour), `mark-ink.png`, `mark-white.png`; app icon is the
colour mark on ink. Source: the "StoryStrand logo variants" design sheet (Design.pdf).

## 10. Running it locally

```bash
# backend (conda env SCIENCE-env), from the repo root
uvicorn backend.main:app --port 8000
ngrok http 8000 --url=remodeler-jitters-cradling.ngrok-free.dev
ollama serve          # qwen3.5:9b pulled
# demo traffic: tap the faint dot at the bottom right of the home page
# (or from a terminal: python -m scripts.simulate_traffic)

# frontend
cd frontend && npm install && npm run dev      # NEXT_PUBLIC_API_URL in frontend/.env.local
```

Env (never committed): `backend/.env` has `DATABASE_URL` (Tiger), `XAI_API_KEY`, optional `CONTACT_EMAIL`;
`frontend/.env.local` has `NEXT_PUBLIC_API_URL`. Vercel has the same `NEXT_PUBLIC_API_URL`.
Schema: `python -m backend.db.apply_schema`, then `psql "$DATABASE_URL" -f backend/db/migrations/002_estimated_books.sql`.

## 11. Rules for contributors (from `.cursor/rules/storystrand.mdc`)

- Tiger is the only database. No SQLite/JSON stores for app data.
- Embeddings: BGE-M3 on MLX only; routes/search use the full 1024-d vectors (3D is display only).
- Strict climb rule on the Knowledge Map.
- All frontend fetches go through `lib/api.ts`.
- Secrets only in `.env` files; datasets (`data/`) never go to GitHub.
- Official APIs only (Open Library, Google Books, Wikipedia, arXiv snapshot), no scraping.

## 12. Known gaps / next ideas

- Taste routes have no narration (the notes prompt is about the climb).
- Taste routes, scenic and Steer need the live API (no baked fallback for venue Wi-Fi).
- Search/item events carry no guest_id (only routes and learns do).
- Estimated books are not drawn as map points; they only influence the guest's pin and DNA.
- Backend must be running on the laptop for the deployed site to work.
