"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import SearchBox from "@/components/SearchBox";
import { api } from "@/lib/api";
import { getGuestId, saveGuest } from "@/lib/guest";
import type { GuestResponse, SearchHit } from "@/lib/types";
import BackButton from "./BackButton";

const PICKS = 5;

/** Pick 5 books you loved: search for any title, or tap covers from the most-read books. */
export default function OnboardingPicker() {
  const router = useRouter();
  const [picks, setPicks] = useState<SearchHit[]>([]);
  const [popular, setPopular] = useState<SearchHit[] | null>(null);
  const [status, setStatus] = useState<{ state: "idle" | "saving" } | { state: "error"; message: string }>(
    { state: "idle" },
  );

  useEffect(() => {
    api<SearchHit[]>("/api/books/popular?limit=36").then(setPopular).catch(() => setPopular([]));
  }, []);

  const picked = (id: string) => picks.some((p) => p.id === id);
  const toggle = (book: SearchHit) =>
    setPicks((ps) => (ps.some((p) => p.id === book.id)
      ? ps.filter((p) => p.id !== book.id)
      : ps.length < PICKS ? [...ps, book] : ps));

  const dropPin = () => {
    setStatus({ state: "saving" });
    api<GuestResponse>("/api/guest", {
      method: "POST",
      body: JSON.stringify({ guest_id: getGuestId(), book_ids: picks.map((p) => p.id) }),
    })
      .then((guest) => {
        saveGuest(guest);
        router.push("/onboarding/reveal");
      })
      .catch((e: Error) => setStatus({ state: "error", message: e.message }));
  };

  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-ink/80 backdrop-blur-sm">
      <BackButton onClick={() => router.push("/")} />
      <div className="mx-auto flex w-full max-w-2xl min-h-0 flex-1 flex-col px-4 pt-[max(4.25rem,calc(env(safe-area-inset-top)+3rem))]">
        <h1 className="font-display text-2xl font-bold">Pick 5 books you loved</h1>
        <p className="mt-1 text-sm text-white/60">We&apos;ll drop your pin on the Book Map and show your reading DNA.</p>
        <div className="mt-4">
          <SearchBox map="books" placeholder="Search any book or author" onSelect={(hit) => {
            if (!picked(hit.id)) toggle(hit);
          }} />
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
          <p className="mb-2 text-xs uppercase tracking-wider text-white/40">Or tap from the most-read</p>
          {popular === null ? (
            <p className="text-sm text-white/40">Loading books…</p>
          ) : (
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
              {popular.map((b) => (
                <button key={b.id} onClick={() => toggle(b)} aria-pressed={picked(b.id)} aria-label={b.title}
                  className={`group relative aspect-[2/3] overflow-hidden rounded-lg transition ${
                    picked(b.id) ? "ring-3 ring-coral" : "opacity-85 hover:opacity-100"}`}
                  title={b.title}>
                  {b.cover_url && <Image src={b.cover_url} alt={b.title} fill sizes="120px" className="object-cover" />}
                  {picked(b.id) && (
                    <span className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-coral text-sm font-bold text-ink">
                      {picks.findIndex((p) => p.id === b.id) + 1}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-white/10 bg-ink/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="flex flex-1 gap-2">
            {Array.from({ length: PICKS }, (_, i) => picks[i]).map((p, i) => (
              <button key={p?.id ?? `slot-${i}`} onClick={() => p && toggle(p)} disabled={!p}
                aria-label={p ? `Remove ${p.title}` : `Empty slot ${i + 1}`}
                className="relative aspect-[2/3] w-11 overflow-hidden rounded-md border border-dashed border-white/25 bg-white/5">
                {p?.cover_url
                  ? <Image src={p.cover_url} alt="" fill sizes="44px" className="object-cover" />
                  : p && <span className="block p-1 text-[9px] leading-tight text-white/70">{p.title}</span>}
              </button>
            ))}
          </div>
          <button onClick={dropPin} disabled={picks.length !== PICKS || status.state === "saving"}
            className="rounded-full bg-coral px-5 py-3 font-display font-semibold text-ink transition-opacity disabled:opacity-40">
            {status.state === "saving" ? "Dropping…" : picks.length === PICKS ? "Drop my pin" : `${picks.length}/${PICKS} picked`}
          </button>
        </div>
        {status.state === "error" && (
          <p className="mx-auto mt-2 max-w-2xl text-xs text-coral">Could not place your pin: {status.message}</p>
        )}
      </div>
    </div>
  );
}
