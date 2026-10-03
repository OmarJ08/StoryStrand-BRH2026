"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import type { MapName, MapPoint } from "@/lib/types";

const FLIGHT_SECONDS = 0.9;
const PULL_BACK = 0.7;   // fly out to 1.7x the distance at mid-flight
const FOCUS_SECONDS = 1.1;
const FOCUS_DISTANCE = 7; // how close the camera settles to a searched-for point
const MAP_RADIUS = 10;   // project_3d.py scales every map to fit inside radius 10
const FIT = 0.75;        // frame 75% of the radius across the narrower screen axis
const ORIGIN = new Vector3();

/** Distance at which the map fills the narrower axis, so portrait phones don't crop it. */
export function fitDistance(camera: PerspectiveCamera, aspect: number): number {
  const tanHalf = Math.tan(MathUtils.degToRad(camera.fov / 2)) * Math.min(aspect, 1);
  return MathUtils.clamp((FIT * MAP_RADIUS) / tanHalf, 18, 45);
}

const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

/** Orbit controls as registered with makeDefault: only the parts the rig moves. */
interface Controls {
  target: Vector3;
  update: () => void;
}

interface Flight {
  t0: number;
  seconds: number;
  fromTarget: Vector3;
  toTarget: Vector3;
  fromDist: number;
  toDist: number;
  dir: Vector3;          // unit vector from target to camera, kept so the view doesn't spin
  pullBack: number;
}

export interface Focus {
  point: MapPoint;
  key: number;           // bumps on every request, so picking the same point twice re-flies
}

/**
 * Frames the map for the screen on load, plays map switches as a "portal jump" (pull back,
 * swoop in, recentred on the map), and flies to a focused point, e.g. a search result.
 */
export default function CameraRig({ map, focus }: { map: MapName; focus: Focus | null }) {
  const flight = useRef<Flight | null>(null);
  const pending = useRef<"portal" | Focus | null>(null);
  const first = useRef(true);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as unknown as Controls | null;

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
    pending.current = "portal";
  }, [map]);

  useEffect(() => {
    if (focus) pending.current = focus;
  }, [focus]);

  useFrame(({ camera, clock }) => {
    const target = controls?.target ?? ORIGIN;
    if (pending.current) {
      const req = pending.current;
      pending.current = null;
      const offset = camera.position.clone().sub(target);
      const base = {
        t0: clock.elapsedTime,
        fromTarget: target.clone(),
        fromDist: offset.length(),
        dir: offset.normalize(),
      };
      flight.current = req === "portal"
        ? { ...base, seconds: FLIGHT_SECONDS, toTarget: ORIGIN.clone(),
            toDist: base.fromDist, pullBack: PULL_BACK }
        : { ...base, seconds: FOCUS_SECONDS, toTarget: new Vector3(req.point.x, req.point.y, req.point.z),
            toDist: FOCUS_DISTANCE, pullBack: 0.25 };
    }

    const f = flight.current;
    if (!f) return;
    const k = Math.min(1, (clock.elapsedTime - f.t0) / f.seconds);
    const e = easeInOut(k);
    const t = new Vector3().lerpVectors(f.fromTarget, f.toTarget, e);
    const dist = MathUtils.lerp(f.fromDist, f.toDist, e) * (1 + f.pullBack * Math.sin(Math.PI * k));
    camera.position.copy(t).addScaledVector(f.dir, dist);
    if (controls) {
      controls.target.copy(t);
      controls.update();
    } else {
      camera.lookAt(t);
    }
    if (k >= 1) flight.current = null;
  });

  return null;
}
