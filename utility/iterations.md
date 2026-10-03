# StoryStrand iterations log

Every change made to StoryStrand so far, in build order, with the reason behind it.
Commit hashes refer to this repo (`OmarJ08/storystrand-brh2026`). Data-pipeline scripts live
outside the repo in `StoryStrand-BRH2026/data/scripts/` (datasets must never reach GitHub), so
their changes are described here without hashes.

---

## 0. Project setup

| Change | Why |
|---|---|
| Moved the project brief ("Project Context for Grok Bot v6.1") to `docs/CONTEXT.md` (`9c89fdb`). | One canonical spec in the repo that every later prompt can point at by section number. |
| Added `.cursor/rules/storystrand.mdc` (alwaysApply, < 40 lines) (`47f2f4a`). | Keeps the essentials (folder layout, stack, Item model, Tiger as the only DB, BGE-M3 on MLX, 1024-d routing, the strict climb rule, `lib/api.ts` for all fetches, secrets only in `.env`) in front of every agent run. |
| Added `.gitignore` for `.env`, `.env.local`, `data/raw/`, `data/interim/`, `data/processed/`, `node_modules`, `__pycache__`. | Secrets and datasets stay out of GitHub. |
| Configured git identity (OmarJ08) and moved work onto feature branches + PRs. | Clean history; each feature merges through a PR. |

## 1. Infrastructure

| Change | Why |
|---|---|
| Created the Tiger Data service (TimescaleDB 2.30 on PostgreSQL 18, `vector` + `vectorscale`). | The spec makes Tiger the single database: relational rows, pgvector/DiskANN similarity, and a hypertable for events in one place. |
| Installed `psql` (Homebrew `libpq`). | To apply schema and inspect data from the terminal. |
| ngrok with a static domain (`remodeler-jitters-cradling.ngrok-free.dev`) in front of `uvicorn :8000`. | The Vercel frontend must reach the FastAPI backend running on the laptop (MLX + Ollama need Apple Silicon locally). A static domain means `NEXT_PUBLIC_API_URL` never changes. |
| Pulled `qwen3.5:9b` into Ollama; conda env `SCIENCE-env` with mlx, mlx-embeddings, umap-learn, scikit-learn, psycopg, pgvector, fastapi, httpx. | Local LLM for labels/notes/estimates; MLX for fast on-device embeddings. |

## 2. Schema, models, API skeleton (`e8bee48`)

| Change | Why |
|---|---|
| `backend/db/schema.sql` exactly per spec §8: `items` (with `embedding vector(1024)` + DiskANN index), `portals`, `book_concepts`, `guests`, `guest_positions`, `routes`, `events` hypertable + continuous aggregate. | Spec-defined data model. |
| `backend/db/apply_schema.py` splits SQL on top-level `;` and runs each statement with autocommit. | Continuous aggregates cannot be created inside a transaction; running the file as one batch failed. |
| `backend/models/item.py` (Pydantic `Item`, `embedding_text()`) and `frontend/lib/types.ts` mirror. | One Item shape for both maps; one text recipe (title. tags. description) for every embedding. |
| `backend/main.py` FastAPI app with `GET /api/health` and CORS from §13. | First end-to-end check through ngrok. |
| Dropped NASA technical reports from scope. | Time. Its gap at difficulty level 3 is filled by quantile binning (below) and by review papers. |

## 3. Data acquisition (outside the repo)

