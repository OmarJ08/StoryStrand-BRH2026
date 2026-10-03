"""Loads the Knowledge Map road network built by data/scripts/build_graph.py."""
import os
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy.sparse import csr_matrix

from backend.routing import learning

REPO = Path(__file__).resolve().parents[2]
GRAPH_DIR = Path(os.environ.get("GRAPH_DIR", REPO.parent / "data" / "processed"))


@dataclass
class KnowledgeGraph:
    ids: list[str]
    index: dict[str, int]
    diff: np.ndarray


graph: KnowledgeGraph | None = None


def load_graph() -> None:
    """Fill learning.G_strict / G_soft / diff. Leaves graph None if the file is missing."""
    global graph
    path = GRAPH_DIR / "graph_knowledge.npz"
    if not path.exists():
        print(f"[routing] {path} not found: /api/route disabled")
        return
    z = np.load(path)
    shape = tuple(z["shape"])
    learning.G_strict = csr_matrix((z["strict_data"], z["strict_indices"], z["strict_indptr"]), shape=shape)
    learning.G_soft = csr_matrix((z["soft_data"], z["soft_indices"], z["soft_indptr"]), shape=shape)
    learning.diff = z["difficulty"]
    ids = [str(i) for i in z["ids"]]
    graph = KnowledgeGraph(ids=ids, index={i: n for n, i in enumerate(ids)}, diff=learning.diff)
    print(f"[routing] loaded {len(ids)} nodes, {learning.G_strict.nnz} strict / "
          f"{learning.G_soft.nnz} soft edges")
