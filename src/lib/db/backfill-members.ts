/**
 * Backfills family_member rows for every existing family, making the original
 * family.parentUserId the owner. Idempotent — guarded by the unique
 * (familyId, userId) index, so it's safe to run repeatedly.
 *
 * Run with:
 *   npx tsx src/lib/db/backfill-members.ts
 * Or via the package script:
 *   npm run db:backfill-members
 */
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:./local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = drizzle(client, { schema });

async function main() {
  const families = await db.select().from(schema.family);
  let created = 0;
  let skipped = 0;

  for (const fam of families) {
    if (!fam.parentUserId) {
      console.warn(`Family ${fam.id} (${fam.familyName}) has no parentUserId — skipping.`);
      skipped++;
      continue;
    }

    const existing = await db
      .select({ id: schema.familyMember.id })
      .from(schema.familyMember)
      .where(
        and(
          eq(schema.familyMember.familyId, fam.id),
          eq(schema.familyMember.userId, fam.parentUserId)
        )
      )
      .limit(1);

    if (existing[0]) {
      skipped++;
      continue;
    }

    const now = new Date();
    await db.insert(schema.familyMember).values({
      id: nanoid(),
      familyId: fam.id,
      userId: fam.parentUserId,
      role: "owner",
      permission: "edit",
      scope: "all",
      status: "active",
      invitedByUserId: null,
      createdAt: fam.createdAt ?? now,
      updatedAt: now,
    });
    created++;
  }

  console.log(`Backfill complete: ${created} owner member(s) created, ${skipped} skipped.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
