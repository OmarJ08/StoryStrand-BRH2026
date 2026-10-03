"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Health =
  | { state: "checking" }
  | { state: "ok" }
  | { state: "error"; message: string };

export default function Home() {
  const [health, setHealth] = useState<Health>({ state: "checking" });

  useEffect(() => {
    api<{ status: string }>("/api/health")
      .then(() => setHealth({ state: "ok" }))
      .catch((e: Error) => setHealth({ state: "error", message: e.message }));
  }, []);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 text-center">
      <div>
        <h1 className="font-display text-5xl font-bold tracking-tight sm:text-6xl">
          Story<span className="text-coral">Strand</span>
        </h1>
        <p className="mt-3 text-lg text-white/70">Your reading DNA</p>
      </div>
      <div className="glass w-full max-w-sm rounded-2xl px-6 py-5">
        <StatusLine health={health} />
        <p className="mt-2 truncate text-xs text-white/40">{process.env.NEXT_PUBLIC_API_URL}</p>
      </div>
      <div className="flex flex-col items-center gap-3">
        <Link
          href="/onboarding"
          className="rounded-full bg-coral px-6 py-3 font-display font-semibold text-ink transition-transform active:scale-95"
        >
          Pick 5 books you loved
        </Link>
        <Link href="/map/books" className="text-sm text-white/60 hover:text-white">
          or just explore the map →
        </Link>
      </div>
    </main>
  );
}

function StatusLine({ health }: { health: Health }) {
  switch (health.state) {
    case "checking":
      return <p className="text-white/70">Checking backend…</p>;
    case "ok":
      return <p className="font-medium text-teal brightness-150">Backend connected</p>;
    case "error":
      return <p className="font-medium text-coral">Backend unreachable: {health.message}</p>;
    default: {
      const unreachable: never = health;
      return unreachable;
    }
  }
}
