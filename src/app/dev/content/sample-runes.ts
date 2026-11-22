/**
 * The rune entries `/dev/content` shows (RI-a / S11): one entry per rune pool, drawn as the pool's
 * first credited skill and shown beside every skill the pool credits (`runePoolFor`). Server-only, like
 * the pools: the page (a server component) calls this and hands the result to the client reader, so a
 * pool's words never ride into the browser's bundle. A skill no pool credits has no entry, and the page
 * says so.
 *
 * Drawn from the page's fixed seeds, so a reload shows the same entry, with its tiles in the order the
 * drawer would show them.
 */
import { drawRuneWords } from "@/lib/tasks/runes/draw";
import { runePoolFor } from "@/lib/tasks/runes";
import { seededRng } from "@/lib/utils/drill-generators";
import { SKILLS, findSkill } from "@/lib/utils/skills";
import { seedFor, type SampledRune } from "./sample";

const NONE: ReadonlySet<string> = new Set();
/** The rung the sample is drawn at: the middle, so a pool's typical entry is what is shown. */
const SAMPLE_LEVEL = 2;

export function sampleRunes(): Record<string, SampledRune> {
  const byPool = new Map<string, SampledRune | null>();
  const out: Record<string, SampledRune> = {};
  for (const skill of SKILLS) {
    const pool = runePoolFor(skill.id);
    if (!pool) continue;
    if (!byPool.has(pool.poolId)) {
      const first = findSkill(pool.skillIds[0]);
      const [task] = first ? drawRuneWords(first, SAMPLE_LEVEL, 1, seededRng(seedFor(pool.poolId, SAMPLE_LEVEL)), NONE, NONE) : [];
      byPool.set(
        pool.poolId,
        task ? { poolId: pool.poolId, effect: task.effect, prompt: task.prompt, ...(task.readAloud ? { readAloud: task.readAloud } : {}), tiles: [...task.tiles], words: [...task.words] } : null,
      );
    }
    const sample = byPool.get(pool.poolId);
    if (sample) out[skill.id] = sample;
  }
  return out;
}
