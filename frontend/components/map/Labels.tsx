"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import { Color, Vector3 } from "three";
import type { MapPoint } from "@/lib/types";

const FADE_START = 40;
const FADE_END = 60;
const GAP_TO_STAY_PX = 4;      // a shown label hides only when it really overlaps...
const GAP_TO_SHOW_PX = 16;     // ...and a hidden one needs clear room to return (no flicker)
const KEEP_CLEAR_PX = 48;      // space around the selected point that labels must avoid
const DIM_OPACITY = 0.15;      // a label under the mouse fades to this, so dots show through
const DIM_LEAVE_PX = 14;       // the cursor must get this far outside to undim it (no blink)
const DIM_EASE = "180ms";

export interface Centroid {
  label: string;
  pos: Vector3;
  size: number;
}

export type LabelRefs = RefObject<(HTMLDivElement | null)[]>;

/** Cluster centroids, largest neighborhood first (it wins label collisions). */
export function centroidsOf(points: MapPoint[]): Centroid[] {
  const acc = new Map<string, { sum: Vector3; n: number }>();
  for (const p of points) {
    const a = acc.get(p.cluster_label) ?? { sum: new Vector3(), n: 0 };
    a.sum.add(new Vector3(p.x, p.y, p.z));
    a.n += 1;
    acc.set(p.cluster_label, a);
  }
  return [...acc]
    .map(([label, { sum, n }]) => ({ label, pos: sum.divideScalar(n), size: n }))
    .sort((a, b) => b.size - a.size);
}

const hex = (palette: Map<string, Color>, label: string) =>
  `#${palette.get(label)?.getHexString() ?? "ffffff"}`;

/** Plain DOM labels over the canvas; LabelProjector moves and declutters them every frame. */
export function LabelOverlay({ centroids, palette, refs, active }: {
  centroids: Centroid[];
  palette: Map<string, Color>;
  refs: LabelRefs;
  active: string | null;
}) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[5] overflow-hidden">
      {centroids.map((c, i) => (
        <div
          key={c.label}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className={`absolute top-0 left-0 flex items-center gap-1.5 whitespace-nowrap rounded-full border-2 bg-ink/85 px-3 py-1 font-display text-[13px] font-semibold text-white opacity-0 shadow-lg shadow-black/50 backdrop-blur-md will-change-transform ${
            c.label === active ? "z-10" : ""
          }`}
          style={{
            borderColor: hex(palette, c.label),
            textShadow: "0 1px 3px rgb(0 0 0 / 0.8)",
            // fades in; LabelProjector zeroes the duration so hiding is instant
            transition: "opacity 250ms ease",
          }}
        >
          <span className="size-2 rounded-full" style={{ background: hex(palette, c.label) }} />
          {c.label}
        </div>
      ))}
    </div>
  );
}

interface Box { x: number; y: number; w: number; h: number }

const overlaps = (a: Box, b: Box, gap: number) =>
  Math.abs(a.x - b.x) * 2 < a.w + b.w + gap && Math.abs(a.y - b.y) * 2 < a.h + b.h + gap;

/**
 * Inside the Canvas: projects each centroid to the screen, fades labels as you zoom out,
 * and hides any label that would overlap one already placed. The active (selected)
 * neighborhood is placed first, then larger neighborhoods before smaller ones.
 * Hidden labels vanish at once and fade back in. A label under the mouse pointer dims
 * (keeping its space, so nothing else pops in); it dims as soon as the cursor is inside
 * it and undims only once the cursor is DIM_LEAVE_PX away, so edge jitter can't blink it.
 */
export function LabelProjector({ centroids, refs, active, keepClear }: {
  centroids: Centroid[];
  refs: LabelRefs;
  active: string | null;
  keepClear: { x: number; y: number; z: number }[];   // selected point, route stops, pins
}) {
  const shown = useRef<Map<string, boolean>>(new Map());
  const dimmed = useRef<Map<string, boolean>>(new Map());
  const mouse = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      mouse.current = e.pointerType === "mouse" ? { x: e.clientX, y: e.clientY } : null;
    };
    const leave = () => {
      mouse.current = null;
    };
    window.addEventListener("pointermove", move);
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
    };
  }, []);

  useFrame(({ camera, size }) => {
    const v = new Vector3();
    const order = centroids.map((_, i) => i);
    const activeIdx = centroids.findIndex((c) => c.label === active);
    if (activeIdx > 0) order.unshift(...order.splice(activeIdx, 1));

    // read every size before writing any style, so the browser lays out only once
    const boxes = order.map((i) => {
      const el = refs.current[i];
      v.copy(centroids[i].pos).project(camera);
      return {
        i, el, behind: v.z > 1,
        x: ((v.x + 1) / 2) * size.width,
        y: ((1 - v.y) / 2) * size.height,
        w: el?.offsetWidth ?? 0,
        h: el?.offsetHeight ?? 0,
      };
    });

    const placed: Box[] = [];
    for (const p of keepClear) {
      v.set(p.x, p.y, p.z).project(camera);
      if (v.z <= 1) {
        placed.push({
          x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height,
          w: KEEP_CLEAR_PX, h: KEEP_CLEAR_PX,
        });
      }
    }
    for (const b of boxes) {
      if (!b.el) continue;
      const label = centroids[b.i].label;
      const gap = shown.current.get(label) ? GAP_TO_STAY_PX : GAP_TO_SHOW_PX;
      const d = camera.position.distanceTo(centroids[b.i].pos);
      const fade = Math.min(1, Math.max(0, 1 - (d - FADE_START) / (FADE_END - FADE_START)));
      const hidden = b.behind || fade === 0 || placed.some((p) => overlaps(p, b, gap));
      const m = mouse.current;
      const wasDim = dimmed.current.get(label) ?? false;
      const cursor = m && { x: m.x, y: m.y, w: 0, h: 0 };
      const dim = !hidden && cursor !== null && overlaps(b, cursor, wasDim ? 2 * DIM_LEAVE_PX : 0);
      shown.current.set(label, !hidden);
      dimmed.current.set(label, dim);
      b.el.style.transform = `translate(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px) translate(-50%, -50%)`;
      b.el.style.transitionDuration = hidden ? "0s" : dim || wasDim ? DIM_EASE : "";
      b.el.style.opacity = hidden ? "0" : (dim ? DIM_OPACITY * fade : fade).toFixed(2);
      if (!hidden) placed.push(b);
    }
  });
  return null;
}
