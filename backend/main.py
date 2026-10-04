from contextlib import asynccontextmanager
from functools import cache

import httpx
import numpy as np
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from pgvector.psycopg import register_vector

from backend.bridge import bridge_context, learn
from backend.db.conn import get_conn
from backend.embeddings import warm_in_background
from backend.estimate import estimate_book
from backend.events import log_events, stop_rows, traffic
from backend.guest import plan_guest, popular_books
from backend.models.item import (BridgeLearnRequest, DbStats, EstimatedBook, EstimateRequest,
                                 GuestRequest, GuestResponse, ItemDetail, ItemLink, MapName, MapPoint,
                                 Portal, RouteNotes,
                                 RouteRequest, RouteResponse, RouteVoice, SearchHit, SearchRequest,
                                 SimulationState, SteerRequest, TrafficResponse, VoiceClip)
from backend.routing import graph as graph_module
from backend.routing.graph import load_graph
from backend.routing.neighborhoods import load_in_background as load_neighborhoods
from backend.routing.notes import run_notes_job
from backend.routing.service import HIT_COLUMNS, plan_route
from backend.simulator import simulator
from backend.stats import db_stats
from backend.voice import VOICE, clip_path, ensure_clips


@asynccontextmanager
async def lifespan(_: FastAPI):
    load_graph()
    load_neighborhoods({m: g.ids for m, g in (("knowledge", graph_module.graph), ("books", graph_module.books)) if g})
    warm_in_background()
    yield


app = FastAPI(title="StoryStrand API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://storystrand-2coqqfhvq-omars-team2.vercel.app",
        "https://storystrand.vercel.app",
        "http://localhost:3000",
    ],
    allow_origin_regex=r"https://storystrand-.*\.vercel\.app",   # preview deploys
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


# Cached for the life of the process: restart uvicorn after re-running the pipeline.
@cache
def load_map(map_name: MapName) -> list[MapPoint]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, type, title, cover_url, difficulty, cluster_label, x, y, z "
            "FROM items WHERE map = %s ORDER BY id",
            (map_name,),
        ).fetchall()
    fields = MapPoint.model_fields.keys()
    return [MapPoint(**dict(zip(fields, r))) for r in rows]


@app.get("/api/map")
def get_map(map: MapName, response: Response) -> list[MapPoint]:
    response.headers["Cache-Control"] = "public, max-age=300"
    return load_map(map)


