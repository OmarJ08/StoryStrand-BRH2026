"""Activity events (Section 8) and the live traffic layer.

Endpoints log events in FastAPI background tasks, after the response is sent, so a slow
insert never delays the user. map and cluster_label are stored on every event, so the
neighborhood_traffic continuous aggregate needs no join.
"""
from typing import Literal, Optional
from uuid import UUID

from backend.db.conn import get_conn
from backend.models.item import MapName, NeighborhoodTraffic, SearchHit, TrafficResponse

EventKind = Literal["search", "route", "stop_click", "portal_jump", "learn", "read"]
TRAFFIC_WINDOW_MIN = 30   # Section 12: visits per neighborhood, last 30 minutes
RECENT_S = 15             # "just visited": drives the ping on the map


def log_events(rows: list[tuple[EventKind, MapName, Optional[str], Optional[str], Optional[str], Optional[UUID]]]) -> None:
    """rows: (kind, map, item_id, cluster_label, route_id, guest_id)."""
    if not rows:
        return
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO events (time, kind, map, item_id, cluster_label, route_id, guest_id) "
                "VALUES (now(), %s, %s, %s, %s, %s, %s)",
                rows,
            )
    except Exception as e:   # analytics must never break a request
        print(f"[events] insert failed: {e}")


def stop_rows(kind: EventKind, map_name: MapName, stops: list[SearchHit], route_id: Optional[str],
              guest_id: Optional[UUID]):
    return [(kind, map_name, s.id, s.cluster_label, route_id, guest_id) for s in stops]


def traffic(map_name: MapName) -> TrafficResponse:
    with get_conn() as conn:
        totals = dict(conn.execute(
            "SELECT cluster_label, sum(visits)::int FROM neighborhood_traffic "
            "WHERE map = %s AND bucket > now() - make_interval(mins => %s) AND cluster_label IS NOT NULL "
            "GROUP BY cluster_label",
            (map_name, TRAFFIC_WINDOW_MIN),
        ).fetchall())
        recent = dict(conn.execute(
            "SELECT cluster_label, count(*)::int FROM events "
            "WHERE map = %s AND time > now() - make_interval(secs => %s) AND cluster_label IS NOT NULL "
            "GROUP BY cluster_label",
            (map_name, RECENT_S),
        ).fetchall())
        real, simulated = conn.execute(
            "SELECT count(*) FILTER (WHERE NOT simulated)::int, count(*) FILTER (WHERE simulated)::int "
            "FROM events WHERE map = %s AND time > now() - make_interval(mins => %s)",
            (map_name, TRAFFIC_WINDOW_MIN),
        ).fetchone()
    labels = sorted(set(totals) | set(recent), key=lambda k: -totals.get(k, 0))
    return TrafficResponse(
        map=map_name, window_minutes=TRAFFIC_WINDOW_MIN, recent_seconds=RECENT_S,
        real_visits=real, simulated_visits=simulated,
        neighborhoods=[NeighborhoodTraffic(label=k, visits=totals.get(k, 0), recent=recent.get(k, 0))
                       for k in labels],
    )
