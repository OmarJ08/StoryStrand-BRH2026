"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, bakedJson, liveOrBaked, withTimeout } from "@/lib/api";
import SearchBox from "@/components/SearchBox";
import Logo from "@/components/Logo";
import { unlockAudio } from "@/components/route/useRoutePlayer";
import { getGuestId } from "@/lib/guest";
import { BAKED_BRIDGES, bakedBridgeFile } from "@/lib/presets";
import type { BakedBridge, MapName, MapPoint, Pin, Portal, RouteResponse, SearchHit } from "@/lib/types";
import CameraRig, { pointFocus, pointsFocus, ViewShift } from "./CameraRig";
import { usePortals } from "./Portals";
import { TrafficBadge, useTraffic } from "./Traffic";
import UnderTheHood from "./UnderTheHood";
import { clusterPalette } from "./colors";
import ItemSheet from "./ItemSheet";
import { centroidsOf, LabelOverlay, LabelProjector } from "./Labels";
import MapSwitcher from "./MapSwitcher";
import PointCloud from "./PointCloud";
import PointPicker from "./PointPicker";
import { useGuest } from "@/lib/guest";
import { GuestPin, PinLabel, PinLabelProjector } from "./GuestPin";
import RouteLine, { liftedPoint } from "./RouteLine";
import { useScene } from "./SceneContext";

const ROUTE_VIEW_SHIFT = 0.14;   // lift the route into the band between header and climb panel
const REVEAL_VIEW_SHIFT = 0.24;  // keep the dropped pin above the DNA panel
const PIN_COLOR: Record<MapName, string> = { books: "#ff7b67", knowledge: "#2fc4c4" };
const LIVE_TIMEOUT_MS = 3000;    // demo routes fall back to their baked copy after this
const MAP_TIMEOUT_MS = 8000;     // map payloads are large; fall back only when really stuck
const OFFLINE_HITS = 8;

/**
 * The persistent map scene: lives in app/(scene)/layout.tsx so moving between /map/*,
 * /route, /steer and /onboarding never remounts it. /route shows the Knowledge Map; taste
 * routes (/route/books), /steer and onboarding the Book Map unless a page sets mapOverride.
 * A guest's pin shows on whichever map is up.
 */
