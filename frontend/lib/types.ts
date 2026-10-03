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

/** A route start or destination: typed text (matched by meaning) or a known item. */
export type RouteEndpoint = { text: string } | { item_id: string };

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
  kind: "learning";
  relaxed: boolean;
  stops: RouteStop[];
  notes_status: NotesStatus;
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
