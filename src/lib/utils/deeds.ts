import type { SkillArea } from "./skills";

export type Deed = {
  id: string;
  title: string;
  story: string;          // gentle default
  monsterStory?: string;  // only when the story mentions an opponent
  buildingId: string;
  area: SkillArea;
  questionCount: number;
};

const Q = 8;

/**
 * Deeds never name a skill: the engine picks skills for the hero's band and
 * the deed's area, so one story serves a first grader and a seventh grader.
 */
export const DEEDS: Deed[] = [
  { id: "well-stones", title: "Count the Well Stones", story: "Old Bram's bucket keeps coming up dry. Count the stones the well-diggers need before the cart leaves.", buildingId: "well", area: "math", questionCount: Q },
  { id: "well-signs", title: "Signs for the Well", story: "The well needs a sign every traveler can read. Help the sign-painter get the words just right.", buildingId: "well", area: "reading", questionCount: Q },
  { id: "well-water", title: "What Makes Water Clean", story: "The well-keeper wants to know why the deep water runs clear. Share what you know about the world.", buildingId: "well", area: "science", questionCount: Q },
  { id: "mill-sacks", title: "Sacks at the Mill", story: "Miller Tessa is counting sacks of grain. Add them up so the baker knows what to expect.", buildingId: "mill", area: "math", questionCount: Q },
  { id: "mill-ledger", title: "The Miller's Ledger", story: "Every sack is written in the ledger. Spell each entry so the record stands.", buildingId: "mill", area: "language", questionCount: Q },
  { id: "mill-wheel", title: "The Turning Wheel", story: "The great wheel turns with the river. Explain what moves it and the millwright will trust the design.", buildingId: "mill", area: "science", questionCount: Q },
  { id: "bridge-planks", title: "Planks for the Bridge", story: "The carpenter needs planks measured and matched. Count carefully so nothing falls short.", buildingId: "bridge", area: "math", questionCount: Q, monsterStory: "Shadow blobs chewed the old planks. Count the new ones so the carpenter can chase the dark off the river." },
  { id: "bridge-toll", title: "The Toll-Keeper's Words", story: "The toll-keeper greets every traveler. Help her choose the right words for the welcome sign.", buildingId: "bridge", area: "language", questionCount: Q },
  { id: "chapel-bell", title: "Ring the Bell", story: "The bell-founder needs numbers for the mold. Work them out and the chapel gets its voice.", buildingId: "chapel", area: "math", questionCount: Q },
  { id: "chapel-scroll", title: "The Chapel Scroll", story: "A faded scroll hangs by the door. Read its words aloud so they can be copied fresh.", buildingId: "chapel", area: "reading", questionCount: Q },
  { id: "chapel-stars", title: "Stars Over the Chapel", story: "The chapel window faces the night sky. Tell the glazier what shines there.", buildingId: "chapel", area: "science", questionCount: Q },
  { id: "market-prices", title: "Market Prices", story: "Stall-keepers argue over prices. Settle the sums and the market opens on time.", buildingId: "market", area: "math", questionCount: Q },
  { id: "market-crier", title: "The Town Crier", story: "The crier needs the right word for every announcement. Lend him your vocabulary.", buildingId: "market", area: "language", questionCount: Q },
  { id: "library-shelves", title: "Shelving the Scrolls", story: "The librarian sorts scrolls by number. Help her find each one's place.", buildingId: "library", area: "math", questionCount: Q },
  { id: "library-catalog", title: "The Catalog", story: "Every scroll gets a card with its name. Read each name so the catalog is true.", buildingId: "library", area: "reading", questionCount: Q },
  { id: "library-scribe", title: "The Scribe's Test", story: "The head scribe tests every helper's spelling. Pass it and the copying begins.", buildingId: "library", area: "language", questionCount: Q },
  { id: "watchtower-height", title: "How Tall the Tower", story: "The mason counts stones for each level. Add them up so the tower stands straight.", buildingId: "watchtower", area: "math", questionCount: Q, monsterStory: "A skeleton crew knocked the tower crooked. Count the stones the mason needs to set it right." },
  { id: "watchtower-signals", title: "Lantern Signals", story: "The watch signals with light. Explain how light travels and the signals will carry.", buildingId: "watchtower", area: "science", questionCount: Q },
  { id: "garden-beds", title: "Garden Beds", story: "The gardener lays out beds in rows. Work the numbers and every seed finds a home.", buildingId: "garden", area: "math", questionCount: Q },
  { id: "garden-bees", title: "The Bee Keeper", story: "The bee keeper wants to know what her bees need. Tell her, and the garden will hum.", buildingId: "garden", area: "science", questionCount: Q },
];

export function findDeed(id: string): Deed | null {
  return DEEDS.find((d) => d.id === id) ?? null;
}

export function deedsForBuilding(buildingId: string): Deed[] {
  return DEEDS.filter((d) => d.buildingId === buildingId);
}

export function deedStory(deed: Deed, tone: "gentle" | "monsters"): string {
  return tone === "monsters" && deed.monsterStory ? deed.monsterStory : deed.story;
}
