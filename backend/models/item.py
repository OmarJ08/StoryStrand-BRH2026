from typing import Literal, Optional
from pydantic import BaseModel, Field

MapName = Literal["books", "knowledge"]
ItemType = Literal["book", "encyclopedia", "report", "paper", "film"]  # film, report reserved

MAP_OF_TYPE = {"book": "books", "film": "books",
               "encyclopedia": "knowledge", "report": "knowledge", "paper": "knowledge"}


class Item(BaseModel):
    id: str                  # "<type>:<source_id>", e.g. "paper:2301.01234"
    type: ItemType
    map: MapName
    slug: str                # URL-safe, unique across all items
    title: str
    creators: list[str]      # authors / NASA centers / paper authors
    year: Optional[int] = None
    description: str         # book blurb, article lead, or abstract
    tags: list[str] = []     # genres, wiki categories, arXiv categories (readable)
    cover_url: Optional[str] = None
    rating: Optional[float] = None
    difficulty: Optional[int] = None   # 1-5, knowledge map only
    attributes: dict = Field(default_factory=dict)
    # book: isbn, page_count | encyclopedia: page_id, url
    # report: ntrs_id, center | paper: arxiv_id, categories, doi
    cluster_id: Optional[int] = None
    cluster_label: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    z: Optional[float] = None


class MapPoint(BaseModel):
    """One point on a map, as returned by GET /api/map."""
    id: str
    type: ItemType
    title: str
    cover_url: Optional[str] = None
    difficulty: Optional[int] = None
    cluster_label: str
    x: float
    y: float
    z: float


def embedding_text(item: Item) -> str:
    return f"{item.title}. {', '.join(item.tags)}. {item.description}".strip()
