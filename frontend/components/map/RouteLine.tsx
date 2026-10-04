"use client";

import { Billboard, Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ComponentRef } from "react";
import { Color } from "three";
import type { MapPoint, RouteResponse } from "@/lib/types";

const LOW = new Color("#2fc4c4");    // brighter brand teal: level 1
const HIGH = new Color("#ff7b67");   // brand coral: level 5
const LIFT_PER_LEVEL = 0.9;          // world units of elevation per difficulty level
const GROW_STOPS_PER_S = 1.4;        // how fast the climb line draws upward
const RETRACT_STOPS_PER_S = 5;

/** Teal at level 1 to coral at level 5: the colour of the climb. */
export function levelColor(level: number | null): Color {
  return LOW.clone().lerp(HIGH, ((level ?? 1) - 1) / 4);
}

/** A stop's colour on the route: its level, or plain coral for books (no levels). */
function stopColor(p: MapPoint): Color {
  return p.difficulty === null ? HIGH.clone() : levelColor(p.difficulty);
}

/** A route stop raised by its difficulty: difficulty drawn as literal elevation. Books have
 *  no difficulty and stay on the map. */
export function liftedPoint<P extends MapPoint>(p: P): P {
  return { ...p, y: p.y + (p.difficulty ?? 0) * LIFT_PER_LEVEL };
}

type V3 = [number, number, number];

/** Polyline through pts, cut at fractional index t (0 = first point, n-1 = whole line). */
function partial(pts: V3[], cols: V3[], t: number): { pos: number[]; col: number[] } {
  const k = Math.min(Math.floor(t), pts.length - 2);
  const f = t - k;
  const head = pts[k].map((v, a) => v + (pts[k + 1][a] - v) * f) as V3;
  const headCol = cols[k].map((v, a) => v + (cols[k + 1][a] - v) * f) as V3;
  const p = [...pts.slice(0, k + 1), head];
  const c = [...cols.slice(0, k + 1), headCol];
  return { pos: p.flat(), col: c.flat() };
}

/**
 * The route as a mountain path: each stop lifted above its point by its level, with a stem
 * down to the map. A faint full path shows the whole climb; the bright line draws itself
 * upward, to the end when the route appears and stop by stop while the guide narrates.
 */
export default function RouteLine({ route, active }: { route: RouteResponse; active: number | null }) {
  const items = route.stops.map((s) => s.item);
  const top = useMemo(() => route.stops.map((s) => {
    const p = liftedPoint(s.item);
    return [p.x, p.y, p.z] as V3;
  }), [route]);
  const colors = useMemo(
    () => route.stops.map((s) => stopColor(s.item).toArray() as V3), [route]);
  const climb = useRef<ComponentRef<typeof Line>>(null);
  const drawn = useRef(0);
  const applied = useRef(-1);

  useEffect(() => {
    drawn.current = 0;
    applied.current = -1;
  }, [route]);

  useFrame((_, dt) => {
    const line = climb.current;
    if (!line || top.length < 2) return;
    const target = active ?? top.length - 1;
    const d = target - drawn.current;
    drawn.current += Math.sign(d) * Math.min(Math.abs(d), dt * (d > 0 ? GROW_STOPS_PER_S : RETRACT_STOPS_PER_S));
    const t = Math.max(0.001, drawn.current);
    if (Math.abs(t - applied.current) < 0.002) return;
    applied.current = t;
    const { pos, col } = partial(top, colors, t);
    line.geometry.setPositions(pos);
    line.geometry.setColors(col);
  });

  if (items.length < 2) return null;
  return (
    <group renderOrder={2}>
      <Line points={top} vertexColors={colors} lineWidth={2} transparent opacity={0.3} depthTest={false} />
      <Line ref={climb} points={top.slice(0, 2)} vertexColors={colors.slice(0, 2)} lineWidth={5}
        transparent depthTest={false} />
      {items.map((p, i) => p.difficulty !== null && (
        <Line key={`stem-${p.id}`} points={[[p.x, p.y, p.z], top[i]]} color={levelColor(p.difficulty)}
          lineWidth={1} dashed dashSize={0.15} gapSize={0.12} transparent opacity={0.6} depthTest={false} />
      ))}
      {items.map((p, i) => (
        <Billboard key={p.id} position={top[i]}>
          <mesh renderOrder={3}>
            <ringGeometry args={i === active ? [0.24, 0.4, 40] : [0.16, 0.26, 32]} />
            <meshBasicMaterial color={stopColor(p)} toneMapped={false} depthTest={false} transparent />
          </mesh>
          {i === active && (
            <mesh renderOrder={3}>
              <circleGeometry args={[0.13, 32]} />
              <meshBasicMaterial color="#ffffff" toneMapped={false} depthTest={false} transparent />
            </mesh>
          )}
        </Billboard>
      ))}
    </group>
  );
}
