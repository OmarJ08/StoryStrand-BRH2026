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
}

const SceneContext = createContext<Scene | null>(null);

export function SceneProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [selection, setSelection] = useState<Scene["selection"]>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const flyTo = (target: FocusTarget) => setFocus((f) => ({ ...target, key: (f?.key ?? 0) + 1 }));
  return (
    <SceneContext.Provider value={{ route, setRoute, selection, setSelection, focus, flyTo }}>
      {children}
    </SceneContext.Provider>
  );
}

export function useScene(): Scene {
  const scene = useContext(SceneContext);
  if (!scene) throw new Error("useScene must be used inside SceneProvider");
  return scene;
}
