"""simulate_traffic.py: run the demo traffic simulator from the command line.

The same simulator also runs inside the API, toggled by the hidden switch at the bottom right
of the home page (POST /api/simulation). Use one or the other: while the switch is off, the
API hides simulated events from /api/traffic.

usage (from the repo root, conda env SCIENCE-env; runs until Ctrl-C):
  python -m scripts.simulate_traffic --interval 3 --burst 8 --backfill 15
"""
import argparse
import signal
import threading

from backend.simulator import BURST, INTERVAL_S, run


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--interval", type=float, default=INTERVAL_S, help="seconds between bursts")
    ap.add_argument("--burst", type=float, default=BURST, help="mean events per burst")
    ap.add_argument("--backfill", type=int, default=None,
                    help="minutes of history to insert at start (default: only if none in the last 30 min)")
    args = ap.parse_args()

    stop = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    run(stop, args.interval, args.burst, args.backfill, log=lambda m: print(m, flush=True))


if __name__ == "__main__":
    main()
