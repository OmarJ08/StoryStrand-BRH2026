"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { MathUtils, PerspectiveCamera } from "three";
import type { MapName } from "@/lib/types";

const FLIGHT_SECONDS = 0.9;
const PULL_BACK = 0.7;   // fly out to 1.7x the distance at mid-flight
const MAP_RADIUS = 10;   // project_3d.py scales every map to fit inside radius 10
const FIT = 0.75;        // frame 75% of the radius across the narrower screen axis

/** Distance at which the map fills the narrower axis, so portrait phones don't crop it. */
export function fitDistance(camera: PerspectiveCamera, aspect: number): number {
  const tanHalf = Math.tan(MathUtils.degToRad(camera.fov / 2)) * Math.min(aspect, 1);
  return MathUtils.clamp((FIT * MAP_RADIUS) / tanHalf, 18, 45);
}

/**
 * Frames the map for the screen on load, and plays map switches as a "portal jump":
 * the camera pulls back and swoops in again.
 */
export default function CameraRig({ map }: { map: MapName }) {
  const flight = useRef<{ t0: number; dist: number } | null>(null);
  const first = useRef(true);
  const pending = useRef(false);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  useEffect(() => {
    if (camera instanceof PerspectiveCamera) {
      camera.position.setLength(fitDistance(camera, size.width / size.height));
    }
    // fit once on load; later resizes keep the user's zoom
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    pending.current = true;
  }, [map]);

  useFrame(({ camera, clock }) => {
    if (pending.current) {
      pending.current = false;
      flight.current = { t0: clock.elapsedTime, dist: camera.position.length() };
    }
    const f = flight.current;
    if (!f) return;
    const k = (clock.elapsedTime - f.t0) / FLIGHT_SECONDS;
    if (k >= 1) {
      camera.position.setLength(f.dist);
      flight.current = null;
      return;
    }
    camera.position.setLength(f.dist * (1 + PULL_BACK * Math.sin(Math.PI * k)));
  });

  return null;
}
