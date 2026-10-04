import type { Metadata } from "next";
import RoutePlanner from "@/components/route/RoutePlanner";

export const metadata: Metadata = { title: "Taste route · StoryStrand" };

/** Taste routes on the Book Map; the map itself lives in the (scene) layout. */
export default function TasteRoutePage() {
  return <RoutePlanner map="books" />;
}
