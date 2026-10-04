"""Knowledge Map learning routes (Section 9.3).

learning_route() and trim_by_level() are as written in the brief (trim_by_level can also be
told to keep a scenic waypoint); they read the
module-level graphs and difficulty array that backend.routing.graph fills at startup.
"""
import numpy as np
from scipy.sparse.csgraph import dijkstra as csgraph_dijkstra

G_strict = None   # directed: only level changes of 0 or +1
G_soft = None     # directed: every edge, v6 downhill/skip penalties (fallback)
diff = None       # difficulty per graph row


def dijkstra(G, start, goal):
    """Shortest path as a list of graph rows, or None when goal is unreachable."""
    dist, pred = csgraph_dijkstra(G, indices=start, return_predecessors=True)
    if not np.isfinite(dist[goal]):
        return None
    path = [goal]
    while path[-1] != start:
        path.append(int(pred[path[-1]]))
    return path[::-1]


def learning_route(start, goal, max_stops=6):
    path = dijkstra(G_strict, start, goal)
    relaxed = path is None
    if relaxed:                                       # no strict path: use v6 soft costs
        path = dijkstra(G_soft, start, goal)
    return trim_by_level(path, max_stops), relaxed


def trim_by_level(path, max_stops, must=()):         # (v6.1) never trims away a level
    if len(path) <= max_stops:
        return path
    keep = {0, len(path) - 1} | {i for i, p in enumerate(path) if p in must}   # e.g. a scenic waypoint
    for lvl in sorted({diff[p] for p in path}):       # first stop at each level
        keep.add(next(i for i, p in enumerate(path) if diff[p] == lvl))
    rest = [i for i in range(len(path)) if i not in keep]
    spare = max_stops - len(keep)
    if spare > 0:
        step = len(rest) / spare
        keep |= {rest[int(k * step)] for k in range(spare)}
    return [path[i] for i in sorted(keep)]
