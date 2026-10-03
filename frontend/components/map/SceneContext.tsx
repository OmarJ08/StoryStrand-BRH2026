"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { MapName, MapPoint, RouteResponse } from "@/lib/types";
import type { Focus, FocusTarget } from "./CameraRig";

/**
 * State shared by the persistent map (MapExperience) and the pages inside the (scene)
 * layout: the current route, the selected point, and where the camera should fly.
 */
interface Scene {
  route: RouteResponse | null;
  setRoute: (route: RouteResponse | null) => void;
  selection: { map: MapName; point: MapPoint } | null;
  setSelection: (selection: { map: MapName; point: MapPoint } | null) => void;
  focus: Focus | null;
  flyTo: (target: FocusTarget) => void;
  /** Index of the route stop being narrated, highlighted on the map. */
  activeStop: number | null;
  setActiveStop: (index: number | null) => void;
  /** Lets a page (e.g. the onboarding reveal) choose the map shown, over the URL default. */
  mapOverride: MapName | null;
  setMapOverride: (map: MapName | null) => void;
  /** Start the route's narration as soon as it is ready (set by "Learn the real science"). */
  autoplay: boolean;
  setAutoplay: (autoplay: boolean) => void;
}

const SceneContext = createContext<Scene | null>(null);

export function SceneProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [selection, setSelection] = useState<Scene["selection"]>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [activeStop, setActiveStop] = useState<number | null>(null);
  const [mapOverride, setMapOverride] = useState<MapName | null>(null);
  const [autoplay, setAutoplay] = useState(false);
  const flyTo = (target: FocusTarget) => setFocus((f) => ({ ...target, key: (f?.key ?? 0) + 1 }));
  return (
    <SceneContext.Provider
      value={{
        route, setRoute, selection, setSelection, focus, flyTo,
        activeStop, setActiveStop, mapOverride, setMapOverride, autoplay, setAutoplay,
      }}
    >
      {children}
    </SceneContext.Provider>
  );
}

export function useScene(): Scene {
  const scene = useContext(SceneContext);
  if (!scene) throw new Error("useScene must be used inside SceneProvider");
  return scene;
}
