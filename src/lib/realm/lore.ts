/**
 * THE LORE PAGES: ten short pages a hero finds in the world's locks and keeps in the Found pages
 * section of the Chronicle book (`getChronicle`). Pure data, in the Realm's voice: each chest gives
 * one as its last reward, and each vault door gives the page for the place its map leads to.
 * `lore.test.ts` holds every page to two to four sentences, a short title, no grade, no
 * "behind" or "ahead", and no markup: a child is never told where they stand against anyone.
 */

export type LoreId =
  | "the-first-lock"
  | "the-locksmith"
  | "the-castle-cellar"
  | "the-scribes-cipher"
  | "the-glasshouse-key"
  | "ringstones-map"
  | "highcairn-map"
  | "longwater-map"
  | "farfurrow-map"
  | "appleway-map";

export const LORE: Readonly<Record<LoreId, { title: string; text: string }>> = {
  "the-first-lock": {
    title: "The First Lock",
    text: "Long ago a smith made a lock with no key. Anyone clever enough to see how its pieces fit could open it. The village kept the lock, and the smith's cleverness was never forgotten.",
  },
  "the-locksmith": {
    title: "The Locksmith",
    text: "Hobb the locksmith never carried a key. A lock is only a question, he used to say, and a question is only waiting for you. Every chest on the east lane is one of his.",
  },
  "the-castle-cellar": {
    title: "The Castle Cellar",
    text: "At the back of the castle wall, the old stewards kept a chest shut with a puzzle instead of a key. They wanted whoever opened it to have thought hard first. The cellar below is still said to be full of good things.",
  },
  "the-scribes-cipher": {
    title: "The Scribe's Cipher",
    text: "The scribes of the library wrote their secrets in a cipher of their own. Each letter hid inside another, and only a patient reader could pull them out. This page is the first one they ever got right.",
  },
  "the-glasshouse-key": {
    title: "The Glasshouse Key",
    text: "The glasshouse never had a key, only a puzzle on its chest. The gardeners say a mind that works through a puzzle works gently with plants too. That is why the herbs in there are so well tended.",
  },
  "ringstones-map": {
    title: "A Map of the High Country",
    text: "The ringstone keepers drew a map of some of the highest ground in the realm. Up there the wind never stops, and the whole island lies beneath your feet. Follow the dotted line, and bring a warm cloak.",
  },
  "highcairn-map": {
    title: "The Second Summit",
    text: "The cairn builders marked another high place on their map, a summit with a very long view. Climb it on a clear day and you can find the village by its chimney smoke. Nobody has finished counting the steps.",
  },
  "longwater-map": {
    title: "The Hidden Cove",
    text: "The boatmen of Longwater kept a map to a quiet cove on the shore. Its sand is soft, and a boat is sometimes pulled up there. They never told anyone where it was, and now it is yours.",
  },
  "farfurrow-map": {
    title: "The Glade in the Deep Wood",
    text: "The farmers of Farfurrow loved a clearing in the deep wood, where the old trees stand back. They marked it on a scrap of map and shut the scrap in a vault. Go quietly, and the glade may let you stay a while.",
  },
  "appleway-map": {
    title: "The Hollow Past the Road's End",
    text: "Appleway's road ends at a cart of apples, but this map goes further, to a hollow in the deep wood. The carter drew it in apple-juice ink. Follow it quietly, because the woods are sleepy by day.",
  },
};

export const LORE_IDS = Object.keys(LORE) as LoreId[];
