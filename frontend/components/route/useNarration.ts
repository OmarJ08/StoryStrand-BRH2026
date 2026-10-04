"use client";

import { useEffect, useState } from "react";
import { api, apiBlob } from "@/lib/api";
import type { RouteNotes, RouteResponse, RouteVoice } from "@/lib/types";

const POLL_MS = 1500;
const NOTES_GIVE_UP_MS = 60_000;   // backend notes job allows 45 s (3 attempts)

export type Narration =
  | { status: "preparing" }
  | { status: "ready"; notes: string[]; clips: string[] }   // clips: object URLs, one per stop
  | { status: "none" }
  | { status: "error"; message: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Waits for the route's tour-guide notes (generated in the background), asks for the Grok
 * Voice clips, and prefetches them all, so "Start route" can play straight from the tap.
 */
export function useNarration(route: RouteResponse | null): Narration {
  const [state, setState] = useState<{ routeId: string; narration: Narration } | null>(null);

  useEffect(() => {
    if (!route || route.baked || route.notes_status === "none") return;
    const id = route.route_id;
    let cancelled = false;
    const urls: string[] = [];
    const set = (narration: Narration) => {
      if (!cancelled) setState({ routeId: id, narration });
    };

    (async () => {
      const t0 = Date.now();
      let notes = await api<RouteNotes>(`/api/route/${id}/notes`);
      while (notes.status === "pending") {
        if (Date.now() - t0 > NOTES_GIVE_UP_MS) return set({ status: "none" });
        await sleep(POLL_MS);
        if (cancelled) return;
        notes = await api<RouteNotes>(`/api/route/${id}/notes`);
      }
      if (notes.status !== "ready" || !notes.notes) return set({ status: "none" });

      const voice = await api<RouteVoice>(`/api/route/${id}/voice`, { method: "POST" });
      const blobs = await Promise.all(voice.clips.map((c) => apiBlob(c.url)));
      if (cancelled) return;
      urls.push(...blobs.map((b) => URL.createObjectURL(b)));
      set({ status: "ready", notes: notes.notes, clips: urls });
    })().catch((e: Error) => set({ status: "error", message: e.message }));

    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [route]);

  if (!route || route.notes_status === "none") return { status: "none" };   // e.g. taste routes
  if (route.baked) return { status: "ready", ...route.baked };   // shipped with the site
  return state?.routeId === route.route_id ? state.narration : { status: "preparing" };
}