| Change | Why |
|---|---|
| `clean_books.py`: goodbooks-10k → Item JSONL (English only, TF-IDF-ranked distinctive tags). | Raw Goodreads shelves are noisy ("to-read", "favorites"); TF-IDF keeps the tags that actually describe a book. |
| `fetch_book_descriptions.py`: Open Library (ISBN, then title/author) → Google Books fallback, cached JSONL, resumable. | goodbooks has no blurbs; embedding text needs a description. Official APIs only, no scraping. |
| First ran a 4k subset to a separate file while the full 10k fetch continued in the background. | Unblocked clustering/maps while the slow fetch finished overnight. Later the full set (9,814 books) was loaded. |
| `fetch_wiki.py`: official Wikipedia API, BFS over astronomy/spaceflight categories, ranked by 60-day pageviews, keeps lead section. | Level 1–2 entry points for the Knowledge Map. |
| Wikipedia fixes: retry single titles on `pvi-cached-error-title`, incremental caching, drop pure off-topic categories, drop biography intros (birth/death dates). | The pageview API crashed whole batches on one bad title; people biographies polluted the science map. |
| `clean_papers.py`: streams the multi-GB arXiv snapshot; primary category astro-ph.*; even spread over years; 40% astro-ph.EP; 15% review papers. | "Give me a better spread of papers": avoid one year/sub-field dominating; reviews give gentler level 3–4 stops. |

## 4. Difficulty, embeddings, load

| Change | Why |
|---|---|
| `score_difficulty.py`: score = type base (encyclopedia 1.5, paper 4.5) ± readability nudge − 0.5 for reviews, then **quantile binning** into levels 1–5 (exactly 1,200 items each). | Without NASA reports a fixed per-type level leaves level 3 empty and breaks the +1 climb rule. Equal-size levels guarantee every rung exists. |
| `backend/embeddings.py` + `embed_items.py`: `mlx-community/bge-m3-mlx-fp16`, **CLS pooling** (`last_hidden_state[:, 0]`), L2-normalized, 1024-d, max 512 tokens, thread lock, lazy load + background warm-up. | `BAAI/bge-m3` has no safetensors for MLX; the mlx `text_embeds` output is mean-pooled, but BGE-M3 dense vectors are defined with CLS pooling. |
| `load_tiger.py`: COPY into staging then upsert; drop DiskANN before load, rebuild after. | Re-runnable loads (4k → full 9.8k) and much faster index build. |

## 5. Neighborhoods and 3D layout

| Change | Why |
|---|---|
| `cluster_items.py`: UMAP → 12-d (min_dist 0) then HDBSCAN; noise joins nearest centroid in full 1024-d. | HDBSCAN on raw 1024-d fails (distance concentration). |
| Switched HDBSCAN to `cluster_selection_method="leaf"`; knowledge `mcs=180, ms=5`; books `mcs=120, ms=10` (after briefly `mcs=25` for the 4k subset) (`d795885`). | `eom` collapsed into one giant cluster (5,000 knowledge items / 9,400 books). Leaf with these sizes lands at 12 knowledge and 18 book neighborhoods, inside the spec's targets (8–16 / 12–20). |
| `project_3d.py`: separate 3-d UMAP (min_dist 0.1), centered, 98th percentile scaled to radius 10, outliers pulled to radius 13. | Display only, kept separate so clustering quality doesn't depend on 3D. Outliers can't shrink the main cloud. |
| `label_clusters.py`: §7 anchor names shortlisted by BGE-M3 similarity, Ollama picks an anchor or proposes a plain name; anchors used once; banned words; **snap paraphrases to anchors**. | Similarity alone forced anchors onto wrong clusters ("Hard Sci-Fi" on inspirational books); the LLM alone stretched anchors. It also paraphrased ("Physical Cosmology"), so names snap back to the anchor. |
| Manual renames: "Southern Black Women's Fiction" → "Contemporary Literary Fiction"; "New Adult Sports Erotica" → "New Adult Romance". | Labels must describe the whole neighborhood respectfully and accurately. |

## 6. Road network (`5b9557f`, graph built outside the repo)

