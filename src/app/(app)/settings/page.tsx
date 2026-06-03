import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getFamily, getFamilies } from "@/lib/actions/family";
import { resolveActiveChild } from "@/lib/actions/resolve-child";
import { getSubjects } from "@/lib/actions/subjects";
import { getChildBadges } from "@/lib/actions/badges";
import { getChildAvatarUnlocks } from "@/lib/actions/avatar";
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
  const guardianData = family && !isChildView ? await getFamilyMembers() : null;
  const loginCode =
    family && !isChildView && guardianData?.canManage
      ? await ensureFamilyLoginCode()
      : null;

  // Fetch subjects, badges, and avatar unlocks for each visible child.
  const childrenWithSubjects = await Promise.all(
    children.map(async (child) => {
      const [subjects, earnedBadges, avatarUnlocks] = await Promise.all([
        getSubjects(child.id),
        getChildBadges(child.id),
        getChildAvatarUnlocks(child.id),
      ]);
      const { pinHash: _pinHash, ...rest } = child;
      return {
        ...rest,
        hasPin: !!_pinHash,
        subjects,
        earnedBadgeIds: earnedBadges.map((b) => b.badge.id),
        questUnlockedItems: avatarUnlocks.map((u) => u.itemId),
      };
    })
  );

  return (
    <div className="space-y-8">
      <div className="page-banner">
        <h1 className="page-title text-3xl">The Hearth</h1>
        {family ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-lg text-muted-foreground">
              <span className="font-semibold text-foreground">{family.familyName}</span>
              {" "}&middot; {isChildView ? "My Chronicle" : "Family Settings"}
            </p>
            {families.length > 1 && (
              <FamilySwitcher families={families} activeFamilyId={family.id} />
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
            children={childrenWithSubjects}
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
