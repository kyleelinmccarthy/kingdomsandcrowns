import { timeToMinutes } from "./schedule-days";

export type RealmAccessMode = "earned" | "scheduled" | "both";
export type LedgerKind = "earned" | "granted" | "spent";
export type LedgerRow = { kind: LedgerKind; minutes: number };
export type TimeBlock = { startTime: string; endTime: string };

export type RealmSettingsLike = {
  enabled: boolean;
  accessMode: RealmAccessMode;
  offHoursEnabled: boolean;
  dailyCapMinutes: number;
};

export type AccessInput = {
  timeOfDay: string; // "HH:mm"
  isSchoolDay: boolean;
  settings: RealmSettingsLike;
  ledgerToday: LedgerRow[];
  classBlocksToday: TimeBlock[];
  recessBlocksToday: TimeBlock[];
};

export type AccessDenied = "disabled" | "cap_reached" | "school_hours" | "outside_recess" | "no_minutes";

export type AccessResult =
  | { allowed: true; minutesRemaining: number; source: "off_hours" | "recess" | "earned" }
  | { allowed: false; reason: AccessDenied };

const TIME = /^\d{2}:\d{2}$/;

export function minutesSpent(rows: LedgerRow[]): number {
  return rows.filter((r) => r.kind === "spent").reduce((sum, r) => sum + r.minutes, 0);
}

/** Earned + granted − spent. Never negative: an over-spend is a cap problem, not debt. */
export function ledgerBalance(rows: LedgerRow[]): number {
  const credit = rows.filter((r) => r.kind !== "spent").reduce((sum, r) => sum + r.minutes, 0);
  return Math.max(0, credit - minutesSpent(rows));
}

function blockContains(block: TimeBlock, timeOfDay: string): boolean {
  return block.startTime <= timeOfDay && timeOfDay < block.endTime;
}

/**
 * "School hours" run from the first class to the end of the last one; the gaps
 * between classes are still school. A time we can't read counts as school so
 * a broken clock never opens the Realm.
 */
export function isOutsideSchoolHours(timeOfDay: string, isSchoolDay: boolean, classBlocks: TimeBlock[]): boolean {
  if (!isSchoolDay || classBlocks.length === 0) return true;
  if (!TIME.test(timeOfDay)) return false;
  const first = classBlocks.map((b) => b.startTime).sort()[0];
  const last = classBlocks.map((b) => b.endTime).sort().at(-1)!;
  return timeOfDay < first || timeOfDay >= last;
}

/** The rules, in order. Every allowed result is already capped by the daily ceiling. */
export function computeRealmAccess(input: AccessInput): AccessResult {
  const { timeOfDay, isSchoolDay, settings, ledgerToday, classBlocksToday, recessBlocksToday } = input;
  if (!settings.enabled) return { allowed: false, reason: "disabled" };

  const spent = minutesSpent(ledgerToday);
  const headroom = settings.dailyCapMinutes - spent;
  if (headroom <= 0) return { allowed: false, reason: "cap_reached" };

  if (settings.offHoursEnabled && isOutsideSchoolHours(timeOfDay, isSchoolDay, classBlocksToday)) {
    return { allowed: true, minutesRemaining: headroom, source: "off_hours" };
  }

  const usesRecess = settings.accessMode === "scheduled" || settings.accessMode === "both";
  const usesEarned = settings.accessMode === "earned" || settings.accessMode === "both";
  const validTime = TIME.test(timeOfDay);

  if (usesRecess && validTime) {
    const block = recessBlocksToday.find((b) => blockContains(b, timeOfDay));
    if (block) {
      const left = timeToMinutes(block.endTime) - timeToMinutes(timeOfDay);
      return { allowed: true, minutesRemaining: Math.min(left, headroom), source: "recess" };
    }
  }

  if (usesEarned) {
    const balance = ledgerBalance(ledgerToday);
    if (balance > 0) {
      return { allowed: true, minutesRemaining: Math.min(balance, headroom), source: "earned" };
    }
  }

  if (usesEarned) return { allowed: false, reason: "no_minutes" };
  if (usesRecess) return { allowed: false, reason: "outside_recess" };
  return { allowed: false, reason: "school_hours" };
}
