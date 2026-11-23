import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";

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

/**
 * The signed-in admin's session, for admin-only server actions. Throws "Unauthorized" for anyone
 * else; admin pages check isAdminUser themselves and answer notFound instead, so the pages don't
 * advertise that they exist.
 */
export async function requireAdmin() {
  const session = await requireSession();
  if (!(await isAdminUser(session.user.id))) {
    throw new Error("Unauthorized");
  }
  return session;
}
