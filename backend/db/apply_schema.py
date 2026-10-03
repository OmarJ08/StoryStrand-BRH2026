"""apply_schema.py — run schema.sql against the Tiger database in backend/.env.

usage: python backend/db/apply_schema.py
Runs once on an empty database; schema.sql uses plain CREATE TABLE.
"""
import os
import re
from pathlib import Path

import psycopg
from dotenv import load_dotenv

DB_DIR = Path(__file__).resolve().parent
load_dotenv(DB_DIR.parent / ".env")


def statements(sql: str) -> list[str]:
    """Split on semicolons that end a line; drop comment-only chunks."""
    chunks = re.split(r";\s*$", sql, flags=re.MULTILINE)
    has_code = lambda c: any(l.strip() and not l.strip().startswith("--") for l in c.splitlines())
    return [c.strip() for c in chunks if has_code(c)]


def main() -> None:
    sql = (DB_DIR / "schema.sql").read_text()
    # A continuous aggregate cannot be created inside a transaction block, and a
    # multi-statement string runs as one implicit transaction, so send statements
    # one at a time with autocommit.
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
        for stmt in statements(sql):
            conn.execute(stmt)
        tables = conn.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' ORDER BY 1"
        ).fetchall()
        exts = conn.execute(
            "SELECT extname, extversion FROM pg_extension ORDER BY 1"
        ).fetchall()
    print("tables:", ", ".join(t for (t,) in tables))
    print("extensions:", ", ".join(f"{n} {v}" for n, v in exts))


if __name__ == "__main__":
    main()
