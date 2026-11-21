/**
 * The one parser for the skill maps in `docs/content/` (F-12). A skill map is the curriculum's
 * source of truth and a document a parent can edit, so the tests that compare code to a map read
 * it through this and never through a second copy of the walk.
 *
 * They differ in two cosmetic ways and in nothing that matters: the math map bolds its grade cell
 * and the ELA and science map leaves it plain, and the ELA map splits its rows across a `## `
 * heading per strand where math has a single table. So a row carries the strand it was found
 * under, `null` for math.
 */
import fs from "node:fs";
import path from "node:path";
import type { SkillArea } from "@/lib/utils/skills";

const MAP_STRANDS: Record<string, SkillArea> = {
  Logic: "logic",
  Reading: "reading",
  "Language Arts": "language",
  Science: "science",
};

export type MapRow = { grade: string; skillId: string; strand: SkillArea | null; status: string };

export function mapRows(file: string): MapRow[] {
  const md = fs.readFileSync(path.join(process.cwd(), "docs/content", file), "utf8");
  const rows: MapRow[] = [];
  let grade: string | null = null;
  let strand: SkillArea | null = null;
  for (const line of md.split("\n")) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      strand = MAP_STRANDS[heading[1].trim()] ?? null;
      continue;
    }
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    // A grade cell is "**K**", "**9** *(Algebra I)*", "K" or "9 *(Biology)*"; a continuation
    // row in the math table leaves it empty and keeps the grade of the row above it.
    const g = /^\*{0,2}([K0-9]{1,2})\*{0,2}(?:\s|$)/.exec(cells[1] ?? "");
    if (g) grade = g[1];
    const id = /^`([a-z0-9-]+)`$/.exec(cells[2] ?? "");
    // The last cell of a row is Status in both maps, whether or not there is a Standard column.
    if (id && grade) rows.push({ grade, skillId: id[1], strand, status: cells[cells.length - 2] ?? "" });
  }
  return rows;
}
