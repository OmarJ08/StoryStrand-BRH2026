"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { DbStats } from "@/lib/types";

const POLL_MS = 4000;

function ago(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 90 ? `${s} s ago` : `${Math.round(s / 60)} min ago`;
}

function until(iso: string | null): string {
  if (!iso) return "";
  const s = Math.round((Date.parse(iso) - Date.now()) / 1000);
  return s > 0 ? `, next in ${s} s` : ", next due now";
}

const n = (v: number) => v.toLocaleString();

/** Live Tiger numbers for the judges: every value is re-read from the database while open. */
export default function UnderTheHood() {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<DbStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = () => api<DbStats>("/api/stats")
      .then((s) => { if (!cancelled) { setStats(s); setError(null); } })
      .catch((e: Error) => !cancelled && setError(e.message));
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open]);

  const rows: [string, string, string][] = stats ? [
    ["Vector search", `${stats.vector_search_ms.toFixed(1)} ms`,
      `top 10 of ${n(stats.knowledge)} by cosine in 1024-d, DiskANN index ${stats.vector_index ?? "not used"}; ${stats.vector_search_roundtrip_ms.toFixed(0)} ms round trip from the API`],
    ["Items and vectors", n(stats.vectors),
      `${n(stats.books)} books and ${n(stats.knowledge)} knowledge items, each a ${stats.vector_dims}-d vector`],
    ["Portals", n(stats.portals), "mutual best matches between books and space science"],
    ["Events hypertable", `${n(stats.events)} events`,
      `${stats.chunks} chunk${stats.chunks === 1 ? "" : "s"}, ${stats.compressed_chunks} compressed`],
    ["Compression", stats.compression_ratio ? `${stats.compression_ratio}x` : "not yet",
      "columnar compression on events, segmented by map"],
    ["Continuous aggregate", stats.cagg_refresh_ms !== null ? `${stats.cagg_refresh_ms.toFixed(1)} ms` : "n/a",
      `last refresh ${ago(stats.cagg_last_refresh)}${until(stats.cagg_next_refresh)} (${stats.cagg_status ?? "no runs"})`],
  ] : [];

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[6] h-10 rounded-full border border-line bg-surface px-4 text-sm font-medium shadow-lg shadow-black/40 hover:border-white/40">
          Under the hood
        </button>
      )}
      <AnimatePresence>
        {open && (
          <motion.section
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            className="fixed inset-x-0 bottom-0 z-20 mx-auto max-h-[70dvh] max-w-lg overflow-y-auto rounded-t-3xl border border-b-0 border-line bg-surface px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black/60"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold">Under the hood</h2>
                <p className="text-xs text-muted">Live from Tiger Data, refreshed every {POLL_MS / 1000} s</p>
              </div>
              <button onClick={() => setOpen(false)}
                className="h-10 rounded-full border border-line px-4 text-sm hover:border-white/40">Close</button>
            </div>
            {error && <p className="mt-3 text-xs text-coral">Could not read stats: {error}</p>}
            {!stats && !error && <p className="mt-4 text-sm text-muted">Measuring…</p>}
            <dl className="mt-4 divide-y divide-line">
              {rows.map(([label, value, detail]) => (
                <div key={label} className="flex items-baseline justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <dt className="text-sm font-medium">{label}</dt>
                    <dd className="mt-0.5 text-xs text-muted">{detail}</dd>
                  </div>
                  <dd className="shrink-0 font-display text-lg font-semibold tabular-nums text-coral">{value}</dd>
                </div>
              ))}
            </dl>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
