"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import SearchBox from "@/components/SearchBox";
import type { MapName, MapPoint, SearchHit } from "@/lib/types";
import CameraRig, { pointFocus, ViewShift } from "./CameraRig";
import { clusterPalette } from "./colors";
import ItemSheet from "./ItemSheet";
import { centroidsOf, LabelOverlay, LabelProjector } from "./Labels";
import MapSwitcher from "./MapSwitcher";
import PointCloud from "./PointCloud";
import PointPicker from "./PointPicker";
import RouteLine from "./RouteLine";
import { useScene } from "./SceneContext";

const ROUTE_VIEW_SHIFT = 0.14;   // lift the route into the band between header and climb panel

/**
 * The persistent map scene: lives in app/(scene)/layout.tsx so moving between /map/* and
 * /route never remounts it. /route always shows the Knowledge Map.
 */
export default function MapExperience() {
  const params = useParams<{ map?: string }>();
  const onRoute = usePathname() === "/route";
  const map: MapName = onRoute || params.map === "knowledge" ? "knowledge" : "books";
  const { route, selection, setSelection, focus, flyTo, activeStop } = useScene();

  const [data, setData] = useState<Partial<Record<MapName, MapPoint[]>>>({});
  const [error, setError] = useState<{ map: MapName; message: string } | null>(null);
  const [hover, setHover] = useState<{ map: MapName; point: MapPoint } | null>(null);
  const [interacted, setInteracted] = useState(false);

  useEffect(() => {
    if (data[map]) return;
    api<MapPoint[]>(`/api/map?map=${map}`)
      .then((points) => setData((d) => ({ ...d, [map]: points })))
      .catch((e: Error) => setError({ map, message: e.message }));
  }, [map, data]);

  const points = data[map];
  const showRoute = onRoute && route !== null;
  const selected = selection?.map === map ? selection.point : null;
  const hovered = hover?.map === map ? hover.point : null;
  const activeLabel = selected?.cluster_label ?? null;   // hover must not reshuffle labels
  const keepClear = useMemo(
    () => [
      ...(selected ? [selected] : []),
      ...(showRoute && route ? route.stops.map((s) => s.item) : []),
    ],
    [selected, showRoute, route],
  );
  const palette = useMemo(() => clusterPalette((points ?? []).map((p) => p.cluster_label)), [points]);
  const centroids = useMemo(() => centroidsOf(points ?? []), [points]);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const onPick = useCallback(
    (point: MapPoint | null) => setSelection(point ? { map, point } : null),
    [map, setSelection],
  );
  const onHover = useCallback(
    (point: MapPoint | null) => setHover(point ? { map, point } : null),
    [map],
  );
  const onSearch = (hit: SearchHit) => {
    setSelection({ map, point: hit });
    flyTo(pointFocus(hit));
  };

  return (
    <>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 26], fov: 50 }} className="touch-none">
        {points && (
          <>
            <PointCloud
              map={map}
              points={points}
              palette={palette}
              selected={selected}
              hovered={hovered}
              dimmed={showRoute}
            />
            <LabelProjector
              centroids={centroids}
              refs={labelRefs}
              active={activeLabel}
              keepClear={keepClear}
            />
            <PointPicker points={points} onPick={onPick} onHover={onHover} />
          </>
        )}
        {showRoute && <RouteLine route={route} active={activeStop} />}
        <ViewShift fraction={showRoute ? ROUTE_VIEW_SHIFT : 0} />
        <CameraRig map={map} focus={focus} />
        <OrbitControls
          makeDefault
          enableDamping
          enablePan={false}
          minDistance={6}
          maxDistance={60}
          autoRotate={!interacted && !focus}
          autoRotateSpeed={0.4}
          onStart={() => setInteracted(true)}
        />
      </Canvas>

      <LabelOverlay centroids={centroids} palette={palette} refs={labelRefs} active={activeLabel} />

      {!onRoute && (
        <header className="pointer-events-none fixed inset-x-0 top-0 z-10 flex flex-col items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <MapSwitcher current={map} />
          <SearchBox
            key={map}
            map={map}
            placeholder={map === "books" ? "Search books or authors" : "Search topics and papers"}
            onSelect={onSearch}
          />
          {map === "knowledge" && (
            <Link
              href="/route"
              className="pointer-events-auto rounded-full bg-coral px-4 py-1.5 font-display text-sm font-semibold text-ink shadow-lg shadow-black/40"
            >
              Plan a learning route
            </Link>
          )}
        </header>
      )}

      {!points && (
        <p className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center text-sm text-white/60">
          {error?.map === map ? `Could not load the map: ${error.message}` : "Loading map…"}
        </p>
      )}

      <ItemSheet point={selected} palette={palette} onClose={() => setSelection(null)} />
    </>
  );
}
