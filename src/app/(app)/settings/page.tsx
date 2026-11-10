import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getFamily, getFamilies } from "@/lib/actions/family";
import { getBanishedChildren } from "@/lib/actions/children";
import { resolveActiveChild } from "@/lib/actions/resolve-child";
import { getSubjects } from "@/lib/actions/subjects";
import { getChildBadges } from "@/lib/actions/badges";
import { getChildAvatarUnlocks } from "@/lib/actions/avatar";
import { getSeasons } from "@/lib/actions/seasons";
import { getLearningProfile } from "@/lib/actions/learning-profile";
import { getRealmSettings } from "@/lib/actions/realm-settings";
import { getRealmPlaySummary } from "@/lib/actions/realm-play";
import { getMasteryOverview } from "@/lib/actions/deeds";
import { loadHeroLevels } from "@/lib/services/deeds";
import { loadFocusSkillIds } from "@/lib/services/learning-focus";
import { focusWindow } from "@/lib/utils/focus";
import { getMakeupDays } from "@/lib/actions/makeup";
import { getFamilyMembers } from "@/lib/actions/guardians";
import { getBillingStatus } from "@/lib/actions/billing";
import { ensureFamilyLoginCode } from "@/lib/actions/child-auth";
import { getActor } from "@/lib/auth/actor";
import { GameFrame } from "@/components/game-frame";
import { FamilySetup } from "./family-setup";
import { ChildList } from "./child-list";
import { GuardiansManager } from "./guardians";
import { FamilySwitcher } from "./family-switcher";
import { FamilyLoginCode } from "./family-login-code";
import { UpkeepSettingsPanel } from "./upkeep-settings-panel";
import { BillingPanel } from "./billing-panel";

/**
 * What the focus panel needs for one hero: the skills inside their window (plain data) and the
 * picks still standing. Only called for a grown-up, after the page's own auth has resolved the
 * heroes; the service itself does no auth.
 */
async function loadFocus(childId: string) {
  const [levels, selected] = await Promise.all([loadHeroLevels(childId), loadFocusSkillIds(childId)]);
  const options = focusWindow(levels.grades).map(({ id, label, area }) => ({ id, label, area }));
  return { options, selected };
}

export default async function SettingsPage() {
  const actor = await getActor();
  const { allChildren, isChildView } = await resolveActiveChild();
  const currentChildId = actor?.kind === "child" ? actor.childId : null;

  // Resolve the family. A PIN child has no Better Auth session, so getFamily()
  // can't find it — load by the child actor's familyId instead.
  let family: {
    id: string;
    familyName: string;
    timezone: string;
    upkeepEnabled: boolean;
    upkeepRequiresApproval: boolean;
  } | null = null;
  if (isChildView && actor?.kind === "child") {
    const rows = await db
      .select({
        id: schema.family.id,
        familyName: schema.family.familyName,
        timezone: schema.family.timezone,
        upkeepEnabled: schema.family.upkeepEnabled,
        upkeepRequiresApproval: schema.family.upkeepRequiresApproval,
      })
      .from(schema.family)
      .where(eq(schema.family.id, actor.familyId))
      .limit(1);
    family = rows[0] ?? null;
  } else {
    family = await getFamily();
  }

  const children = allChildren;

  // Adult-only management data.
  const families = !isChildView ? await getFamilies() : [];
  // Soft-deleted heroes a parent can summon back (never shown to a child).
  const banishedKids = family && !isChildView
    ? (await getBanishedChildren()).map((c) => ({
        id: c.id,
        displayName: c.displayName,
        avatarConfig: c.avatarConfig,
        banishedAt: c.banishedAt ? c.banishedAt.toISOString() : null,
      }))
    : [];
  const guardianData = family && !isChildView ? await getFamilyMembers() : null;
  const billingStatus =
    family && !isChildView ? await getBillingStatus().catch(() => null) : null;
  const loginCode =
    family && !isChildView && guardianData?.canManage
      ? await ensureFamilyLoginCode()
      : null;

  // Fetch subjects, badges, avatar unlocks and catch-up days for each visible child.
  const childrenWithSubjects = await Promise.all(
    children.map(async (child) => {
      const [subjects, earnedBadges, avatarUnlocks, seasons, learningProfile, realmSettings, realmPlay, mastery, focus, makeupDays] = await Promise.all([
        getSubjects(child.id),
        getChildBadges(child.id),
        getChildAvatarUnlocks(child.id),
        getSeasons(child.id),
        isChildView ? null : getLearningProfile(child.id),
        isChildView ? null : getRealmSettings(child.id),
        isChildView ? null : getRealmPlaySummary(child.id),
        isChildView ? null : getMasteryOverview(child.id),
        isChildView ? null : loadFocus(child.id),
        getMakeupDays(child.id),
      ]);
      const { pinHash: _pinHash, ...rest } = child;
      return {
        ...rest,
        hasPin: !!_pinHash,
        subjects,
        earnedBadgeIds: earnedBadges.map((b) => b.badge.id),
        questUnlockedItems: avatarUnlocks.map((u) => u.itemId),
        seasons,
        learningProfile,
        realmSettings,
        realmPlay,
        mastery,
        focus,
        makeupDayDates: makeupDays.map((d) => ({ id: d.id, date: d.date, note: d.note })),
      };
    })
  );

  return (
    <div className="space-y-8">
      <div className="page-banner text-center">
        <h1 className="page-title text-3xl">The Hearth</h1>
        {family ? (
          <div className="relative flex flex-col items-center gap-2">
            <p className="text-lg text-muted-foreground">
              <span className="font-semibold text-foreground">{family.familyName}</span>
              {" "}&middot; {isChildView ? "My Chronicle" : "Family Settings"}
            </p>
            {families.length > 1 && (
              <div className="sm:absolute sm:right-0 sm:top-1/2 sm:-translate-y-1/2">
                <FamilySwitcher families={families} activeFamilyId={family.id} />
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground">Set up your family to get started.</p>
        )}
      </div>

      {family ? (
        <>
          <ChildList
            family={family}
            kids={childrenWithSubjects}
            banished={banishedKids}
            isChildView={isChildView}
            currentChildId={currentChildId}
            familyUpkeepEnabled={family.upkeepEnabled}
            familyRequiresApproval={family.upkeepRequiresApproval}
          />
          {guardianData && (
            <GuardiansManager
              members={guardianData.members}
              invites={guardianData.invites}
              canManage={guardianData.canManage}
              heroes={children.map((c) => ({ id: c.id, displayName: c.displayName }))}
            />
          )}
          {guardianData?.canManage && <FamilyLoginCode code={loginCode} />}
          {!isChildView && family && (
            <GameFrame>
              <UpkeepSettingsPanel
                enabled={family.upkeepEnabled}
                requiresApproval={family.upkeepRequiresApproval}
              />
            </GameFrame>
          )}
          {billingStatus?.canManage && (
            <GameFrame>
              <BillingPanel enabled={billingStatus.enabled} status={billingStatus.status} />
            </GameFrame>
          )}
        </>
      ) : (
        <FamilySetup family={family} isChildView={isChildView} />
      )}
    </div>
  );
}
