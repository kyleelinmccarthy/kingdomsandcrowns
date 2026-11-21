"use client";

/**
 * A RUNE OBJECT'S BOARD: E at one of the fifteen things that need a rune (`lib/realm/rune-objects.ts`),
 * any time, in a side quest or not. A broken object starts its run of one word at once
 * (`startRuneObjectRun`): the hero builds it on the rune stone, the same stone as the villager's board
 * and the walk. The state machine is the shared shell's (`object-run-board.tsx`, as the chests'
 * is); this is its start and its copy. A run's finish says "Done" and its leave link "Leave the
 * rune"; the result card says whether the rune worked (`talk.ts`).
 *
 * The page's view of what holds can be days old (an object breaks again on the server's day), so the
 * hero's board asks the server even at an object drawn fixed (RI-a / S20): a refusal as fixed says
 * the holds line, and a run that starts is the object broken again, played at once. A visiting
 * grown-up asks nothing. What the server wrote is handed up (`onOutcome`) the moment it answers, so
 * the frame mirrors the fix; a start refused as fixed at an object the frame drew broken (another
 * run fixed it) is reported up as "already-fixed".
 *
 * A grown-up cannot reach the hero-only finish refusal through here (they never start a run); the
 * server words it `RUNE_HERO_ONLY` all the same (`completeDeedRun`).
 */

import { startRuneObjectRun } from "@/lib/actions/rune-objects";
import type { RuneObject } from "@/lib/realm/rune-objects";
import type { Viewer } from "@/lib/realm3d/talk";
import { RUNE_HOLDS_LINE, RUNE_HOLDS_LINE_VISITOR, RUNE_NOT_NOW, RUNE_READING, RUNE_STORY, RUNE_TITLE } from "@/lib/tasks/rune-copy";
import type { RuneOutcome } from "@/lib/utils/deed-run-types";
import { RUNE_FIXED, RUNE_HERO_ONLY } from "@/lib/utils/deed-refusals";
import { ObjectRunBoard } from "./object-run-board";

export function RuneObjectBoard({
  childId,
  object,
  fixed,
  viewer,
  numerals,
  profile,
  calm,
  onOutcome,
  onClose,
}: {
  childId: string | null;
  object: Pick<RuneObject, "id">;
  /** The object stands fixed now, as the frame's view says. Read once, when the board opens. */
  fixed: boolean;
  viewer: Viewer;
  numerals: boolean;
  profile: { readAloud: boolean; untimed: boolean };
  calm: boolean;
  /** What the server wrote when the run finished: the frame mirrors it (`applyRuneOutcomes`). */
  onOutcome: (o: readonly RuneOutcome[]) => void;
  onClose: () => void;
}) {
  return (
    <ObjectRunBoard
      childId={childId}
      viewer={viewer}
      numerals={numerals}
      profile={profile}
      calm={calm}
      held={fixed}
      start={(c) => startRuneObjectRun(c, object.id)}
      heldRefusal={RUNE_FIXED}
      copy={{
        title: RUNE_TITLE,
        story: RUNE_STORY,
        icon: "sparkles",
        reading: RUNE_READING,
        notNow: RUNE_NOT_NOW,
        heroOnly: RUNE_HERO_ONLY,
        heldLine: (visitor) => (visitor ? RUNE_HOLDS_LINE_VISITOR : RUNE_HOLDS_LINE),
        refusedLine: RUNE_HOLDS_LINE,
      }}
      onHeldRefused={() => onOutcome([{ objectId: object.id, fixed: false, reason: "already-fixed" }])}
      onSummary={(s) => onOutcome(s.runes ?? [])}
      onClose={onClose}
    />
  );
}
