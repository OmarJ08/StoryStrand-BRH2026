from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

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


class SearchRequest(BaseModel):
    map: MapName
    query: str = Field(min_length=1, max_length=100)
    limit: int = Field(default=8, ge=1, le=20)


class SearchHit(MapPoint):
    creators: list[str] = []


class RouteEndpoint(BaseModel):
    """A route start or destination: typed text (matched by meaning) or a known item."""
    text: Optional[str] = Field(default=None, min_length=1, max_length=200)
    item_id: Optional[str] = None

    @model_validator(mode="after")
    def exactly_one(self) -> "RouteEndpoint":
        if (self.text is None) == (self.item_id is None):
            raise ValueError("give exactly one of text or item_id")
        return self


class RouteRequest(BaseModel):
    map: MapName
    start: RouteEndpoint
    destination: RouteEndpoint
    max_stops: int = Field(default=6, ge=2, le=12)
    guest_id: Optional[UUID] = None


class RouteStop(BaseModel):
    item: SearchHit
    step_similarity: Optional[float] = None   # cosine to the previous stop
    guide_note: Optional[str] = None           # filled by the tour-guide step later


NotesStatus = Literal["pending", "ready", "none"]


class RouteResponse(BaseModel):
    route_id: str
    map: MapName
    kind: Literal["learning"]
    relaxed: bool                               # True when the strict climb had no path
    stops: list[RouteStop]
    notes_status: NotesStatus = "pending"       # notes are generated in the background


class RouteNotes(BaseModel):
    status: NotesStatus
    notes: Optional[list[str]] = None


class VoiceClip(BaseModel):
    index: int
    note: str
    url: str                                    # relative to the API base


class RouteVoice(BaseModel):
    route_id: str
    voice: str
    clips: list[VoiceClip]


def embedding_text(item: Item) -> str:
    return f"{item.title}. {', '.join(item.tags)}. {item.description}".strip()
