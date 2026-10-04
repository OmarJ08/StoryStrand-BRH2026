"""POST /api/route: resolve endpoints, route (learning on the Knowledge Map, taste on the
Book Map, either with an optional scenic detour), enrich, save."""
import secrets
from typing import Literal
from uuid import UUID

import psycopg
from fastapi import HTTPException
from pgvector.psycopg import register_vector
from psycopg.types.json import Jsonb

from backend.db.conn import get_conn
from backend.embeddings import embed
from backend.models.item import (MapName, RouteEndpoint, RouteRequest, RouteResponse, RouteStop,
                                 ScenicDetour, SearchHit)
from backend.routing import graph as graph_module
from backend.routing import learning
from backend.routing.learning import dijkstra, learning_route, trim_by_level
from backend.routing.scenic import scenic_path
from backend.routing.taste import trim_even

CANDIDATES = 20
SIMILARITY_MARGIN = 0.05   # candidates within this of the best match compete on difficulty

HIT_COLUMNS = "id, type, title, cover_url, difficulty, cluster_label, x, y, z, creators"


def resolve(conn: psycopg.Connection, ep: RouteEndpoint, role: Literal["start", "destination"]) -> int:
    """Knowledge Map graph row for an endpoint. Typed text takes the easiest close match as a
    start and the hardest close match as a destination (Section 9.3)."""
    g = graph_module.graph
    if ep.guest:
        raise HTTPException(422, f"{role}: \"you are here\" is for book routes")
    if ep.item_id is not None:
        if ep.item_id not in g.index:
            raise HTTPException(422, f"{role}: {ep.item_id} is not on the knowledge map")
        return g.index[ep.item_id]

    vec = embed([ep.text])[0]
    rows = conn.execute(
        "SELECT id, difficulty, 1 - (embedding <=> %(v)s) AS sim FROM items "
        "WHERE map = 'knowledge' ORDER BY embedding <=> %(v)s LIMIT %(k)s",
        {"v": vec, "k": CANDIDATES},
    ).fetchall()
    best = rows[0][2]
    close = [r for r in rows if r[2] >= best - SIMILARITY_MARGIN and r[0] in g.index]
    if role == "start":
        pick = min(close, key=lambda r: (r[1], -r[2]))
    else:
        pick = max(close, key=lambda r: (r[1], r[2]))
    return g.index[pick[0]]


def resolve_book(conn: psycopg.Connection, ep: RouteEndpoint, role: str, guest_id: UUID | None) -> int:
    """Book Map graph row for an endpoint (Section 9.2): an item is itself, text is a book
    with that exact title or else the nearest book, the guest is the book nearest their
    taste centroid."""
    b = graph_module.books
    if ep.item_id is not None:
        if ep.item_id not in b.index:
            raise HTTPException(422, f"{role}: {ep.item_id} is not on the book map")
        return b.index[ep.item_id]
    if ep.guest:
        if guest_id is None:
            raise HTTPException(422, f"{role}: \"you are here\" needs a guest_id")
        row = conn.execute(
            "SELECT i.id FROM items i, guests g WHERE i.map = 'books' AND g.guest_id = %s "
            "ORDER BY i.embedding <=> g.centroid LIMIT 1", (guest_id,)).fetchone()
        if row is None:
            raise HTTPException(422, f"{role}: unknown guest; pick 5 books first")
    else:   # a typed title means that book (most-read edition); anything else, by meaning
        row = conn.execute(
            "SELECT id FROM items WHERE map = 'books' AND lower(title) = lower(%s) "
            "ORDER BY coalesce((attributes->>'ratings_count')::int, 0) DESC LIMIT 1", (ep.text,)).fetchone()
        row = row or conn.execute(
            "SELECT id FROM items WHERE map = 'books' ORDER BY embedding <=> %s LIMIT 1",
            (embed([ep.text])[0],)).fetchone()
    return b.index[row[0]]


def plan_route(req: RouteRequest) -> RouteResponse:
    return plan_taste(req) if req.map == "books" else plan_learning(req)


