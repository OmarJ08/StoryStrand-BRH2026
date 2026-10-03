from contextlib import asynccontextmanager
from functools import cache

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from backend.db.conn import get_conn
from backend.embeddings import warm_in_background
from backend.models.item import (MapName, MapPoint, RouteRequest, RouteResponse, SearchHit,
                                 SearchRequest)
from backend.routing.graph import load_graph
from backend.routing.service import plan_route


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


@app.post("/api/route")
def route(req: RouteRequest) -> RouteResponse:
    """Learning route on the Knowledge Map (Section 9.3): strict climb, soft fallback."""
    return plan_route(req)
