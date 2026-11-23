import type { GameIconName } from "@/components/game-icon";
import { screenshot, type Screenshot } from "@/components/marketing/screens";

/**
 * Copy and screenshots for the landing page's Realm showcase.
 *
 * Every claim here is backed by the shipped game (checked 2026-11-23 against
 * docs/superpowers/specs/2026-11-23-landing-realm-showcase-design.md). Tighten
 * the wording freely, but don't promise more than the Realm does.
 */
export type RealmPoint = { icon: GameIconName; title: string; body: string };

export type RealmShowcaseContent = {
  eyebrow: string;
  title: string;
  subtitle: string;
  points: RealmPoint[];
  /** The first shot is shown large; the other two sit side by side beneath it. */
  shots: [Screenshot, Screenshot, Screenshot];
};

export const REALM_SHOWCASE: RealmShowcaseContent = {
  eyebrow: "The Realm",
  title: "A kingdom built by learning",
  subtitle: "A 3D game where each student builds their own kingdom with what they learn.",
  points: [
    {
      icon: "brain",
      title: "Learning is the game",
      body: "Measuring, reading, spelling and logic puzzles are how the game is played, set to each student's grade from K to 12.",
    },
    {
      icon: "castle",
      title: "Schoolwork builds a kingdom",
      body: "Finished quests earn building materials. Each school year ends with a Crown.",
    },
    {
      icon: "hourglass",
      title: "Play time is earned",
      body: "A few free minutes a day, and more for stars on side quests. Unused time carries over.",
    },
    {
      icon: "shield",
      title: "Parents stay in control",
      body: "You set the daily limit, when it's open, and how minutes are earned. Gentle by default, with accessibility options.",
    },
  ],
  shots: [
    screenshot(
      "realm-village",
      "A student's hero standing in a 3D village, with villagers waiting at building plots, the next side quest, a spell bar and the play time left today",
    ),
    screenshot(
      "realm-learning",
      "Old Bram, keeper of the Village Well, offering math, reading and science side quests that each build the well a little more",
    ),
    screenshot(
      "realm-quest-giver",
      "A parent visiting their student's Realm as the Quest Giver, which spends none of the student's minutes",
    ),
  ],
};
