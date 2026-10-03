"""Grok Voice narration via xAI text-to-speech (POST https://api.x.ai/v1/tts).

Per the xAI docs (checked Oct 2026): body {text, voice_id, language, output_format}, raw
audio bytes back; built-in voices eve (default), ara, rex, sal, leo; MP3 24 kHz / 128 kbps
by default. Clips are cached on disk per route, so a route is only ever synthesized once.
"""
import os
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

TTS_URL = "https://api.x.ai/v1/tts"
VOICE = "ara"                 # warm, friendly: suits a tour guide
MAX_PARALLEL = 3              # the docs give no rate limits; stay polite
REPO = Path(__file__).resolve().parents[1]
CACHE_DIR = Path(os.environ.get("VOICE_CACHE_DIR", REPO.parent / "data" / "processed" / "voice"))
ROUTE_ID = re.compile(r"^r_[0-9a-f]{6}$")   # also keeps cache paths inside CACHE_DIR


def clip_path(route_id: str, index: int) -> Path:
    if not ROUTE_ID.match(route_id):
        raise ValueError(f"bad route id {route_id!r}")
    return CACHE_DIR / route_id / f"{index}.mp3"


def synthesize(text: str) -> bytes:
    r = httpx.post(
        TTS_URL,
        headers={"Authorization": f"Bearer {os.environ['XAI_API_KEY']}"},
        json={"text": text, "voice_id": VOICE, "language": "en",
              "output_format": {"codec": "mp3", "sample_rate": 24000, "bit_rate": 128000}},
        timeout=30,
    )
    r.raise_for_status()
    return r.content


def ensure_clips(route_id: str, notes: list[str]) -> None:
    """Synthesize any clips not cached yet."""
    missing = [(i, n) for i, n in enumerate(notes) if not clip_path(route_id, i).exists()]
    if not missing:
        return
    clip_path(route_id, 0).parent.mkdir(parents=True, exist_ok=True)

    def one(item: tuple[int, str]) -> None:
        i, note = item
        audio = synthesize(note)
        tmp = clip_path(route_id, i).with_suffix(".part")
        tmp.write_bytes(audio)
        tmp.replace(clip_path(route_id, i))      # never serve a half-written clip

    with ThreadPoolExecutor(MAX_PARALLEL) as pool:
        list(pool.map(one, missing))
