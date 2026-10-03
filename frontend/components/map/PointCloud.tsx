"use client";

import { Billboard } from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, IcosahedronGeometry, InstancedMesh, Object3D } from "three";
import type { MapName, MapPoint } from "@/lib/types";

const BOOK_SIZE = 0.055;
const KNOWLEDGE_SIZE = 0.045;

/** Knowledge points grow and brighten with difficulty (elevation); level 5 is ~1.7x level 1. */
function sizeOf(map: MapName, p: MapPoint): number {
  return map === "knowledge" ? KNOWLEDGE_SIZE * (0.6 + 0.2 * (p.difficulty ?? 1)) : BOOK_SIZE;
}

/** Peaks at 1 (the true neighborhood color): going above washes hues out toward white. */
function brightnessOf(map: MapName, p: MapPoint): number {
  return map === "knowledge" ? 0.5 + 0.1 * (p.difficulty ?? 1) : 1;
}

interface Props {
  map: MapName;
  points: MapPoint[];
  palette: Map<string, Color>;
  selected: MapPoint | null;
  hovered: MapPoint | null;
  dimmed?: boolean;      // fade the whole map back, e.g. so a route stands out
}

const DIMMED = 0.3;

/** A flat ring that always faces the camera, drawn around one point. */
function Outline({ map, point, inner, outer, color }: {
  map: MapName; point: MapPoint; inner: number; outer: number; color: string;
}) {
  const s = sizeOf(map, point);
  return (
    <Billboard position={[point.x, point.y, point.z]}>
      <mesh renderOrder={1}>
        <ringGeometry args={[s * inner, s * outer, 32]} />
        <meshBasicMaterial color={color} toneMapped={false} depthTest={false} transparent />
      </mesh>
    </Billboard>
  );
}

/** Every point on the map as ONE instanced mesh: a single draw call. */
export default function PointCloud({ map, points, palette, selected, hovered, dimmed = false }: Props) {
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new IcosahedronGeometry(1, 1), []);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new Object3D();
    const c = new Color();
    points.forEach((p, i) => {
      o.position.set(p.x, p.y, p.z);
      o.scale.setScalar(sizeOf(map, p));
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      c.copy(palette.get(p.cluster_label) ?? c.set("#ffffff"))
        .multiplyScalar(brightnessOf(map, p) * (dimmed ? DIMMED : 1));
      m.setColorAt(i, c);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [map, points, palette, dimmed]);

  return (
    <>
      <instancedMesh
        key={`${map}-${points.length}`}
        ref={mesh}
        args={[geometry, undefined, points.length]}
        frustumCulled={false}
      >
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {hovered && hovered.id !== selected?.id && (
        <Outline map={map} point={hovered} inner={1.35} outer={1.9} color="#ffffff" />
      )}
      {selected && <Outline map={map} point={selected} inner={2.2} outer={3} color="#ff7b67" />}
    </>
  );
}
