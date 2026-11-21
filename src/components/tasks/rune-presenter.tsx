"use client";

/**
 * A rune's work surface (slice 6). The task's prompt is the player's question line, as any task's
 * is; this is what goes under it.
 *
 * - In the Realm, on a villager's board whose run is a rune walk (`onWalk`, R-I2): the line naming
 *   the objects that need a rune (`stops`) and "Set off" (the shared `SetOff`, RI-a / S13), which
 *   closes the board and hands the run to the walk. Nothing is spoken there (RI-a / S5).
 * - Everywhere else (the Side Quests page's picture run, a board with no walk, a stop of the walk):
 *   the rune stone, beside the object's picture (`RuneStone`).
 */
import { runeSetOffLine } from "@/lib/tasks/rune-copy";
import type { PresenterProps } from "./presenters";
import { RuneStone } from "./rune-stone";
import { SetOff } from "./set-off";

export function RunePresenter({ task, flow, variant, disabled, calm, stops, onWalk, onRespond }: PresenterProps<"rune">) {
  if (variant === "board" && onWalk) {
    // A run picked back up with every rune cast is at its finish step: nothing is left to walk to.
    return flow.phase === "resolved" ? null : <SetOff line={runeSetOffLine(stops ?? [])} onWalk={onWalk} />;
  }
  // A fresh stone for every word, and for its second chance: the word that missed is taken back.
  return <RuneStone key={`${flow.index}:${task.id}:${flow.ruledOut.length}`} task={task} flow={flow} variant={variant} disabled={disabled} calm={calm} onRespond={onRespond} />;
}