def like_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@app.post("/api/search")
def search(req: SearchRequest, background: BackgroundTasks) -> list[SearchHit]:
    """Title lookup on one map: title prefix, then title contains, then author match;
    ties go to the more popular item. Vibe (vector) search will extend this endpoint."""
    q = like_escape(req.query.strip())
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, type, title, cover_url, difficulty, cluster_label, x, y, z, creators
            FROM items
            WHERE map = %(map)s
              AND (title ILIKE %(contains)s OR array_to_string(creators, ' ') ILIKE %(contains)s)
            ORDER BY
              (title ILIKE %(prefix)s) DESC,
              (title ILIKE %(contains)s) DESC,
              coalesce((attributes->>'ratings_count')::int, (attributes->>'pageviews_60d')::int, 0) DESC
            LIMIT %(limit)s
            """,
            {"map": req.map, "contains": f"%{q}%", "prefix": f"{q}%", "limit": req.limit},
        ).fetchall()
    fields = SearchHit.model_fields.keys()
    hits = [SearchHit(**dict(zip(fields, r))) for r in rows]
    if hits:   # a search counts as a visit to the top result's neighborhood
        background.add_task(log_events, stop_rows("search", req.map, hits[:1], None, None))
    return hits


def source_links(item_type: str, attrs: dict) -> list[ItemLink]:
    """Where to actually read an item, primary link first."""
    links: list[ItemLink] = []
    if item_type == "paper":
        if attrs.get("url"):
            links.append(ItemLink(label="arXiv", url=attrs["url"]))
        if attrs.get("arxiv_id"):
            links.append(ItemLink(label="PDF", url=f"https://arxiv.org/pdf/{attrs['arxiv_id']}"))
        if attrs.get("doi"):
            links.append(ItemLink(label="DOI", url=f"https://doi.org/{attrs['doi']}"))
    elif item_type == "encyclopedia" and attrs.get("url"):
        links.append(ItemLink(label="Wikipedia", url=attrs["url"]))
    elif item_type == "book":
        if attrs.get("goodreads_book_id"):
            links.append(ItemLink(label="Goodreads",
                                  url=f"https://www.goodreads.com/book/show/{attrs['goodreads_book_id']}"))
        if isbn := attrs.get("isbn13") or attrs.get("isbn"):
            links.append(ItemLink(label="Open Library", url=f"https://openlibrary.org/isbn/{isbn}"))
    return links


@app.get("/api/items/{item_id:path}")
def item_detail(item_id: str, background: BackgroundTasks) -> ItemDetail:
    """The item sheet opens with this call, so it is also where a stop_click is logged."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, type, title, cover_url, difficulty, cluster_label, x, y, z, creators, "
            "map, year, description, tags, attributes FROM items WHERE id = %s",
            (item_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(404, f"no item {item_id}")
    *fields, attrs = row
    names = ["id", "type", "title", "cover_url", "difficulty", "cluster_label", "x", "y", "z",
             "creators", "map", "year", "description", "tags"]
    detail = ItemDetail(**dict(zip(names, fields)), links=source_links(row[1], attrs or {}))
    background.add_task(log_events, stop_rows("stop_click", detail.map, [detail], None, None))
    return detail


@app.post("/api/guest")
def guest(req: GuestRequest) -> GuestResponse:
    """5 picked books -> taste centroid, Book Map pin, DNA panels, suggested curiosity pin."""
    return plan_guest(req)


@app.post("/api/books/estimate")
def books_estimate(req: EstimateRequest) -> EstimatedBook:
    """Any book, even one not in the dataset: qwen profiles it and it is placed among the
    nearest real books, so it can be one of the 5 onboarding picks."""
    return estimate_book(req.query)


@app.get("/api/books/popular")
def books_popular(limit: int = Query(default=30, ge=1, le=100)) -> list[SearchHit]:
    return popular_books(limit)


@app.post("/api/route")
def route(req: RouteRequest, background: BackgroundTasks) -> RouteResponse:
    """Learning route on the Knowledge Map (Section 9.3: strict climb, soft fallback) or taste
    route on the Book Map (Section 9.2), optionally scenic. Learning routes get tour-guide
    notes afterwards; poll GET /api/route/{id}/notes."""
    planned = plan_route(req)
    if planned.notes_status == "pending":
        background.add_task(run_notes_job, planned.route_id)
    background.add_task(log_events, stop_rows(
        "route", req.map, [s.item for s in planned.stops], planned.route_id, req.guest_id))
    return planned


@app.post("/api/steer")
def steer(req: SteerRequest) -> list[SearchHit]:
    """Steer (Section 9.4): q = normalize(A + s(B - A)); the nearest books to q, excluding A, B
    and anything by their authors (series and box sets otherwise fill the list at every s)."""
    with get_conn() as conn:
        register_vector(conn)
        found = {r[0]: r[1:] for r in conn.execute(
            "SELECT id, embedding, coalesce(creators, '{}') FROM items WHERE map = 'books' AND id IN (%s, %s)",
            (req.a_id, req.b_id)).fetchall()}
        if len(found) < 2:
            raise HTTPException(422, "both a_id and b_id must be books")
        (a, a_by), (b, b_by) = found[req.a_id], found[req.b_id]
        q = a.to_numpy() + req.s * (b.to_numpy() - a.to_numpy())
        rows = conn.execute(
            f"SELECT {HIT_COLUMNS} FROM items WHERE map = 'books' AND id NOT IN (%s, %s) "
            "AND NOT coalesce(creators && %s::text[], false) ORDER BY embedding <=> %s LIMIT %s",
            (req.a_id, req.b_id, [*a_by, *b_by], q / np.linalg.norm(q), req.k)).fetchall()
    fields = SearchHit.model_fields.keys()
    return [SearchHit(**dict(zip(fields, r))) for r in rows]


@app.post("/api/bridge/learn")
def bridge_learn(req: BridgeLearnRequest, background: BackgroundTasks) -> RouteResponse:
    """"Learn the real science" (Section 10): a book's concepts -> a strict learning route on
    the Knowledge Map. Same shape as /api/route plus book + concepts; notes as usual."""
    planned, book = learn(req)
    if planned.notes_status == "pending":
        background.add_task(run_notes_job, planned.route_id, bridge_context(book, planned.concepts))
    background.add_task(log_events, [
        *stop_rows("learn", "books", [book], planned.route_id, req.guest_id),
        *stop_rows("route", "knowledge", [s.item for s in planned.stops], planned.route_id, req.guest_id),
    ])
    return planned


@app.get("/api/traffic")
def get_traffic(map: MapName) -> TrafficResponse:
    """Visits per neighborhood over the last 30 minutes, plus the last few seconds for the
    live ping; simulated_visits > 0 means the UI must label the layer as simulated.
    Simulated events count only while the simulation switch is on."""
    return traffic(map, include_simulated=simulator.running)


def point_cols(alias: str) -> str:
    """MapPoint columns of items, qualified by a table alias."""
    return ", ".join(f"{alias}.{c}" for c in MapPoint.model_fields)


@app.get("/api/portals")
def get_portals(map: MapName, response: Response) -> list[Portal]:
    """Portal markers for one map: mutual best book <-> knowledge matches (Section 10),
    each with the matching point on the other map so the UI can fly there."""
    response.headers["Cache-Control"] = "public, max-age=300"
    here, there = ("b", "k") if map == "books" else ("k", "b")
    with get_conn() as conn:
        rows = conn.execute(
            f"SELECT p.similarity, {point_cols(here)}, {point_cols(there)} FROM portals p "
            "JOIN items b ON b.id = p.book_id JOIN items k ON k.id = p.knowledge_id "
            "ORDER BY p.similarity DESC"
        ).fetchall()
    fields = list(MapPoint.model_fields)
    n = len(fields)
    return [Portal(similarity=round(r[0], 3), here=MapPoint(**dict(zip(fields, r[1:1 + n]))),
                   there=MapPoint(**dict(zip(fields, r[1 + n:]))),
                   there_map="knowledge" if map == "books" else "books") for r in rows]


@app.get("/api/stats")
def get_stats() -> DbStats:
    """Live database numbers for the "Under the hood" panel."""
    return db_stats()


@app.get("/api/simulation")
def get_simulation() -> SimulationState:
    return SimulationState(running=simulator.running)


@app.post("/api/simulation")
def set_simulation(req: SimulationState) -> SimulationState:
    """Demo switch (hidden on the home page): start or stop simulated traffic."""
    return SimulationState(running=simulator.set(req.running))


def saved_notes(route_id: str) -> RouteNotes:
    with get_conn() as conn:
        row = conn.execute("SELECT notes FROM routes WHERE route_id = %s", (route_id,)).fetchone()
    if row is None:
        raise HTTPException(404, f"no route {route_id}")
    notes = row[0] or {"status": "none"}
    return RouteNotes(status=notes["status"], notes=notes.get("notes"))


@app.get("/api/route/{route_id}/notes")
def route_notes(route_id: str) -> RouteNotes:
    return saved_notes(route_id)


@app.post("/api/route/{route_id}/voice")
def route_voice(route_id: str) -> RouteVoice:
    """Grok Voice audio for a route's notes, one MP3 per stop, cached per route."""
    notes = saved_notes(route_id)
    if notes.status != "ready" or not notes.notes:
        raise HTTPException(409, f"notes are {notes.status}; nothing to narrate yet")
    try:
        ensure_clips(route_id, notes.notes)
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Grok Voice failed: {e}") from e
    return RouteVoice(route_id=route_id, voice=VOICE, clips=[
        VoiceClip(index=i, note=n, url=f"/api/route/{route_id}/voice/{i}.mp3")
        for i, n in enumerate(notes.notes)])


@app.get("/api/route/{route_id}/voice/{index}.mp3")
def route_voice_clip(route_id: str, index: int) -> FileResponse:
    try:
        path = clip_path(route_id, index)
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    if not path.exists():
        raise HTTPException(404, "clip not generated; call POST /api/route/{id}/voice first")
    return FileResponse(path, media_type="audio/mpeg",
                        headers={"Cache-Control": "public, max-age=31536000, immutable"})
