"use client";

import Image from "next/image";
import type { MapPoint, RouteResponse } from "@/lib/types";
import { ScenicTag } from "./ClimbPanel";

/** Bottom panel for a Book Map taste route: the stops in order, each tappable. */
export default function TastePanel({ route, onStop }: {
  route: RouteResponse;
  onStop: (item: MapPoint) => void;
}) {
  const hoods = new Set(route.stops.map((s) => s.item.cluster_label)).size;
  return (
    <section className="pointer-events-auto fixed inset-x-0 bottom-0 z-10 mx-auto max-h-[40dvh] max-w-lg overflow-y-auto rounded-t-3xl border border-b-0 border-line bg-surface px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black/60">
      <h2 className="font-display text-lg font-semibold">Your reading path</h2>
      <p className="text-xs text-muted">
        {route.stops.length} books · {hoods} {hoods === 1 ? "neighborhood" : "neighborhoods"}
      </p>
      <ol className="mt-3 space-y-1">
        {route.stops.map((s, i) => (
          <li key={s.item.id}>
            <button onClick={() => onStop(s.item)}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-coral text-xs font-bold text-ink">
                {i + 1}
              </span>
              {s.item.cover_url && (
                <Image src={s.item.cover_url} alt="" width={28} height={42}
                  className="h-10.5 w-7 shrink-0 rounded object-cover" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{s.item.title}</span>
                <span className="block truncate text-xs text-muted">
                  {s.item.id === route.scenic?.waypoint_id && <ScenicTag />}
                  {s.item.cluster_label}
                  {s.step_similarity !== null && ` · ${Math.round(s.step_similarity * 100)}% like the last book`}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
