"use client";

import { levelColor } from "@/components/map/RouteLine";
import type { MapPoint, RouteResponse } from "@/lib/types";
import type { Narration } from "./useNarration";
import type { Player } from "./useRoutePlayer";

const STEP_X = 64;
const LEVEL_Y = 18;
const PAD = 18;

/** Stepped elevation profile: stops along x, level 1-5 up the y axis. */
function ClimbProfile({ route }: { route: RouteResponse }) {
  const levels = route.stops.map((s) => s.item.difficulty ?? 1);
  const width = PAD * 2 + STEP_X * (levels.length - 1);
  const height = PAD * 2 + LEVEL_Y * 4;
  const x = (i: number) => PAD + i * STEP_X;
  const y = (lvl: number) => height - PAD - (lvl - 1) * LEVEL_Y;
  const path = levels
    .map((lvl, i) => (i === 0 ? `M ${x(0)} ${y(lvl)}` : `H ${x(i) - STEP_X / 2} V ${y(lvl)} H ${x(i)}`))
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-28 w-full" role="img"
      aria-label={`Climb: levels ${levels.join(", ")}`}>
      {[1, 2, 3, 4, 5].map((lvl) => (
        <g key={lvl}>
          <line x1={0} x2={width} y1={y(lvl)} y2={y(lvl)} stroke="white" strokeOpacity={0.07} />
          <text x={2} y={y(lvl) - 3} fontSize={8} fill="white" fillOpacity={0.35}>L{lvl}</text>
        </g>
      ))}
      <defs>
        <linearGradient id="climb" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={`#${levelColor(1).getHexString()}`} />
          <stop offset="1" stopColor={`#${levelColor(5).getHexString()}`} />
        </linearGradient>
      </defs>
      <path d={path} fill="none" stroke="url(#climb)" strokeWidth={3} strokeLinejoin="round" />
      {levels.map((lvl, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(lvl)} r={7} fill={`#${levelColor(lvl).getHexString()}`} />
          <text x={x(i)} y={y(lvl) + 3} fontSize={8} fontWeight={700} textAnchor="middle" fill="#071416">
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Start / pause / resume the narrated tour, or say why it isn't available. */
function NarrationButton({ narration, player }: { narration: Narration; player: Player }) {
  const base = "shrink-0 rounded-full px-4 py-2 font-display text-sm font-semibold";
  switch (narration.status) {
    case "preparing":
      return <span className={`${base} border border-line text-muted`}>Preparing narration…</span>;
    case "none":
      return <span className={`${base} border border-line text-muted`}>No narration</span>;
    case "error":
      return <span className={`${base} bg-coral/15 text-coral`} title={narration.message}>Voice unavailable</span>;
    case "ready":
      if (player.index === null) {
        return <button onClick={player.start} className={`${base} bg-coral text-ink`}>▶ Start route</button>;
      }
      return player.playing
        ? <button onClick={player.pause} className={`${base} bg-white/15 text-white`}>❚❚ Pause</button>
        : <button onClick={player.resume} className={`${base} bg-coral text-ink`}>▶ Resume</button>;
    default: {
      const unhandled: never = narration;
      return unhandled;
    }
  }
}

/** Marks the stop a scenic route detours through. */
export function ScenicTag() {
  return <span className="mr-1.5 rounded-full bg-[#f2c14e]/20 px-1.5 py-px text-[11px] text-[#f2c14e]">Scenic detour</span>;
}

const TYPE_LABEL: Record<string, string> = {
  encyclopedia: "Article", paper: "Paper", report: "NASA report", book: "Book", film: "Film",
};

/** Bottom panel for a learning route: the climb profile and the list of stops. */
export default function ClimbPanel({ route, onStop, narration, player }: {
  route: RouteResponse;
  onStop: (item: MapPoint) => void;
  narration: Narration;
  player: Player;
}) {
  const levels = route.stops.map((s) => s.item.difficulty ?? 1);
  const notes = narration.status === "ready" ? narration.notes : null;
  return (
    <section className="pointer-events-auto fixed inset-x-0 bottom-0 z-10 mx-auto max-h-[40dvh] max-w-lg overflow-y-auto rounded-t-3xl border border-b-0 border-line bg-surface px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black/60">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Your climb</h2>
          <p className="text-xs text-muted">
            {route.stops.length} stops · level {levels[0]} → {levels[levels.length - 1]}
          </p>
        </div>
        <NarrationButton narration={narration} player={player} />
      </div>
      {route.relaxed && (
        <p className="mt-2 rounded-xl bg-coral/15 px-3 py-2 text-xs text-coral">
          No strictly climbing route was found, so this one may step down a level.
        </p>
      )}
      <ClimbProfile route={route} />
      <ol className="mt-1 space-y-1">
        {route.stops.map((s, i) => (
          <li key={s.item.id}>
            <button
              onClick={() => onStop(s.item)}
              aria-current={player.index === i ? "step" : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/5 ${
                player.index === i ? "bg-white/10 ring-1 ring-coral/60" : ""
              }`}
            >
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-ink"
                style={{ background: `#${levelColor(s.item.difficulty).getHexString()}` }}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{s.item.title}</span>
                <span className="block text-xs text-muted">
                  {s.item.id === route.scenic?.waypoint_id && <ScenicTag />}
                  {TYPE_LABEL[s.item.type] ?? s.item.type} · level {s.item.difficulty}
                  {s.step_similarity !== null && ` · ${Math.round(s.step_similarity * 100)}% like the last stop`}
                </span>
                {notes?.[i] && (
                  <span className={`mt-1 block text-[13px] leading-snug ${
                    player.index === i ? "text-white" : "text-muted"}`}>
                    {notes[i]}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
