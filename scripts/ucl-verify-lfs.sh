#!/bin/bash
# ucl-verify-lfs.sh - Read-only verification for UCL Git LFS PDF deployment.
# Checks that git-lfs is available, all expected PDFs are real files, the
# PDF headers are valid, SHA256 samples match LFS pointers, and the DATA_DIR
# symlinks expose the same files. This script never creates, deletes, moves,
# or modifies files.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UCL_DATA_DIR="/data/archive-hot/wiki-data"
PDF_DIRS=(reports zaozhi laiguanxue)
EXPECTED_PDF_COUNT=185
EXPECTED_TOTAL_BYTES=908155866
SAMPLE_COUNT=3
EXPECTED_IMAGE_COUNT=289
EXPECTED_IMAGE_BYTES=125830821
SAMPLE_IMAGE_COUNT=3

if [ -f "$REPO_DIR/.env" ]; then
  ENV_DATA_DIR=$(grep -E '^DATA_DIR=' "$REPO_DIR/.env" | head -n1 | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
  if [ -n "$ENV_DATA_DIR" ]; then
    UCL_DATA_DIR="$ENV_DATA_DIR"
  fi
fi

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

check_image_file() {
  local f="$1"
  local ext sig

  if head -c 40 "$f" | grep -q 'git-lfs'; then
    fail "LFS pointer instead of image: $f"
  fi

  ext="${f##*.}"
  ext=$(printf '%s' "$ext" | tr '[:upper:]' '[:lower:]')
  case "$ext" in
    png)
      sig=$(head -c 4 "$f")
      [ "$sig" = "$(printf '\x89PNG')" ] || fail "not a real PNG: $f"
      ;;
    jpg|jpeg)
      sig=$(head -c 3 "$f")
      [ "$sig" = "$(printf '\xff\xd8\xff')" ] || fail "not a real JPEG: $f"
      ;;
    gif)
      sig=$(head -c 4 "$f")
      [ "$sig" = "GIF8" ] || fail "not a real GIF: $f"
      ;;
    webp)
      head -c 12 "$f" | grep -q '^RIFF....WEBP' || fail "not a real WEBP: $f"
      ;;
    *)
      fail "unsupported image extension: $f"
      ;;
  esac
}

if ! command -v git-lfs >/dev/null 2>&1; then
  fail "git-lfs is not installed"
fi

count=0
total_bytes=0

for d in "${PDF_DIRS[@]}"; do
  src_dir="$REPO_DIR/backend/data/$d"
  [ -d "$src_dir" ] || fail "source directory missing: $src_dir"

  while IFS= read -r f; do
    [ -n "$f" ] || continue
    count=$((count + 1))
    size=$(stat -c '%s' "$f")
    total_bytes=$((total_bytes + size))

    signature=$(head -c 4 "$f")
    if [ "$signature" != "%PDF" ]; then
      fail "not a real PDF (header '$signature'): $f"
    fi
  done < <(find "$src_dir" -type f -iname '*.pdf' | sort)
done

if [ "$count" -ne "$EXPECTED_PDF_COUNT" ]; then
  fail "expected $EXPECTED_PDF_COUNT PDFs, found $count"
fi

if [ "$total_bytes" -ne "$EXPECTED_TOTAL_BYTES" ]; then
  fail "expected total $EXPECTED_TOTAL_BYTES bytes, found $total_bytes"
fi

mapfile -t samples < <(
  find "$REPO_DIR/backend/data/reports" "$REPO_DIR/backend/data/zaozhi" \
    "$REPO_DIR/backend/data/laiguanxue" -type f -iname '*.pdf' | sort | head -n "$SAMPLE_COUNT"
)

