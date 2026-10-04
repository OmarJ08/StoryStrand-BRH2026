"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import SearchBox from "@/components/SearchBox";
import { pointFocus, pointsFocus } from "@/components/map/CameraRig";
import { liftedPoint } from "@/components/map/RouteLine";
import { useScene } from "@/components/map/SceneContext";
import { api } from "@/lib/api";
import { useGuest } from "@/lib/guest";
import type { MapName, RouteEndpoint, RouteResponse, SearchHit } from "@/lib/types";
import ClimbPanel from "./ClimbPanel";
import TastePanel from "./TastePanel";
import { useNarration } from "./useNarration";
import { useRoutePlayer } from "./useRoutePlayer";

type Pick = { kind: "text"; text: string } | { kind: "item"; hit: SearchHit } | { kind: "guest" };

function toEndpoint(pick: Pick): RouteEndpoint {
  switch (pick.kind) {
    case "text":
      return { text: pick.text };
    case "item":
      return { item_id: pick.hit.id };
    case "guest":
      return { guest: true };
    default: {
      const unhandled: never = pick;
      return unhandled;
    }
  }
}

function pickLabel(pick: Pick): string {
  switch (pick.kind) {
    case "text":
      return `“${pick.text}”`;
    case "item":
      return pick.hit.title;
    case "guest":
      return "You are here";
    default: {
      const unhandled: never = pick;
      return unhandled;
    }
  }
}

const COPY: Record<MapName, { title: string; from: string; to: string; hint: string; finding: string }> = {
  knowledge: {
    title: "Learning route",
    from: "Where you are, e.g. what is Mars like",
    to: "Where to go, e.g. Martian atmospheric chemistry",
    hint: "Matches the closest topics, not just titles",
    finding: "Finding your climb…",
  },
  books: {
    title: "Taste route",
    from: "A book you love",
    to: "A book to head toward, or a vibe",
    hint: "Matches the closest book by feel, not just titles",
    finding: "Finding your way…",
  },
};

function Field({ map, label, pick, onPick, placeholder }: {
  map: MapName;
  label: string;
  pick: Pick | null;
  onPick: (pick: Pick | null) => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-sm text-muted">{label}</span>
      {pick ? (
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-full border border-line bg-ink py-2 pr-2 pl-4">
          <span className="truncate text-sm">{pickLabel(pick)}</span>
          <button onClick={() => onPick(null)} aria-label={`Clear ${label}`}
            className="shrink-0 rounded-full px-2 text-muted hover:text-white">×</button>
        </div>
      ) : (
        <SearchBox
          map={map}
          placeholder={placeholder}
          onSelect={(hit) => onPick({ kind: "item", hit })}
          onText={(text) => onPick({ kind: "text", text })}
          textHint={COPY[map].hint}
        />
      )}
    </div>
  );
}

/**
 * Start + destination inputs; the route is drawn on the shared map via SceneContext.
 * Knowledge Map: a learning route (climb + narration). Book Map: a taste route, which can
 * start from "You are here". Either can be scenic: a detour through a nearby neighborhood.
 */
