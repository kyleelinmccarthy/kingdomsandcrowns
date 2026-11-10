"use client";

/**
 * How each task kind is shown and answered. A player hands `TaskPresenter` the current task and
 * the flow, and gets back that kind's work surface; the run flow around it (meter, feedback,
 * Next) stays the player's. To add a kind: add one key to `TASK_PRESENTERS`; the compiler asks
 * for it as soon as `TaskKind` widens.
 */
import type { ComponentType } from "react";
import type { ClientTask, ResponseByKind, TaskKind } from "@/lib/tasks/types";
import type { FlowState } from "@/lib/utils/deed-run-flow";
import { ChoicePresenter } from "./choice-presenter";

export type PresenterProps<K extends TaskKind> = {
  task: Extract<ClientTask, { kind: K }>;
  flow: FlowState;
  /** "board" is the Realm's villager board (and its number keys); "page" is the Side Quests page. */
  variant: "board" | "page";
  /** The player's depth setting for numbers; a kind with nothing to count ignores it. */
  numerals: boolean;
  /** Calm play: the surface keeps its sparkle still. */
  calm: boolean;
  /** The player is busy with a server call. Resolved and ruled-out are the surface's own business. */
  disabled: boolean;
  /** The pace guard's word and clue, shown above the surface while it is up. */
  nudge?: { line: string; hint: string } | null;
  onRespond(response: ResponseByKind[K]): void;
};

export const TASK_PRESENTERS: { [K in TaskKind]: ComponentType<PresenterProps<K>> } = {
  choice: ChoicePresenter,
};

export function TaskPresenter(props: PresenterProps<TaskKind>) {
  const Presenter = TASK_PRESENTERS[props.task.kind] as ComponentType<PresenterProps<TaskKind>>;
  const { nudge, ...surface } = props;
  const board = props.variant === "board";
  return (
    <>
      {nudge && (
        <div role="status" className={board ? "r3-nudge" : "rounded-md border border-gold-dim bg-muted/30 p-3 text-sm"}>
          <p className={board ? "r3-nudge-line" : "font-semibold"}>{nudge.line}</p>
          <p className={board ? "r3-nudge-hint" : "mt-1"}>{nudge.hint}</p>
        </div>
      )}
      <Presenter {...surface} />
    </>
  );
}
