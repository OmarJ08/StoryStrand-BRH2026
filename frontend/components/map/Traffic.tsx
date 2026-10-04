"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { MapName, TrafficResponse } from "@/lib/types";

const POLL_MS = 5000;

/** A traffic snapshot plus a counter that ticks on every poll, so labels can flash once per poll. */
export interface LiveTraffic extends TrafficResponse {
  poll: number;
}

/** GET /api/traffic for one map every few seconds while the tab is visible. */
export function useTraffic(map: MapName, enabled: boolean): LiveTraffic | null {
  const [traffic, setTraffic] = useState<LiveTraffic | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () => {
      if (document.hidden) return;
      api<TrafficResponse>(`/api/traffic?map=${map}`)
        .then((t) => !cancelled && setTraffic((prev) => ({ ...t, poll: (prev?.poll ?? 0) + 1 })))
        .catch(() => {});
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [map, enabled]);
  return enabled && traffic?.map === map ? traffic : null;
}

/** Small legend for the traffic shown on the labels; says "simulated" whenever simulated events are in it. */
export function TrafficBadge({ traffic }: { traffic: TrafficResponse }) {
  const total = traffic.real_visits + traffic.simulated_visits;
  if (total === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-[6] flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-1.5 text-xs text-muted">
      <span className="size-1.5 rounded-full bg-coral" />
      Live traffic · {total.toLocaleString()} visits in {traffic.window_minutes} min
      {traffic.simulated_visits > 0 && (
        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-white">simulated</span>
      )}
    </div>
  );
}