for f in "${samples[@]}"; do
  rel="${f#"$REPO_DIR"/}"
  expected_oid=$(git lfs ls-files --long | grep -F " * $rel" | awk '{print $1}' | head -n1)
  [ -n "$expected_oid" ] || fail "no LFS pointer found for $rel"
  actual_sha=$(sha256sum "$f" | awk '{print $1}')
  if [ "$expected_oid" != "$actual_sha" ]; then
    fail "SHA256 mismatch for $rel"
  fi
done

for d in "${PDF_DIRS[@]}"; do
  src_dir="$REPO_DIR/backend/data/$d"
  target_dir="$UCL_DATA_DIR/$d"

  [ -d "$src_dir" ] || fail "source directory missing: $src_dir"

  if [ -L "$target_dir" ]; then
    actual_target=$(readlink -f "$target_dir")
    expected_target=$(readlink -f "$src_dir")
    if [ "$actual_target" != "$expected_target" ]; then
      fail "symlink $target_dir points to $actual_target, expected $expected_target"
    fi
  elif [ -e "$target_dir" ]; then
    fail "$target_dir exists and is not a symlink"
  else
    fail "$target_dir symlink is missing"
  fi

  [ -d "$target_dir" ] || fail "$target_dir is not accessible"
  sample_pdf=$(find -L "$target_dir" -maxdepth 1 -type f -iname '*.pdf' | head -n1)
  [ -n "$sample_pdf" ] || fail "$target_dir contains no accessible PDF"

  signature=$(head -c 4 "$sample_pdf")
  if [ "$signature" != "%PDF" ]; then
    fail "PDF through symlink is not a real PDF: $sample_pdf"
  fi
done

img_count=0
img_bytes=0
img_src="$REPO_DIR/backend/data/images"
[ -d "$img_src" ] || fail "source image directory missing: $img_src"

while IFS= read -r f; do
  [ -n "$f" ] || continue
  check_image_file "$f"
  img_count=$((img_count + 1))
  img_bytes=$((img_bytes + $(stat -c '%s' "$f")))
done < <(find "$img_src" -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' -o -iname '*.gif' \) | sort)

if [ "$img_count" -ne "$EXPECTED_IMAGE_COUNT" ]; then
  fail "expected $EXPECTED_IMAGE_COUNT images, found $img_count"
fi

if [ "$img_bytes" -ne "$EXPECTED_IMAGE_BYTES" ]; then
  fail "expected $EXPECTED_IMAGE_BYTES image bytes, found $img_bytes"
fi

mapfile -t image_samples < <(
  find "$img_src" -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' -o -iname '*.gif' \) \
    | sort | head -n "$SAMPLE_IMAGE_COUNT"
)

for f in "${image_samples[@]}"; do
  rel="${f#"$REPO_DIR"/}"
  expected_oid=$(git lfs ls-files --long | grep -F " * $rel" | awk '{print $1}' | head -n1)
  [ -n "$expected_oid" ] || fail "no LFS pointer found for $rel"
  actual_sha=$(sha256sum "$f" | awk '{print $1}')
  if [ "$expected_oid" != "$actual_sha" ]; then
    fail "SHA256 mismatch for $rel"
  fi
done

img_target="$UCL_DATA_DIR/images"
if [ -L "$img_target" ]; then
  actual_target=$(readlink -f "$img_target")
  expected_target=$(readlink -f "$img_src")
  if [ "$actual_target" != "$expected_target" ]; then
    fail "symlink $img_target points to $actual_target, expected $expected_target"
  fi
elif [ -e "$img_target" ]; then
  fail "$img_target exists and is not a symlink"
else
  fail "$img_target symlink is missing"
fi

[ -d "$img_target" ] || fail "$img_target is not accessible"
sample_img=$(find -L "$img_target" -maxdepth 1 -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' -o -iname '*.gif' \) | head -n1)
[ -n "$sample_img" ] || fail "$img_target contains no accessible image"
check_image_file "$sample_img"

echo "LFS verification OK: $count PDFs, $img_count images, $total_bytes PDF bytes, $img_bytes image bytes, symlinks OK"