| Change | Why |
|---|---|
| `backend/routing/knowledge_cost.py`: `allowed(d_from, d_to)` = Δd ∈ {0, +1}; soft `edge_cost` with downhill/skip penalties. | v6.1 strict climb rule: a learner never drops a level or skips one. Soft graph is only a fallback. |
| `build_graph.py --map knowledge`: k=10 cosine neighbors (full 1024-d), uphill guarantee edge for every level 1–4 item, stray components connected to main, strict + soft directed graphs saved to `data/processed/graph_knowledge.npz`. | Without the uphill guarantee some items have no level+1 neighbor and strict routes dead-end. |
| §9.1 check: 200 random (start ≤ 2, goal ≥ 4) pairs → 100% have a strict path (target ≥ 95%). | Proves routes will almost never need the relaxed fallback. |

## 7. Frontend foundation (`6d14a73`)

| Change | Why |
|---|---|
| Next.js 16 App Router + TypeScript + Tailwind v4 in `frontend/`. | Spec stack; deploys to Vercel. |
| `lib/api.ts` (`api<T>()`), sends `ngrok-skip-browser-warning: 1`. | One fetch path; ngrok's free tier otherwise returns an HTML warning page instead of JSON. |
| Brand colors (ink, teal, coral, gold) + fonts (Bricolage Grotesque display, Work Sans body) from §3. | Visual identity. |
| CORS `allow_origins` set to the Vercel URL (plus localhost; preview URLs via regex). | Browser requests from the deployed site would otherwise be blocked. |

## 8. 3D maps (`d90f30a`, `95e1785`, `a2be188`)

| Change | Why |
|---|---|
| `GET /api/map?map=` (id, type, title, cover, difficulty, cluster, x, y, z; cached). | Single payload for the whole cloud. |
| `/map/[map]`: all points as ONE instanced mesh, colored by neighborhood, OrbitControls, screen-space tap picking, HTML label overlay, Books/Knowledge switcher, bottom sheet on tap. Knowledge points scale/brighten with difficulty. | §13 mobile 3D rules: one draw call for 6–10k points, finger-friendly picking. |
| Hover outline on dots; bolder, higher-contrast group labels; smaller dots; more color contrast between neighborhoods. | User feedback: dots needed feedback, labels were hard to read, groups blended together. |
| Labels: replaced drei `<Html>` with a custom DOM overlay projected in `useFrame`, collision avoidance, dims to 15% (180 ms) under the cursor with enter/leave hysteresis, sorting decoupled from hover. | drei `<Html>` crashed on unmount under React 19; sliding/fading labels flickered and jumped. Several iterations ("slide away", "just disappear", "don't move first") ended at a calm dim. |
| `POST /api/search` + `SearchBox` (title/author ILIKE first, then semantic). | "Can we add a book search option": jump to any book or topic on the map. |
| Shared `(scene)` layout with `SceneProvider` + `MapExperience` so `/map`, `/route`, `/onboarding` share one Canvas. | The 3D scene persists between pages instead of reloading 10k points. |
| `touch-none` only on the canvas; sheets/panels scroll and allow text selection; drag-to-dismiss only on the handle. | Mobile: text in sheets was unselectable and panels wouldn't scroll. |

## 9. Learning routes (`91b1ba7`)

| Change | Why |
|---|---|
| `POST /api/route` (knowledge only): endpoints by item id or free text (semantic, among top-20 candidates within 0.05 similarity, prefer the right difficulty); Dijkstra on strict graph, soft fallback flagged `relaxed: true`; `trim_by_level` to ≤ 6 stops never removing a level. Saved to `routes`. | §9.3: shortest path in 1024-d meaning space that only climbs by +1. Trimming must keep the "staircase". |
| `/route` page: start + destination inputs, route line through stops, climb profile panel. | Visualizes the climb. Check passed: "what is Mars like" → "Martian atmospheric chemistry", levels monotone +0/+1, `relaxed: false`. |

## 10. Narration (`f92b45b`, `9a84f47`)

