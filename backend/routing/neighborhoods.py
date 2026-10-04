"""Neighborhood geometry for scenic detours, per map, aligned to the road-network rows:
each row's neighborhood label and unit vector, each neighborhood's centroid (normalized
mean vector), and each row's centrality (cosine to its own centroid).

Loaded from Tiger in a background thread at startup (about 16k vectors); until it is in,
scenic requests return the normal route.
"""
import threading
from dataclasses import dataclass

import numpy as np
from pgvector.psycopg import register_vector

from backend.db.conn import get_conn
from backend.models.item import MapName


@dataclass
class Neighborhoods:
    labels: np.ndarray        # per row
    X: np.ndarray             # per row, unit vectors
    names: list[str]          # neighborhood names; centroids[k] belongs to names[k]
    centroids: np.ndarray     # per neighborhood, unit vectors
    centrality: np.ndarray    # per row


loaded: dict[MapName, Neighborhoods] = {}


def build(map_name: MapName, ids: list[str]) -> Neighborhoods:
    with get_conn() as conn:
        register_vector(conn)
        rows = conn.execute("SELECT id, cluster_label, embedding FROM items WHERE map = %s",
                            (map_name,)).fetchall()
    by_id = {r[0]: (r[1], r[2]) for r in rows}
    labels = np.array([by_id[i][0] for i in ids])
    X = np.stack([by_id[i][1].to_numpy() for i in ids]).astype(np.float32)
    X /= np.linalg.norm(X, axis=1, keepdims=True)
    names = sorted(set(labels))
    centroids = np.stack([X[labels == n].mean(axis=0) for n in names])
    centroids /= np.linalg.norm(centroids, axis=1, keepdims=True)
    own = np.searchsorted(names, labels)
    centrality = np.einsum("ij,ij->i", X, centroids[own])
    return Neighborhoods(labels=labels, X=X, names=names, centroids=centroids, centrality=centrality)


def load_in_background(graphs: dict[MapName, list[str]]) -> None:
    def run() -> None:
        for map_name, ids in graphs.items():
            loaded[map_name] = build(map_name, ids)
            print(f"[routing] {map_name}: {len(loaded[map_name].names)} neighborhoods ready for scenic")
    threading.Thread(target=run, daemon=True).start()
