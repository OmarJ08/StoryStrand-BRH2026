from contextlib import asynccontextmanager
from functools import cache

import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse

from backend.db.conn import get_conn
from backend.embeddings import warm_in_background
from backend.models.item import (ItemDetail, ItemLink, MapName, MapPoint, RouteNotes, RouteRequest,
                                 RouteResponse, RouteVoice, SearchHit, SearchRequest, VoiceClip)
from backend.routing.graph import load_graph
from backend.routing.notes import run_notes_job
from backend.routing.service import plan_route
from backend.voice import VOICE, clip_path, ensure_clips


@asynccontextmanager
async def lifespan(_: FastAPI):
    load_graph()
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
def search(req: SearchRequest) -> list[SearchHit]:
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
    return [SearchHit(**dict(zip(fields, r))) for r in rows]


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
def item_detail(item_id: str) -> ItemDetail:
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
    return ItemDetail(**dict(zip(names, fields)), links=source_links(row[1], attrs or {}))


@app.post("/api/route")
def route(req: RouteRequest, background: BackgroundTasks) -> RouteResponse:
    """Learning route on the Knowledge Map (Section 9.3): strict climb, soft fallback.
    Tour-guide notes are generated afterwards; poll GET /api/route/{id}/notes."""
    planned = plan_route(req)
    background.add_task(run_notes_job, planned.route_id)
    return planned


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
