import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def get_conn() -> psycopg.Connection:
    return psycopg.connect(os.environ["DATABASE_URL"])
