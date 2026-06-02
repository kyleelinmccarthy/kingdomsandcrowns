/**
 * Grants or revokes admin access by email.
 * Run with:
 *   npx tsx src/lib/db/make-admin.ts user@example.com          # grant
 *   npx tsx src/lib/db/make-admin.ts user@example.com --revoke # revoke
 *
 * Or via the package script: npm run db:make-admin -- user@example.com
 */
import { eq } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:./local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = drizzle(client, { schema });

async function main() {
  const email = process.argv[2];
  const revoke = process.argv.includes("--revoke");
  if (!email) {
    console.error("Usage: npx tsx src/lib/db/make-admin.ts <email> [--revoke]");
    process.exit(1);
  }

  const result = await db
    .update(schema.user)
    .set({ isAdmin: !revoke, updatedAt: new Date() })
    .where(eq(schema.user.email, email))
    .returning({ id: schema.user.id, email: schema.user.email, isAdmin: schema.user.isAdmin });

  if (result.length === 0) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  const u = result[0];
  console.log(`${u.isAdmin ? "Granted" : "Revoked"} admin for ${u.email} (${u.id}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
