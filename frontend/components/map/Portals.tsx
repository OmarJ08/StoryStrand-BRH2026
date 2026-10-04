"use client";

import { useEffect, useState } from "react";
import { api, liveOrBaked } from "@/lib/api";
import type { MapName, Portal } from "@/lib/types";

const LIVE_TIMEOUT_MS = 4000;

/** GET /api/portals for one map (baked copy if the API is slow or down). */
export function usePortals(map: MapName, enabled: boolean): Portal[] | null {
  const [state, setState] = useState<{ map: MapName; portals: Portal[] } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    liveOrBaked(api<Portal[]>(`/api/portals?map=${map}`), `portals-${map}.json`, LIVE_TIMEOUT_MS)
      .then((portals) => !cancelled && setState({ map, portals }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [map, enabled]);
  return enabled && state?.map === map ? state.portals : null;
}
