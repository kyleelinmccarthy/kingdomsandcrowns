/**
 * Takes a verified backup of the production database onto this computer, and keeps the newest
 * KEEP of them. Run weekly by the systemd timer from scripts/install-backup-timer.sh, or by hand:
 *
 *   npm run db:backup
 *
 * Settings come from BACKUP_CONFIG (default ~/.config/kingdoms-and-crowns/backup.env), which
 * lives outside the repo because it points at credentials:
 *
 *   BACKUP_DIR=/mnt/c/Users/you/Documents/KingdomsAndCrowns-backups
 *   KEEP=12
 *   ENV_FILE=/path/to/repo/.env.prod      # optional: read the credentials below from here
 *   TURSO_DATABASE_URL=libsql://…
 *   TURSO_AUTH_TOKEN=…
 *
 * Turso is exported as a gzipped SQL script. Every backup is restored into a scratch database
 * and its row counts compared before it is kept, and old backups are pruned only after a new one
 * has been verified. On failure it emails ALERT_EMAIL (default FEEDBACK_NOTIFY_EMAIL) through
 * Resend when RESEND_API_KEY is available, then exits non-zero.
 *
 * Restore: see docs/database-backups.md.
 */
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip, gunzipSync } from "node:zlib";

function parseEnvFile(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

function loadConfig() {
  const path = process.env.BACKUP_CONFIG ?? join(homedir(), ".config/kingdoms-and-crowns/backup.env");
  const file = existsSync(path) ? parseEnvFile(path) : {};
  const creds = file.ENV_FILE && existsSync(file.ENV_FILE) ? parseEnvFile(file.ENV_FILE) : {};
  // Precedence: the real environment, then the backup config, then the credentials file.
  const get = (k) => process.env[k] ?? file[k] ?? creds[k];
  return {
    path,
    dir: get("BACKUP_DIR") ?? join(homedir(), "backups/kingdoms-and-crowns"),
    keep: Math.max(1, Number(get("KEEP") ?? 12)),
    tursoUrl: get("TURSO_DATABASE_URL"),
    tursoToken: get("TURSO_AUTH_TOKEN"),
    resendKey: get("RESEND_API_KEY"),
    alertTo: get("ALERT_EMAIL") ?? get("FEEDBACK_NOTIFY_EMAIL"),
    alertFrom: get("ALERT_FROM") ?? get("FEEDBACK_FROM_EMAIL") ?? "raven@kingdomsandcrowns.com",
  };
}

// ── Turso (libSQL) ───────────────────────────────────────────
function sqlLiteral(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return `X'${Buffer.from(v).toString("hex")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function backupTurso(url, authToken, tmp) {
  const { createClient } = await import("@libsql/client");
  const db = createClient({ url, authToken, intMode: "bigint" });
  const objects = (
    await db.execute("select type, name, sql from sqlite_master where sql is not null and name not like 'sqlite_%' order by type = 'table' desc, name")
  ).rows;
  const counts = {};
  const gzip = createGzip();
  const done = pipeline(gzip, createWriteStream(tmp, { mode: 0o600 }));
  gzip.write("PRAGMA foreign_keys=OFF;\nBEGIN;\n");
  for (const o of objects.filter((o) => o.type === "table")) {
    gzip.write(`${o.sql};\n`);
    const res = await db.execute(`select * from "${o.name}"`);
    counts[o.name] = res.rows.length;
    const cols = res.columns.map((c) => `"${c}"`).join(", ");
    for (const r of res.rows) {
      gzip.write(`INSERT INTO "${o.name}" (${cols}) VALUES (${res.columns.map((c) => sqlLiteral(r[c])).join(", ")});\n`);
    }
  }
  for (const o of objects.filter((o) => o.type !== "table")) gzip.write(`${o.sql};\n`);
  gzip.end("COMMIT;\n");
  await done;
  db.close();

  // Verify: replay the script into an in-memory database and compare every table's row count.
  const check = createClient({ url: ":memory:" });
  await check.executeMultiple(gunzipSync(readFileSync(tmp)).toString("utf8"));
  for (const [table, n] of Object.entries(counts)) {
    const got = Number((await check.execute(`select count(*) n from "${table}"`)).rows[0].n);
    if (got !== n) throw new Error(`Turso backup: ${table} restored ${got} rows, expected ${n}.`);
  }
  check.close();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return `${Object.keys(counts).length} tables, ${total} rows`;
}

// ── Orchestration ────────────────────────────────────────────
async function prune(dir, prefix, keep) {
  const files = (await readdir(dir)).filter((f) => f.startsWith(prefix) && !f.endsWith(".partial")).sort();
  const old = files.slice(0, Math.max(0, files.length - keep));
  for (const f of old) await rm(join(dir, f));
  return old.length;
}

async function alert(cfg, message) {
  if (!cfg.resendKey || !cfg.alertTo) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: cfg.alertFrom,
      to: cfg.alertTo,
      subject: "⚠ Kingdoms & Crowns weekly backup FAILED",
      text: `The weekly database backup on ${hostname()} failed:\n\n${message}\n\nYour previous backups in ${cfg.dir} are untouched. Run \`npm run db:backup\` in the repo to retry, or see docs/database-backups.md.`,
    }),
  }).catch(() => {});
}

async function main() {
  const cfg = loadConfig();
  const jobs = [];
  if (cfg.tursoUrl) jobs.push({ name: "turso", ext: "sql.gz", fn: (tmp) => backupTurso(cfg.tursoUrl, cfg.tursoToken, tmp) });
  if (jobs.length === 0) {
    throw new Error(`No database configured. Set TURSO_DATABASE_URL in ${cfg.path} (or its ENV_FILE).`);
  }

  await mkdir(cfg.dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const failures = [];
  for (const job of jobs) {
    const prefix = `kingdoms-${job.name}-`;
    const final = join(cfg.dir, `${prefix}${stamp}.${job.ext}`);
    const tmp = `${final}.partial`;
    try {
      const summary = await job.fn(tmp);
      await rename(tmp, final);
      await chmod(final, 0o600).catch(() => {}); // a Windows drive ignores modes; harmless
      const size = (await stat(final)).size;
      const pruned = await prune(cfg.dir, prefix, cfg.keep);
      console.log(`✔ ${job.name}: ${final} (${(size / 1024).toFixed(0)} KiB; ${summary})${pruned ? `; pruned ${pruned} old` : ""}`);
    } catch (err) {
      await rm(tmp, { force: true });
      failures.push(`${job.name}: ${err.message}`);
      console.error(`✖ ${job.name} backup failed: ${err.message}`);
    }
  }
  if (failures.length) {
    await alert(cfg, failures.join("\n"));
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error(`✖ ${err.message}`);
  await alert(loadConfig(), err.message);
  process.exit(1);
});
