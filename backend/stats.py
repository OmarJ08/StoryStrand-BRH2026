"""GET /api/stats: live numbers from Tiger for the "Under the hood" panel.

Every value is read from the database at request time: a real DiskANN vector search is
timed (round trip from the API, and execution time from EXPLAIN ANALYZE), and the hypertable,
compression and continuous-aggregate numbers come from timescaledb_information views.
"""
import time

from pgvector.psycopg import register_vector

from backend.db.conn import get_conn
from backend.models.item import DbStats

SEARCH = ("SELECT id FROM items WHERE map = 'knowledge' "
          "ORDER BY embedding <=> %(v)s LIMIT 10")


def index_name(node: dict) -> str | None:
    """First index the query plan scans (the per-map DiskANN index for a vector search)."""
    if "Index Name" in node:
        return node["Index Name"]
    for child in node.get("Plans", []):
        if found := index_name(child):
            return found
    return None


def db_stats() -> DbStats:
    with get_conn() as conn:
        register_vector(conn)
        (vec,) = conn.execute(
            "SELECT embedding FROM items TABLESAMPLE SYSTEM (5) WHERE map = 'books' LIMIT 1"
        ).fetchone()
        t0 = time.perf_counter()
        conn.execute(SEARCH, {"v": vec}).fetchall()
        roundtrip_ms = (time.perf_counter() - t0) * 1000
        (plan,) = conn.execute("EXPLAIN (ANALYZE, FORMAT JSON) " + SEARCH, {"v": vec}).fetchone()
        db_ms = plan[0]["Execution Time"]
        index = index_name(plan[0]["Plan"])

        per_map = {m: (n, v) for m, n, v in conn.execute(
            "SELECT map, count(*)::int, count(embedding)::int FROM items GROUP BY map").fetchall()}
        (portals,) = conn.execute("SELECT count(*)::int FROM portals").fetchone()

        chunks, compressed = conn.execute(
            "SELECT count(*)::int, count(*) FILTER (WHERE is_compressed)::int "
            "FROM timescaledb_information.chunks WHERE hypertable_name = 'events'").fetchone()
        (events,) = conn.execute("SELECT count(*)::int FROM events").fetchone()
        before, after = conn.execute(
            "SELECT sum(before_compression_total_bytes)::bigint, sum(after_compression_total_bytes)::bigint "
            "FROM hypertable_compression_stats('events')").fetchone()

        cagg = conn.execute(
            "SELECT js.last_run_started_at, extract(epoch FROM js.last_run_duration) * 1000, "
            "js.last_run_status, js.next_start, j.schedule_interval "
            "FROM timescaledb_information.jobs j JOIN timescaledb_information.job_stats js USING (job_id) "
            "WHERE j.proc_name = 'policy_refresh_continuous_aggregate' "
            "ORDER BY js.last_run_started_at DESC NULLS LAST LIMIT 1").fetchone()

    return DbStats(
        vector_search_ms=round(db_ms, 2), vector_search_roundtrip_ms=round(roundtrip_ms, 1),
        vector_index=index,
        books=per_map.get("books", (0, 0))[0], knowledge=per_map.get("knowledge", (0, 0))[0],
        vectors=sum(v for _, v in per_map.values()), vector_dims=1024, portals=portals,
        events=events, chunks=chunks, compressed_chunks=compressed,
        compression_ratio=round(before / after, 1) if before and after else None,
        cagg_last_refresh=cagg[0] if cagg else None,
        cagg_refresh_ms=round(float(cagg[1]), 1) if cagg and cagg[1] is not None else None,
        cagg_status=cagg[2] if cagg else None,
        cagg_next_refresh=cagg[3] if cagg else None,
    )
