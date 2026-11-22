"use client";

/**
 * "Watch Pip" build a rune (R-I12): a young hero (K–3) meets one worked rune before their first, as
 * Pip shows a clue. Hear the word, tap the runes in order, cast. The card is Pip's own (`PipSteps`);
 * `useTaskDemo` (task-demo.tsx) decides when it shows.
 */
import type { GameIconName } from "@/components/game-icon";
import { RUNE_DEMO_COPY, RUNE_DEMO_STEPS } from "@/lib/tasks/rune-copy";
import { PipSteps } from "./trail-demo";

const STEP_ICONS: readonly GameIconName[] = ["bell", "gem", "sparkles"];

export function RuneDemo(props: { onDone(): void; calm: boolean; variant?: "board" | "page" }) {
  return <PipSteps steps={RUNE_DEMO_STEPS} icons={STEP_ICONS} copy={RUNE_DEMO_COPY} {...props} />;
}
