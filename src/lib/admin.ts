import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/**
 * Returns true if the given user is flagged as an admin in the database
 * (the `user.is_admin` column). Grant admin with the `db:make-admin` script
 * or by setting the column directly.
 */
export async function isAdminUser(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const rows = await db
    .select({ isAdmin: schema.user.isAdmin })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1);
  return rows[0]?.isAdmin === true;
}
