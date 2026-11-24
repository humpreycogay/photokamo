#!/usr/bin/env bash
# Replaces src/ with an UNTOUCHED copy of upstream negs at <tag-or-commit>.
# Only run this when the owner has decided to update the engine, and only on the
# vendor/negs branch; then commit and merge that branch into main (see UPSTREAM.md).
# Afterwards: tools/build.sh, test renders, commit runtime/.
#
# Usage, from the repository root:  bash engines/negs/tools/import.sh <tag-or-commit>   (e.g. v0.17.0)
set -euo pipefail

UPSTREAM=https://github.com/noahhaasis/negs.git
REF="${1:?usage: import.sh <tag-or-commit>}"
# Left out of our copy: desktop/web apps, docs, research, build/CI scripts, artwork, and the
# photo-border images; none are needed to build or credit the engine (see UPSTREAM.md).
EXCLUDES=(--exclude=./.git --exclude=./.github --exclude=./.claude --exclude=./CLAUDE.md --exclude=./docs
  --exclude=./macos --exclude=./windows --exclude=./linux --exclude=./web --exclude=./research --exclude=./scripts
  --exclude=./assets --exclude=./release --exclude=./README.zh-CN.md --exclude=./data/borders)

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$HERE/src"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

branch="$(git -C "$HERE" rev-parse --abbrev-ref HEAD)"
if [ "$branch" != "vendor/negs" ]; then
  echo "Refusing: on '$branch'. Check out vendor/negs first." >&2
  exit 1
fi

echo "==> Fetching negs @ $REF"
git init -q "$WORK/up"
# Keep upstream's exact bytes: no CRLF conversion, whatever the local git settings are.
git -C "$WORK/up" config core.autocrlf false
git -C "$WORK/up" config core.eol lf
if git -C "$WORK/up" fetch -q --depth 1 "$UPSTREAM" "refs/tags/$REF" 2>/dev/null; then :; else
  git -C "$WORK/up" fetch -q --depth 1 "$UPSTREAM" "$REF"
fi
git -C "$WORK/up" -c advice.detachedHead=false checkout -q FETCH_HEAD
commit="$(git -C "$WORK/up" rev-parse HEAD)"

echo "==> Replacing src/ with upstream $commit"
rm -rf "$SRC"
mkdir -p "$SRC"
(cd "$WORK/up" && tar "${EXCLUDES[@]}" -cf - .) | (cd "$SRC" && tar -xf -)

echo "==> Done. Now: update the tag/commit in UPSTREAM.md, commit on vendor/negs"
echo "    (\"Import negs $REF\"), then merge into main."