def plan_learning(req: RouteRequest) -> RouteResponse:
    g = graph_module.graph
    if g is None:
        raise HTTPException(503, "knowledge road network not loaded")

    with get_conn() as conn:
        register_vector(conn)
        start = resolve(conn, req.start, "start")
        goal = resolve(conn, req.destination, "destination")
        path, relaxed = learning_route(start, goal, len(g.ids))   # untrimmed, so scenic sees every row
        detour = None
        if req.scenic and not relaxed:
            lo, hi = g.diff[start], g.diff[goal]
            detour = scenic_path("knowledge", learning.G_strict, path,
                                 eligible=lambda rows: (g.diff[rows] >= lo) & (g.diff[rows] <= hi))
            if detour:
                path = detour[0]
        path = trim_by_level(path, req.max_stops, must={detour[2]} if detour else ())
        stops = load_stops(conn, [g.ids[p] for p in path])
        route_id = save_route(conn, stops, "learning", relaxed, req.guest_id)
    return RouteResponse(route_id=route_id, map="knowledge", kind="learning", relaxed=relaxed, stops=stops,
                         scenic=ScenicDetour(label=detour[1], waypoint_id=g.ids[detour[2]]) if detour else None)


def plan_taste(req: RouteRequest) -> RouteResponse:
    b = graph_module.books
    if b is None:
        raise HTTPException(503, "book road network not loaded")

    with get_conn() as conn:
        register_vector(conn)
        start = resolve_book(conn, req.start, "start", req.guest_id)
        goal = resolve_book(conn, req.destination, "destination", req.guest_id)
        if start == goal:
            raise HTTPException(422, "start and destination are the same book")
        path = dijkstra(b.G, start, goal)
        if path is None:
            raise HTTPException(422, "no taste route between these books")
        detour = scenic_path("books", b.G, path) if req.scenic else None
        if detour:
            path = detour[0]
        avoid = set()
        if req.guest_id is not None:
            row = conn.execute("SELECT picks FROM guests WHERE guest_id = %s", (req.guest_id,)).fetchone()
            avoid = {b.index[i] for i in (row[0] if row else []) if i in b.index}
        path = trim_even(path, req.max_stops, must={detour[2]} if detour else frozenset(), avoid=avoid)
        stops = load_stops(conn, [b.ids[p] for p in path])
        route_id = save_route(conn, stops, "taste", False, req.guest_id, map_name="books")
    return RouteResponse(route_id=route_id, map="books", kind="taste", relaxed=False, stops=stops,
                         notes_status="none",
                         scenic=ScenicDetour(label=detour[1], waypoint_id=b.ids[detour[2]]) if detour else None)


def load_stops(conn: psycopg.Connection, stop_ids: list[str]) -> list[RouteStop]:
    """Stops in order, each with its cosine similarity (full 1024-d) to the previous stop."""
    rows = conn.execute(f"SELECT {HIT_COLUMNS} FROM items WHERE id = ANY(%s)", (stop_ids,)).fetchall()
    fields = SearchHit.model_fields.keys()
    hits = {r[0]: SearchHit(**dict(zip(fields, r))) for r in rows}
    sims = [None] + [s for (s,) in conn.execute(
        "SELECT 1 - (a.embedding <=> b.embedding) "
        "FROM unnest(%s::text[], %s::text[]) WITH ORDINALITY AS p(a_id, b_id, ord) "
        "JOIN items a ON a.id = p.a_id JOIN items b ON b.id = p.b_id ORDER BY p.ord",
        (stop_ids[:-1], stop_ids[1:]),
    ).fetchall()]
    return [RouteStop(item=hits[i], step_similarity=None if s is None else round(float(s), 3))
            for i, s in zip(stop_ids, sims)]


def save_route(conn: psycopg.Connection, stops: list[RouteStop], kind: Literal["learning", "bridge", "taste"],
               relaxed: bool, guest_id: UUID | None, map_name: MapName = "knowledge") -> str:
    """Insert a route; returns its id. Knowledge routes wait for notes, taste routes have none."""
    route_id = f"r_{secrets.token_hex(3)}"
    notes = {"status": "pending" if map_name == "knowledge" else "none"}
    conn.execute(
        "INSERT INTO routes (route_id, guest_id, map, kind, stops, notes, relaxed) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (route_id, guest_id, map_name, kind, [s.item.id for s in stops], Jsonb(notes), relaxed),
    )
    return route_id
