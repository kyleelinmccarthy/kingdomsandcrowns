"use client";

/**
 * THE QUIET GATE (spec §4.5). A child whose visit opens at 0 minutes, in a mode that earns, is
 * met here before the world: how minutes are earned (`earningLines`, said by the frame), a way to
 * play side quests right at the gate, and a way to walk on into the quiet world. A run finished
 * here pays like any other; the gate then asks again, and once there are minutes the walk becomes
 * a normal, clocked entry — "Enter the Realm".
 *
 * The world snapshots its kingdom when it mounts, so after any run here the village is fetched
 * again on the way in: a building raised at the gate stands when the child walks up to it. If that
 * fetch fails, the gate's own record of its runs (`applyDeedResult`) goes in instead.
 */

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { GameIcon } from "@/components/game-icon";
import { getRealmAccess } from "@/lib/actions/realm-play";
import { getRealmKingdom } from "@/lib/actions/realm";
import { surfacesFor, type RealmDepth } from "@/lib/realm/depth";
import { applyDeedResult, type KingdomState } from "@/lib/realm/kingdom-state";
import { renderSettingsFor } from "@/lib/realm/render-settings";
import { QUIET_LINE, wakeToast } from "@/lib/realm3d/quiet";
import type { AvatarConfig } from "@/lib/utils/avatar-catalog";
import type { LearningProfile } from "@/lib/utils/learning-profile";
import { isQuiet, type AccessResult } from "@/lib/utils/realm-access";
import type { DeedResult } from "./deed-board";
import { RealmScreen } from "./frame-hud";
import { GateQuestBoard } from "./gate-quest-board";

export function QuietGate({
  childId,
  heroName,
  portrait,
  earning,
  kingdom: opened,
  profile,
  depth,
  onEnter,
}: {
  childId: string;
  heroName: string;
  portrait: AvatarConfig | null;
  /** How minutes are earned (`earningLines`, joined), once the frame has it. */
  earning?: string;
  /** The kingdom the visit opened with (the frame's snapshot). */
  kingdom: KingdomState;
  profile: LearningProfile;
  depth: RealmDepth;
  /**
   * In: `access` is the gate's new answer once a run here has woken it (null walks in quiet);
   * `kingdom` is the village to open with after a run here (null when none was played).
   */
  onEnter: (access: AccessResult | null, kingdom: KingdomState | null) => void;
}) {
  const [board, setBoard] = useState(false);
  const [kingdom, setKingdom] = useState(opened);
  const [ran, setRan] = useState(false);
  const [awake, setAwake] = useState<Extract<AccessResult, { allowed: true }> | null>(null);
  const [entering, setEntering] = useState(false);
  // The re-check after a run is out: both ways wait for its answer. Numbered, so only the latest applies.
  const [checking, setChecking] = useState(false);
  const asked = useRef(0);
  const sideQuests = useRef<HTMLButtonElement>(null);
  const busy = entering || checking;

  function onResult(buildingId: string, result: DeedResult) {
    setKingdom((k) => applyDeedResult(k, buildingId, result, result.deed).state);
    setRan(true);
    const n = ++asked.current;
    setChecking(true);
    // A failed ask leaves the gate quiet; the world's own clock asks again once inside.
    getRealmAccess(childId)
      .then((access) => {
        if (n === asked.current) setAwake(access.allowed && !isQuiet(access) && access.minutesRemaining > 0 ? access : null);
      })
      .catch(() => {})
      .finally(() => {
        if (n === asked.current) setChecking(false);
      });
  }

  const closeBoard = useCallback(() => {
    setBoard(false);
    sideQuests.current?.focus();
  }, []);

  async function enter() {
    if (!ran) return onEnter(awake, null);
    setEntering(true);
    const fresh = await getRealmKingdom(childId).catch(() => kingdom);
    onEnter(awake, fresh);
  }

  return (
    <>
      <RealmScreen icon="castle" title={awake ? wakeToast(awake.minutesRemaining) : QUIET_LINE} portrait={portrait} heroName={heroName} extra={earning}>
        <button ref={sideQuests} type="button" className={`r3-menu-item${awake ? "" : " r3-menu-item--go"}`} disabled={busy} onClick={() => setBoard(true)}>
          <GameIcon name="scroll" className="r3-menu-icon" /> Side quests here
        </button>
        <button type="button" className={`r3-menu-item${awake ? " r3-menu-item--go" : ""}`} disabled={busy} onClick={() => void enter()}>
          <GameIcon name="castle" className="r3-menu-icon" /> {awake ? "Enter the Realm" : "Walk in the quiet Realm"}
        </button>
        <Link href="/tavern" className="r3-menu-item">
          Back to the Tavern
        </Link>
      </RealmScreen>
      {board && (
        <GateQuestBoard
          childId={childId}
          buildings={kingdom.buildings}
          heroName={heroName}
          numerals={surfacesFor(depth, profile).numerals}
          profile={{ readAloud: profile.readAloud, untimed: profile.untimed }}
          calm={!renderSettingsFor(profile, false).motion}
          onResult={onResult}
          onClose={closeBoard}
        />
      )}
    </>
  );
}
