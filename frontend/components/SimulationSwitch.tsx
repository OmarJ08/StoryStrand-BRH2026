"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { SimulationState } from "@/lib/types";

/** Demo-only: a faint dot in the corner that turns simulated traffic on and off. */
export default function SimulationSwitch() {
  const [running, setRunning] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<SimulationState>("/api/simulation").then((s) => setRunning(s.running)).catch(() => {});
  }, []);

  if (running === null) return null;
  const toggle = () => {
    setBusy(true);
    api<SimulationState>("/api/simulation", { method: "POST", body: JSON.stringify({ running: !running }) })
      .then((s) => setRunning(s.running))
      .catch(() => {})
      .finally(() => setBusy(false));
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      role="switch"
      aria-checked={running}
      aria-label="Simulated traffic"
      title={`Simulated traffic: ${running ? "on" : "off"}`}
      className="fixed right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] p-2 opacity-25 transition-opacity hover:opacity-80"
    >
      <span className={`block size-2 rounded-full ${running ? "bg-coral" : "border border-white/60"}`} />
    </button>
  );
}
