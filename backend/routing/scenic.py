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


def via(G: csr_matrix, stops: list[int]) -> list[int] | None:
    """One path through `stops` in order, or None if a leg has no path or legs cross."""
    full = [stops[0]]
    for a, b in zip(stops, stops[1:]):
        leg = dijkstra(G, a, b)
        if leg is None or set(leg[1:]) & set(full):
            return None
        full += leg[1:]
    return full


def scenic_path(map_name: MapName, G: csr_matrix, path: list[int],
                eligible: Callable[[np.ndarray], np.ndarray] | None = None,
                through: list[int] = (), order: Callable[[int], int] = lambda r: 0,
                ) -> tuple[list[int], str, int] | None:
    """(full path, neighborhood, waypoint row) for the first detour that works, or None.
    `eligible` filters candidate waypoint rows (the Knowledge Map's level window); the route
    still passes through `through` (e.g. a topic article), with the waypoint slotted in by
    `order` (the level, on the Knowledge Map)."""
    if map_name not in loaded:
        return None
    nb = loaded[map_name]
    for label in detour_neighborhoods(map_name, path):
        rows = np.where(nb.labels == label)[0]
        if eligible is not None:
            rows = rows[eligible(rows)]
        for w in rows[np.argsort(-nb.centrality[rows])][:WAYPOINTS_TRIED]:
            stops = sorted([*through, int(w)], key=order)
            full = via(G, [path[0], *stops, path[-1]])
            if full:
                return full, label, int(w)
    return None
