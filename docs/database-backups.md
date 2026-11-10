# Database backups

A verified copy of the production Turso database is taken **weekly onto your own computer**, by [scripts/backup-db.mjs](../scripts/backup-db.mjs) on a systemd user timer.

- **What:** `kingdoms-turso-<date>.sql.gz`, a full SQL script of every table.
- **Verified:** every backup is replayed into a throwaway database, and its table and row counts are compared with the live database, before it's kept. A backup that doesn't restore is discarded and counts as a failure.
- **Where:** `BACKUP_DIR`, by default `C:\Users\<you>\Documents\KingdomsAndCrowns-backups` on WSL. That's outside the WSL disk image, so a broken or removed distro can't take the backups with it. It is **not** synced to OneDrive: these files hold your children's records, so keep them on this machine (or copy them to an encrypted drive).
- **How many:** the newest `KEEP` (default 12, about three months). Old ones are pruned only after a new backup has been verified.
- **When:** Sundays 19:00, local time. If the computer or WSL was off then, it runs the next time WSL starts (`Persistent=true`).
- **If it fails:** you get an email ("Kingdoms & Crowns weekly backup FAILED") at `FEEDBACK_NOTIFY_EMAIL` via Resend, and `systemctl --user status kingdoms-backup` shows the error. Earlier backups are untouched.

## Setup (once)

```bash
npm run db:backup-install
```

This writes `~/.config/kingdoms-and-crowns/backup.env` (kept private) and enables the weekly timer. The config points at the repo's `.env.prod` for `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

Check on it:

```bash
systemctl --user list-timers kingdoms-backup.timer      # next run
journalctl --user -u kingdoms-backup -n 30 --no-pager   # past runs
npm run db:backup                                       # take one right now
```

## Turso's own history

Turso also keeps point-in-time history for a short window (its length depends on your Turso plan), so a very recent mistake can sometimes be rewound from the Turso dashboard or CLI. The weekly local backups are the copy that survives anything happening to the Turso account itself.

## Restoring

Restore into a **new, empty** database first and look around before pointing anything at it:

```bash
turso db create kingdoms-restored
gunzip -c kingdoms-turso-<date>.sql.gz | turso db shell kingdoms-restored
```

or into a local SQLite file with `gunzip -c … | sqlite3 restored.db` (then run the app against it with `TURSO_DATABASE_URL=file:./restored.db`).

To make a restored database production, point Vercel's `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` at it and redeploy.