| Change | Why |
|---|---|
| `backend/routing/notes.py`: all stop notes in ONE Ollama `qwen3.5:9b` JSON call, background task; ≤ 2 sentences / 240 chars each; banned-word list; no "Stop 3…" openings; validate + one retry. | §11: one call is faster and keeps the voice consistent; validation stops clichés ("delve", "journey"). |
| `add_transitions()`: "Stepping up a level, …", "From there, …" unless the note already opens with a transition. | "Make it more natural": notes read as a connected tour. |
| `backend/voice.py`: xAI Grok TTS (`POST https://api.x.ai/v1/tts`, voice `ara`), ≤ 3 parallel, MP3 cached per route on disk; `POST /api/route/{id}/voice` + clip endpoint. | Spoken tour; caching avoids paying twice. Route id regex keeps cache paths safe. |
| Frontend "Start route": plays each clip, flies the camera to each stop, `navigator.vibrate` per stop (Android). `apiBlob()` fetches audio through `lib/api.ts`. | `<audio src=ngrok-url>` got ngrok's HTML warning page; fetching as a blob sends the skip header. |

## 11. Reaching the sources (`5e3a194`)

| Change | Why |
|---|---|
| `GET /api/items/{id}` with full description + links (arXiv abs/PDF, DOI, Wikipedia, Goodreads, Open Library). Item sheet: full abstract, selectable text, Copy text / Copy reference (with clipboard fallback). | "How are users supposed to actually reach these resources after getting their paths": every stop now links to the real paper/article. |

## 12. Onboarding and reading DNA (`2324356`, `84ca375`)

| Change | Why |
|---|---|
| `backend/guest.py` + `POST /api/guest`: 5 book ids → centroid (normalized mean of 1024-d vectors), Book Map pin (mean x,y,z), DNA = softmax(sim to each neighborhood centroid / T=0.05), curiosity pin = mean of 20 nearest knowledge items (DiskANN), labelled "suggested". Upserts `guests` / `guest_positions`. `GET /api/books/popular`. | §9.4/§10: place the reader in both maps from 5 picks. |
| `lib/guest.ts`: random UUID + saved result in `localStorage`, `useSyncExternalStore` hooks, `useHydrated()`. | No accounts; survives reloads; avoids hydration mismatch and premature redirects on `/onboarding/reveal`. |
| `/onboarding` (search + popular cover grid + 5-slot tray) and `/onboarding/reveal` (pins drop, DNA panel slides up). | The first-run experience. |
| Back buttons on onboarding pages; headline names the top DNA bar; **sci-fi gate**: curiosity pin only if ≥ 2 picks are sci-fi (tags or neighborhood). | "A Diary of Anne Frank + Great Gatsby reader shouldn't randomly like stars." The knowledge map is space science, so the bridge only makes sense for sci-fi readers. |

## 13. Any book, branding, explorers (this iteration)

| Change | Why |
|---|---|
| `backend/estimate.py` + `POST /api/books/estimate`: Open Library search (title, authors, year, cover, subjects) → qwen3.5:9b writes a spoiler-light blurb + 6–8 Goodreads-style tags (falls back to OL subjects) → BGE-M3 embeds `title. tags. blurb` → placed at the similarity-weighted mean of its 10 nearest real books; neighborhood = most similarity weight. Stored in new table `estimated_books` (`backend/db/migrations/002_estimated_books.sql`) with id `est:<slug>`. | A reader's favorite book may not be in the 9,814. Same text recipe + same embedder as real books means the estimate lands in the same space. Kept out of `items` so maps/clusters/routes only contain real data. |
| `/api/guest` also loads `est:` picks from `estimated_books`. | Estimated books count toward the centroid, DNA, pin and the sci-fi gate exactly like real picks. |
| Onboarding search offers "Any book: add “…”"; a slot pulses while placing (~5–13 s); tray marks estimates "EST."; a line explains where it landed and its nearest real books (and warns when it was a guess from the title only). | Transparency: the user sees it's an estimate and why it landed there. |
| Removed the "Backend connected" health card from the home page (the endpoint stays for checks); rebuilt home with the stacked logo lockup and two CTAs. | It was a dev check, not product. |
| Explorer "You are here" pin at the centre of the map's cloud when the visitor has no pin of their own on that map; hint link "Pick 5 books to place yourself". | People who skip onboarding still get an anchor and a nudge to personalise. |
| Home button (logo mark) top-left on map pages. | A way back to the starting screen from the map. |
| Logos from the design sheet: extracted the mark (colour, one-colour ink, reversed white) from `Design.pdf` with its alpha mask into `public/brand/`; `components/Logo.tsx` (stacked / horizontal / mark, "Story" + coral "Strand", "YOUR READING DNA"); `app/icon.png` + `app/apple-icon.png` (colour mark on ink), default Next favicon removed. | Implements the identity system; the dark-UI lockup uses the design's dark variant (coral "Strand"). |
| `utility/iterations.md` (this file) and `utility/CONTEXT_MODEL.md`. | History with reasons, and a self-contained brief for other models. |

