/**
 * Valid trail pools for tests (the validator, the sheet round-trip, the drawer, the week harness).
 * They are NOT content: they live here so `src/content/trails/` stays exactly what H5 ships.
 *
 * `fixtureTrailPool(band)` passes `validateTrailPool` unchanged at every band; the validator tests
 * break it one rule at a time. Its clues are built, not written, so each says where to go by a phrase
 * for the place that never uses one of the place's own names (g23 up) or a word shared with its
 * confusable partner (`CONFUSABLE_ANCHORS`).
 */
import type { AnchorId } from "@/lib/realm/anchors";
import { ANCHOR_IDS } from "@/lib/realm/anchors";
import { TRAIL_SKILLS, type Trail, type TrailClue, type TrailLevel, type TrailPool } from "@/lib/content/trail-pools";
import type { ContentBand } from "@/lib/utils/content-bands";

/** A phrase for each place that holds none of its names and none of its confusable partner's shared words. */
const PLACE_PHRASE: Record<AnchorId, string> = {
  "landmark:well": "where a rope lowers into the cool dark below",
  "landmark:mill": "where grain becomes flour for the baker",
  "landmark:bridge": "where the path crosses the river",
  "landmark:chapel": "where a bell calls the village to be quiet",
  "landmark:market": "where stalls sell bread and songs fill the air",
  "landmark:library": "where shelves hold every story of the realm",
  "landmark:watchtower": "where a lantern watches the hills at night",
  "landmark:garden": "where herbs grow in tidy rows",
  "landmark:castle-gate": "where the road meets the king's door",
  "landmark:puzzle-tower": "where the stone walls hide bonus puzzles",
  "object:notice-board": "where pinned papers hang for passers-by",
  "object:water-trough": "where thirsty animals stop on the way",
  "object:beehives": "where tiny striped workers hum all day",
  "object:hay-cart": "a wagon heaped with dry grass",
};

const LABEL: Record<AnchorId, string> = {
  "landmark:well": "the well",
  "landmark:mill": "the mill",
  "landmark:bridge": "the bridge",
  "landmark:chapel": "the chapel",
  "landmark:market": "the market",
  "landmark:library": "the library",
  "landmark:watchtower": "the watchtower",
  "landmark:garden": "the garden",
  "landmark:castle-gate": "the castle gate",
  "landmark:puzzle-tower": "the puzzle tower",
  "object:notice-board": "the notice board",
  "object:water-trough": "the water trough",
  "object:beehives": "the beehives",
  "object:hay-cart": "the hay cart",
};

/** A clue for `answer`: a place name at k1 (where it may be named), a phrase for it above. */
export function fixtureClue(band: ContentBand, answer: AnchorId, n: number): TrailClue {
  const others = ANCHOR_IDS.filter((a) => a !== answer);
  const clue: TrailClue = {
    text: band === "k1" ? `Go to ${LABEL[answer]}, step ${n}.` : `Trail step ${n}: find the place ${PLACE_PHRASE[answer]}.`,
    answer,
    redirect: "Read the clue again and picture the place it tells of.",
  };
  if (band === "k1") clue.readAloud = `Go to ${LABEL[answer]}. That is step ${n}.`;
  if (band !== "k1" && band !== "g23") clue.why = `The clue's words point to one place only, in step ${n}.`;
  if (band === "g68" || band === "g912") {
    // Two parts that share only the answer, so the intersection is exactly [answer].
    clue.parts = [
      [answer, others[n % others.length]],
      [answer, others[(n + 5) % others.length]],
    ];
  }
  return clue;
}

/**
 * 50 trails (10 at each level, so 9 per level is cleared), of 2 or 3 clues (125 clues), no trail
 * sending the hero to one place twice. `answerOf` is what the clue key says, in trail order.
 */
export function fixtureTrailPool(band: ContentBand = "g23"): TrailPool {
  const trails: Trail[] = [];
  for (let t = 0; t < 50; t++) {
    const clues: TrailClue[] = [];
    const length = t % 2 === 0 ? 2 : 3;
    for (let s = 0; s < length; s++) clues.push(fixtureClue(band, ANCHOR_IDS[(t * 3 + s * 5) % ANCHOR_IDS.length], t * 10 + s + 1));
    trails.push({ id: `fx-${String(t + 1).padStart(2, "0")}-trail`, level: (t % 5) as TrailLevel, clues });
  }
  return { poolId: `trail-${band}`, skillId: TRAIL_SKILLS[band], band, trails };
}

/** The same pool as JSON text, deep-copied, so a test can mutate it freely. */
export const cloneTrailPool = (band: ContentBand = "g23"): TrailPool => JSON.parse(JSON.stringify(fixtureTrailPool(band))) as TrailPool;
