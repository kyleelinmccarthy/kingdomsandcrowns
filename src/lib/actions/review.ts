"use server";

import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { isChildActor, requireChildAccess } from "@/lib/auth/access";
import { placeById } from "@/lib/realm/layout";
import { findSkill } from "@/lib/utils/skills";
import type { PoolItem } from "@/lib/utils/deed-engine";
import { RUN_EFFECTS } from "@/lib/utils/deed-scoring";
import { CLOSED, HERO_ONLY, NOT_IN_CHRONICLE } from "@/lib/utils/deed-refusals";
import { buildReviewRun } from "@/lib/utils/review-run";
import { QUICK_REVIEW_TITLE, REVIEW_STORY, stoneTitle } from "@/lib/utils/review-copy";
import type { RunStart } from "@/lib/utils/deed-run-types";
import { findOpenRun, insertRun, loadMasteryRows, loadRecentMisses, resumedStart } from "@/lib/services/deed-run-store";
import { loadHeroLevels } from "@/lib/services/deeds";
import { loadFocusSkillIds } from "@/lib/services/learning-focus";
import { loadRealmSettings } from "@/lib/services/realm-play";
import { loadReviewDue, masteryTiming } from "@/lib/services/review";

/** Where a review run is asked from: a riddle stone out in the Realm, or the Side Quests page. */
export type ReviewOrigin = { kind: "stone"; placeId: string } | { kind: "page" };

/** A short interleaved set from what the hero has learned; it teaches and pays nothing. */
export async function startReviewRun(childId: string, origin: ReviewOrigin): Promise<RunStart | { empty: true }> {
  const { access } = await requireChildAccess(childId, { write: true });
  let header: RunStart["deed"];
  let sourceRef: string;
  // `origin` crosses the network: only the two known shapes are served, before any data is read.
  const raw = (typeof origin === "object" && origin !== null ? origin : {}) as { kind?: unknown; placeId?: unknown };
  if (raw.kind === "stone") {
    // In the world only the hero plays; a parent previewing the Realm never starts a run.
    if (!isChildActor(access)) throw new Error(HERO_ONLY);
    const place = typeof raw.placeId === "string" ? placeById(raw.placeId) : null;
    if (!place) throw new Error(NOT_IN_CHRONICLE);
    sourceRef = place.id;
    header = { id: `review:${place.id}`, title: stoneTitle(place.name), story: REVIEW_STORY, area: null };
  } else if (raw.kind === "page") {
    sourceRef = "page";
    header = { id: "review:page", title: QUICK_REVIEW_TITLE, story: REVIEW_STORY, area: null };
  } else {
    throw new Error(NOT_IN_CHRONICLE);
  }
  const hero = await loadHeroLevels(childId);
  if (!hero.enabled) throw new Error(CLOSED);

  const open = await findOpenRun(and(
    eq(schema.deedRun.childId, childId), eq(schema.deedRun.kind, "review"), eq(schema.deedRun.sourceRef, sourceRef),
  ));
  if (open) return resumedStart(open, header);

  const [masteryRows, recentMisses, settings, focusSkillIds] = await Promise.all([
    loadMasteryRows(childId), loadRecentMisses(childId), loadRealmSettings(childId), loadFocusSkillIds(childId),
  ]);
  const poolSkillIds = masteryRows
    .filter((m) => findSkill(m.skillId)?.source.kind === "pool")
    .map((m) => m.skillId);
  const poolRows = poolSkillIds.length > 0
    ? await db.select().from(schema.drillItem).where(inArray(schema.drillItem.skillId, poolSkillIds))
    : [];
  const poolItems: PoolItem[] = poolRows.map((r) => ({
    id: r.id, skillId: r.skillId, prompt: r.prompt, answer: r.answer,
    distractors: JSON.parse(r.distractors) as string[], readAloud: r.readAloud, level: r.level,
  }));
  const now = Date.now();
  const built = buildReviewRun({ mastery: masteryRows.map(masteryTiming), recentMisses, poolItems, focusSkillIds, now, seed: now >>> 0 });
  // Nothing learned yet: there is nothing to review, and nothing is written.
  if (built.questions.length === 0) return { empty: true };

  const masteryStart: Record<string, number> = {};
  for (const id of built.skillIds) masteryStart[id] = masteryRows.find((m) => m.skillId === id)?.level ?? 0;
  return insertRun({
    id: nanoid(), childId, deedId: null, sourceRef, skillIds: JSON.stringify(built.skillIds), band: hero.band,
    masteryStart: JSON.stringify(masteryStart),
    // Snapshotted, so a grown-up changing the setting mid-run never changes this run's rules.
    kind: "review", secondChances: RUN_EFFECTS.review.allowsSecondChances && settings.secondChances,
  }, built.questions, header);
}

/** Whether anything the hero has learned is past its review interval (read access only). */
export async function getReviewDue(childId: string): Promise<boolean> {
  await requireChildAccess(childId);
  return loadReviewDue(childId);
}
