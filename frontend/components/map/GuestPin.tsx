"use client";

import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import { Group, Mesh, MeshBasicMaterial, Vector3 } from "three";
import type { Pin } from "@/lib/types";

const DROP_FROM = 6;        // world units above the pin's spot
const DROP_SECONDS = 0.9;
const PIN_HEIGHT = 0.9;

/** Fall with a little bounce at the end (easeOutBounce, damped). */
function bounce(k: number): number {
  const n = 7.5625, d = 2.75;
  if (k < 1 / d) return n * k * k;
  if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
  if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
  return n * (k -= 2.625 / d) * k + 0.984375;
}

/**
 * A map pin that drops onto its spot when it mounts (key it by guest + map to replay),
 * with a pulsing ring where it lands. The DOM label is positioned by PinLabelProjector.
 */
export function GuestPin({ pin, color }: { pin: Pin; color: string }) {
  const group = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const t0 = useRef<number | null>(null);

  useFrame(({ clock }) => {
    if (t0.current === null) t0.current = clock.elapsedTime;
    const k = Math.min(1, (clock.elapsedTime - t0.current) / DROP_SECONDS);
    if (group.current) group.current.position.set(pin.x, pin.y + DROP_FROM * (1 - bounce(k)), pin.z);
    if (ring.current) {
      const pulse = (clock.elapsedTime * 0.8) % 1;
      ring.current.scale.setScalar(k < 1 ? 0.001 : 0.6 + pulse * 1.6);
      (ring.current.material as MeshBasicMaterial).opacity = k < 1 ? 0 : 0.8 * (1 - pulse);
    }
  });

  return (
    <>
      <group ref={group} position={[pin.x, pin.y + DROP_FROM, pin.z]} renderOrder={4}>
        <Billboard>
          {/* head */}
          <mesh position={[0, PIN_HEIGHT, 0]} renderOrder={4}>
            <circleGeometry args={[0.28, 32]} />
            <meshBasicMaterial color={color} toneMapped={false} depthTest={false} transparent />
          </mesh>
          <mesh position={[0, PIN_HEIGHT, 0]} renderOrder={5}>
            <circleGeometry args={[0.11, 24]} />
            <meshBasicMaterial color="#071416" toneMapped={false} depthTest={false} transparent />
          </mesh>
          {/* stem down to the exact spot */}
          <mesh position={[0, PIN_HEIGHT / 2, 0]} rotation={[0, 0, Math.PI]} renderOrder={4}>
            <coneGeometry args={[0.17, PIN_HEIGHT - 0.1, 3]} />
            <meshBasicMaterial color={color} toneMapped={false} depthTest={false} transparent />
          </mesh>
        </Billboard>
      </group>
      <Billboard position={[pin.x, pin.y, pin.z]}>
        <mesh ref={ring} renderOrder={3}>
          <ringGeometry args={[0.3, 0.38, 40]} />
          <meshBasicMaterial color={color} toneMapped={false} depthTest={false} transparent opacity={0} />
        </mesh>
      </Billboard>
    </>
  );
}

export type PinLabelRef = RefObject<HTMLDivElement | null>;

/**
 * Projects the point just above the pin head every frame and reports it; the component that
 * owns the label element (see PinLabel) moves it. Visible only once the pin has landed.
 */
export function PinLabelProjector({ pin, onFrame }: {
  pin: Pin;
  onFrame: (x: number, y: number, visible: boolean) => void;
}) {
  const t0 = useRef<number | null>(null);
  useFrame(({ camera, size, clock }) => {
    if (t0.current === null) t0.current = clock.elapsedTime;
    const v = new Vector3(pin.x, pin.y + PIN_HEIGHT + 0.55, pin.z).project(camera);
    onFrame(((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height,
      v.z <= 1 && clock.elapsedTime - t0.current >= DROP_SECONDS);
  });
  return null;
}

export function PinLabel({ text, color, label }: { text: string; color: string; label: PinLabelRef }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[6] overflow-hidden">
      <div
        ref={label}
        className="absolute top-0 left-0 whitespace-nowrap rounded-full px-3 py-1 font-display text-xs font-bold text-ink opacity-0 shadow-lg shadow-black/50 transition-opacity duration-300"
        style={{ background: color }}
      >
        {text}
      </div>
    </div>
  );
}
