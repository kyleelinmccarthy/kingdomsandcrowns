#!/usr/bin/env bash
# Schedules scripts/backup-db.mjs to run every week via a systemd *user* timer (no sudo).
# Persistent=true: if the computer (or WSL) was off at the scheduled time, the backup runs at
# the next start instead of being skipped. Re-running this script is safe; it only rewrites the
# timer files and never overwrites an existing backup config.
#
#   bash scripts/install-backup-timer.sh
#
# Afterwards: `systemctl --user list-timers kingdoms-backup.timer` shows the next run, and
# `journalctl --user -u kingdoms-backup` shows past runs.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="$HOME/.config/kingdoms-and-crowns"
CONFIG="$CONFIG_DIR/backup.env"
UNIT_DIR="$HOME/.config/systemd/user"

if [ "$(ps -p 1 -o comm=)" != "systemd" ]; then
  echo "systemd isn't running here. On WSL add [boot] systemd=true to /etc/wsl.conf, run 'wsl --shutdown' from Windows, and try again." >&2
  exit 1
fi

# Default destination: Windows Documents when running under WSL (outside the WSL disk image, so a
# broken or removed distro can't take the backups with it), otherwise ~/backups.
default_dir="$HOME/backups/kingdoms-and-crowns"
if command -v powershell.exe >/dev/null 2>&1; then
  win_docs="$(powershell.exe -NoProfile -Command "[Environment]::GetFolderPath('MyDocuments')" 2>/dev/null | tr -d '\r')"
  if [ -n "$win_docs" ]; then default_dir="$(wslpath "$win_docs")/KingdomsAndCrowns-backups"; fi
fi

mkdir -p "$CONFIG_DIR" "$UNIT_DIR"
if [ ! -f "$CONFIG" ]; then
  umask 077
  cat > "$CONFIG" <<EOF
# Weekly backup settings for scripts/backup-db.mjs. Keep this file private (it is chmod 600).
BACKUP_DIR=$default_dir
KEEP=12
# Production credentials (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN) are read from this file.
# Its RESEND_API_KEY and FEEDBACK_NOTIFY_EMAIL also send you an email if a backup fails.
ENV_FILE=$REPO/.env.prod
EOF
  echo "Wrote $CONFIG"
else
  echo "Keeping existing $CONFIG"
fi

cat > "$UNIT_DIR/kingdoms-backup.service" <<EOF
[Unit]
Description=Kingdoms & Crowns database backup
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$REPO
Environment=BACKUP_CONFIG=$CONFIG
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=$(command -v node) scripts/backup-db.mjs
EOF

cat > "$UNIT_DIR/kingdoms-backup.timer" <<EOF
[Unit]
Description=Weekly Kingdoms & Crowns database backup

[Timer]
OnCalendar=Sun *-*-* 19:00:00
Persistent=true
RandomizedDelaySec=10min

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now kingdoms-backup.timer
echo
systemctl --user list-timers kingdoms-backup.timer --no-pager
echo
echo "Run one now with:  systemctl --user start kingdoms-backup && journalctl --user -u kingdoms-backup -n 20 --no-pager"
