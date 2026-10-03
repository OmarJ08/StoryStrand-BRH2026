"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdditiveBlending, CanvasTexture, Color, Object3D, type InstancedMesh } from "three";
import { api } from "@/lib/api";
import type { MapName, TrafficResponse } from "@/lib/types";
import type { Centroid } from "./Labels";

const POLL_MS = 5000;
const GLOW_MIN = 1.6;          // world units: glow size for the quietest active neighborhood
const GLOW_GROWTH = 3.2;       // extra size for the busiest
const BREATHE = 0.14;          // slow pulse amplitude
const PING_S = 1.8;            // a ring's lifetime
const RING_MIN = 1.0;          // ring diameter at birth scales from this...
const RING_GROWTH = 0.8;       // ...plus this for the busiest, and grows to 2x as it fades
const MAX_PINGS_PER_POLL = 3;  // per neighborhood, spread across the next poll interval

/** GET /api/traffic for one map every few seconds while the tab is visible. */
export function useTraffic(map: MapName, enabled: boolean): TrafficResponse | null {
  const [traffic, setTraffic] = useState<TrafficResponse | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () => {
      if (document.hidden) return;
      api<TrafficResponse>(`/api/traffic?map=${map}`)
        .then((t) => !cancelled && setTraffic(t))
        .catch(() => {});
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [map, enabled]);
  return enabled && traffic?.map === map ? traffic : null;
}

export function radialTexture(ring: boolean): CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  if (ring) {
    grad.addColorStop(0.0, "rgba(255,255,255,0)");
    grad.addColorStop(0.78, "rgba(255,255,255,0)");
    grad.addColorStop(0.88, "rgba(255,255,255,1)");
    grad.addColorStop(1.0, "rgba(255,255,255,0)");
  } else {
    grad.addColorStop(0.0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.45)");
    grad.addColorStop(1.0, "rgba(255,255,255,0)");
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

/**
 * Inside the Canvas: a soft glow at each neighborhood centroid, sized by visits in the last
 * 30 minutes and gently breathing, plus a ring that pings outward for each fresh visit.
 * Additive blending, so a dimmer colour reads as more transparent. Two draw calls total.
 */
export function TrafficPulse({ centroids, palette, traffic }: {
  centroids: Centroid[];
  palette: Map<string, Color>;
  traffic: TrafficResponse;
}) {
  const glow = useRef<InstancedMesh>(null);
  const ring = useRef<InstancedMesh>(null);
  const textures = useMemo(() => ({ glow: radialTexture(false), ring: radialTexture(true) }), []);
  const pings = useRef<Map<string, number[]>>(new Map());   // label -> ping start times (s)
  const dummy = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);

  const visits = useMemo(() => new Map(traffic.neighborhoods.map((n) => [n.label, n.visits])), [traffic]);
  const busiest = Math.max(1, ...visits.values());

  // schedule this poll's fresh visits as pings spread over the next interval, so they
  // trickle in like live traffic instead of firing all at once
  useEffect(() => {
    const now = performance.now() / 1000;
    for (const n of traffic.neighborhoods) {
      if (n.recent <= 0) continue;
      const count = Math.min(MAX_PINGS_PER_POLL, Math.ceil(n.recent / 2));
      const times = (pings.current.get(n.label) ?? []).filter((t) => t + PING_S > now);
      for (let k = 0; k < count; k++) times.push(now + Math.random() * (POLL_MS / 1000));
      pings.current.set(n.label, times);
    }
  }, [traffic]);

  useEffect(() => () => {
    textures.glow.dispose();
    textures.ring.dispose();
  }, [textures]);

  useFrame(({ camera }) => {
    const g = glow.current;
    const r = ring.current;
    if (!g || !r) return;
    const now = performance.now() / 1000;
    centroids.forEach((c, i) => {
      const share = (visits.get(c.label) ?? 0) / busiest;
      const base = share > 0 ? GLOW_MIN + GLOW_GROWTH * Math.sqrt(share) : 0;
      const tint = palette.get(c.label) ?? color.set("#ffffff");

      dummy.position.copy(c.pos);
      dummy.quaternion.copy(camera.quaternion);
      dummy.scale.setScalar(base * (1 + BREATHE * Math.sin(now * 2.2 + i * 1.7)));
      dummy.updateMatrix();
      g.setMatrixAt(i, dummy.matrix);
      g.setColorAt(i, color.copy(tint).multiplyScalar(0.12 + 0.28 * share));

      // newest ping that has started and not yet faded
      const times = pings.current.get(c.label) ?? [];
      const age = Math.max(-1, ...times.map((t) => (now >= t && now - t < PING_S ? now - t : -1)));
      const live = age >= 0;
      const k = live ? age / PING_S : 1;
      dummy.scale.setScalar(live ? (RING_MIN + RING_GROWTH * Math.sqrt(share)) * (0.5 + 1.5 * k) : 0);
      dummy.updateMatrix();
      r.setMatrixAt(i, dummy.matrix);
      r.setColorAt(i, color.copy(tint).multiplyScalar(live ? 0.7 * (1 - k) : 0));
    });
    for (const m of [g, r]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      {/* glow: drawn first in the opaque pass with no depth test, so the dots paint over it
          and it only shows between them; rings: drawn on top so pings stay visible */}
      <instancedMesh key={`glow-${centroids.length}`} ref={glow}
        args={[undefined, undefined, Math.max(1, centroids.length)]} frustumCulled={false} renderOrder={-1}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={textures.glow} transparent={false} depthTest={false} depthWrite={false}
          blending={AdditiveBlending} toneMapped={false} />
      </instancedMesh>
      <instancedMesh key={`ring-${centroids.length}`} ref={ring}
        args={[undefined, undefined, Math.max(1, centroids.length)]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={textures.ring} transparent depthWrite={false}
          blending={AdditiveBlending} toneMapped={false} />
      </instancedMesh>
    </>
  );
}

/** Small legend for the traffic layer; says "simulated" whenever simulated events are in it. */
export function TrafficBadge({ traffic }: { traffic: TrafficResponse }) {
  const total = traffic.real_visits + traffic.simulated_visits;
  if (total === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-[6] flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-1.5 text-xs text-muted">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-coral opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-coral" />
      </span>
      Live traffic · {total.toLocaleString()} visits in {traffic.window_minutes} min
      {traffic.simulated_visits > 0 && (
        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-white">simulated</span>
      )}
    </div>
  );
}
