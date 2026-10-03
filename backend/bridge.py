"""POST /api/bridge/learn: "Learn the real science" (Section 10).

A book blurb describes a vibe and a knowledge item describes a concept, so raw book-to-
knowledge similarity is weak. Instead qwen translates the book into 3-5 real scientific
concepts; each is embedded (BGE-M3) and snapped to its nearest Knowledge Map item.
  start       = the easiest snapped item (ties: closest match)
  destination = the hardest item among the 20 nearest the concepts' centroid
Then the strict learning route between them (Section 9.3). Concepts and their snaps are
cached in book_concepts; a repeat request with the same stops reuses the saved route, so
its notes and voice clips are cached too.
"""
import json
import re

import httpx
import numpy as np
import psycopg
from fastapi import HTTPException
from pgvector.psycopg import register_vector

from backend.db.conn import get_conn
from backend.embeddings import embed
from backend.models.item import BridgeLearnRequest, RouteResponse, SearchHit
from backend.routing import graph as graph_module
from backend.routing.learning import learning_route
from backend.routing.service import HIT_COLUMNS, load_stops, save_route

OLLAMA = "http://localhost:11434/api/chat"
MODEL = "qwen3.5:9b"
TIMEOUT_S = 30
MIN_CONCEPTS, MAX_CONCEPTS = 3, 5
MAX_CONCEPT_CHARS = 60
SNAP_CANDIDATES = 5
DEST_CANDIDATES = 20
# Concepts whose nearest knowledge item is less similar than this are off the map
# (e.g. "hydroponics" -> a hot super-Earth paper at 0.50; "radio astronomy" -> 0.69).
SNAP_MIN_SIMILARITY = 0.58
MIN_ON_MAP_CONCEPTS = 2

# Section 10's prompt, narrowed to what the Knowledge Map covers (space science only), so
# a novel's biology or politics doesn't snap to unrelated astronomy.
SYSTEM = """List 3-5 real-world space-science concepts this book draws on (astronomy, planetary
science, spaceflight, space physics). Short noun phrases, no plot, no character names.
Return JSON: {"concepts": ["...", "..."]}."""


def clean(concepts: object, title: str) -> list[str]:
    """Short, distinct noun phrases; drops anything that repeats the title."""
    if not isinstance(concepts, list):
        return []
    title_words = {w for w in re.findall(r"[a-z]+", title.lower()) if len(w) > 3}
    out: list[str] = []
    for c in concepts:
        c = str(c).strip().strip(".")
        words = set(re.findall(r"[a-z]+", c.lower()))
        if not c or len(c) > MAX_CONCEPT_CHARS or (title_words and title_words <= words):
            continue
        if c.lower() not in (o.lower() for o in out):
            out.append(c)
    return out[:MAX_CONCEPTS]


def extract_concepts(title: str, tags: list[str], description: str) -> list[str]:
    user = f"Title: {title}. Tags: {', '.join(tags[:12])}. Description: {description[:1200]}"
    messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}]
    concepts: list[str] = []
    for _ in range(2):
        try:
            r = httpx.post(OLLAMA, timeout=TIMEOUT_S, json={
                "model": MODEL, "messages": messages, "format": "json", "stream": False,
                "think": False, "options": {"temperature": 0.2}})
            r.raise_for_status()
            content = r.json()["message"]["content"]
            concepts = clean(json.loads(content).get("concepts"), title)
        except (httpx.HTTPError, ValueError, KeyError, AttributeError) as e:
            raise HTTPException(502, f"concept extraction failed: {e}") from e
        if len(concepts) >= MIN_CONCEPTS:
            return concepts
        messages += [{"role": "assistant", "content": content},
                     {"role": "user", "content": "Give 3 to 5 distinct concepts, as JSON."}]
    if not concepts:
        raise HTTPException(422, "no scientific concepts found for this book")
    return concepts


