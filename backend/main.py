from functools import cache

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from backend.db.conn import get_conn
from backend.models.item import MapName, MapPoint

app = FastAPI(title="StoryStrand API")

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
