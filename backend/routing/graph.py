"""Loads the road networks built by data/scripts/build_graph.py: the Knowledge Map's strict
and soft learning graphs, and the Book Map's taste graph."""
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


@dataclass
class BooksGraph:
    ids: list[str]
    index: dict[str, int]
    G: csr_matrix          # undirected, cost (1 - s)^2 (Section 9.2)


graph: KnowledgeGraph | None = None
books: BooksGraph | None = None


def load_graph() -> None:
    """Fill learning.G_strict / G_soft / diff and `books`. Leaves a graph None if its file is missing."""
    global graph, books
    path = GRAPH_DIR / "graph_knowledge.npz"
    if not path.exists():
        print(f"[routing] {path} not found: knowledge routes disabled")
    else:
        z = np.load(path)
        shape = tuple(z["shape"])
        learning.G_strict = csr_matrix((z["strict_data"], z["strict_indices"], z["strict_indptr"]), shape=shape)
        learning.G_soft = csr_matrix((z["soft_data"], z["soft_indices"], z["soft_indptr"]), shape=shape)
        learning.diff = z["difficulty"]
        ids = [str(i) for i in z["ids"]]
        graph = KnowledgeGraph(ids=ids, index={i: n for n, i in enumerate(ids)}, diff=learning.diff)
        print(f"[routing] knowledge: {len(ids)} nodes, {learning.G_strict.nnz} strict / "
              f"{learning.G_soft.nnz} soft edges")

    path = GRAPH_DIR / "graph_books.npz"
    if not path.exists():
        print(f"[routing] {path} not found: taste routes disabled")
    else:
        z = np.load(path)
        ids = [str(i) for i in z["ids"]]
        G = csr_matrix((z["data"], z["indices"], z["indptr"]), shape=tuple(z["shape"]))
        books = BooksGraph(ids=ids, index={i: n for n, i in enumerate(ids)}, G=G)
        print(f"[routing] books: {len(ids)} nodes, {G.nnz} edges")
