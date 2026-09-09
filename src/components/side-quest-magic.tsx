import Link from "next/link";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { AREA_LABELS, schoolLines, type SkillArea } from "@/lib/utils/skills";
import { SPELL_ELEMENTS, SPELL_FORMS } from "@/lib/utils/spell-catalog";
import type { SpellSchool } from "@/lib/utils/spell-schools";
import { SIDE_QUESTS_LOWER } from "@/lib/utils/side-quest-copy";

const PLURAL: Record<SpellSchool, string> = { form: "Forms", element: "Elements", modifier: "Modifiers" };

function examplesFor(school: SpellSchool): string[] {
  if (school === "form") return SPELL_FORMS.slice(0, 3).map((p) => p.label);
  if (school === "element") return SPELL_ELEMENTS.slice(0, 3).map((p) => p.label);
  return [];
}

function joinSubjects(areas: SkillArea[]): string {
  const names = areas.map((a) => AREA_LABELS[a].label);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
}

/** "Math side quests unlock Forms: Bolt, Orb, Burst and more." */
export function magicLine(school: SpellSchool, areas: SkillArea[]): string {
  const examples = examplesFor(school);
  const tail = examples.length > 0 ? `: ${examples.join(", ")} and more.` : ".";
  return `${joinSubjects(areas)} ${SIDE_QUESTS_LOWER} unlock ${PLURAL[school]}${tail}`;
}

export function SideQuestMagic({ spellbookHref }: { spellbookHref: string }) {
  return (
    <GameFrame title="How side quests make magic" icon={<GameIcon name="sparkles" className="size-4 text-[var(--gold-bright)]" />}>
      <ul className="space-y-2">
        {schoolLines().map(({ school, areas }) => (
          <li key={school} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{magicLine(school, areas)}</span>
            <Link href={spellbookHref} className="text-xs font-medium text-primary hover:underline">Open the Spellbook</Link>
          </li>
        ))}
      </ul>
    </GameFrame>
  );
}
