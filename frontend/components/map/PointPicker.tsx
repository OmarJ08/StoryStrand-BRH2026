"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { Camera, Vector3 } from "three";
import type { MapPoint } from "@/lib/types";

const TAP_MAX_MOVE_PX = 10;
const TAP_MAX_MS = 350;
const PICK_RADIUS_PX = 28;
const HOVER_RADIUS_PX = 14;

/** Nearest point to (x, y) on screen within radius px, by projecting every point. */
function nearestOnScreen(
  points: MapPoint[], camera: Camera, rect: DOMRect, x: number, y: number, radius: number,
): MapPoint | null {
  const v = new Vector3();
  let best = -1;
  let bestDist = radius * radius;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    v.set(p.x, p.y, p.z).project(camera);
    if (v.z < -1 || v.z > 1) continue;                 // behind the camera or clipped
    const dx = ((v.x + 1) / 2) * rect.width - x;
    const dy = ((1 - v.y) / 2) * rect.height - y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best >= 0 ? points[best] : null;
}

interface Props {
  points: MapPoint[];
  onPick: (point: MapPoint | null) => void;
  onHover: (point: MapPoint | null) => void;
}

/**
 * Screen-space picking: raycasting tiny dots on a phone misses far too often.
 * A tap (not a drag or pinch) selects the nearest point within PICK_RADIUS_PX; a mouse
 * hovering within HOVER_RADIUS_PX highlights one (touch screens have no hover).
 */
export default function PointPicker({ points, onPick, onHover }: Props) {
  const camera = useThree((s) => s.camera);
  const el = useThree((s) => s.gl.domElement);

  useEffect(() => {
    let start: { x: number; y: number; t: number } | null = null;
    let multiTouch = false;
    let hoverFrame = 0;
    let hoveredId: string | null = null;

    const local = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      return { rect, x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const setHover = (p: MapPoint | null) => {
      if ((p?.id ?? null) === hoveredId) return;
      hoveredId = p?.id ?? null;
      el.style.cursor = p ? "pointer" : "";
      onHover(p);
    };

    const down = (e: PointerEvent) => {
      if (!e.isPrimary) {
        multiTouch = true;
        return;
      }
      multiTouch = false;
      start = { x: e.clientX, y: e.clientY, t: performance.now() };
    };

    const up = (e: PointerEvent) => {
      if (!e.isPrimary || !start) return;
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      const elapsed = performance.now() - start.t;
      start = null;
      if (multiTouch || moved > TAP_MAX_MOVE_PX || elapsed > TAP_MAX_MS) return;
      const { rect, x, y } = local(e);
      onPick(nearestOnScreen(points, camera, rect, x, y, PICK_RADIUS_PX));
    };

    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.buttons !== 0) return;   // no hover while dragging
      cancelAnimationFrame(hoverFrame);
      hoverFrame = requestAnimationFrame(() => {
        const { rect, x, y } = local(e);
        setHover(nearestOnScreen(points, camera, rect, x, y, HOVER_RADIUS_PX));
      });
    };

    const leave = () => {
      cancelAnimationFrame(hoverFrame);
      setHover(null);
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(hoverFrame);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      el.style.cursor = "";
    };
  }, [camera, el, points, onPick, onHover]);

  return null;
}
