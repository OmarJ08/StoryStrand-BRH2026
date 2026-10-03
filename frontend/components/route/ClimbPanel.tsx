"use client";

import { levelColor } from "@/components/map/RouteLine";
import type { MapPoint, RouteResponse } from "@/lib/types";

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

const TYPE_LABEL: Record<string, string> = {
  encyclopedia: "Article", paper: "Paper", report: "NASA report", book: "Book", film: "Film",
};

/** Bottom panel for a learning route: the climb profile and the list of stops. */
export default function ClimbPanel({ route, onStop }: {
  route: RouteResponse;
  onStop: (item: MapPoint) => void;
}) {
  const levels = route.stops.map((s) => s.item.difficulty ?? 1);
  return (
    <section className="pointer-events-auto fixed inset-x-0 bottom-0 z-10 mx-auto max-h-[40dvh] max-w-lg overflow-y-auto rounded-t-3xl border border-b-0 border-white/15 bg-ink/95 px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black/60 backdrop-blur-xl">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-semibold">Your climb</h2>
        <p className="text-xs text-white/50">
          {route.stops.length} stops · level {levels[0]} → {levels[levels.length - 1]}
        </p>
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
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/5"
            >
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-ink"
                style={{ background: `#${levelColor(s.item.difficulty).getHexString()}` }}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{s.item.title}</span>
                <span className="block text-xs text-white/50">
                  {TYPE_LABEL[s.item.type] ?? s.item.type} · level {s.item.difficulty}
                  {s.step_similarity !== null && ` · ${Math.round(s.step_similarity * 100)}% like the last stop`}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
