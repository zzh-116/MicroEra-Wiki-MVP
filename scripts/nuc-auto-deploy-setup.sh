#!/bin/bash
# nuc-auto-deploy-setup.sh — One-shot setup for auto-deploy on NUC
# Run this ONCE on the NUC server to install the auto-deploy timer.
#
# Usage:
#   ssh devops@192.168.40.60
#   cd /data/code-project/microera-wiki
#   bash scripts/nuc-auto-deploy-setup.sh
set -e

echo "============================================================"
echo " MicroEra Wiki — NUC Auto-Deploy Setup"
echo "============================================================"
echo ""

REPO_DIR="/data/code-project/microera-wiki"
GITLAB_REMOTE="ssh://git@git.miqroera.com:12222/intership/microera-wiki-mvp.git"

cd "$REPO_DIR"

# ── Step 1: Switch remote to GitLab ─────────────────────────
echo "[1/5] Switching git remote to GitLab..."
CURRENT_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [ "$CURRENT_URL" != "$GITLAB_REMOTE" ]; then
  git remote set-url origin "$GITLAB_REMOTE"
  echo "  Remote updated: origin → git.miqroera.com"
else
  echo "  Remote already points to GitLab"
fi

# ── Step 2: Add GitLab SSH host key ─────────────────────────
echo "[2/5] Adding GitLab SSH host key..."
mkdir -p ~/.ssh
ssh-keyscan -p 12222 git.miqroera.com >> ~/.ssh/known_hosts 2>/dev/null || true
echo "  Host key added"

# ── Step 3: Test SSH + git fetch ────────────────────────────
echo "[3/5] Testing GitLab connection..."
if git fetch origin main --quiet 2>&1; then
  echo "  ✓ GitLab connection OK"
else
  echo "  ✗ GitLab connection FAILED — check SSH key is added to GitLab"
  echo "    Generate: ssh-keygen -t ed25519 -C 'nuc-auto-deploy'"
  echo "    Add to:   http://git.miqroera.com/-/profile/keys"
  exit 1
fi

# ── Step 4: Install systemd timer ───────────────────────────
echo "[4/5] Installing systemd auto-deploy timer..."
chmod +x "$REPO_DIR/scripts/auto-deploy.sh"
sudo cp "$REPO_DIR/scripts/auto-deploy.service" /etc/systemd/system/
sudo cp "$REPO_DIR/scripts/auto-deploy.timer"   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now auto-deploy.timer
echo "  Timer installed and started"

# ── Step 5: Verify ──────────────────────────────────────────
echo "[5/5] Verifying..."
sleep 1
echo ""
echo "--- Timer status ---"
sudo systemctl status auto-deploy.timer --no-pager 2>&1 || true
echo ""
echo "--- Next trigger ---"
systemctl list-timers auto-deploy.timer --no-pager 2>&1 | tail -3 || true
echo ""
echo "============================================================"
echo " Setup complete!"
echo "============================================================"
echo ""
echo " Monitor auto-deploy logs:"
echo "   journalctl -u auto-deploy.service -f"
echo ""
echo " Manual trigger:"
echo "   sudo systemctl start auto-deploy.service"
echo ""
