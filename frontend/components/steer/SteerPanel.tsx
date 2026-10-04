"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import SearchBox from "@/components/SearchBox";
import { pointFocus, pointsFocus } from "@/components/map/CameraRig";
import { useScene } from "@/components/map/SceneContext";
import { api } from "@/lib/api";
import type { MapPoint, SearchHit } from "@/lib/types";

const DEBOUNCE_MS = 250;
const RESULTS = 8;

function BookField({ label, book, onPick, placeholder }: {
  label: string;
  book: MapPoint | null;
  onPick: (book: MapPoint | null) => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-sm text-muted">{label}</span>
      {book ? (
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-full border border-line bg-ink py-2 pr-2 pl-4">
          <span className="truncate text-sm">{book.title}</span>
          <button onClick={() => onPick(null)} aria-label={`Clear ${label}`}
            className="shrink-0 rounded-full px-2 text-muted hover:text-white">×</button>
        </div>
      ) : (
        <SearchBox map="books" placeholder={placeholder} onSelect={onPick} />
      )}
    </div>
  );
}

/**
 * Steer (Section 9.4): "like this, but more of that". Pick two books and slide between
 * them; POST /api/steer returns the books nearest the blend, which stay lit on the map
 * while everything else dims.
 */
export default function SteerPanel() {
  const { steerFrom, setSelection, flyTo, setHighlight } = useScene();
  const [a, setA] = useState<MapPoint | null>(steerFrom);
  const [b, setB] = useState<MapPoint | null>(null);
  const [s, setS] = useState(0.5);
  const [result, setResult] = useState<{ hits: SearchHit[] } | { error: string } | null>(null);
  const flownTo = useRef("");   // fly to fit a pair once, not on every slider move

  useEffect(() => {
    if (!a || !b) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api<SearchHit[]>("/api/steer", {
        method: "POST",
        body: JSON.stringify({ a_id: a.id, b_id: b.id, s, k: RESULTS }),
      })
        .then((hits) => {
          if (cancelled) return;
          setResult({ hits });
          setHighlight([a.id, b.id, ...hits.map((h) => h.id)]);
          const pair = `${a.id}|${b.id}`;
          if (flownTo.current !== pair) {
            flownTo.current = pair;
            flyTo(pointsFocus([a, b, ...hits]));
          }
        })
        .catch((e: Error) => !cancelled && setResult({ error: e.message }));
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [a, b, s, flyTo, setHighlight]);

  useEffect(() => () => setHighlight(null), [setHighlight]);

  const pick = (set: (book: MapPoint | null) => void) => (book: MapPoint | null) => {
    set(book);
    setResult(null);
    setHighlight(null);
    if (book) flyTo(pointFocus(book));
  };
  const hits = a && b && result && "hits" in result ? result.hits : [];

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex justify-center px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto w-full max-w-md space-y-2 rounded-3xl border border-line bg-surface p-4 shadow-2xl shadow-black/50">
          <div className="flex items-center justify-between px-1">
            <h1 className="font-display text-base font-semibold">Steer</h1>
            <Link href="/map/books" className="text-xs text-muted hover:text-white">← Map</Link>
          </div>
          <p className="px-1 text-xs text-muted">Like one book, but more of another.</p>
          <BookField label="Like" book={a} onPick={pick(setA)} placeholder="A book you love" />
          <BookField label="More" book={b} onPick={pick(setB)} placeholder="…but more like this one" />
          {a && b && (
            <div className="px-1 pt-1">
              <input type="range" min={0} max={1} step={0.05} value={s}
                onChange={(e) => setS(Number(e.target.value))}
                aria-label="How far to steer toward the second book"
                className="w-full accent-coral" />
              <div className="flex justify-between text-[11px] text-muted">
                <span>like this</span>
                <span>more of that</span>
              </div>
            </div>
          )}
          {a && b && result && "error" in result && (
            <p className="px-1 text-xs text-coral">Could not steer: {result.error}</p>
          )}
        </div>
      </header>

      {hits.length > 0 && (
        <section className="pointer-events-auto fixed inset-x-0 bottom-0 z-10 mx-auto max-h-[40dvh] max-w-lg overflow-y-auto rounded-t-3xl border border-b-0 border-line bg-surface px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black/60">
          <h2 className="font-display text-lg font-semibold">Books in between</h2>
          <ol className="mt-3 space-y-1">
            {hits.map((h) => (
              <li key={h.id}>
                <button
                  onClick={() => {
                    setSelection({ map: "books", point: h });
                    flyTo(pointFocus(h));
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/5"
                >
                  {h.cover_url && (
                    <Image src={h.cover_url} alt="" width={28} height={42}
                      className="h-10.5 w-7 shrink-0 rounded object-cover" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{h.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {h.creators.slice(0, 2).join(", ")}{h.creators.length > 0 && " · "}{h.cluster_label}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
