/**
 * Gives existing disciplines a school of magic by name. Subjects created
 * before the spellbook existed carry the column default ("none"); this sets
 * the same default-by-name rule new subjects get, and never touches a subject
 * that already has a school, so a grown-up's choice survives a re-run.
 *
 * Idempotent. Run with:
 *   npx tsx --env-file=.env.prod src/lib/db/backfill-spell-schools.ts
 * Add --dry-run to print the changes without writing them.
 */
import { eq } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { defaultSchoolForSubject } from "../utils/spell-schools";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:./local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const db = drizzle(client, { schema });
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const subjects = await db
    .select({ id: schema.subject.id, name: schema.subject.name, spellSchool: schema.subject.spellSchool })
    .from(schema.subject);
  let changed = 0;
  for (const s of subjects) {
    if (s.spellSchool !== "none") continue;
    const school = defaultSchoolForSubject(s.name);
    if (school === "none") continue;
    changed += 1;
    console.log(`${dryRun ? "[dry-run] " : ""}${s.name} → ${school}`);
    if (!dryRun) {
      await db.update(schema.subject).set({ spellSchool: school }).where(eq(schema.subject.id, s.id));
    }
  }
  console.log(`${changed} subject(s) ${dryRun ? "would be" : ""} assigned a school.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
