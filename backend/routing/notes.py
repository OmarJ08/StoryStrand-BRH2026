"""Tour-guide notes for a route (Section 11): one Ollama call returns every stop's note.

Notes are checked with regexes (count, length, sentences, banned words); a violation gets
one retry with the problems spelled out. A timeout or a second failure means no notes, and
the route works without narration.
"""
import json
import re
import time

import httpx
from psycopg.types.json import Jsonb

from backend.db.conn import get_conn

OLLAMA = "http://localhost:11434/api/chat"
MODEL = "qwen3.5:9b"
TIMEOUT_S = 25
MAX_CHARS = 240
MAX_SENTENCES = 2
DESCRIPTION_CHARS = 300

BANNED = ["delve", "tapestry", "realm", "embark", "journey", "odyssey", "unlock", "unleash",
          "testament", "beacon", "intricate", "multifaceted", "navigate", "landscape",
          "symphony", "enigma", "captivating"]
BANNED_RE = re.compile(r"\b(" + "|".join(BANNED) + r")\w*", re.IGNORECASE)
NUMBERED_OPENING = re.compile(r"^\s*(stop|step|level)\s*\d", re.IGNORECASE)
SENTENCE_END = re.compile(r"[.!?](?=\s|$)")

TYPE_NAME = {"encyclopedia": "encyclopedia article", "paper": "research paper",
             "report": "NASA report", "book": "book", "film": "film"}

SYSTEM = f"""You are the tour guide on StoryStrand, a map of space science. A learning route
climbs from approachable (level 1) to advanced (level 5). Write one short spoken note per stop.
Rules:
- Exactly one note per stop, in the same order.
- At most {MAX_SENTENCES} sentences and under {MAX_CHARS} characters per note.
- Do not summarize the plot or the abstract; say why this stop is worth reading here.
- From the second stop on, explain the step from the previous stop.
- When the level goes up, say what new idea the higher level adds.
- Never use these words: {", ".join(BANNED)}.
- Do not open a note with "Stop 1", "Step 2", "Level 3" or similar; just talk.
- Make it flow like one guide speaking: open the first note by welcoming the listener
  (e.g. "Let's begin with ..."), and open every later note with a short spoken transition
  that links it to the previous stop (e.g. "Building on that,", "From there,", "Stepping up a
  level,", "With that in hand,", and "Finally," for the last stop). Vary the transitions.
- Plain spoken English: no lists, markdown or emojis.
Return JSON only: {{"notes": ["note for stop 1", "note for stop 2", ...]}}"""


def problems(notes: object, n_stops: int) -> list[str]:
    """Rule violations in a candidate list of notes (empty means it passes)."""
    if not isinstance(notes, list) or not all(isinstance(t, str) for t in notes):
        return ['"notes" must be a list of strings']
    found = []
    if len(notes) != n_stops:
        found.append(f"there are {n_stops} stops but {len(notes)} notes")
    for i, note in enumerate(notes, 1):
        if len(note) > MAX_CHARS:
            found.append(f"note {i} is {len(note)} characters (max {MAX_CHARS})")
        if len(SENTENCE_END.findall(note.strip())) > MAX_SENTENCES:
            found.append(f"note {i} has more than {MAX_SENTENCES} sentences")
        if m := BANNED_RE.search(note):
            found.append(f'note {i} uses the banned word "{m.group(0)}"')
        if NUMBERED_OPENING.match(note):
            found.append(f'note {i} opens with a stop/step/level number')
    return found


# Openers that already link a note to the one before it.
TRANSITION_OPENER = re.compile(
    r"^\s*(next|then|now|so|and|finally|lastly|from (there|here)|building on|with (that|this)|"
    r"having|after|once|going|stepping|moving|taking|staying|alongside|meanwhile|from that|"
    r"that|this|these|here|to (go|take)|one level|a level|at (this|the next) level)\b",
    re.IGNORECASE,
)
LEVEL_UP = ["Stepping up a level, ", "Going one level deeper, ", "Climbing higher, "]
SAME_LEVEL = ["From there, ", "Building on that, ", "Staying at this level, "]
# First words that are safe to lowercase after a prepended transition (not proper nouns).
COMMON_FIRST_WORDS = {"the", "a", "an", "we", "you", "it", "its", "our", "this", "these",
                      "those", "there", "here", "using", "with", "new", "now", "by", "in",
                      "on", "at", "from", "to", "scientists", "researchers", "astronomers",
                      "if", "when", "while", "even", "just", "simple", "modern", "early"}


