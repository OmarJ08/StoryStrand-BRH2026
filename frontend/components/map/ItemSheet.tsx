"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import type { Color } from "three";
import type { ItemType, MapPoint } from "@/lib/types";

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

interface Props {
  point: MapPoint | null;
  palette: Map<string, Color>;
  onClose: () => void;
}

/** Bottom sheet over the persistent map; swipe down or tap the handle to dismiss. */
export default function ItemSheet({ point, palette, onClose }: Props) {
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
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.6 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 80 || info.velocity.y > 500) onClose();
          }}
          className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-lg rounded-t-3xl border border-b-0 border-white/15 bg-ink/95 px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black/60 backdrop-blur-xl"
        >
          <button
            onClick={onClose}
            aria-label="Close"
            className="mx-auto mb-4 block h-1.5 w-10 rounded-full bg-white/30"
          />
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
              <h2 className="mt-1 font-display text-xl font-semibold leading-tight">{point.title}</h2>
              <span
                className="mt-3 inline-block rounded-full px-3 py-1 text-xs font-medium text-ink"
                style={{ background: `#${palette.get(point.cluster_label)?.getHexString() ?? "ffffff"}` }}
              >
                {point.cluster_label}
              </span>
              {point.difficulty !== null && <Elevation level={point.difficulty} />}
            </div>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
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
