/**
 * Gives an EXISTING account an email + password sign-in (or replaces its password), alongside
 * whatever it already has — a Google-only account keeps Google. Never creates a user: sign-ups
 * are closed, and this isn't a way around that.
 *
 * The password is typed at a hidden prompt (twice), or read from stdin when piped, and is hashed
 * with Better Auth's own hashPassword, so it is exactly what email sign-in checks against.
 *
 *   # production (Turso)
 *   node --env-file=.env.prod scripts/set-password.mjs you@example.com
 *   # the local database (file:./local.db)
 *   node scripts/set-password.mjs you@example.com
 *
 * Uses TURSO_DATABASE_URL when set, otherwise the local database, as the app does.
 */
import { hashPassword } from "better-auth/crypto";
import { nanoid } from "nanoid";

const MIN = 8;
const MAX = 128; // keep in step with emailAndPassword in src/lib/auth/index.ts

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Usage: node scripts/set-password.mjs <email>");
  process.exit(1);
}

/** One line from stdin, echoing nothing when stdin is a terminal. */
async function readSecret(prompt) {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) {
    const chunks = [];
    for await (const c of stdin) chunks.push(c);
    return Buffer.concat(chunks).toString("utf8").split("\n")[0];
  }
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve) => {
    let value = "";
    const onData = (ch) => {
      if (ch === "\r" || ch === "\n" || ch === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        stdout.write("\n");
        resolve(value);
      } else if (ch === "\u0003") {
        stdout.write("\n");
        process.exit(130);
      } else if (ch === "\u007f" || ch === "\b") {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

const password = await readSecret("New password: ");
if (process.stdin.isTTY && (await readSecret("Again: ")) !== password) {
  console.error("The two entries didn't match. Nothing was changed.");
  process.exit(1);
}
if (password.length < MIN || password.length > MAX) {
  console.error(`Passwords must be ${MIN}–${MAX} characters. Nothing was changed.`);
  process.exit(1);
}
const hash = await hashPassword(password);
const now = new Date();

let result;
{
  const { createClient } = await import("@libsql/client");
  const db = createClient({ url: process.env.TURSO_DATABASE_URL || "file:./local.db", authToken: process.env.TURSO_AUTH_TOKEN });
  const secs = Math.floor(now.getTime() / 1000); // the SQLite schema stores timestamps in seconds
  const user = (await db.execute({ sql: "select id from user where lower(email) = ?", args: [email] })).rows[0];
  if (user) {
    const existing = (await db.execute({ sql: "select id from account where user_id = ? and provider_id = 'credential'", args: [user.id] })).rows[0];
    if (existing) {
      await db.execute({ sql: "update account set password = ?, updated_at = ? where id = ?", args: [hash, secs, existing.id] });
      result = "replaced the existing password";
    } else {
      await db.execute({
        sql: "insert into account (id, user_id, account_id, provider_id, password, created_at, updated_at) values (?, ?, ?, 'credential', ?, ?, ?)",
        args: [nanoid(), user.id, user.id, hash, secs, secs],
      });
      result = "added an email + password sign-in";
    }
  }
  db.close();
}

if (!result) {
  console.error(`No account found for ${email}. Nothing was changed (this script never creates accounts).`);
  process.exit(1);
}
console.log(`${email}: ${result}. Sign in with email + password now works.`);
