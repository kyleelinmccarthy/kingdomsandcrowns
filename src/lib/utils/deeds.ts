// "Deed" in code is "side quest" on screen. Identifiers are not renamed; copy comes from side-quest-copy.ts.
import type { SkillArea } from "./skills";
import type { TaskKind } from "@/lib/tasks/types";

export type Deed = {
  id: string;
  title: string;
  story: string;          // gentle default
  monsterStory?: string;  // only when the story mentions an opponent
  buildingId: string;
  area: SkillArea;
  /**
   * The deed's tasks at the grown-up's default side-quest length (`SIDE_QUEST_QUESTIONS`). A run
   * scales it to their own setting (`deedRunLength`); most deeds hold the full eight.
   */
  questionCount: number;
  /** How this deed's skills are played when a run can present them that way; any other skill is a choice. */
  mechanic: TaskKind;
  /**
   * The fewest and most tasks a run asks when it draws the mechanic (`deedRunLength`): a rune side
   * quest's stops, each a walk to a village object (R-I9). Absent, the share of the length stands alone.
   */
  stops?: { min: number; max: number };
};

/** A side quest's questions at the default length (`DEFAULT_REALM_SETTINGS.sideQuestLength`). */
export const SIDE_QUEST_QUESTIONS = 8;
const Q = SIDE_QUEST_QUESTIONS;
/** A science side quest is half as many tasks (RF-j): each sort places 6 to 10 items, so four is already a full quest. */
const SCIENCE_SORTS = 4;
/**
 * A reading side quest is half as many tasks too (R-H10): each clue is a walk across the village and
 * a longer read, so four clues take about as long as the old eight taps. Halved only when the run
 * draws trails (`deedRunLength`); a reading run that plays as multiple choice keeps the whole length.
 */
export const TRAIL_CLUES = 4;
/**
 * A language side quest is two or three runes (R-I9): each stop is a walk to a village object and a word
 * built from tiles, so three take about as long as the old eight taps, and the owner set 2 to 3 objects.
 * Its share of the length is `round(L × 3 / 8)`, held to `RUNE_STOPS` (4 → 2, 8 → 3, 12 → 3), and only
 * when the run draws runes; a language run that plays as multiple choice keeps the whole length.
 */
const RUNE_WORDS = 3;
export const RUNE_STOPS = { min: 2, max: 3 } as const;

/**
 * Deeds never name a skill: the engine picks skills for the hero's band and
 * the deed's area, so one story serves a first grader and a seventh grader.
 */
