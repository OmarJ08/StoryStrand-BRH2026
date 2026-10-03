"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { MapName, SearchHit } from "@/lib/types";

const DEBOUNCE_MS = 200;

interface Props {
  map: MapName;
  placeholder: string;
  onSelect: (hit: SearchHit) => void;
  /** When set, the first suggestion picks the typed text itself (e.g. "Search by meaning"). */
  onText?: (text: string) => void;
  /** Wording for that free-text row; {q} is replaced by the typed text. */
  textLabel?: string;
  textHint?: string;
  /** Local title matches, used when the API is unreachable (e.g. points already on screen). */
  offline?: (query: string) => SearchHit[];
}

type Option = { kind: "text"; text: string } | { kind: "hit"; hit: SearchHit };

/** Type-ahead title/author search on one map (POST /api/search). */
export default function SearchBox({
  map, placeholder, onSelect, onText,
  textLabel = "Search by meaning: “{q}”",
  textHint = "Matches the closest topics, not just titles",
  offline,
}: Props) {
  const offlineRef = useRef(offline);
  useEffect(() => {
    offlineRef.current = offline;
  });
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
          if (latest.current === q) setResult({ query: q, hits: offlineRef.current?.(q) ?? [] });
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, map]);

  const q = query.trim();
  const hits = q && result?.query === q ? result.hits : [];
  const options: Option[] = [
    ...(onText && q ? [{ kind: "text" as const, text: q }] : []),
    ...hits.map((hit) => ({ kind: "hit" as const, hit })),
  ];
  const showList = open && q.length > 0;

  const choose = (option: Option) => {
    switch (option.kind) {
      case "text":
        onText?.(option.text);
        break;
      case "hit":
        onSelect(option.hit);
        break;
      default: {
        const unhandled: never = option;
        return unhandled;
      }
    }
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
            setActive((i) => Math.min(i + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && options[active]) {
            e.preventDefault();
            choose(options[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="w-full rounded-full border border-line bg-surface px-5 py-2.5 text-[15px] text-white shadow-lg shadow-black/40 placeholder:text-muted outline-none focus:border-teal focus:ring-2 focus:ring-teal/50"
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-2 max-h-[50dvh] overflow-y-auto rounded-2xl border border-line bg-surface py-1.5 shadow-2xl shadow-black/60"
        >
          {options.map((option, i) => (
            <li
              key={option.kind === "text" ? "__text" : option.hit.id}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: fires before the input's blur closes the list
              onMouseDown={(e) => {
                e.preventDefault();
                choose(option);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-4 py-2 ${i === active ? "bg-white/10" : ""}`}
            >
              {option.kind === "text" ? (
                <>
                  <p className="truncate text-sm font-medium text-coral">{textLabel.replace("{q}", option.text)}</p>
                  <p className="text-xs text-muted">{textHint}</p>
                </>
              ) : (
                <>
                  <p className="truncate text-sm font-medium text-white">{option.hit.title}</p>
                  <p className="truncate text-xs text-muted">
                    {option.hit.creators.slice(0, 2).join(", ")} · {option.hit.cluster_label}
                  </p>
                </>
              )}
            </li>
          ))}
          {hits.length === 0 && (
            <li className="px-4 py-2.5 text-sm text-muted">
              {result?.query === q ? "No title matches" : "Searching…"}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
