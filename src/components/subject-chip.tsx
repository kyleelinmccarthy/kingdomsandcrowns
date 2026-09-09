import { AREA_LABELS, type SkillArea } from "@/lib/utils/skills";

/** The subject a side quest practices, as a small coloured pill. */
export function SubjectChip({ area, size = "sm" }: { area: SkillArea; size?: "sm" | "md" }) {
  const { label, color } = AREA_LABELS[area];
  // A custom property carries the raw colour through untouched: assigning `color`/`borderColor`
  // directly gets normalized (e.g. to rgb(...)) when the style is serialized.
  const style = { "--subject-color": color, color: "var(--subject-color)", borderColor: "var(--subject-color)" } as React.CSSProperties;
  return (
    <span
      data-subject={area}
      className={`inline-flex shrink-0 items-center rounded-full border font-medium ${size === "sm" ? "px-2 py-0 text-[11px]" : "px-2.5 py-0.5 text-xs"}`}
      style={style}
    >
      <span className="sr-only">Subject: </span>
      {label}
    </span>
  );
}