def nearest_on_graph(conn: psycopg.Connection, vec: np.ndarray, k: int) -> list[tuple[str, int, float]]:
    """(id, difficulty, similarity) of the k nearest knowledge items on the road network."""
    rows = conn.execute(
        "SELECT id, difficulty, 1 - (embedding <=> %(v)s) FROM items "
        "WHERE map = 'knowledge' ORDER BY embedding <=> %(v)s LIMIT %(k)s",
        {"v": vec, "k": k},
    ).fetchall()
    return [r for r in rows if r[0] in graph_module.graph.index]


def bridge_context(book: SearchHit, concepts: list[str]) -> str:
    """Framing for the tour-guide notes: the listener arrives from this book."""
    by = f" by {book.creators[0]}" if book.creators else ""
    return (f'The listener arrives from the book "{book.title}"{by}, which draws on: '
            f'{", ".join(concepts)}. In the first note, link the book to the first stop in a few words '
            f'(no plot spoilers); after that, focus on the science.')


def learn(req: BridgeLearnRequest) -> tuple[RouteResponse, SearchHit]:
    """The bridge route and the book it starts from."""
    g = graph_module.graph
    if g is None:
        raise HTTPException(503, "knowledge road network not loaded")

    with get_conn() as conn:
        register_vector(conn)
        row = conn.execute(
            f"SELECT {HIT_COLUMNS}, tags, description FROM items WHERE id = %s AND map = 'books'",
            (req.book_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(404, f"{req.book_id} is not on the book map")
        book = SearchHit(**dict(zip(SearchHit.model_fields.keys(), row[:10])))
        tags, description = row[10] or [], row[11] or ""

        cached = [c for (c,) in conn.execute(
            "SELECT concept FROM book_concepts WHERE book_id = %s ORDER BY created_at, concept",
            (req.book_id,),
        ).fetchall()]
        concepts = cached or extract_concepts(book.title, tags, description)
        vecs = embed(concepts)

        snaps = []   # (concept, knowledge id, difficulty, similarity, vector)
        for concept, vec in zip(concepts, vecs):
            near = nearest_on_graph(conn, vec, SNAP_CANDIDATES)
            if near:
                snaps.append((concept, *near[0], vec))
        if not cached:
            with conn.cursor() as cur:
                cur.executemany(
                    "INSERT INTO book_concepts (book_id, concept, knowledge_id, similarity) "
                    "VALUES (%s, %s, %s, %s) ON CONFLICT (book_id, concept) DO UPDATE "
                    "SET knowledge_id = EXCLUDED.knowledge_id, similarity = EXCLUDED.similarity",
                    [(req.book_id, c, kid, float(s)) for c, kid, _, s, _ in snaps],
                )
        snaps = [s for s in snaps if s[3] >= SNAP_MIN_SIMILARITY]
        if len(snaps) < MIN_ON_MAP_CONCEPTS:
            raise HTTPException(422, f'"{book.title}" draws on too little space science for a route')

        start = min(snaps, key=lambda s: (s[2], -s[3]))[1]
        centroid = np.mean([s[4] for s in snaps], axis=0)
        centroid /= np.linalg.norm(centroid)
        candidates = [c for c in nearest_on_graph(conn, centroid, DEST_CANDIDATES) if c[0] != start]
        if not candidates:
            raise HTTPException(422, "no destination near the concepts")
        goal = max(candidates, key=lambda c: (c[1], c[2]))[0]

        path, relaxed = learning_route(g.index[start], g.index[goal], req.max_stops)
        stops = load_stops(conn, [g.ids[p] for p in path])

        reuse = conn.execute(
            "SELECT route_id FROM routes WHERE kind = 'bridge' AND stops = %s::text[] "
            "AND notes->>'status' = 'ready' ORDER BY created_at DESC LIMIT 1",
            ([s.item.id for s in stops],),
        ).fetchone()
        route_id = reuse[0] if reuse else save_route(conn, stops, "bridge", relaxed, req.guest_id)

    return RouteResponse(
        route_id=route_id, map="knowledge", kind="bridge", relaxed=relaxed, stops=stops,
        notes_status="ready" if reuse else "pending", book=book, concepts=[s[0] for s in snaps],
    ), book
