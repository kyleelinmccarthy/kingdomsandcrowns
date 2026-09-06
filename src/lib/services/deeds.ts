import type { GameIconName } from "@/components/game-icon";
import type { SkillArea } from "@/lib/utils/skills";

export type BuildingOverview = {
  id: string; label: string; description: string; icon: GameIconName;
  done: number; total: number; complete: boolean;
  deeds: { id: string; title: string; story: string; area: SkillArea }[];
};
