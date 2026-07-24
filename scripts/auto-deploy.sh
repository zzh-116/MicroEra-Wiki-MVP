#!/bin/bash
# auto-deploy.sh — Polling-based auto deploy for MicroEra Wiki MVP
# Runs via systemd timer every 2 min. Fetches remote, deploys if new commits.
# Logs to journald (visible via: journalctl -u auto-deploy -f)
set -e

REPO_DIR="/data/code-project/microera-wiki"
BRANCH="main"
LOCK_FILE="/tmp/microera-deploy.lock"

# ── Prevent concurrent deploys ──────────────────────────────
if [ -f "$LOCK_FILE" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deploy already in progress, skipping."
  exit 0
fi
trap "rm -f $LOCK_FILE" EXIT
touch "$LOCK_FILE"

cd "$REPO_DIR"

# ── Fetch remote ────────────────────────────────────────────
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Fetching origin/$BRANCH..."
git fetch origin "$BRANCH" --quiet 2>&1 || {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: git fetch failed — network down?"
  exit 1
}

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

# ── No new commits → skip ───────────────────────────────────
if [ "$LOCAL" = "$REMOTE" ]; then
  # Silent exit — don't spam logs when nothing changed
  exit 0
fi

echo "============================================================"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] New commits detected!"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Local:  ${LOCAL:0:8}"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Remote: ${REMOTE:0:8}"
echo "============================================================"

# ── Pull ────────────────────────────────────────────────────
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pulling changes..."
git pull origin "$BRANCH" 2>&1

# ── Dependencies ────────────────────────────────────────────
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Installing dependencies..."
npm install --no-audit --no-fund 2>&1

# ── Build frontend ──────────────────────────────────────────
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Building frontend..."
npm run build 2>&1

# ── Restart service ─────────────────────────────────────────
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restarting microera-wiki..."
sudo systemctl restart microera-wiki

# ── Verify ──────────────────────────────────────────────────
sleep 3
if systemctl is-active --quiet microera-wiki; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✓ Deploy successful — service is running"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✗ Deploy finished but service is DOWN — check: sudo systemctl status microera-wiki"
fi

echo ""