def add_transitions(notes: list[str], levels: list[int]) -> list[str]:
    """Prepend a transition to any later note that starts abruptly, picked by the climb:
    level up, same level, or the final stop. The first note is left as written."""
    out = notes[:1]
    up = same = 0
    for i in range(1, len(notes)):
        note = notes[i].strip()
        if TRANSITION_OPENER.match(note):
            out.append(note)
            continue
        if i == len(notes) - 1:
            phrase = "Finally, "
        elif levels[i] > levels[i - 1]:
            phrase, up = LEVEL_UP[up % len(LEVEL_UP)], up + 1
        else:
            phrase, same = SAME_LEVEL[same % len(SAME_LEVEL)], same + 1
        first, _, rest = note.partition(" ")
        if first.lower() in COMMON_FIRST_WORDS:
            note = first.lower() + (" " + rest if rest else "")
        out.append(phrase + note)
    return out


def describe(stops: list[dict]) -> str:
    lines = []
    for i, s in enumerate(stops, 1):
        desc = (s["description"] or "")[:DESCRIPTION_CHARS]
        lines.append(f'{i}. [level {s["difficulty"]}, {TYPE_NAME.get(s["type"], s["type"])}, '
                     f'neighborhood "{s["cluster_label"]}"] {s["title"]}: {desc}')
    return "Route stops:\n" + "\n".join(lines)


def generate(stops: list[dict]) -> tuple[list[str] | None, str]:
    """Notes for the stops, or (None, reason). One retry on a rule violation."""
    messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": describe(stops)}]
    deadline = time.monotonic() + TIMEOUT_S
    for attempt in range(2):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return None, "timeout"
        try:
            r = httpx.post(OLLAMA, timeout=remaining, json={
                "model": MODEL, "messages": messages, "format": "json", "stream": False,
                "think": False, "options": {"temperature": 0.4}})
            r.raise_for_status()
            content = r.json()["message"]["content"]
            notes = json.loads(content).get("notes")
        except httpx.TimeoutException:
            return None, "timeout"
        except (httpx.HTTPError, ValueError, KeyError, AttributeError) as e:
            return None, f"ollama error: {e}"
        found = problems(notes, len(stops))
        if not found:
            return add_transitions([n.strip() for n in notes], [s["difficulty"] for s in stops]), "ok"
        if attempt == 0:
            messages += [{"role": "assistant", "content": content},
                         {"role": "user", "content": "Fix these problems and return the full JSON again: "
                                                     + "; ".join(found)}]
    return None, "rule violations after retry: " + "; ".join(found)


def run_notes_job(route_id: str) -> None:
    """Background task: write ready/none notes onto the saved route."""
    with get_conn() as conn:
        (stop_ids,) = conn.execute("SELECT stops FROM routes WHERE route_id = %s", (route_id,)).fetchone()
        rows = conn.execute(
            "SELECT id, title, type, difficulty, cluster_label, description FROM items WHERE id = ANY(%s)",
            (stop_ids,),
        ).fetchall()
        by_id = {r[0]: dict(zip(("id", "title", "type", "difficulty", "cluster_label", "description"), r))
                 for r in rows}
        notes, reason = generate([by_id[i] for i in stop_ids])
        payload = {"status": "ready", "notes": notes} if notes else {"status": "none", "reason": reason}
        conn.execute("UPDATE routes SET notes = %s WHERE route_id = %s", (Jsonb(payload), route_id))
    print(f"[notes] {route_id}: {payload['status']} ({reason})")
