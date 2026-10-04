"""Scenic detours (Section 9.2, on both maps): route start -> waypoint -> destination, where
the waypoint is the most central item of a neighborhood the smooth route doesn't touch,
choosing the neighborhood closest in meaning to the route."""
from typing import Callable

import numpy as np
from scipy.sparse import csr_matrix

from backend.models.item import MapName
from backend.routing.learning import dijkstra
from backend.routing.neighborhoods import loaded

NEIGHBORHOODS_TRIED = 3
WAYPOINTS_TRIED = 5     # per neighborhood, most central first


def detour_neighborhoods(map_name: MapName, path: list[int]) -> list[str]:
    """Neighborhoods the route doesn't pass through, closest to any of its rows first."""
    nb = loaded[map_name]
    touched = set(nb.labels[path])
    closeness = (nb.centroids @ nb.X[path].T).max(axis=1)
    order = [nb.names[k] for k in np.argsort(-closeness)]
    return [n for n in order if n not in touched][:NEIGHBORHOODS_TRIED]


def via(G: csr_matrix, start: int, goal: int, waypoint: int) -> list[int] | None:
    """start -> waypoint -> goal, or None if a half has no path or the halves cross."""
    a = dijkstra(G, start, waypoint)
    b = dijkstra(G, waypoint, goal) if a else None
    if b is None or set(a[:-1]) & set(b):
        return None
    return a + b[1:]


def scenic_path(map_name: MapName, G: csr_matrix, path: list[int],
                eligible: Callable[[np.ndarray], np.ndarray] | None = None
                ) -> tuple[list[int], str, int] | None:
    """(full path, neighborhood, waypoint row) for the first detour that works, or None.
    `eligible` filters candidate waypoint rows (the Knowledge Map's level window)."""
    if map_name not in loaded:
        return None
    nb = loaded[map_name]
    for label in detour_neighborhoods(map_name, path):
        rows = np.where(nb.labels == label)[0]
        if eligible is not None:
            rows = rows[eligible(rows)]
        for w in rows[np.argsort(-nb.centrality[rows])][:WAYPOINTS_TRIED]:
            full = via(G, path[0], path[-1], int(w))
            if full:
                return full, label, int(w)
    return None
