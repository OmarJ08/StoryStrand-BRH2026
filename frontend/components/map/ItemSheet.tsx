"use client";

import { AnimatePresence, motion, useDragControls } from "motion/react";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { Color } from "three";
import { api } from "@/lib/api";
import type { ItemDetail, ItemType, MapPoint } from "@/lib/types";

function typeLabel(type: ItemType): string {
  switch (type) {
    case "book":
      return "Book";
    case "encyclopedia":
      return "Encyclopedia article";
    case "report":
      return "NASA report";
    case "paper":
      return "Research paper";
    case "film":
      return "Film";
    default: {
      const unhandled: never = type;
      return unhandled;
    }
  }
}

const details = new Map<string, ItemDetail>();   // session cache: reopening a stop is instant

/** Full item (description, authors, links), fetched when the sheet opens. */
function useItemDetail(id: string | null): ItemDetail | null {
  const [loaded, setLoaded] = useState<ItemDetail | null>(null);
  useEffect(() => {
    if (!id || details.has(id)) return;
    let cancelled = false;
    api<ItemDetail>(`/api/items/${encodeURIComponent(id)}`)
      .then((d) => {
        details.set(id, d);
        if (!cancelled) setLoaded(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);
  if (!id) return null;
  return details.get(id) ?? (loaded?.id === id ? loaded : null);
}

interface Props {
  point: MapPoint | null;
  palette: Map<string, Color>;
  onClose: () => void;
}

/**
 * Bottom sheet over the persistent map. Only the handle drags (swipe down to dismiss), so
 * the description stays selectable; links open the real source in a new tab.
 */
export default function ItemSheet({ point, palette, onClose }: Props) {
  const drag = useDragControls();
  const detail = useItemDetail(point?.id ?? null);

  return (
    <AnimatePresence>
      {point && (
        <motion.section
          key={point.id}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 320 }}
          drag="y"
          dragListener={false}
          dragControls={drag}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.6 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 80 || info.velocity.y > 500) onClose();
          }}
          className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-h-[80dvh] max-w-lg flex-col rounded-t-3xl border border-b-0 border-white/15 bg-ink/95 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black/60 backdrop-blur-xl"
        >
          <div
            onPointerDown={(e) => drag.start(e)}
            className="flex shrink-0 cursor-grab touch-none justify-center pt-3 pb-4 active:cursor-grabbing"
          >
            <button onClick={onClose} aria-label="Close" className="h-1.5 w-10 rounded-full bg-white/30" />
          </div>

          <div className="min-h-0 overflow-y-auto overscroll-contain">
            <div className="flex gap-4">
              {point.cover_url && (
                <Image
                  src={point.cover_url}
                  alt=""
                  width={72}
                  height={108}
                  className="h-27 w-18 shrink-0 rounded-lg object-cover shadow-lg"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wider text-white/50">{typeLabel(point.type)}</p>
                <h2 className="mt-1 select-text font-display text-xl font-semibold leading-tight">{point.title}</h2>
                {detail && (detail.creators.length > 0 || detail.year) && (
                  <p className="mt-1 select-text text-sm text-white/60">
                    {detail.creators.slice(0, 4).join(", ")}
                    {detail.creators.length > 4 && " et al."}
                    {detail.year && ` · ${detail.year}`}
                  </p>
                )}
                <span
                  className="mt-3 inline-block rounded-full px-3 py-1 text-xs font-medium text-ink"
                  style={{ background: `#${palette.get(point.cluster_label)?.getHexString() ?? "ffffff"}` }}
                >
                  {point.cluster_label}
                </span>
                {point.difficulty !== null && <Elevation level={point.difficulty} />}
              </div>
            </div>

            {detail ? <DetailBody detail={detail} /> : <p className="mt-4 text-sm text-white/40">Loading details…</p>}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

/**
 * Clipboard API first; it is missing on plain-http pages and some in-app browsers, so fall
 * back to a hidden textarea + execCommand("copy").
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function DetailBody({ detail }: { detail: ItemDetail }) {
  const [copied, setCopied] = useState<{ key: string; ok: boolean } | null>(null);
  const primary = detail.links[0];
  const copy = (key: string, text: string) => {
    void copyText(text).then((ok) => {
      setCopied({ key, ok });
      setTimeout(() => setCopied((c) => (c?.key === key ? null : c)), 1500);
    });
  };
  const label = (key: string, idle: string) =>
    copied?.key === key ? (copied.ok ? "Copied ✓" : "Copy failed") : idle;

  return (
    <>
      {detail.links.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {detail.links.map((l, i) => (
            <a
              key={l.label}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                i === 0 ? "bg-coral text-ink" : "border border-white/20 text-white hover:bg-white/10"
              }`}
            >
              {i === 0 ? `Open on ${l.label}` : l.label} ↗
            </a>
          ))}
        </div>
      )}

      {detail.description && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-wider text-white/50">
              {detail.type === "paper" ? "Abstract" : "About"}
            </h3>
            <div className="flex gap-3 text-xs">
              <button onClick={() => copy("text", detail.description)} className="text-teal brightness-150 hover:underline">
                {label("text", "Copy text")}
              </button>
              {primary && (
                <button
                  onClick={() => copy("link", `${detail.title}. ${detail.creators.slice(0, 3).join(", ")}${detail.year ? ` (${detail.year})` : ""}. ${primary.url}`)}
                  className="text-teal brightness-150 hover:underline"
                >
                  {label("link", "Copy reference")}
                </button>
              )}
            </div>
          </div>
          <p className="mt-2 select-text whitespace-pre-line text-sm leading-relaxed text-white/80">
            {detail.description}
          </p>
        </div>
      )}
    </>
  );
}

function Elevation({ level }: { level: number }) {
  return (
    <div className="mt-4">
      <p className="text-xs text-white/60">Elevation · level {level} of 5</p>
      <div className="mt-1.5 flex items-end gap-1" aria-hidden>
        {[1, 2, 3, 4, 5].map((l) => (
          <span
            key={l}
            className={`w-5 rounded-sm ${l <= level ? "bg-coral" : "bg-white/15"}`}
            style={{ height: 4 + l * 3 }}
          />
        ))}
      </div>
    </div>
  );
}
