import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getFamily, getFamilies } from "@/lib/actions/family";
import { getBanishedChildren } from "@/lib/actions/children";
import { resolveActiveChild } from "@/lib/actions/resolve-child";
import { getSubjects } from "@/lib/actions/subjects";
import { getChildBadges } from "@/lib/actions/badges";
import { getChildAvatarUnlocks } from "@/lib/actions/avatar";
import { getMakeupDays } from "@/lib/actions/makeup";
import { getFamilyMembers } from "@/lib/actions/guardians";
import { ensureFamilyLoginCode } from "@/lib/actions/child-auth";
import { getActor } from "@/lib/auth/actor";
import { FamilySetup } from "./family-setup";
import { ChildList } from "./child-list";
import { GuardiansManager } from "./guardians";
import { FamilySwitcher } from "./family-switcher";
import { FamilyLoginCode } from "./family-login-code";

export default async function SettingsPage() {
  const actor = await getActor();
  const { allChildren, isChildView } = await resolveActiveChild();
  const currentChildId = actor?.kind === "child" ? actor.childId : null;

  // Resolve the family. A PIN child has no Better Auth session, so getFamily()
  // can't find it — load by the child actor's familyId instead.
  let family: { id: string; familyName: string; timezone: string } | null = null;
  if (isChildView && actor?.kind === "child") {
    const rows = await db
      .select({
        id: schema.family.id,
        familyName: schema.family.familyName,
        timezone: schema.family.timezone,
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
  const loginCode =
    family && !isChildView && guardianData?.canManage
      ? await ensureFamilyLoginCode()
      : null;

  // Fetch subjects, badges, avatar unlocks and catch-up days for each visible child.
  const childrenWithSubjects = await Promise.all(
    children.map(async (child) => {
      const [subjects, earnedBadges, avatarUnlocks, makeupDays] = await Promise.all([
        getSubjects(child.id),
        getChildBadges(child.id),
        getChildAvatarUnlocks(child.id),
        getMakeupDays(child.id),
      ]);
      const { pinHash: _pinHash, ...rest } = child;
      return {
        ...rest,
        hasPin: !!_pinHash,
        subjects,
        earnedBadgeIds: earnedBadges.map((b) => b.badge.id),
        questUnlockedItems: avatarUnlocks.map((u) => u.itemId),
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
        </>
      ) : (
        <FamilySetup family={family} isChildView={isChildView} />
      )}
    </div>
  );
}
