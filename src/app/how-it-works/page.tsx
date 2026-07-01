import { Suspense } from "react";
import type { Metadata } from "next";
import { Walkthrough } from "@/components/marketing/walkthrough";

export const metadata: Metadata = {
  title: "How It Works — Kingdoms & Crowns",
  description:
    "A full walkthrough of Kingdoms & Crowns for parents and students — real screens for setting up your family, creating quests, logging learning, and earning XP, badges, and castles.",
};

export default function HowItWorksPage() {
  return (
    <Suspense fallback={null}>
      <Walkthrough />
    </Suspense>
  );
}
