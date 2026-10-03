from datetime import datetime
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


class ItemLink(BaseModel):
    label: str               # e.g. "arXiv", "PDF", "Wikipedia", "Goodreads"
    url: str


class ItemDetail(SearchHit):
    """GET /api/items/{id}: everything the item sheet shows, plus where to read it."""
    map: MapName
    year: Optional[int] = None
    description: str = ""
    tags: list[str] = []
    links: list[ItemLink] = []  # first is the primary "open" link


class EstimateRequest(BaseModel):
    query: str = Field(min_length=2, max_length=120)   # title, optionally with author


class EstimatedBook(SearchHit):
    """A book outside the dataset, placed on the Book Map by estimate (POST /api/books/estimate)."""
    estimated: bool = True
    description: str = ""
    tags: list[str] = []
    nearest_titles: list[str] = []   # the real books it landed closest to
    found_online: bool = False       # False when Open Library had no match (qwen guessed alone)


class GuestRequest(BaseModel):
    guest_id: UUID
    book_ids: list[str] = Field(min_length=5, max_length=5)

    @model_validator(mode="after")
    def unique(self) -> "GuestRequest":
        if len(set(self.book_ids)) != len(self.book_ids):
            raise ValueError("pick 5 different books")
        return self


class Pin(BaseModel):
    x: float
    y: float
    z: float
    home_cluster: str
    suggested: bool = False      # True for the curiosity pin (Section 10)


class DnaShare(BaseModel):
    label: str
    share: float                 # softmax share; a map's shares sum to 1


class GuestResponse(BaseModel):
    """POST /api/guest (Section 12): where the guest's taste sits on both maps."""
    guest_id: UUID
    picks: list[SearchHit]
    book_pin: Pin
    curiosity_pin: Optional[Pin] = None   # only when sci-fi is a real part of the picks
    scifi_picks: list[str] = []           # ids of the picks that count as sci-fi
    dna: dict[MapName, list[DnaShare]]    # "knowledge" only alongside a curiosity pin


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
    kind: Literal["learning", "bridge"]
    relaxed: bool                               # True when the strict climb had no path
    stops: list[RouteStop]
    notes_status: NotesStatus = "pending"       # notes are generated in the background
    # bridge routes only ("Learn the real science", Section 10)
    book: Optional[SearchHit] = None
    concepts: list[str] = []


class BridgeLearnRequest(BaseModel):
    book_id: str
    guest_id: Optional[UUID] = None
    max_stops: int = Field(default=5, ge=2, le=12)


class NeighborhoodTraffic(BaseModel):
    label: str
    visits: int                                 # last window_minutes (continuous aggregate)
    recent: int                                 # last recent_seconds, for the live ping


class SimulationState(BaseModel):
    running: bool


class Portal(BaseModel):
    """GET /api/portals?map=: a mutual best match between a book and a knowledge item.
    here is on the requested map, there on the other one."""
    similarity: float
    here: MapPoint
    there: MapPoint
    there_map: MapName


class DbStats(BaseModel):
    """GET /api/stats: live Tiger numbers for the "Under the hood" panel."""
    vector_search_ms: float              # EXPLAIN ANALYZE execution time, top-10 DiskANN search
    vector_search_roundtrip_ms: float    # same query timed from the API (includes network)
    vector_index: Optional[str]          # index the search used, from the query plan
    books: int
    knowledge: int
    vectors: int
    vector_dims: int
    portals: int
    events: int
    chunks: int
    compressed_chunks: int
    compression_ratio: Optional[float]   # before / after bytes, None until a chunk is compressed
    cagg_last_refresh: Optional[datetime]
    cagg_refresh_ms: Optional[float]
    cagg_status: Optional[str]
    cagg_next_refresh: Optional[datetime]


class TrafficResponse(BaseModel):
    map: MapName
    window_minutes: int
    recent_seconds: int
    real_visits: int
    simulated_visits: int                       # > 0 means the UI must say "simulated"
    neighborhoods: list[NeighborhoodTraffic]


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
