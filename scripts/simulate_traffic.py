"""simulate_traffic.py: simulated visitors, so both maps show live traffic during judging.

Every few seconds, inserts a burst of events with simulated = true, spread across both maps'
neighborhoods. Each neighborhood's popularity drifts as a random walk, and now and then one
"surges" for a while, so the pulses move around the map instead of sitting still. Kinds
follow what real visitors do: mostly stop_clicks and searches, some routes (knowledge) and
learns (books). The UI labels the layer "simulated" whenever these events are in the window.

usage (from the repo root, conda env SCIENCE-env; runs until Ctrl-C):
  nohup python scripts/simulate_traffic.py > simulate_traffic.log 2>&1 &
  python scripts/simulate_traffic.py --interval 3 --burst 8 --backfill 15
"""
import argparse
import math
import os
import random
import signal
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / "backend" / ".env")

KINDS = {   # (kind, weight) per map
    "books": [("stop_click", 0.55), ("search", 0.30), ("learn", 0.15)],
    "knowledge": [("stop_click", 0.50), ("search", 0.25), ("route", 0.25)],
}
SAMPLE_ITEMS = 300          # item ids kept per neighborhood
DRIFT = 0.15                # log-popularity random-walk step per tick
SURGE_CHANCE = 0.04         # per tick: one neighborhood starts surging
SURGE_FACTOR = 6.0
SURGE_TICKS = (8, 20)


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


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--interval", type=float, default=3.0, help="seconds between bursts")
    ap.add_argument("--burst", type=float, default=8.0, help="mean events per burst")
    ap.add_argument("--backfill", type=int, default=15,
                    help="minutes of history to insert at start, so the 30-min window isn't empty")
    args = ap.parse_args()

    running = True

    def stop(*_):
        nonlocal running
        running = False
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)

    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
        hoods = load_neighborhoods(conn)
        by_map = defaultdict(int)
        for h in hoods:
            by_map[h.map] += 1
        print(f"[sim] {len(hoods)} neighborhoods ({dict(by_map)}); every {args.interval}s, "
              f"~{args.burst:g} events", flush=True)

        if args.backfill:
            now = datetime.now(timezone.utc)
            steps = int(args.backfill * 60 / args.interval)
            history = []
            for s in range(steps, 0, -1):
                for h in hoods:
                    h.tick()
                history += make_events(hoods, max(0, round(random.gauss(args.burst, 2))),
                                       now - timedelta(seconds=s * args.interval))
            insert(conn, history)
            print(f"[sim] backfilled {len(history)} events over {args.backfill} min", flush=True)

        tick = 0
        while running:
            for h in hoods:
                h.tick()
            if random.random() < SURGE_CHANCE:
                h = random.choice(hoods)
                h.surge = random.randint(*SURGE_TICKS)
                print(f"[sim] surge: {h.map} / {h.label}", flush=True)
            n = max(1, round(random.gauss(args.burst, args.burst / 3)))
            events = make_events(hoods, n, datetime.now(timezone.utc))
            try:
                insert(conn, events)
            except psycopg.OperationalError as e:   # dropped connection: report and keep going
                print(f"[sim] insert failed: {e}", flush=True)
            tick += 1
            if tick % 20 == 0:
                print(f"[sim] {tick} bursts, last {n} events", flush=True)
            time.sleep(args.interval * random.uniform(0.6, 1.4))
    print("[sim] stopped", flush=True)


if __name__ == "__main__":
    main()
