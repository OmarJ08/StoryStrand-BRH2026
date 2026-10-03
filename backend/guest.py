"""POST /api/guest: a guest's 5 book picks placed on both maps (Sections 9.4 and 10)."""
import re
from functools import cache

import numpy as np
from fastapi import HTTPException
from pgvector.psycopg import register_vector

from backend.db.conn import get_conn
from backend.models.item import DnaShare, GuestRequest, GuestResponse, MapName, Pin, SearchHit

# Cosine similarities to neighborhood centroids sit in a narrow band (~0.4-0.7), so a plain
# softmax is nearly uniform; this temperature spreads the DNA shares out readably.
DNA_TEMPERATURE = 0.05
CURIOSITY_NEIGHBORS = 20
HIT_COLUMNS = "id, type, title, cover_url, difficulty, cluster_label, x, y, z, creators"

# A curiosity pin only makes sense when sci-fi is a real part of the picks: raw book ->
# knowledge similarity is weak, so a Gatsby + Anne Frank reader would otherwise land on stars.
# Book tags are Goodreads shelves (e.g. Dune: "sf masterworks", "hugo award"; The Martian:
# "mars", "science"); dystopia alone does not count.
SCIFI_TAG = re.compile(
    r"sci ?fi|science fiction|\bsf\b|space|alien|cyberpunk|\bmars\b|martian|robot|"
    r"time travel|hugo|nebula|astronaut|planet|galac|starship|futuristic",
    re.IGNORECASE,
)
SCIFI_NEIGHBORHOOD = re.compile(r"sci-?fi|space|cyberpunk", re.IGNORECASE)
MIN_SCIFI_PICKS = 2


def is_scifi(tags: list[str] | None, neighborhood: str | None) -> bool:
    return bool(SCIFI_NEIGHBORHOOD.search(neighborhood or "")) or any(
        SCIFI_TAG.search(t) for t in tags or [])


def normalize(v: np.ndarray) -> np.ndarray:
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


# Cached for the life of the process, like /api/map: restart uvicorn after re-clustering.
@cache
def neighborhood_centroids(map_name: MapName) -> tuple[list[str], np.ndarray]:
    with get_conn() as conn:
        register_vector(conn)
        rows = conn.execute(
            "SELECT cluster_label, avg(embedding) FROM items WHERE map = %s "
            "GROUP BY cluster_label ORDER BY cluster_label",
            (map_name,),
        ).fetchall()
    return [r[0] for r in rows], normalize(np.stack([r[1].to_numpy() for r in rows]))


def dna(map_name: MapName, centroid: np.ndarray) -> list[DnaShare]:
    """Softmax over similarity to each neighborhood centroid, largest share first."""
    labels, C = neighborhood_centroids(map_name)
    logits = (C @ centroid) / DNA_TEMPERATURE
    shares = np.exp(logits - logits.max())
    shares /= shares.sum()
    order = np.argsort(-shares)
    return [DnaShare(label=labels[i], share=round(float(shares[i]), 4)) for i in order]


def plan_guest(req: GuestRequest) -> GuestResponse:
    with get_conn() as conn:
        register_vector(conn)
        rows = conn.execute(
            f"SELECT {HIT_COLUMNS}, map, embedding, tags FROM items WHERE id = ANY(%s)", (req.book_ids,),
        ).fetchall()
        # books placed by estimate (est:...) behave like Book Map picks, same column order
        rows += conn.execute(
            "SELECT id, 'book', title, cover_url, NULL::smallint, cluster_label, x, y, z, creators, "
            "'books', embedding, tags FROM estimated_books WHERE id = ANY(%s)",
            ([i for i in req.book_ids if i.startswith("est:")],),
        ).fetchall()
        found = {r[0]: r for r in rows}
        bad = [i for i in req.book_ids if i not in found or found[i][10] != "books"]
        if bad:
            raise HTTPException(422, f"not books on the Book Map: {', '.join(bad)}")
        picks = [found[i] for i in req.book_ids]

        centroid = normalize(np.mean([r[11].to_numpy() for r in picks], axis=0))
        book_dna = dna("books", centroid)
        # the headline neighborhood is the top DNA bar, so the panel reads consistently
        book_pin = Pin(x=float(np.mean([r[6] for r in picks])), y=float(np.mean([r[7] for r in picks])),
                       z=float(np.mean([r[8] for r in picks])), home_cluster=book_dna[0].label)

        scifi = [r[0] for r in picks if is_scifi(r[12], r[5])]
        curiosity_pin = None
        all_dna = {"books": book_dna}
        if len(scifi) >= MIN_SCIFI_PICKS:
            near = conn.execute(
                "SELECT x, y, z FROM items WHERE map = 'knowledge' ORDER BY embedding <=> %s LIMIT %s",
                (centroid, CURIOSITY_NEIGHBORS),
            ).fetchall()
            xyz = np.array(near, dtype=float).mean(axis=0)
            all_dna["knowledge"] = dna("knowledge", centroid)
            curiosity_pin = Pin(x=float(xyz[0]), y=float(xyz[1]), z=float(xyz[2]),
                                home_cluster=all_dna["knowledge"][0].label, suggested=True)

        conn.execute(
            "INSERT INTO guests (guest_id, picks, centroid) VALUES (%s, %s, %s) "
            "ON CONFLICT (guest_id) DO UPDATE SET picks = EXCLUDED.picks, centroid = EXCLUDED.centroid",
            (req.guest_id, req.book_ids, centroid),
        )
        pins = {"books": book_pin, "knowledge": curiosity_pin}
        for map_name, pin in pins.items():
            if pin is None:
                conn.execute("DELETE FROM guest_positions WHERE guest_id = %s AND map = %s",
                             (req.guest_id, map_name))
                continue
            conn.execute(
                "INSERT INTO guest_positions (guest_id, map, x, y, z, home_cluster) "
                "VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (guest_id, map) DO UPDATE SET "
                "x = EXCLUDED.x, y = EXCLUDED.y, z = EXCLUDED.z, home_cluster = EXCLUDED.home_cluster",
                (req.guest_id, map_name, pin.x, pin.y, pin.z, pin.home_cluster),
            )

    fields = list(SearchHit.model_fields.keys())
    return GuestResponse(
        guest_id=req.guest_id,
        picks=[SearchHit(**dict(zip(fields, r[:10]))) for r in picks],
        book_pin=book_pin,
        curiosity_pin=curiosity_pin,
        scifi_picks=scifi,
        dna=all_dna,
    )


def popular_books(limit: int) -> list[SearchHit]:
    """Most-rated books that have a cover, for the onboarding grid."""
    with get_conn() as conn:
        rows = conn.execute(
            f"SELECT {HIT_COLUMNS} FROM items WHERE map = 'books' AND cover_url IS NOT NULL "
            "ORDER BY (attributes->>'ratings_count')::int DESC NULLS LAST LIMIT %s",
            (limit,),
        ).fetchall()
    fields = list(SearchHit.model_fields.keys())
    return [SearchHit(**dict(zip(fields, r))) for r in rows]
