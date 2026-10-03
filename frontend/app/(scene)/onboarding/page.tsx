import type { Metadata } from "next";
import OnboardingPicker from "@/components/onboarding/OnboardingPicker";

export const metadata: Metadata = { title: "Pick 5 books · StoryStrand" };

export default function OnboardingPage() {
  return <OnboardingPicker />;
}
