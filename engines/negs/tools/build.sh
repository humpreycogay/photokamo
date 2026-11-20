#!/usr/bin/env bash
# Rebuilds PhotoKamo's negs engine from OUR copy of the source in src/ (no download of engine
# code; Rust crates are pinned by src/Cargo.lock and come from crates.io):
#   runtime/pkg/      spektrafilm_wasm.js + spektrafilm_wasm_bg.wasm (wasm-bindgen, --target web)
#   runtime/catalog.json   film/paper catalog + engine defaults, made by the engine itself
# Data files (profiles, LUTs, filters) are NOT copied: the app fetches them straight from
# src/data/, which is upstream's own copy.
#
# Requirements: Rust 1.89+, the wasm32-unknown-unknown target, wasm-bindgen-cli at the version
# in src/Cargo.lock, Node 18+. Usage, from the repository root:
#   bash engines/negs/tools/build.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # engines/negs
SRC="$HERE/src"
OUT="$HERE/runtime"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-${TMPDIR:-/tmp}/photokamo-negs-target}"

want=$(grep -A1 '^name = "wasm-bindgen"$' "$SRC/Cargo.lock" | sed -n 's/^version = "\(.*\)"/\1/p')
if [[ "$(wasm-bindgen --version 2>/dev/null)" != "wasm-bindgen $want" ]]; then
  echo "Needs wasm-bindgen $want: cargo install wasm-bindgen-cli --version $want --locked" >&2
  exit 1
fi
rustup target add wasm32-unknown-unknown >/dev/null

echo "==> Building spektrafilm-wasm (single-threaded; WebGPU + CPU backends)"
# Run from src/ so its .cargo/config.toml (getrandom's browser backend) applies.
(cd "$SRC" && cargo build --release --locked --target wasm32-unknown-unknown -p spektrafilm-wasm)

echo "==> wasm-bindgen"
rm -rf "$OUT/pkg"
wasm-bindgen --target web --no-typescript --out-dir "$OUT/pkg" "$CARGO_TARGET_DIR/wasm32-unknown-unknown/release/spektrafilm_wasm.wasm"

echo "==> Catalog"
node "$HERE/tools/make-catalog.mjs"

echo "==> Done"
ls -l "$OUT/pkg" "$OUT/catalog.json"
