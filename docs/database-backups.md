# Database backups

A verified copy of the production database is taken **weekly onto your own computer**, by [scripts/backup-db.mjs](../scripts/backup-db.mjs) on a systemd user timer.

- **What:** Postgres 18 → `kingdoms-postgres-<date>.dump` (`pg_dump` custom format, from the `postgres:18` Docker image so the client always matches the server). Turso → `kingdoms-turso-<date>.sql.gz` (a full SQL script). If both are configured, as during the cutover, both are taken.
- **Verified:** every backup is restored into a throwaway database, and its table and row counts are compared with the live database, before it's kept. A backup that doesn't restore is discarded and counts as a failure.
- **Where:** `BACKUP_DIR`, by default `C:\Users\<you>\Documents\KingdomsAndCrowns-backups` on WSL. That's outside the WSL disk image, so a broken or removed distro can't take the backups with it. It is **not** synced to OneDrive: these files hold your children's records, so keep them on this machine (or copy them to an encrypted drive).
- **How many:** the newest `KEEP` (default 12, about three months). Old ones are pruned only after a new backup has been verified.
- **When:** Sundays 19:00, local time. If the computer or WSL was off then, it runs the next time WSL starts (`Persistent=true`).
- **If it fails:** you get an email ("Kingdoms & Crowns weekly backup FAILED") at `FEEDBACK_NOTIFY_EMAIL` via Resend, and `systemctl --user status kingdoms-backup` shows the error. Earlier backups are untouched.

## Setup (once)

```bash
npm run db:backup-install
```

This writes `~/.config/kingdoms-and-crowns/backup.env` (kept private) and enables the weekly timer. The config points at the repo's `.env.prod` for credentials:

- **Turso** (production until the cutover): `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`
- **Postgres 18**: `DATABASE_URL` — the **direct** connection string, not Hyperdrive

After the Postgres cutover, add `DATABASE_URL` to `.env.prod`. Once you're sure Turso is retired, remove the `TURSO_*` lines and the Turso backups stop.

Check on it:

```bash
systemctl --user list-timers kingdoms-backup.timer      # next run
journalctl --user -u kingdoms-backup -n 30 --no-pager   # past runs
npm run db:backup                                       # take one right now
```

## Neon's own history

Neon also keeps its own point-in-time history (the restore window depends on your Neon plan), so a recent mistake can usually be rewound from the Neon dashboard via **Branches → Restore**. The weekly local backups are the copy that survives anything happening to the Neon account itself.

## Restoring

Restore into a **new, empty** database first and look around before pointing anything at it.

**Postgres** (`.dump`):

```bash
docker run --rm -i --network host postgres:18-alpine \
  pg_restore --no-owner --no-privileges -d 'postgres://…/new_db' < kingdoms-postgres-<date>.dump
```

To replace a broken production database in place, add `--clean --if-exists`. Only do that after the dry run above.

**Turso** (`.sql.gz`): replay it into a new database:

```bash
gunzip -c kingdoms-turso-<date>.sql.gz | turso db shell <new-db>
```

or into a local SQLite file with `gunzip -c … | sqlite3 restored.db`.
