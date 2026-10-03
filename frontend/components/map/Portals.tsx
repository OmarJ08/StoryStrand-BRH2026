"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdditiveBlending, Color, Object3D, type InstancedMesh } from "three";
import { api, liveOrBaked } from "@/lib/api";
import type { MapName, Portal } from "@/lib/types";
import { radialTexture } from "./Traffic";

const GOLD = new Color("#f2c14e");   // the gold page of the logo's book
const SIZE = 0.75;
const LIVE_TIMEOUT_MS = 4000;

/** GET /api/portals for one map (baked copy if the API is slow or down). */
export function usePortals(map: MapName, enabled: boolean): Portal[] | null {
  const [state, setState] = useState<{ map: MapName; portals: Portal[] } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    liveOrBaked(api<Portal[]>(`/api/portals?map=${map}`), `portals-${map}.json`, LIVE_TIMEOUT_MS)
      .then((portals) => !cancelled && setState({ map, portals }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [map, enabled]);
  return enabled && state?.map === map ? state.portals : null;
}

/**
 * Inside the Canvas: a slowly turning gold ring on every point that has a portal to the
 * other map. Always drawn on top (no depth test) so portals are easy to spot. One draw call.
 */
export function PortalMarkers({ portals }: { portals: Portal[] }) {
  const mesh = useRef<InstancedMesh>(null);
  const texture = useMemo(() => radialTexture(true), []);
  const dummy = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);
  const spots = useMemo(() => [...new Map(portals.map((p) => [p.here.id, p.here])).values()], [portals]);

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame(({ camera, clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    spots.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.quaternion.copy(camera.quaternion);
      dummy.rotateZ(t * 0.6 + i);
      dummy.scale.setScalar(SIZE * (1 + 0.15 * Math.sin(t * 2.4 + i)));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, color.copy(GOLD).multiplyScalar(0.75 + 0.25 * Math.sin(t * 2.4 + i)));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  if (spots.length === 0) return null;
  return (
    <instancedMesh key={spots.length} ref={mesh} args={[undefined, undefined, spots.length]}
      frustumCulled={false} renderOrder={4}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} transparent depthTest={false} depthWrite={false}
        blending={AdditiveBlending} toneMapped={false} />
    </instancedMesh>
  );
}
