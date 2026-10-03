"""POST /api/books/estimate: place a book that isn't in the dataset on the Book Map.

1. Open Library search (official API) for title, authors, year, cover and subjects.
2. qwen3.5:9b (Ollama, JSON mode) writes a short spoiler-light blurb and Goodreads-style
   tags; if it fails, the Open Library subjects stand in.
3. BGE-M3 embeds "title. tags. blurb" (the same text shape as the real books).
4. Position = similarity-weighted mean of the 10 nearest real books; neighborhood = the one
   with the most similarity weight among them. Saved in estimated_books for /api/guest.
"""
import json
import os
import re
from collections import defaultdict

import httpx
import numpy as np
from pgvector.psycopg import register_vector

from backend.db.conn import get_conn
from backend.embeddings import embed
from backend.models.item import EstimatedBook

OL_SEARCH = "https://openlibrary.org/search.json"
UA = f"StoryStrand/0.1 ({os.environ.get('CONTACT_EMAIL', 'hackathon project')})"
OLLAMA = "http://localhost:11434/api/chat"
MODEL = "qwen3.5:9b"
LLM_TIMEOUT_S = 30
NEIGHBORS = 10
MAX_TAGS = 8

PROMPT = """You know books. For the book below, write:
- "description": 2-3 sentences on its premise, tone and themes, spoiler-light, no plot twists.
- "tags": 6-8 short lowercase genre or mood tags like Goodreads shelves
  (e.g. "hard sci fi", "space opera", "historical fiction", "cozy mystery", "coming of age").
If you don't know the book, infer carefully from the title, author and subjects and stay general.
Return JSON only: {"description": "...", "tags": ["...", "..."]}

Title: %s
Author: %s
Subjects: %s"""


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60]


def open_library(query: str) -> dict:
    try:
        r = httpx.get(OL_SEARCH, headers={"User-Agent": UA}, timeout=10, params={
            "q": query, "limit": 1,
            "fields": "key,title,author_name,first_publish_year,subject,cover_i"})
        r.raise_for_status()
        docs = r.json().get("docs", [])
        return docs[0] if docs else {}
    except (httpx.HTTPError, ValueError):
        return {}


def clean_subjects(subjects: list[str]) -> list[str]:
    """Open Library subjects include list markers ("nyt:...") and long headings; keep genres."""
    out = []
    for s in subjects:
        s = s.strip().lower()
        if ":" in s or "," in s or len(s) > 28 or s in out:
            continue
        out.append(s)
    return out


def qwen_profile(title: str, authors: list[str], subjects: list[str]) -> tuple[str, list[str]]:
    try:
        r = httpx.post(OLLAMA, timeout=LLM_TIMEOUT_S, json={
            "model": MODEL, "format": "json", "stream": False, "think": False,
            "options": {"temperature": 0.2},
            "messages": [{"role": "user", "content": PROMPT % (
                title, ", ".join(authors) or "unknown", ", ".join(subjects[:12]) or "unknown")}]})
        r.raise_for_status()
        data = json.loads(r.json()["message"]["content"])
        description = str(data.get("description", "")).strip()
        tags = [str(t).strip().lower() for t in data.get("tags", []) if str(t).strip()]
        return description, tags[:MAX_TAGS]
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        return "", subjects[:MAX_TAGS]


def estimate_book(query: str) -> EstimatedBook:
    ol = open_library(query)
    title = ol.get("title") or query.strip()
    authors = (ol.get("author_name") or [])[:3]
    subjects = clean_subjects(ol.get("subject") or [])
    description, tags = qwen_profile(title, authors, subjects)
    if not tags:
        tags = subjects[:MAX_TAGS]

    vec = embed([f"{title}. {', '.join(tags)}. {description}".strip()])[0]
    with get_conn() as conn:
        register_vector(conn)
        near = conn.execute(
            "SELECT title, x, y, z, cluster_label, 1 - (embedding <=> %(v)s) FROM items "
            "WHERE map = 'books' ORDER BY embedding <=> %(v)s LIMIT %(k)s",
            {"v": vec, "k": NEIGHBORS},
        ).fetchall()
        w = np.clip(np.array([r[5] for r in near], dtype=float), 1e-6, None)
        xyz = (np.array([r[1:4] for r in near], dtype=float) * w[:, None]).sum(axis=0) / w.sum()
        weight: dict[str, float] = defaultdict(float)
        for r, wi in zip(near, w):
            weight[r[4]] += wi
        cluster = max(weight, key=weight.get)

        book_id = f"est:{slugify(title + ' ' + (authors[0] if authors else ''))}"
        cover = f"https://covers.openlibrary.org/b/id/{ol['cover_i']}-M.jpg" if ol.get("cover_i") else None
        source = f"https://openlibrary.org{ol['key']}" if ol.get("key") else None
        conn.execute(
            "INSERT INTO estimated_books (id, title, creators, year, description, tags, cover_url, "
            "source_url, cluster_label, x, y, z, embedding) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
            "ON CONFLICT (id) DO UPDATE SET description = EXCLUDED.description, tags = EXCLUDED.tags, "
            "cluster_label = EXCLUDED.cluster_label, x = EXCLUDED.x, y = EXCLUDED.y, z = EXCLUDED.z, "
            "embedding = EXCLUDED.embedding",
            (book_id, title, authors, ol.get("first_publish_year"), description, tags, cover, source,
             cluster, float(xyz[0]), float(xyz[1]), float(xyz[2]), vec),
        )

    return EstimatedBook(
        id=book_id, type="book", title=title, cover_url=cover, difficulty=None,
        cluster_label=cluster, x=float(xyz[0]), y=float(xyz[1]), z=float(xyz[2]), creators=authors,
        description=description, tags=tags, nearest_titles=[r[0] for r in near[:3]],
        found_online=bool(ol),
    )
