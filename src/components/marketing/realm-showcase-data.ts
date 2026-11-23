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
  subtitle:
    "Every hero gets a 3D world to explore. The schoolwork they finish raises their kingdom, and the skills they practice are how the game is played.",
  points: [
    {
      icon: "brain",
      title: "Learning is the game",
      body: "Students measure to build, follow reading clue trails, craft spells from spelling runes, and crack logic locks, matched to their grade from K to 12.",
    },
    {
      icon: "castle",
      title: "Schoolwork builds a kingdom",
      body: "Finished quests earn materials for new wings and upgrades. Each grade year is a season, and finishing it earns that year's Crown.",
    },
    {
      icon: "hourglass",
      title: "Play time is earned",
      body: "A small free allowance every day, more minutes for stars earned on side quests, and unspent time banks for tomorrow.",
    },
    {
      icon: "shield",
      title: "Parents stay in control",
      body: "You set every number: the daily cap, off-hours access, and how minutes are earned. Gentle and non-violent by default, with accessibility options.",
    },
  ],
  shots: [
    screenshot("realm-village", "The hero's village in the Realm"),
    screenshot("realm-learning", "Side quests matched to the student's grade"),
    screenshot("realm-earned-time", "The Realm with the student's earned play time"),
  ],
};