export default function RoutePlanner({ map }: { map: MapName }) {
  const scene = useScene();
  const { setRoute, setSelection, flyTo, setActiveStop, autoplay, setAutoplay } = scene;
  const route = scene.route?.map === map ? scene.route : null;   // a route from the other map isn't ours
  const guest = useGuest();
  const narration = useNarration(route);
  const player = useRoutePlayer(
    narration.status === "ready" ? narration.clips : null,
    (i) => {                                   // each stop: fly there, buzz (Android), highlight
      if (!route) return;
      setSelection(null);
      setActiveStop(i);
      flyTo(pointFocus(liftedPoint(route.stops[i].item)));
      if ("vibrate" in navigator) navigator.vibrate(60);
    },
    () => {                                    // done: step back to see the whole climb
      setActiveStop(null);
      if (route) flyTo(pointsFocus(route.stops.map((s) => liftedPoint(s.item))));
    },
  );
  // "Learn the real science" asked for a hands-free tour: start once the clips are in
  // (the tap that asked for it already unlocked audio, see unlockAudio)
  const { start: startTour } = player;
  useEffect(() => {
    if (!autoplay || narration.status === "preparing") return;
    setAutoplay(false);
    if (narration.status === "ready") startTour();
  }, [autoplay, narration.status, setAutoplay, startTour]);

  const [start, setStart] = useState<Pick | null>(null);
  const [destination, setDestination] = useState<Pick | null>(null);
  const [scenic, setScenic] = useState(false);
  const [scenicAsked, setScenicAsked] = useState(false);   // for "no detour found" after the fact
  const [editing, setEditing] = useState(false);
  // a guest with a Book Map pin starts taste routes from it until they clear it
  const [fromHere, setFromHere] = useState(true);
  const from = start ?? (map === "books" && guest && fromHere ? { kind: "guest" as const } : null);
  const [status, setStatus] = useState<{ state: "idle" | "loading" } | { state: "error"; message: string }>(
    { state: "idle" },
  );

  const findRoute = () => {
    if (!from || !destination) return;
    setStatus({ state: "loading" });
    api<RouteResponse>("/api/route", {
      method: "POST",
      body: JSON.stringify({
        map, scenic, guest_id: guest?.guest_id,
        start: toEndpoint(from), destination: toEndpoint(destination),
      }),
    })
      .then((r) => {
        setRoute(r);
        setScenicAsked(scenic);
        setEditing(false);
        setSelection(null);
        setActiveStop(null);
        flyTo(pointsFocus(r.stops.map((s) => liftedPoint(s.item))));
        setStatus({ state: "idle" });
      })
      .catch((e: Error) => setStatus({ state: "error", message: e.message }));
  };

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex justify-center px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto w-full max-w-md space-y-2 rounded-3xl border border-line bg-surface p-4 shadow-2xl shadow-black/50">
          <div className="flex items-center justify-between px-1">
            <h1 className="min-w-0 truncate font-display text-base font-semibold">
              {route?.book && !editing ? `The real science of ${route.book.title}` : COPY[map].title}
            </h1>
            <Link href={route?.book && !editing ? "/map/books" : `/map/${map}`}
              className="shrink-0 pl-2 text-xs text-muted hover:text-white">← Map</Link>
          </div>
          {route?.book && !editing && route.concepts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-1">
              {route.concepts.map((c) => (
                <span key={c} className="rounded-full bg-teal/30 px-2.5 py-0.5 text-[11px] text-white/85">{c}</span>
              ))}
            </div>
          )}
          {route && !editing ? (
            // collapsed once a route is showing, so the map has room
            <div className="flex items-center gap-2 px-1">
              <p className="min-w-0 flex-1 truncate text-sm text-white/80">
                {route.stops[0].item.title} <span className="text-coral">→</span>{" "}
                {route.stops[route.stops.length - 1].item.title}
              </p>
              <button onClick={() => setEditing(true)}
                className="shrink-0 rounded-full border border-line px-3 py-1 text-xs hover:border-white/40">
                Edit
              </button>
            </div>
          ) : (
            <>
              <Field map={map} label="From" pick={from} onPick={(p) => {
                setStart(p);
                if (!p) setFromHere(false);
              }}
                placeholder={COPY[map].from} />
              <Field map={map} label="To" pick={destination} onPick={setDestination}
                placeholder={COPY[map].to} />
              <label className="flex cursor-pointer items-center gap-2 px-1 text-sm text-white/85">
                <input type="checkbox" checked={scenic} onChange={(e) => setScenic(e.target.checked)}
                  className="size-4 accent-coral" />
                Scenic: detour through a nearby neighborhood
              </label>
              <button
                onClick={findRoute}
                disabled={!from || !destination || status.state === "loading"}
                className="w-full rounded-full bg-coral py-2.5 font-display font-semibold text-ink transition-opacity disabled:opacity-40"
              >
                {status.state === "loading" ? COPY[map].finding : "Find route"}
              </button>
            </>
          )}
          {route && !editing && route.scenic && (
            <p className="px-1 text-xs text-muted">
              Scenic, via <span className="text-white">{route.scenic.label}</span>
            </p>
          )}
          {route && !editing && scenicAsked && !route.scenic && (
            <p className="px-1 text-xs text-muted">No scenic detour fits this route, so here is the direct one.</p>
          )}
          {status.state === "error" && (
            <p className="px-1 text-xs text-coral">Could not find a route: {status.message}</p>
          )}
        </div>
      </header>
      {route && (map === "knowledge" ? (
        <ClimbPanel
          route={route}
          narration={narration}
          player={player}
          onStop={(item) => {
            setSelection({ map: "knowledge", point: item });
            flyTo(pointFocus(item));
          }}
        />
      ) : (
        <TastePanel
          route={route}
          onStop={(item) => {
            setSelection({ map: "books", point: item });
            flyTo(pointFocus(item));
          }}
        />
      ))}
    </>
  );
}
