def allowed(d_from: int, d_to: int) -> bool:          # strict graph (v6.1)
    return d_to - d_from in (0, 1)


def edge_cost(s: float, d_from: int, d_to: int,       # soft graph (v6, fallback only)
              alpha: float = 0.5, beta: float = 0.3) -> float:
    smooth = (1 - s) ** 2                             # small conceptual steps
    downhill = alpha * max(0, d_from - d_to)          # penalize dropping back
    skip = beta * max(0, d_to - d_from - 1)           # penalize climbing more than one level
    return smooth + downhill + skip
