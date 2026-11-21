/**
 * A hand-built trail clue (slice 5), until the trail pools (H4, H5) exist. Its answer is the mill;
 * the well has its own redirect, and every other wrong place hears the clue's general one. Its
 * prompt never names the mill, so a test can hold that nothing about the mill reaches the browser.
 */
import type { TrailTask } from "@/lib/tasks/types";

export const WELL_REDIRECT = "That is where water is drawn.";
export const TRAIL_REDIRECT = "Read the last word again.";

export const TRAIL: TrailTask = {
  kind: "trail",
  id: "read-g1:trail:0a1b2c3d",
  skillId: "read-g1",
  prompt: "Go where the big wheel turns and grain becomes flour.",
  readAloud: "Go where the big wheel turns, and grain becomes flour.",
  answer: "landmark:mill",
  redirect: TRAIL_REDIRECT,
  redirects: { "landmark:well": WELL_REDIRECT },
  trail: "trail-k1/mill-walk",
  explain: "Flour is ground at the mill.",
};
