"""Book Map taste routes (Section 9.2): Dijkstra on the undirected taste graph, trimmed to
evenly spaced stops. The path itself is learning.dijkstra on graph.books.G."""

def trim_even(path: list[int], max_stops: int, must=frozenset(), avoid=frozenset()) -> list[int]:
    """Keep the start, the end and any `must` rows, then evenly spaced stops from the rest;
    a row in `avoid` (the guest's own picks) is never kept as a middle stop."""
    keep = {0, len(path) - 1} | {i for i, p in enumerate(path) if p in must}
    rest = [i for i in range(len(path)) if i not in keep and path[i] not in avoid]
    spare = max_stops - len(keep)
    if spare >= len(rest):
        keep |= set(rest)
    elif spare > 0:
        step = len(rest) / spare
        keep |= {rest[int((k + 0.5) * step)] for k in range(spare)}
    return [path[i] for i in sorted(keep)]

