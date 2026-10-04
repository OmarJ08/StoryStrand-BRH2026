"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { MapName, MapPoint, RouteResponse } from "@/lib/types";
import type { Focus, FocusTarget } from "./CameraRig";

/**
 * State shared by the persistent map (MapExperience) and the pages inside the (scene)
 * layout: the current route, the selected point, where the camera should fly, and Steer's
 * starting book and highlighted results.
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
  /** Steer: the book "Steer from here" was tapped on, picked up by /steer. */
  steerFrom: MapPoint | null;
  setSteerFrom: (book: MapPoint | null) => void;
  /** Points to keep bright while the rest of the map dims (Steer's results). */
  highlight: string[] | null;
  setHighlight: (ids: string[] | null) => void;
}

const SceneContext = createContext<Scene | null>(null);

export function SceneProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [selection, setSelection] = useState<Scene["selection"]>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [activeStop, setActiveStop] = useState<number | null>(null);
  const [mapOverride, setMapOverride] = useState<MapName | null>(null);
  const [autoplay, setAutoplay] = useState(false);
  const [steerFrom, setSteerFrom] = useState<MapPoint | null>(null);
  const [highlight, setHighlight] = useState<string[] | null>(null);
  const flyTo = useCallback(   // stable, so pages can list it as an effect dependency
    (target: FocusTarget) => setFocus((f) => ({ ...target, key: (f?.key ?? 0) + 1 })), []);
  return (
    <SceneContext.Provider
      value={{
        route, setRoute, selection, setSelection, focus, flyTo,
        activeStop, setActiveStop, mapOverride, setMapOverride, autoplay, setAutoplay,
        steerFrom, setSteerFrom, highlight, setHighlight,
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
