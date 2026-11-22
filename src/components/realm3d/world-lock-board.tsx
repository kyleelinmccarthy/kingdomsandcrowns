"use client";

/**
 * A CHEST'S OR VAULT DOOR'S BOARD: E at one of the world's locks (`lib/realm/world-objects.ts`).
 * A shut lock starts its run of one puzzle at once (`startWorldLockRun`): walking up and pressing E
 * was the choice. The run is the villager board's own `DeedRun`, so the puzzle surface, second
 * chances and read-aloud are the same everywhere; its finish says "Done" and its leave link "Leave
 * the lock" (RG-m), and the result card says whether it opened and what was inside.
 *
 * The state machine is the shared shell's (`object-run-board.tsx`, RI-a / S14, which the rune
 * objects' board stands on too); this is its start and its copy. The page's view of what stands open
 * can be a day old (a chest relocks weekly, on the server's day), so the hero's board asks the
 * server even at a lock the frame draws open (final f1). What the server wrote is handed up
 * (`onOutcome`) the moment it answers, so the frame mirrors the opening; the server's answer that it
 * stands open (`{ held: true }`), at a lock the frame drew shut, is reported up as an "already-open" outcome.
 */

import { startWorldLockRun } from "@/lib/actions/world-locks";
import type { WorldObject } from "@/lib/realm/world-objects";
import type { Viewer } from "@/lib/realm3d/talk";
import type { WorldOutcome } from "@/lib/utils/deed-run-types";
import { WORLD_HERO_ONLY, WORLD_OPEN } from "@/lib/utils/deed-refusals";
import { CHEST_STORY, CHEST_TITLE, DOOR_STORY, DOOR_TITLE, LOCK_NOT_NOW, lockOpenLine } from "@/lib/utils/world-lock-copy";
import { ObjectRunBoard } from "./object-run-board";

export function WorldLockBoard({
  childId,
  object,
  open,
  viewer,
  numerals,
  profile,
  calm,
  onOutcome,
  onClose,
}: {
  childId: string | null;
  object: Pick<WorldObject, "id" | "type">;
  /** The lock stands open now, as the frame's view says. Read once, when the board opens. */
  open: boolean;
  viewer: Viewer;
  numerals: boolean;
  profile: { readAloud: boolean; untimed: boolean };
  calm: boolean;
  /** What the server wrote when the run finished: the frame mirrors it (`applyWorldOutcome`). */
  onOutcome: (o: WorldOutcome) => void;
  onClose: () => void;
}) {
  const door = object.type === "door";
  return (
    <ObjectRunBoard
      childId={childId}
      viewer={viewer}
      numerals={numerals}
      profile={profile}
      calm={calm}
      held={open}
      start={(c) => startWorldLockRun(c, object.id)}
      copy={{
        title: door ? DOOR_TITLE : CHEST_TITLE,
        story: door ? DOOR_STORY : CHEST_STORY,
        icon: "key",
        reading: "The lock turns…",
        notNow: LOCK_NOT_NOW,
        heroOnly: WORLD_HERO_ONLY,
        heldLine: (visitor) => lockOpenLine(door, visitor),
        refusedLine: WORLD_OPEN,
      }}
      onHeldRefused={() => onOutcome({ objectId: object.id, opened: false, reason: "already-open", rewards: [] })}
      onSummary={(s) => s.world && onOutcome(s.world)}
      onClose={onClose}
    />
  );
}
