import type { Metadata } from "next";
import RoutePlanner from "@/components/route/RoutePlanner";

export const metadata: Metadata = { title: "Learning route · StoryStrand" };

/** The map itself lives in the (scene) layout; this page adds the route controls. */
export default function RoutePage() {
  return <RoutePlanner />;
}
