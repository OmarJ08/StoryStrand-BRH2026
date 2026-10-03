"use client";

import Link from "next/link";
import { useState } from "react";
import SearchBox from "@/components/SearchBox";
import { pointFocus, pointsFocus } from "@/components/map/CameraRig";
import { useScene } from "@/components/map/SceneContext";
import { api } from "@/lib/api";
import type { RouteEndpoint, RouteResponse, SearchHit } from "@/lib/types";
import ClimbPanel from "./ClimbPanel";

type Pick = { kind: "text"; text: string } | { kind: "item"; hit: SearchHit };

function toEndpoint(pick: Pick): RouteEndpoint {
  switch (pick.kind) {
    case "text":
      return { text: pick.text };
    case "item":
      return { item_id: pick.hit.id };
    default: {
      const unhandled: never = pick;
      return unhandled;
    }
  }
}

function Field({ label, pick, onPick, placeholder }: {
  label: string;
  pick: Pick | null;
  onPick: (pick: Pick | null) => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-xs font-medium uppercase tracking-wider text-white/50">{label}</span>
      {pick ? (
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-full border border-white/15 bg-ink/90 py-2 pr-2 pl-4">
          <span className="truncate text-sm">
            {pick.kind === "text" ? `“${pick.text}”` : pick.hit.title}
          </span>
          <button onClick={() => onPick(null)} aria-label={`Clear ${label}`}
            className="shrink-0 rounded-full px-2 text-white/50 hover:text-white">×</button>
        </div>
      ) : (
        <SearchBox
          map="knowledge"
          placeholder={placeholder}
          onSelect={(hit) => onPick({ kind: "item", hit })}
          onText={(text) => onPick({ kind: "text", text })}
        />
      )}
    </div>
  );
}

/** Start + destination inputs; the route is drawn on the shared map via SceneContext. */
export default function RoutePlanner() {
  const { route, setRoute, setSelection, flyTo } = useScene();
  const [start, setStart] = useState<Pick | null>(null);
  const [destination, setDestination] = useState<Pick | null>(null);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<{ state: "idle" | "loading" } | { state: "error"; message: string }>(
    { state: "idle" },
  );

  const findRoute = () => {
    if (!start || !destination) return;
    setStatus({ state: "loading" });
    api<RouteResponse>("/api/route", {
      method: "POST",
      body: JSON.stringify({ map: "knowledge", start: toEndpoint(start), destination: toEndpoint(destination) }),
    })
      .then((r) => {
        setRoute(r);
        setEditing(false);
        setSelection(null);
        flyTo(pointsFocus(r.stops.map((s) => s.item)));
        setStatus({ state: "idle" });
      })
      .catch((e: Error) => setStatus({ state: "error", message: e.message }));
  };

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex justify-center px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto w-full max-w-md space-y-2 rounded-3xl border border-white/15 bg-ink/90 p-3 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div className="flex items-center justify-between px-1">
            <h1 className="font-display text-base font-semibold">Learning route</h1>
            <Link href="/map/knowledge" className="text-xs text-white/50 hover:text-white">← Map</Link>
          </div>
          {route && !editing ? (
            // collapsed once a route is showing, so the map has room
            <div className="flex items-center gap-2 px-1">
              <p className="min-w-0 flex-1 truncate text-sm text-white/80">
                {route.stops[0].item.title} <span className="text-coral">→</span>{" "}
                {route.stops[route.stops.length - 1].item.title}
              </p>
              <button onClick={() => setEditing(true)}
                className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs hover:bg-white/10">
                Edit
              </button>
            </div>
          ) : (
            <>
              <Field label="From" pick={start} onPick={setStart}
                placeholder="Where you are, e.g. what is Mars like" />
              <Field label="To" pick={destination} onPick={setDestination}
                placeholder="Where to go, e.g. Martian atmospheric chemistry" />
              <button
                onClick={findRoute}
                disabled={!start || !destination || status.state === "loading"}
                className="w-full rounded-full bg-coral py-2.5 font-display font-semibold text-ink transition-opacity disabled:opacity-40"
              >
                {status.state === "loading" ? "Finding your climb…" : "Find route"}
              </button>
            </>
          )}
          {status.state === "error" && (
            <p className="px-1 text-xs text-coral">Could not find a route: {status.message}</p>
          )}
        </div>
      </header>
      {route && (
        <ClimbPanel
          route={route}
          onStop={(item) => {
            setSelection({ map: "knowledge", point: item });
            flyTo(pointFocus(item));
          }}
        />
      )}
    </>
  );
}
