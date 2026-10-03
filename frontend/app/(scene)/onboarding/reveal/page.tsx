import type { Metadata } from "next";
import RevealFlow from "@/components/onboarding/RevealFlow";

export const metadata: Metadata = { title: "Your reading DNA · StoryStrand" };

/** The pins drop on the shared map (app/(scene)/layout.tsx); this page adds the DNA panel. */
export default function RevealPage() {
  return <RevealFlow />;
}
