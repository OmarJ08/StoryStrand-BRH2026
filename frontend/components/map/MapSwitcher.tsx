import Link from "next/link";
import type { MapName } from "@/lib/types";

const MAPS: { map: MapName; label: string }[] = [
  { map: "books", label: "Books" },
  { map: "knowledge", label: "Knowledge" },
];

/** Flips between maps by route only; the Canvas lives in the layout, so it never unmounts. */
export default function MapSwitcher({ current }: { current: MapName }) {
  return (
    <nav className="glass pointer-events-auto flex rounded-full p-1 text-sm font-medium">
      {MAPS.map(({ map, label }) => (
        <Link
          key={map}
          href={`/map/${map}`}
          scroll={false}
          aria-current={map === current ? "page" : undefined}
          className={`rounded-full px-4 py-1.5 transition-colors ${
            map === current ? "bg-teal text-white" : "text-white/60 hover:text-white"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
