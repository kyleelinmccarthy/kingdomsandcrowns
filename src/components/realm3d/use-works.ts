"use client";

import { useCallback, useMemo, useState } from "react";
import { IMPROVEMENT_IDS } from "@/lib/realm/improvements";
import { MATERIAL_IDS, type MaterialId } from "@/lib/realm/materials";
import { applyBuild, EMPTY_WORKS, type Works } from "@/lib/realm/works-state";
import type { RunSummary } from "@/lib/utils/deed-run-types";

/**
 * The hero's works as the frame holds them for the visit (`RealmData.works`, a snapshot taken on
 * entry): the plans board pins and builds through it, and the beacon and the stockpile read it, so
 * a build or a pin shows in the world without a reload. Absent counts as empty.
 *
 * `stockpile` is the balance for the canvas (`keep-yard.tsx`): a new object only when an amount
 * changes, so the canvas prop stays the same object across every other render. `built` is the same
 * for the improvements (`improvements.tsx`): the highest level per plan, a new object only when a
 * level changes.
 */
export function useWorks(initial: Works | undefined) {
  const [works, setWorks] = useState<Works>(() => initial ?? EMPTY_WORKS);
  /** A finished build run's outcome: the balance always, the level and its plaque when it stood. */
  const applyBuildResult = useCallback((improvement: NonNullable<RunSummary["improvement"]>) => setWorks((w) => applyBuild(w, improvement)), []);
  /** The pin the server took: one plan, or none. */
  const setPinned = useCallback((id: string | null) => setWorks((w) => ({ ...w, pinned: id })), []);
  const balanceKey = MATERIAL_IDS.map((m) => works.balance[m] ?? 0).join(",");
  const stockpile = useMemo(() => {
    const amounts = balanceKey.split(",").map(Number);
    return Object.fromEntries(MATERIAL_IDS.map((m, i) => [m, amounts[i]])) as Readonly<Record<MaterialId, number>>;
  }, [balanceKey]);
  const builtKey = IMPROVEMENT_IDS.map((id) => works.built[id] ?? 0).join(",");
  const built = useMemo(() => {
    const levels = builtKey.split(",").map(Number);
    return Object.fromEntries(IMPROVEMENT_IDS.flatMap((id, i) => (levels[i] > 0 ? [[id, levels[i]]] : []))) as Readonly<Record<string, number>>;
  }, [builtKey]);
  return { works, stockpile, built, applyBuildResult, setPinned };
}