## 14. "Learn the real science" bridge (Step 17)

| Change | Why |
|---|---|
| `backend/bridge.py` + `POST /api/bridge/learn {book_id, guest_id?, max_stops=5}`: qwen extracts 3–5 concepts (JSON, one retry), each embedded and snapped to its nearest Knowledge Map item; start = easiest snapped item; destination = hardest of the 20 items nearest the concepts' centroid; strict `learning_route`; saved as a `routes` row with `kind = 'bridge'`. Response = the `/api/route` shape plus `book` and `concepts`. | Section 10/12 bridge contract. Reusing the route shape means the existing climb panel, notes, voice and player work unchanged. |
| Concept prompt narrowed to **space-science** concepts (astronomy, planetary science, spaceflight, space physics). | With the spec's generic "scientific concepts", The Martian gave "hydroponics, soil chemistry, photosynthesis", which snapped to unrelated astronomy (hydroponics → a hot super-Earth paper), and routes drifted into galaxy clusters. The Knowledge Map is space science only. |
| Snaps below cosine 0.58 are dropped; fewer than 2 on-map concepts → 422 "draws on too little space science". Centroid uses only kept concepts. | Measured: good snaps were 0.58–0.74 ("radio astronomy" → Radio astronomy 0.74), junk 0.43–0.55. The Great Gatsby now gets an honest refusal instead of a nonsense route. |
| Concepts + snaps cached in `book_concepts`; a repeat request whose stops match a saved bridge route with ready notes reuses that route. | Second tap is ~1 s and its notes and Grok Voice clips are already cached. |
| Notes job takes an optional context line; bridge routes tell the guide which book the listener came from. | The first note links back to the book ("just like the air on Mars in that book"). |
| `plan_route` refactored into `load_stops()` + `save_route()`. | Shared by learning and bridge routes. |
| Item sheet (books): "🔭 Learn the real science" button with loading/error states. `MapExperience.onLearn` unlocks audio inside the tap, calls the bridge, sets the route, flies the camera, routes to `/route` with `autoplay`; `/route` starts narration once clips are ready and shows "The real science of …" with concept chips. | Hands-free tour from one tap. |
| `useRoutePlayer` now uses one module-level `<audio>` element and exports `unlockAudio()`. | iPhone Safari only plays audio started in a gesture; the clips arrive 3–20 s after the tap, on another page, so the element is unlocked in the tap and reused. |
| Tested on 11 books. Feature in the demo: **The Martian, Ender's Game, Rendezvous with Rama, Contact, Red Mars**. Don't feature: The Three-Body Problem (drifts to galaxy clusters), Packing for Mars (drifts to disks), Dune / 2001 (wander). All routes strict (`relaxed: false`). | "If concepts come out bad for a book, don't feature it." |

## 15. Live traffic (Step 18)

