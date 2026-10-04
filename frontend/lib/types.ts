export type MapName = "books" | "knowledge";
export type ItemType = "book" | "encyclopedia" | "report" | "paper" | "film"; // film, report reserved

export interface Item {
  id: string; type: ItemType; map: MapName; slug: string; title: string;
  creators: string[]; year?: number; description: string; tags: string[];
  coverUrl?: string; rating?: number; difficulty?: number;
  attributes: Record<string, string | number | boolean | string[]>;
  clusterId?: number; clusterLabel?: string; x?: number; y?: number; z?: number;
}

/** One point from GET /api/map (snake_case, as the API returns it). */
export interface MapPoint {
  id: string; type: ItemType; title: string; cover_url: string | null;
  difficulty: number | null; cluster_label: string; x: number; y: number; z: number;
}

/** One result from POST /api/search. */
export interface SearchHit extends MapPoint {
  creators: string[];
}

/** GET /api/items/:id: the full item and where to read it (first link is the primary one). */
export interface ItemDetail extends SearchHit {
  map: MapName;
  year: number | null;
  description: string;
  tags: string[];
  links: { label: string; url: string }[];
}

/** POST /api/books/estimate: a book outside the dataset, placed by estimate. */
export interface EstimatedBook extends SearchHit {
  estimated: true;
  description: string;
  tags: string[];
  nearest_titles: string[];
  found_online: boolean;
}

export interface Pin {
  x: number;
  y: number;
  z: number;
  home_cluster: string;
  suggested: boolean;
}

export interface DnaShare {
  label: string;
  share: number;
}

/** POST /api/guest response (Section 12). */
export interface GuestResponse {
  guest_id: string;
  picks: SearchHit[];
  book_pin: Pin;
  curiosity_pin: Pin | null;              // only when sci-fi is a real part of the picks
  scifi_picks: string[];
  dna: { books: DnaShare[]; knowledge?: DnaShare[] };
}

/** A route start or destination: typed text (matched by meaning), a known item, or (book
 *  map starts only) the guest's own position, "You are here". */
export type RouteEndpoint = { text: string } | { item_id: string } | { guest: true };

export interface RouteStop {
  item: SearchHit;
  step_similarity: number | null;
  guide_note: string | null;
}

export type NotesStatus = "pending" | "ready" | "none";

/** POST /api/route response (Section 12). */
export interface RouteResponse {
  route_id: string;
  map: MapName;
  kind: "learning" | "bridge" | "taste";
  relaxed: boolean;
  stops: RouteStop[];
  notes_status: NotesStatus;
  /** set when a scenic detour was asked for and found: the neighborhood and its waypoint stop */
  scenic?: { label: string; waypoint_id: string } | null;
  /** bridge routes only ("Learn the real science"): the book and its concepts */
  book: SearchHit | null;
  concepts: string[];
  /** frontend only: narration shipped with the site (public/demo), played without the API */
  baked?: { notes: string[]; clips: string[] };
}

/** public/demo/bridge/<book>.json, written by scripts/bake_demo.py */
export interface BakedBridge {
  route: RouteResponse;
  notes: string[];
  clips: string[];   // site-relative MP3 paths
}

/** GET /api/portals?map= */
export interface Portal {
  similarity: number;
  here: MapPoint;
  there: MapPoint;
  there_map: MapName;
}

/** GET /api/stats */
export interface DbStats {
  vector_search_ms: number;
  vector_search_roundtrip_ms: number;
  vector_index: string | null;
  books: number;
  knowledge: number;
  vectors: number;
  vector_dims: number;
  portals: number;
  events: number;
  chunks: number;
  compressed_chunks: number;
  compression_ratio: number | null;
  cagg_last_refresh: string | null;
  cagg_refresh_ms: number | null;
  cagg_status: string | null;
  cagg_next_refresh: string | null;
}

/** GET/POST /api/simulation: the demo's simulated-traffic switch */
export interface SimulationState {
  running: boolean;
}

/** GET /api/traffic?map= */
export interface NeighborhoodTraffic {
  label: string;
  visits: number;   // last window_minutes
  recent: number;   // last recent_seconds
}

export interface TrafficResponse {
  map: MapName;
  window_minutes: number;
  recent_seconds: number;
  real_visits: number;
  simulated_visits: number;
  neighborhoods: NeighborhoodTraffic[];
}

/** GET /api/route/:id/notes */
export interface RouteNotes {
  status: NotesStatus;
  notes: string[] | null;
}

/** POST /api/route/:id/voice */
export interface RouteVoice {
  route_id: string;
  voice: string;
  clips: { index: number; note: string; url: string }[];
}
