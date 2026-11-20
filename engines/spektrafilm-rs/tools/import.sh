#!/usr/bin/env bash
# Replaces src/ with an UNTOUCHED copy of upstream spektrafilm-rs at <commit-or-tag>.
# Only run this when the owner has decided to update the engine, and only on the
# vendor/spektrafilm-rs branch; then commit and merge that branch into main, so git keeps
# PhotoKamo's own changes (see UPSTREAM.md). Afterwards: tools/build.sh, test renders, commit.
#
# Usage, from the repository root:  bash engines/spektrafilm-rs/tools/import.sh <commit-or-tag>
set -euo pipefail

UPSTREAM=https://github.com/turbasvin/spektrafilm-rs.git
REF="${1:?usage: import.sh <commit-or-tag>}"
# Left out of our copy (not needed to build or credit the engine).
EXCLUDES=(--exclude=./.git --exclude=./docs)

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$HERE/src"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

branch="$(git -C "$HERE" rev-parse --abbrev-ref HEAD)"
if [ "$branch" != "vendor/spektrafilm-rs" ]; then
  echo "Refusing: on '$branch'. Check out vendor/spektrafilm-rs first." >&2
  exit 1
fi

echo "==> Fetching spektrafilm-rs @ $REF"
git init -q "$WORK/up"
# Keep upstream's exact bytes: no CRLF conversion, whatever the local git settings are.
git -C "$WORK/up" config core.autocrlf false
git -C "$WORK/up" config core.eol lf
git -C "$WORK/up" fetch -q --depth 1 "$UPSTREAM" "$REF"
git -C "$WORK/up" -c advice.detachedHead=false checkout -q FETCH_HEAD
commit="$(git -C "$WORK/up" rev-parse HEAD)"

echo "==> Replacing src/ with upstream $commit"
rm -rf "$SRC"
mkdir -p "$SRC"
(cd "$WORK/up" && tar "${EXCLUDES[@]}" -cf - .) | (cd "$SRC" && tar -xf -)

echo "==> Done. Now: update the commit in UPSTREAM.md, commit on vendor/spektrafilm-rs"
echo "    (\"Import spektrafilm-rs ${commit:0:7}\"), then merge into main."
