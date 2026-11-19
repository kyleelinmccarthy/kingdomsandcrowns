// Materials: what real schoolwork brings to the Realm, and how building spends it.
// Pure and client-safe: no db, no server code, no value imports (a script imports this by relative path).
import type { GameIconName } from "@/components/game-icon";

export type MaterialId = "stone" | "ink" | "herbs" | "thread" | "dye" | "timber";

/** Catalog order. It is also the order subject words are matched in, so the first material with a matching word wins. */
export const MATERIAL_IDS: readonly MaterialId[] = ["stone", "ink", "herbs", "thread", "dye", "timber"];

export const MATERIALS: Record<MaterialId, { label: string; plural: string; color: string; icon: GameIconName }> = {
  stone: { label: "Stone", plural: "Stone", color: "#8a94a0", icon: "rock" },
  ink: { label: "Ink", plural: "Ink", color: "#3b4a8c", icon: "pencil" },
  herbs: { label: "Herbs", plural: "Herbs", color: "#4f9a5a", icon: "flower" },
  thread: { label: "Thread", plural: "Thread", color: "#c0714f", icon: "link" },
  dye: { label: "Dye", plural: "Dye", color: "#a65bbf", icon: "droplet" },
  timber: { label: "Timber", plural: "Timber", color: "#9a6b3c", icon: "box" },
};

export function isMaterialId(v: unknown): v is MaterialId {
  return typeof v === "string" && (MATERIAL_IDS as readonly string[]).includes(v);
}

// Whole words only ("Smarts" is not art), like defaultSchoolForSubject.
const MATERIAL_WORDS: [MaterialId, string[]][] = [
  ["stone", ["math", "mathematics", "arithmetic", "algebra", "geometry", "calculus"]],
  ["ink", ["reading", "writing", "ela", "english", "language", "spelling", "grammar", "literature", "phonics", "handwriting"]],
  ["herbs", ["science", "biology", "chemistry", "physics", "nature"]],
  ["thread", ["history", "social", "studies", "geography", "civics"]],
  ["dye", ["art", "music", "drawing", "painting"]],
];

/** Best-guess material for a subject name. Anything unmatched brings timber. */
export function defaultMaterialForSubject(name: string): MaterialId {
  const words = name.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  for (const [material, list] of MATERIAL_WORDS) {
    if (words.some((w) => list.includes(w))) return material;
  }
  return "timber";
}

/** A grown-up's pick wins; with none (or a stale value), the subject's name decides. */
export function resolveMaterial(subject: { name: string; material: string | null }): MaterialId {
  return isMaterialId(subject.material) ? subject.material : defaultMaterialForSubject(subject.name);
}

export type MaterialRow = {
  materialId: string;
  amount: number;
  kind: "earned" | "spent";
  sourceAssignmentId: string | null;
  createdAt: number;
};

type Amounts = Partial<Record<MaterialId, number>>;

function zeroBalance(): Record<MaterialId, number> {
  return { stone: 0, ink: 0, herbs: 0, thread: 0, dye: 0, timber: 0 };
}

/** Earned minus spent per material. Unknown ids are ignored; nothing is ever negative. */
export function materialBalance(rows: readonly MaterialRow[]): Record<MaterialId, number> {
  const balance = zeroBalance();
  for (const r of rows) {
    if (!isMaterialId(r.materialId)) continue;
    balance[r.materialId] += r.kind === "earned" ? r.amount : -r.amount;
  }
  for (const id of MATERIAL_IDS) balance[id] = Math.max(0, balance[id]);
  return balance;
}

const MAX_SOURCES = 12;

/**
 * Plan a spend. Each costed material is paid from its own balance, and any shortfall from timber
 * (the wildcard, so PE and music lessons still build the kingdom). Sources are found by treating each
 * material's earned rows as a FIFO queue of units: earlier spends eat the oldest units, and this
 * spend takes the next ones; every earned row it touches names its quest, oldest first.
 */
export function allocateSpend(
  cost: Amounts,
  rows: readonly MaterialRow[],
):
  | { ok: true; spend: Amounts; sources: string[] }
  | { ok: false; short: Amounts } {
  const balance = materialBalance(rows);
  const spend: Amounts = {};
  const gap: Amounts = {}; // what each non-timber material lacks, to be paid from timber
  let timberNeed = cost.timber ?? 0;
  for (const id of MATERIAL_IDS) {
    if (id === "timber") continue;
    const want = cost[id] ?? 0;
    const own = Math.min(want, balance[id]);
    if (own > 0) spend[id] = own;
    if (want > own) {
      gap[id] = want - own;
      timberNeed += want - own;
    }
  }

  const timberMissing = timberNeed - balance.timber;
  if (timberMissing > 0) {
    // Name the missing amounts against the materials that were short, then any timber asked for directly.
    const short: Amounts = {};
    let left = timberMissing;
    for (const id of MATERIAL_IDS) {
      const g = gap[id] ?? 0;
      if (g > 0 && left > 0) {
        short[id] = Math.min(g, left);
        left -= short[id];
      }
    }
    if (left > 0) short.timber = left;
    return { ok: false, short };
  }
  if (timberNeed > 0) spend.timber = timberNeed;

  const touched: { createdAt: number; order: number; id: string }[] = [];
  const sorted = rows
    .map((r, order) => ({ r, order }))
    .filter(({ r }) => r.kind === "earned" && isMaterialId(r.materialId))
    .sort((a, b) => a.r.createdAt - b.r.createdAt || a.order - b.order);
  for (const id of MATERIAL_IDS) {
    const amount = spend[id] ?? 0;
    if (amount === 0) continue;
    const from = rows.reduce((n, r) => (r.kind === "spent" && r.materialId === id ? n + r.amount : n), 0);
    const to = from + amount;
    let start = 0; // first unit of the row being looked at
    for (const { r, order } of sorted) {
      if (r.materialId !== id) continue;
      const end = start + r.amount;
      if (end > from && start < to && r.sourceAssignmentId) {
        touched.push({ createdAt: r.createdAt, order, id: r.sourceAssignmentId });
      }
      start = end;
    }
  }
  touched.sort((a, b) => a.createdAt - b.createdAt || a.order - b.order);
  const sources: string[] = [];
  for (const t of touched) {
    if (sources.length === MAX_SOURCES) break;
    if (!sources.includes(t.id)) sources.push(t.id);
  }
  return { ok: true, spend, sources };
}

/** How tall a stockpile heap stands: empty, then 1-3, 4-9, 10 or more. */
export function heapSize(n: number): 0 | 1 | 2 | 3 {
  if (n <= 0) return 0;
  if (n <= 3) return 1;
  if (n <= 9) return 2;
  return 3;
}
