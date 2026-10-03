"use client";

import { Billboard, Line } from "@react-three/drei";
import { Color } from "three";
import type { RouteResponse } from "@/lib/types";

const LOW = new Color("#2fc4c4");    // brighter brand teal: level 1
const HIGH = new Color("#ff7b67");   // brand coral: level 5

/** Teal at level 1 to coral at level 5: the colour of the climb. */
export function levelColor(level: number | null): Color {
  return LOW.clone().lerp(HIGH, ((level ?? 1) - 1) / 4);
}

/** The route as a line through its stops, coloured by level, with a ring at every stop. */
export default function RouteLine({ route }: { route: RouteResponse }) {
  const items = route.stops.map((s) => s.item);
  if (items.length < 2) return null;
  const points = items.map((p) => [p.x, p.y, p.z] as [number, number, number]);
  const colors = items.map((p) => levelColor(p.difficulty).toArray() as [number, number, number]);

  return (
    <group renderOrder={2}>
      <Line
        points={points}
        vertexColors={colors}
        lineWidth={4}
        transparent
        depthTest={false}
      />
      {items.map((p) => (
        <Billboard key={p.id} position={[p.x, p.y, p.z]}>
          <mesh renderOrder={3}>
            <ringGeometry args={[0.16, 0.26, 32]} />
            <meshBasicMaterial color={levelColor(p.difficulty)} toneMapped={false} depthTest={false} transparent />
          </mesh>
        </Billboard>
      ))}
    </group>
  );
}
