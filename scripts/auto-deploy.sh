#!/bin/bash
# auto-deploy.sh - Polling-based auto deploy for MicroEra Wiki MVP.
# Runs via systemd timer every 2 min. Fetches GitLab, deploys if new commits.
# PDFs are managed by Git LFS; the deploy fails closed if LFS is missing,
# objects cannot be pulled, or the PDF tree does not pass verification.
set -euo pipefail

REPO_DIR="/data/code-project/microera-wiki"
BRANCH="main"
GITLAB_REMOTE="ssh://git@git.miqroera.com:12222/intership/microera-wiki-mvp.git"
LOCK_FILE="/tmp/microera-deploy.lock"
UCL_DATA_DIR="/data/archive-hot/wiki-data"
PDF_DIRS=(reports zaozhi laiguanxue)
EXPECTED_PDF_COUNT=185
EXPECTED_TOTAL_BYTES=908155866
EXPECTED_IMAGE_COUNT=289
EXPECTED_IMAGE_BYTES=125830821

HOME="${HOME:-/home/devops}"

# Load NVM (systemd has no shell profile)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Read DATA_DIR from .env when present so the symlink target follows the
# actual runtime data directory instead of assuming a hardcoded value.
if [ -f "$REPO_DIR/.env" ]; then
  ENV_DATA_DIR=$(grep -E '^DATA_DIR=' "$REPO_DIR/.env" | head -n1 | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
  if [ -n "$ENV_DATA_DIR" ]; then
    UCL_DATA_DIR="$ENV_DATA_DIR"
  fi
fi

# Prevent concurrent deploys
if [ -f "$LOCK_FILE" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deploy already in progress, skipping."
  exit 0
fi
trap "rm -f $LOCK_FILE" EXIT
touch "$LOCK_FILE"

cd "$REPO_DIR"

# Ensure remote points to GitLab
CURRENT_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [ "$CURRENT_URL" != "$GITLAB_REMOTE" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Fixing remote origin -> GitLab"
  git remote set-url origin "$GITLAB_REMOTE" 2>/dev/null || true
fi

# Add GitLab SSH host key if missing
if ! grep -q "git.miqroera.com" "$HOME/.ssh/known_hosts" 2>/dev/null; then
  mkdir -p "$HOME/.ssh"
  ssh-keyscan -p 12222 git.miqroera.com >> "$HOME/.ssh/known_hosts" 2>/dev/null || true
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Fetching origin/$BRANCH from GitLab..."
git fetch origin "$BRANCH" --quiet 2>&1 || {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: git fetch failed - check SSH key and network"
  exit 1
}

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

# No new commits -> skip
if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0
fi

echo "============================================================"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] New commits detected!"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Local:  ${LOCAL:0:8}"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Remote: ${REMOTE:0:8}"
echo "============================================================"

# Git LFS must be available before checkout, otherwise PDF pointers can be
# written as text files instead of real PDFs.
if ! command -v git-lfs >/dev/null 2>&1; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: git-lfs is not installed. Install Git LFS before deploying."
  exit 1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Configuring local Git LFS filters..."
git lfs install --local 2>&1 || {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: git lfs install --local failed."
  exit 1
}

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pulling changes..."
git pull origin "$BRANCH" 2>&1

# Explicit LFS materialization after pull. This is the fail-safe step: if LFS
# objects are missing, the deploy stops before npm/build/restart.
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Installing Git LFS filters again (idempotent)..."
git lfs install --local 2>&1
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pulling Git LFS objects..."
git lfs pull 2>&1 || {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: git lfs pull failed."
  exit 1
}

# Verify source directories exist before creating symlinks.
for d in "${PDF_DIRS[@]}"; do
  if [ ! -d "$REPO_DIR/backend/data/$d" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: source directory missing: $REPO_DIR/backend/data/$d"
    exit 1
  fi
done

if [ ! -d "$REPO_DIR/backend/data/images" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: source directory missing: $REPO_DIR/backend/data/images"
  exit 1
fi

# Prepare symlinks under DATA_DIR. Never delete, overwrite, or move existing
# directories; fail closed if a non-symlink target already exists.
mkdir -p "$UCL_DATA_DIR"
for d in "${PDF_DIRS[@]}"; do
  src="$REPO_DIR/backend/data/$d"
  target="$UCL_DATA_DIR/$d"

  if [ -L "$target" ]; then
    actual_target=$(readlink -f "$target")
    expected_target=$(readlink -f "$src")
    if [ "$actual_target" != "$expected_target" ]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $target points to $actual_target, expected $expected_target"
      exit 1
    fi
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Reusing existing symlink: $target -> $src"
  elif [ -e "$target" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $target exists and is not a symlink. Refusing to overwrite or remove it."
    exit 1
  else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Creating symlink: $target -> $src"
    ln -s "$src" "$target"
  fi

  if [ ! -d "$target" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: symlink target not accessible: $target"
    exit 1
  fi
done

# Prepare images symlink under DATA_DIR with the same fail-closed rules.
img_src="$REPO_DIR/backend/data/images"
img_target="$UCL_DATA_DIR/images"
img_count=$(find "$img_src" -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' -o -iname '*.gif' \) | wc -l)
if [ "$img_count" -lt "$EXPECTED_IMAGE_COUNT" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: expected at least $EXPECTED_IMAGE_COUNT images, found $img_count"
  exit 1
fi

img_bytes=$(find "$img_src" -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' -o -iname '*.gif' \) -exec stat -c '%s' {} + | awk '{s += $1} END {print s + 0}')
if [ "$img_bytes" -ne "$EXPECTED_IMAGE_BYTES" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: expected $EXPECTED_IMAGE_BYTES image bytes, found $img_bytes"
  exit 1
fi

if find "$img_src" -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' -o -iname '*.gif' \) \
  -exec sh -c 'head -c 40 "$1" | grep -q "git-lfs" && echo "LFS_POINTER $1"' _ {} \; | grep -q 'LFS_POINTER'; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: images contain Git LFS pointers instead of real image files"
  exit 1
fi

if [ -L "$img_target" ]; then
  actual_target=$(readlink -f "$img_target")
  expected_target=$(readlink -f "$img_src")
  if [ "$actual_target" != "$expected_target" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $img_target points to $actual_target, expected $expected_target"
    exit 1
  fi
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Reusing existing symlink: $img_target -> $img_src"
elif [ -e "$img_target" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $img_target exists and is not a symlink. Refusing to overwrite or remove it."
  exit 1
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Creating symlink: $img_target -> $img_src"
  ln -s "$img_src" "$img_target"
fi

if [ ! -d "$img_target" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: symlink target not accessible: $img_target"
  exit 1
fi

# Read-only verification before touching dependencies or the service.
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Running read-only LFS verification..."
bash "$REPO_DIR/scripts/ucl-verify-lfs.sh" 2>&1 || {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: LFS verification failed. Aborting deploy."
  exit 1
}

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Installing dependencies..."
npm install --no-audit --no-fund 2>&1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Building frontend..."
npm run build 2>&1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restarting microera-wiki..."
sudo systemctl restart microera-wiki

sleep 3
if systemctl is-active --quiet microera-wiki; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deploy successful - service is running"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deploy finished but service is DOWN - check: sudo systemctl status microera-wiki"
fi

echo ""
