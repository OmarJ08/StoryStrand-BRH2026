"""Simulated traffic for the demo: events with simulated = true across both maps.

Every few seconds a burst of events lands in neighborhoods weighted by size and a drifting
random-walk popularity; now and then one neighborhood "surges" for a while, so the pulses
move around the map. Kinds follow what real visitors do: mostly stop_clicks and searches,
some routes (knowledge) and learns (books).

Runs as a daemon thread inside the API (toggled from the hidden switch on the home page via
/api/simulation) or from the command line (scripts/simulate_traffic.py).
"""
import math
import random
import threading
from datetime import datetime, timedelta, timezone

import psycopg

from backend.db.conn import get_conn

KINDS = {   # (kind, weight) per map
    "books": [("stop_click", 0.55), ("search", 0.30), ("learn", 0.15)],
    "knowledge": [("stop_click", 0.50), ("search", 0.25), ("route", 0.25)],
}
SAMPLE_ITEMS = 300          # item ids kept per neighborhood
DRIFT = 0.15                # log-popularity random-walk step per tick
SURGE_CHANCE = 0.04         # per tick: one neighborhood starts surging
SURGE_FACTOR = 6.0
SURGE_TICKS = (8, 20)
INTERVAL_S = 3.0            # mean seconds between bursts
BURST = 8.0                 # mean events per burst
BACKFILL_MIN = 15           # history inserted on start when the 30-min window has none


class Neighborhood:
    def __init__(self, map_name: str, label: str, size: int, items: list[str]):
        self.map, self.label, self.items = map_name, label, items
        self.base = math.sqrt(size)          # bigger neighborhoods get more visits
        self.log_pop = random.gauss(0, 0.4)
        self.surge = 0                       # ticks of surge left

    def weight(self) -> float:
        return self.base * math.exp(self.log_pop) * (SURGE_FACTOR if self.surge else 1.0)

    def tick(self) -> None:
        self.log_pop = max(-1.5, min(1.5, self.log_pop + random.gauss(0, DRIFT)))
        self.surge = max(0, self.surge - 1)


def load_neighborhoods(conn: psycopg.Connection) -> list[Neighborhood]:
    rows = conn.execute(
        "SELECT map, cluster_label, count(*)::int, "
        "(array_agg(id ORDER BY random()))[1:%s] FROM items GROUP BY map, cluster_label",
        (SAMPLE_ITEMS,),
    ).fetchall()
    return [Neighborhood(m, label, n, ids) for m, label, n, ids in rows]


def make_events(hoods: list[Neighborhood], n: int, at: datetime) -> list[tuple]:
    weights = [h.weight() for h in hoods]
    events = []
    for h in random.choices(hoods, weights=weights, k=n):
        kinds, kw = zip(*KINDS[h.map])
        kind = random.choices(kinds, weights=kw)[0]
        jitter = timedelta(seconds=random.uniform(-1.5, 0))
        events.append((at + jitter, kind, h.map, random.choice(h.items), h.label))
    return events


def insert(conn: psycopg.Connection, events: list[tuple]) -> None:
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO events (time, kind, map, item_id, cluster_label, simulated) "
            "VALUES (%s, %s, %s, %s, %s, true)",
            events,
        )


def run(stop: threading.Event, interval: float = INTERVAL_S, burst: float = BURST,
        backfill_min: int | None = None, log=print) -> None:
    """Insert bursts until stop is set. backfill_min=None backfills only if the last 30
    minutes have no simulated events (so toggling on shows activity straight away)."""
    with get_conn() as conn:
        conn.autocommit = True
        hoods = load_neighborhoods(conn)
        log(f"[sim] on: {len(hoods)} neighborhoods, every ~{interval:g}s, ~{burst:g} events")
        if backfill_min is None:
            (have,) = conn.execute(
                "SELECT count(*) FROM events WHERE simulated AND time > now() - interval '30 minutes'"
            ).fetchone()
            backfill_min = 0 if have else BACKFILL_MIN
        if backfill_min:
            now = datetime.now(timezone.utc)
            steps = int(backfill_min * 60 / interval)
            history = []
            for s in range(steps, 0, -1):
                for h in hoods:
                    h.tick()
                history += make_events(hoods, max(0, round(random.gauss(burst, 2))),
                                       now - timedelta(seconds=s * interval))
            insert(conn, history)
            log(f"[sim] backfilled {len(history)} events over {backfill_min} min")

        while not stop.is_set():
            for h in hoods:
                h.tick()
            if random.random() < SURGE_CHANCE:
                h = random.choice(hoods)
                h.surge = random.randint(*SURGE_TICKS)
                log(f"[sim] surge: {h.map} / {h.label}")
            n = max(1, round(random.gauss(burst, burst / 3)))
            try:
                insert(conn, make_events(hoods, n, datetime.now(timezone.utc)))
            except psycopg.OperationalError as e:   # dropped connection: report and keep going
                log(f"[sim] insert failed: {e}")
            stop.wait(interval * random.uniform(0.6, 1.4))
    log("[sim] off")


class SimulatorThread:
    """The in-API simulator behind /api/simulation."""

    def __init__(self) -> None:
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._lock = threading.Lock()

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def set(self, on: bool) -> bool:
        with self._lock:
            if on and not self.running:
                self._stop = threading.Event()
                self._thread = threading.Thread(target=self._run, args=(self._stop,), daemon=True)
                self._thread.start()
            elif not on and self.running:
                self._stop.set()
        return on

    @staticmethod
    def _run(stop: threading.Event) -> None:
        try:
            run(stop)
        except Exception as e:   # the API must survive a simulator crash
            print(f"[sim] crashed: {e}")


simulator = SimulatorThread()