| Change | Why |
|---|---|
| `backend/events.py`: `log_events()` writes to the `events` hypertable from FastAPI background tasks (after the response). Logged: `search` (top hit's neighborhood), `stop_click` (on `GET /api/items/{id}`, i.e. every sheet open), `route` (one per stop), `learn` (the book, plus `route` events for its stops). Failures are printed, never raised. | Section 8 events. Background tasks keep the extra Tiger round trip out of request latency. |
| `GET /api/traffic?map=`: visits per neighborhood over 30 min from the `neighborhood_traffic` continuous aggregate, `recent` counts (last 15 s) from raw events, and real vs simulated totals. | Section 12. Real-time aggregate (`materialized_only = false`) includes the newest buckets; observed that backfilled history appears after the next policy refresh (≤ 1 min). |
| `scripts/simulate_traffic.py`: `simulated = true` events every ~3 s (~8 per burst) across all 30 neighborhoods, weighted by √size × a drifting random-walk popularity, with occasional 6× "surges"; `--backfill` minutes of history at start. | Activity on both maps during judging; drifting/surging weights make the pulses move around instead of sitting still. |
| `components/map/Traffic.tsx`: `useTraffic` polls every 5 s (map pages only, tab visible); `TrafficPulse` draws a breathing glow per neighborhood (size ∝ √visits) and rings that ping for fresh visits, spread over the poll interval; two instanced draw calls. `TrafficBadge`: "Live traffic · N visits in 30 min · SIMULATED". | Neighborhoods visibly pulse; the label is honest about simulated data. |
| Glow drawn first in the opaque pass with no depth test (dots paint over it); rings drawn on top and kept small (≤ ~4 units). | First version washed the cloud centre out to white and the rings spanned half the map. |
| Simulator moved into `backend/simulator.py` (daemon thread) with `GET/POST /api/simulation`; hidden switch (faint dot, bottom right of the home page) toggles it. While off, `/api/traffic` counts only real events, straight from the hypertable. `scripts/simulate_traffic.py` is now a thin CLI (`python -m scripts.simulate_traffic`). | Demo control without a terminal; turning it off clears the pulses and the "simulated" badge immediately instead of after 30 minutes. A standalone `nohup` run had also died silently when its shell closed. |

## 17. Visual cleanup and README

| Change | Why |
|---|---|
| Glass panels (translucent ink + `backdrop-blur`) replaced by solid `surface` panels with a `line` border; unused `glass` utility removed; body gradient replaced by flat ink. | Remove generic "glassmorphism over a gradient" styling; solid panels also read better over the busy 3D cloud and skip costly blur on phones. |
| Secondary text at 40–60% white replaced by a `muted` token (#a3b8b7, about 8:1 on ink). | Low-contrast dark mode. |
| Removed the 🔭 emoji, "✓", and eyebrow labels above headlines (item type over the title, "You are here" / "Your curiosity" over the reveal headlines); uppercase section labels made sentence case. Item type now leads the line under the title. | Generic AI-template patterns; the headlines already say it. |
| Cover hover changed from an opacity fade to a ring; secondary buttons get a brighter border on hover instead of a translucent fill. Floating pills share one height (h-10) and panels one padding. | Fading-button hovers and inconsistent spacing. |
| Em dashes removed from the utility docs. `README.md` written (pitch, how it works, Tiger features, Cursor and Grok, how to run). | Requested; README only claims features that exist (no portals, compression or hybrid search). |

## 16. Narration reliability

| Change | Why |
|---|---|
| Notes: overlong notes are trimmed locally at a sentence boundary (`shorten()`); up to 3 attempts; job timeout 25 → 45 s. Frontend waits up to 60 s for notes (was 30). | A route on Vercel showed "No narration": qwen returned 4 notes for 5 stops and two over 240 chars, twice; another route hit the 25 s timeout. Not a Vercel issue. Re-running both failed routes with the fix gave ready notes. |
