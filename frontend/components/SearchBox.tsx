"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { MapName, SearchHit } from "@/lib/types";

const DEBOUNCE_MS = 200;

interface Props {
  map: MapName;
  placeholder: string;
  onSelect: (hit: SearchHit) => void;
}

/** Type-ahead title/author search on one map (POST /api/search). */
export default function SearchBox({ map, placeholder, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ query: string; hits: SearchHit[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const latest = useRef("");

  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    if (!q) return;
    const timer = setTimeout(() => {
      api<SearchHit[]>("/api/search", { method: "POST", body: JSON.stringify({ map, query: q }) })
        .then((hits) => {
          if (latest.current === q) setResult({ query: q, hits });
        })
        .catch(() => {
          if (latest.current === q) setResult({ query: q, hits: [] });
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, map]);

  const q = query.trim();
  const hits = q && result?.query === q ? result.hits : [];
  const showList = open && q.length > 0;

  const choose = (hit: SearchHit) => {
    onSelect(hit);
    setQuery("");
    setResult(null);
    setOpen(false);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  return (
    <div className="pointer-events-auto relative w-full max-w-sm">
      <input
        type="search"
        value={query}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && hits[active]) {
            e.preventDefault();
            choose(hits[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="w-full rounded-full border border-white/15 bg-ink/90 px-5 py-2.5 text-[15px] text-white shadow-lg shadow-black/40 backdrop-blur-md placeholder:text-white/45 outline-none focus:border-teal focus:ring-2 focus:ring-teal/50"
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-2 max-h-[50dvh] overflow-y-auto rounded-2xl border border-white/15 bg-ink py-1.5 shadow-2xl shadow-black/60"
        >
          {hits.length === 0 && (
            <li className="px-4 py-2.5 text-sm text-white/50">
              {result?.query === q ? "No matches" : "Searching…"}
            </li>
          )}
          {hits.map((hit, i) => (
            <li
              key={hit.id}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: fires before the input's blur closes the list
              onMouseDown={(e) => {
                e.preventDefault();
                choose(hit);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-4 py-2 ${i === active ? "bg-white/10" : ""}`}
            >
              <p className="truncate text-sm font-medium text-white">{hit.title}</p>
              <p className="truncate text-xs text-white/50">
                {hit.creators.slice(0, 2).join(", ")} · {hit.cluster_label}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
