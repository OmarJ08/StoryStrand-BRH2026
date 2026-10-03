"""bake_demo.py: ship the demo's data with the website, so it survives a dead backend.

Writes frontend/public/demo/ (served by Vercel as static files):
  map-books.json, map-knowledge.json        GET /api/map, if the API is slow or down
  portals-books.json, portals-knowledge.json GET /api/portals
  popular.json                              GET /api/books/popular (onboarding cover grid)
  guest-<preset>.json                       POST /api/guest for each onboarding quick pick
  bridge/book-<id>.json + bridge/<route>/<i>.mp3
                                            "Learn the real science" for the demo books:
                                            route, notes and Grok Voice clips

The frontend tries the live API first and uses these after ~3 s (or on error). Run it from
the repo root with the backend up, after any change to positions, portals or demo routes:
  python -m scripts.bake_demo
"""
import json
import shutil
import time
import uuid
from pathlib import Path

import httpx

API = "http://localhost:8000"
OUT = Path(__file__).resolve().parents[1] / "frontend" / "public" / "demo"
GUEST_ID = str(uuid.UUID(int=0))   # replaced by the visitor's id in the browser

# keep in sync with frontend/lib/presets.ts
PRESETS = {
    "scifi": ["book:18007564", "book:234225", "book:375802", "book:11", "book:29579"],
    "thriller": ["book:2429135", "book:8442457", "book:22557272", "book:21686", "book:11588"],
    "classics": ["book:1885", "book:4671", "book:2657", "book:5470", "book:10210"],
}
BRIDGE_BOOKS = {
    "book:18007564": "The Martian",
    "book:375802": "Ender's Game",
    "book:112537": "Rendezvous with Rama",
    "book:61666": "Contact",
    "book:77507": "Red Mars",
}
NOTES_TRIES = 3


def save(path: str, data) -> None:
    f = OUT / path
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(data, separators=(",", ":")))
    print(f"  {path}: {f.stat().st_size / 1024:.0f} KB")


def bake_bridge(client: httpx.Client, book_id: str, name: str) -> None:
    for attempt in range(NOTES_TRIES):
        route = client.post("/api/bridge/learn", json={"book_id": book_id}).raise_for_status().json()
        rid = route["route_id"]
        for _ in range(60):
            notes = client.get(f"/api/route/{rid}/notes").json()
            if notes["status"] != "pending":
                break
            time.sleep(1.5)
        if notes["status"] == "ready":
            break
        print(f"  {name}: notes {notes['status']} on try {attempt + 1}, asking again")
    else:
        raise SystemExit(f"{name}: no notes after {NOTES_TRIES} tries")

    voice = client.post(f"/api/route/{rid}/voice").raise_for_status().json()
    clips = []
    for c in voice["clips"]:
        rel = f"bridge/{rid}/{c['index']}.mp3"
        (OUT / rel).parent.mkdir(parents=True, exist_ok=True)
        (OUT / rel).write_bytes(client.get(c["url"]).raise_for_status().content)
        clips.append(f"/demo/{rel}")
    route["notes_status"] = "ready"
    save(f"bridge/{book_id.replace(':', '-')}.json", {"route": route, "notes": notes["notes"], "clips": clips})
    print(f"  {name}: {rid}, {len(clips)} clips, levels {[s['item']['difficulty'] for s in route['stops']]}")


def main() -> None:
    if (OUT / "bridge").exists():
        shutil.rmtree(OUT / "bridge")
    with httpx.Client(base_url=API, timeout=120) as client:
        for m in ("books", "knowledge"):
            save(f"map-{m}.json", client.get(f"/api/map?map={m}").raise_for_status().json())
            save(f"portals-{m}.json", client.get(f"/api/portals?map={m}").raise_for_status().json())
        save("popular.json", client.get("/api/books/popular?limit=36").raise_for_status().json())
        for key, ids in PRESETS.items():
            guest = client.post("/api/guest", json={"guest_id": GUEST_ID, "book_ids": ids}).raise_for_status()
            save(f"guest-{key}.json", guest.json())
        for book_id, name in BRIDGE_BOOKS.items():
            bake_bridge(client, book_id, name)


if __name__ == "__main__":
    main()
