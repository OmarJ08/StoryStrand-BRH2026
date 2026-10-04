import type { Metadata } from "next";
import SteerPanel from "@/components/steer/SteerPanel";

export const metadata: Metadata = { title: "Steer · StoryStrand" };

/** Steer on the Book Map: "like this, but more of that". The map lives in the (scene) layout. */
export default function SteerPage() {
  return <SteerPanel />;
}