export default function MapExperience() {
  const params = useParams<{ map?: string }>();
  const pathname = usePathname();
  const onRoute = pathname === "/route" || pathname === "/route/books";
  const onSteer = pathname === "/steer";
  const onMapPage = pathname.startsWith("/map/");
  const onReveal = pathname === "/onboarding/reveal";
  const router = useRouter();
  const {
    route, setRoute, selection, setSelection, focus, flyTo, activeStop, setActiveStop, mapOverride, setAutoplay,
    setSteerFrom, highlight,
  } = useScene();
  const map: MapName = mapOverride ?? (pathname === "/route" || params.map === "knowledge" ? "knowledge" : "books");
  const guest = useGuest();
  const guestPin = guest ? (map === "books" ? guest.book_pin : guest.curiosity_pin) : null;
  const pinLabel = useRef<HTMLDivElement>(null);
  const placePinLabel = useCallback((x: number, y: number, visible: boolean) => {
    const el = pinLabel.current;
    if (!el) return;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    el.style.opacity = visible ? "1" : "0";
  }, []);

  const [data, setData] = useState<Partial<Record<MapName, MapPoint[]>>>({});
  const [error, setError] = useState<{ map: MapName; message: string } | null>(null);
  const [hover, setHover] = useState<{ map: MapName; point: MapPoint } | null>(null);
  const [interacted, setInteracted] = useState(false);

  useEffect(() => {
    if (data[map]) return;
    liveOrBaked(api<MapPoint[]>(`/api/map?map=${map}`), `map-${map}.json`, MAP_TIMEOUT_MS)
      .then((points) => setData((d) => ({ ...d, [map]: points })))
      .catch((e: Error) => setError({ map, message: e.message }));
  }, [map, data]);

  const points = data[map];
  const showRoute = onRoute && route !== null && route.map === map;
  const lit = useMemo(() => (onSteer && highlight ? new Set(highlight) : null), [onSteer, highlight]);
  // Explorers (no pin of their own on this map) start at the centre of the map's cloud.
  const explorerPin = useMemo<Pin | null>(() => {
    if (!points?.length) return null;
    const n = points.length;
    const c = points.reduce((a, p) => ({ x: a.x + p.x / n, y: a.y + p.y / n, z: a.z + p.z / n }), { x: 0, y: 0, z: 0 });
    return { ...c, home_cluster: "", suggested: false };
  }, [points]);
  const pin = guestPin ?? (onMapPage ? explorerPin : null);
  const selected = selection?.map === map ? selection.point : null;
  const hovered = hover?.map === map ? hover.point : null;
  const activeLabel = selected?.cluster_label ?? null;   // hover must not reshuffle labels
  const keepClear = useMemo(
    () => [
      ...(selected ? [selected] : []),
      ...(showRoute && route ? route.stops.map((s) => liftedPoint(s.item)) : []),
      // the pin head stands ~1 unit above its spot; keep both clear
      ...(pin ? [pin, { x: pin.x, y: pin.y + 1, z: pin.z }] : []),
    ],
    [selected, showRoute, route, pin],
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
  // without the API, search the titles of the points already loaded (prefix matches first)
  const offlineSearch = (q: string): SearchHit[] => {
    const needle = q.toLowerCase();
    return (points ?? [])
      .filter((p) => p.title.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.title.toLowerCase().startsWith(needle)) - Number(a.title.toLowerCase().startsWith(needle))
        || a.title.length - b.title.length)
      .slice(0, OFFLINE_HITS)
      .map((p) => ({ ...p, creators: [] }));
  };
  const onSearch = (hit: SearchHit) => {
    setSelection({ map, point: hit });
    flyTo(pointFocus(hit));
  };
  // "Learn the real science": unlock audio inside the tap, build the bridge route, then
  // fly to the Knowledge Map; /route starts the narration once its clips are ready.
  // Demo books also ship a baked route + narration: used when the live call is slower than
  // LIVE_TIMEOUT_MS or fails, and whenever the live route is that same saved route.
  const onLearn = async (book: MapPoint) => {
    unlockAudio();
    const live = api<RouteResponse>("/api/bridge/learn", {
      method: "POST",
      body: JSON.stringify({ book_id: book.id, guest_id: getGuestId() }),
    });
    let r: RouteResponse;
    if (BAKED_BRIDGES.has(book.id)) {
      const baked = bakedJson<BakedBridge>(bakedBridgeFile(book.id)).catch(() => null);
      const fresh = await withTimeout(live, LIVE_TIMEOUT_MS).catch(() => null);
      const saved = await baked;
      if (saved && (!fresh || fresh.route_id === saved.route.route_id)) {
        r = { ...saved.route, baked: { notes: saved.notes, clips: saved.clips } };
      } else {
        r = fresh ?? await live;
      }
    } else {
      r = await live;
    }
    setRoute(r);
    setActiveStop(null);
    setSelection(null);
    setAutoplay(true);
    flyTo(pointsFocus(r.stops.map((s) => liftedPoint(s.item))));
    router.push("/route");
  };
  const traffic = useTraffic(map, onMapPage);
  const portals = usePortals(map, onMapPage);
  const portalsHere = useMemo(() => {
    const by = new Map<string, Portal[]>();
    for (const p of portals ?? []) by.set(p.here.id, [...(by.get(p.here.id) ?? []), p]);
    return by;
  }, [portals]);
  // Portal jump: switch maps first, then fly to the matching point (a focus requested before
  // the switch would be replaced by CameraRig's map-change swoop).
  const portalJump = useRef<{ to: MapPoint; from: MapName } | null>(null);
  const onPortal = (p: Portal) => {
    portalJump.current = { to: p.there, from: map };
    setSelection({ map: p.there_map, point: p.there });
    router.push(`/map/${p.there_map}`);
  };
  useEffect(() => {
    const jump = portalJump.current;
    if (!jump || jump.from === map) return;
    portalJump.current = null;
    flyTo(pointFocus(jump.to));
  }, [map, flyTo]);

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
              highlight={lit}
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
        {showRoute && route && <RouteLine route={route} active={activeStop} />}
        {pin && (
          <group key={`${guest?.guest_id ?? "explorer"}-${map}-${pin.x}`}>
            <GuestPin pin={pin} color={PIN_COLOR[map]} />
            <PinLabelProjector pin={pin} onFrame={placePinLabel} />
          </group>
        )}
        <ViewShift fraction={showRoute ? ROUTE_VIEW_SHIFT : onReveal ? REVEAL_VIEW_SHIFT : 0} />
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

      <LabelOverlay centroids={centroids} palette={palette} refs={labelRefs} active={activeLabel} traffic={traffic} />
      {pin && (
        <PinLabel
          key={map}
          text={pin.suggested ? "Your curiosity · suggested" : "You are here"}
          color={PIN_COLOR[map]}
          label={pinLabel}
        />
      )}

      {onMapPage && (
        <Link
          href="/"
          aria-label="Back to the start"
          className="fixed top-[max(1rem,env(safe-area-inset-top))] left-4 z-20 flex h-10 items-center gap-2 rounded-full border border-line bg-surface pr-4 pl-2.5 text-sm font-medium shadow-lg shadow-black/40 hover:border-white/40"
        >
          <Logo variant="mark" size="sm" />
          <span className="hidden sm:inline">Home</span>
        </Link>
      )}

      {onMapPage && (
        <header className="pointer-events-none fixed inset-x-0 top-0 z-10 flex flex-col items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <MapSwitcher current={map} />
          <SearchBox
            key={map}
            map={map}
            placeholder={map === "books" ? "Search books or authors" : "Search topics and papers"}
            onSelect={onSearch}
            offline={offlineSearch}
          />
          {!guest && map === "books" && (
            <Link href="/onboarding"
              className="pointer-events-auto rounded-full border border-line bg-surface px-4 py-1.5 text-xs text-muted hover:text-white">
              You&apos;re at the centre for now. <span className="text-coral">Pick 5 books</span> to place yourself
            </Link>
          )}
          <Link
            href={map === "knowledge" ? "/route" : "/route/books"}
            className="pointer-events-auto rounded-full bg-coral px-4 py-1.5 font-display text-sm font-semibold text-ink shadow-lg shadow-black/40"
          >
            {map === "knowledge" ? "Plan a learning route" : "Plan a taste route"}
          </Link>
        </header>
      )}

      {!points && (
        <p className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center text-sm text-muted">
          {error?.map === map ? `Could not load the map: ${error.message}` : "Loading map…"}
        </p>
      )}

      {onMapPage && traffic && !selected && <TrafficBadge traffic={traffic} />}
      {onMapPage && !selected && <UnderTheHood />}
      <ItemSheet point={selected} palette={palette} onClose={() => setSelection(null)}
        onLearn={map === "books" ? onLearn : undefined}
        onSteer={map === "books" && !onSteer ? (book) => {
          setSteerFrom(book);
          setSelection(null);
          router.push("/steer");
        } : undefined}
        portals={selected ? portalsHere.get(selected.id) : undefined} onPortal={onPortal} />
    </>
  );
}
