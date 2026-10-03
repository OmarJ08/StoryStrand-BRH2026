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