export const DEEDS: Deed[] = [
  { id: "well-stones", title: "Count the Well Stones", story: "Old Bram's bucket keeps coming up dry. Count the stones the well-diggers need before the cart leaves.", buildingId: "well", area: "math", questionCount: Q, mechanic: "measure" },
  { id: "well-signs", title: "Signs for the Well", story: "The well needs a sign every traveler can read. Help the sign-painter get the words just right.", buildingId: "well", area: "reading", questionCount: TRAIL_CLUES, mechanic: "trail" },
  { id: "well-water", title: "What Makes Water Clean", story: "The well-keeper wants to know why the deep water runs clear. Share what you know about the world.", buildingId: "well", area: "science", questionCount: SCIENCE_SORTS, mechanic: "lock" },
  { id: "mill-sacks", title: "Sacks at the Mill", story: "Miller Tessa is counting sacks of grain. Add them up so the baker knows what to expect.", buildingId: "mill", area: "math", questionCount: Q, mechanic: "measure" },
  { id: "mill-ledger", title: "The Miller's Ledger", story: "Clerk Odo keeps the mill's ledger and his spelling wobbles. Spell each entry so the record stands.", buildingId: "mill", area: "language", questionCount: RUNE_WORDS, mechanic: "rune", stops: RUNE_STOPS },
  { id: "mill-wheel", title: "The Turning Wheel", story: "The great wheel turns with the river. Explain what moves it and the millwright will trust the design.", buildingId: "mill", area: "science", questionCount: SCIENCE_SORTS, mechanic: "lock" },
  { id: "bridge-planks", title: "Planks for the Bridge", story: "The carpenter needs planks measured and matched. Count carefully so nothing falls short.", buildingId: "bridge", area: "math", questionCount: Q, mechanic: "measure", monsterStory: "Shadow blobs chewed the old planks. Count the new ones so the carpenter can chase the dark off the river." },
  { id: "bridge-toll", title: "The Toll-Keeper's Words", story: "The toll-keeper greets every traveler. Help her choose the right words for the welcome sign.", buildingId: "bridge", area: "language", questionCount: RUNE_WORDS, mechanic: "rune", stops: RUNE_STOPS },
  { id: "chapel-bell", title: "Ring the Bell", story: "The bell-founder needs numbers for the mold. Work them out and the chapel gets its voice.", buildingId: "chapel", area: "math", questionCount: Q, mechanic: "measure" },
  { id: "chapel-scroll", title: "The Chapel Scroll", story: "Sister Wren found a faded scroll by the chapel door. Read its words aloud so she can copy them fresh.", buildingId: "chapel", area: "reading", questionCount: TRAIL_CLUES, mechanic: "trail" },
  { id: "chapel-stars", title: "Stars Over the Chapel", story: "The chapel window faces the night sky. Tell the glazier what shines there.", buildingId: "chapel", area: "science", questionCount: SCIENCE_SORTS, mechanic: "lock" },
  { id: "market-prices", title: "Market Prices", story: "Stall-keepers argue over prices. Settle the sums and the market opens on time.", buildingId: "market", area: "math", questionCount: Q, mechanic: "measure" },
  { id: "market-crier", title: "The Town Crier", story: "The crier needs the right word for every announcement. Lend him your vocabulary.", buildingId: "market", area: "language", questionCount: RUNE_WORDS, mechanic: "rune", stops: RUNE_STOPS },
  { id: "library-shelves", title: "Shelving the Scrolls", story: "The librarian sorts scrolls by number. Help her find each one's place.", buildingId: "library", area: "math", questionCount: Q, mechanic: "measure" },
  { id: "library-catalog", title: "The Catalog", story: "Librarian Hesper is writing a card for every scroll. Read each name so the catalog is true.", buildingId: "library", area: "reading", questionCount: TRAIL_CLUES, mechanic: "trail" },
  { id: "library-scribe", title: "The Scribe's Test", story: "The head scribe tests every helper's spelling. Pass it and the copying begins.", buildingId: "library", area: "language", questionCount: RUNE_WORDS, mechanic: "rune", stops: RUNE_STOPS },
  { id: "watchtower-height", title: "How Tall the Tower", story: "The mason counts stones for each level. Add them up so the tower stands straight.", buildingId: "watchtower", area: "math", questionCount: Q, mechanic: "measure", monsterStory: "A skeleton crew knocked the tower crooked. Count the stones the mason needs to set it right." },
  { id: "watchtower-signals", title: "Lantern Signals", story: "The watch signals with light. Explain how light travels and the signals will carry.", buildingId: "watchtower", area: "science", questionCount: SCIENCE_SORTS, mechanic: "lock" },
  { id: "garden-beds", title: "Garden Beds", story: "The gardener lays out beds in rows. Work the numbers and every seed finds a home.", buildingId: "garden", area: "math", questionCount: Q, mechanic: "measure" },
  { id: "garden-bees", title: "The Bee Keeper", story: "The bee keeper wants to know what her bees need. Tell her, and the garden will hum.", buildingId: "garden", area: "science", questionCount: SCIENCE_SORTS, mechanic: "lock" },
];

/**
 * The side quests played as trails: every reading one (R-H9). The trails a hero met lately are read
 * from these runs alone (`loadRecentTrailIds`), so the memory spans every reading side quest at once.
 */
export const TRAIL_DEED_IDS: readonly string[] = DEEDS.filter((d) => d.mechanic === "trail").map((d) => d.id);

/**
 * The side quests played as runes (R-I14): every language one, since slice 6 (I11). The rune entries
 * a hero met lately are read from these runs and from rune world runs
 * together (`loadRecentRuneKeys`), so the memory spans side quests and objects fixed any time.
 */
export const RUNE_DEED_IDS: readonly string[] = DEEDS.filter((d) => d.mechanic === "rune").map((d) => d.id);

export function findDeed(id: string): Deed | null {
  return DEEDS.find((d) => d.id === id) ?? null;
}

export function deedsForBuilding(buildingId: string): Deed[] {
  return DEEDS.filter((d) => d.buildingId === buildingId);
}

export function deedStory(deed: Deed, tone: "gentle" | "monsters"): string {
  return tone === "monsters" && deed.monsterStory ? deed.monsterStory : deed.story;
}

/**
 * How many tasks a run of `deed` asks, given the grown-up's side-quest length (RF-j). A deed of the
 * full eight asks exactly that length. A shorter deed asks its share of it (four of eight is half),
 * rounded, and never fewer than one — but only when the run actually draws its mechanic
 * (`drawsMechanic`, decided by the engine from the skills it practises): a science side quest that
 * falls back to multiple choice (locks off, the gate, or a skill no sort pool credits) is the whole
 * length it always was, since its shortness is for the sorts. A reading side quest is the same with
 * its trails (R-H10): half when it walks, the whole length when it plays as multiple choice (trails
 * off, the gate, or a grown-up's focus no trail can play, R-H22). A language side quest is the same with
 * its runes, and its share is then held to its `stops` (R-I9): two to three, whatever the length.
 */
export function deedRunLength(deed: Pick<Deed, "questionCount" | "stops">, sideQuestLength: number, drawsMechanic: boolean): number {
  if (!drawsMechanic) return sideQuestLength;
  const share = Math.max(1, Math.round((sideQuestLength * deed.questionCount) / SIDE_QUEST_QUESTIONS));
  return deed.stops ? Math.min(deed.stops.max, Math.max(deed.stops.min, share)) : share;
}
