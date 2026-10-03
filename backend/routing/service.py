"""POST /api/route for the Knowledge Map: resolve endpoints, route, enrich, save."""
import secrets
from typing import Literal

import psycopg
from fastapi import HTTPException
from pgvector.psycopg import register_vector
from psycopg.types.json import Jsonb

from backend.db.conn import get_conn
from backend.embeddings import embed
from backend.models.item import RouteEndpoint, RouteRequest, RouteResponse, RouteStop, SearchHit
from backend.routing import graph as graph_module
from backend.routing.learning import learning_route

CANDIDATES = 20
SIMILARITY_MARGIN = 0.05   # candidates within this of the best match compete on difficulty

HIT_COLUMNS = "id, type, title, cover_url, difficulty, cluster_label, x, y, z, creators"


def resolve(conn: psycopg.Connection, ep: RouteEndpoint, role: Literal["start", "destination"]) -> int:
    """Graph row for an endpoint. Typed text takes the easiest close match as a start and
    the hardest close match as a destination (Section 9.3)."""
    g = graph_module.graph
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


def plan_route(req: RouteRequest) -> RouteResponse:
    if req.map != "knowledge":
        raise HTTPException(422, "learning routes are knowledge-map only (book routes come in step 9)")
    g = graph_module.graph
    if g is None:
        raise HTTPException(503, "knowledge road network not loaded")

    with get_conn() as conn:
        register_vector(conn)
        start = resolve(conn, req.start, "start")
        goal = resolve(conn, req.destination, "destination")
        path, relaxed = learning_route(start, goal, req.max_stops)
        stop_ids = [g.ids[p] for p in path]

        rows = conn.execute(f"SELECT {HIT_COLUMNS} FROM items WHERE id = ANY(%s)", (stop_ids,)).fetchall()
        fields = SearchHit.model_fields.keys()
        hits = {r[0]: SearchHit(**dict(zip(fields, r))) for r in rows}
        sims = [None] + [s for (s,) in conn.execute(
            "SELECT 1 - (a.embedding <=> b.embedding) "
            "FROM unnest(%s::text[], %s::text[]) WITH ORDINALITY AS p(a_id, b_id, ord) "
            "JOIN items a ON a.id = p.a_id JOIN items b ON b.id = p.b_id ORDER BY p.ord",
            (stop_ids[:-1], stop_ids[1:]),
        ).fetchall()]

        route_id = f"r_{secrets.token_hex(3)}"
        conn.execute(
            "INSERT INTO routes (route_id, guest_id, map, kind, stops, notes, relaxed) "
            "VALUES (%s, %s, 'knowledge', 'learning', %s, %s, %s)",
            (route_id, req.guest_id, stop_ids, Jsonb(None), relaxed),
        )

    return RouteResponse(
        route_id=route_id, map="knowledge", kind="learning", relaxed=relaxed,
        stops=[RouteStop(item=hits[i], step_similarity=None if s is None else round(float(s), 3))
               for i, s in zip(stop_ids, sims)],
    )
