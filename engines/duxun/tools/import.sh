#!/usr/bin/env bash
# Replaces src/ with an UNTOUCHED copy of upstream DuXun Film Simulation at <commit>.
# Only run this when the owner has decided to update the engine, and only on the vendor/duxun
# branch; then commit and merge that branch into main (see UPSTREAM.md). Afterwards port any
# renderer changes into js/engines/duxun/ and re-run tools/verify/.
#
# Usage, from the repository root:  bash engines/duxun/tools/import.sh <commit>
set -euo pipefail

UPSTREAM=https://github.com/DuXun03/duxun-film-simulation.git
REF="${1:?usage: import.sh <commit>}"
# Left out: git metadata, CI, and every .cube LUT (not loaded by the plugin; see UPSTREAM.md).
EXCLUDES=(--exclude=./.git --exclude=./.github --exclude='*.cube' --exclude=./scripts/luts --exclude=./scripts/luts_src)

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$HERE/src"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

branch="$(git -C "$HERE" rev-parse --abbrev-ref HEAD)"
if [ "$branch" != "vendor/duxun" ]; then
  echo "Refusing: on '$branch'. Check out vendor/duxun first." >&2
  exit 1
fi

echo "==> Fetching DuXun @ $REF"
git init -q "$WORK/up"
git -C "$WORK/up" config core.autocrlf false   # upstream's exact bytes
git -C "$WORK/up" config core.eol lf
git -C "$WORK/up" fetch -q --depth 1 "$UPSTREAM" "$REF"
git -C "$WORK/up" -c advice.detachedHead=false checkout -q FETCH_HEAD
commit="$(git -C "$WORK/up" rev-parse HEAD)"

echo "==> Replacing src/ with upstream $commit"
rm -rf "$SRC"
mkdir -p "$SRC"
(cd "$WORK/up" && tar "${EXCLUDES[@]}" -cf - .) | (cd "$SRC" && tar -xf -)

echo "==> Done. Update UPSTREAM.md, commit on vendor/duxun (\"Import DuXun ${commit:0:7}\"), merge into main."
