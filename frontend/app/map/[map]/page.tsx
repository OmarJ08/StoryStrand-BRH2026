import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { MapName } from "@/lib/types";

const TITLES: Record<MapName, string> = {
  books: "Book Map · StoryStrand",
  knowledge: "Knowledge Map · StoryStrand",
};

function isMapName(value: string): value is MapName {
  return value in TITLES;
}

export function generateStaticParams() {
  return Object.keys(TITLES).map((map) => ({ map }));
}

export async function generateMetadata({ params }: PageProps<"/map/[map]">): Promise<Metadata> {
  const { map } = await params;
  return { title: isMapName(map) ? TITLES[map] : "StoryStrand" };
}

/** The scene itself lives in app/map/layout.tsx so it survives switching maps. */
export default async function MapPage({ params }: PageProps<"/map/[map]">) {
  const { map } = await params;
  if (!isMapName(map)) notFound();
  return null;
}
