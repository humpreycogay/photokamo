#!/usr/bin/env bash
# Rebuilds PhotoKamo's spektrafilm-rs engine (runtime/spektrafilm.wasm) and its data subset
# from OUR copy of the source in src/ (no download of engine code; Rust crates are pinned by
# src/Cargo.lock and come from crates.io).
#
# Requirements: Rust (rustup + cargo, 1.85+). Usage, from the repository root:
#   bash engines/spektrafilm-rs/tools/build.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # engines/spektrafilm-rs
SRC="$HERE/src"
OUT="$HERE/runtime"
# Cargo output stays outside the repo (target/ is also gitignored).
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-${TMPDIR:-/tmp}/photokamo-spektrafilm-rs-target}"

# Film stocks the Advanced panel offers (keep in sync with js/engines/spektrafilm-rs/params.js).
FILMS="fujifilm_c200 fujifilm_pro_400h fujifilm_xtra_400 fujifilm_provia_100f fujifilm_velvia_100
kodak_ektachrome_100 kodak_kodachrome_64 kodak_ektar_100 kodak_gold_200 kodak_portra_160 kodak_portra_400
kodak_portra_800 kodak_portra_800_push1 kodak_portra_800_push2 kodak_ultramax_400 kodak_verita_200d
kodak_vision3_50d kodak_vision3_200t kodak_vision3_250d kodak_vision3_500t"
PAPERS="kodak_portra_endura kodak_supra_endura kodak_ultra_endura kodak_endura_premier kodak_ektacolor_edge
fujifilm_crystal_archive_typeii kodak_2383 kodak_2393"

echo "==> Building for wasm32-wasip1 (this takes a few minutes)"
rustup target add wasm32-wasip1 >/dev/null
(cd "$SRC" && cargo build --release --locked --target wasm32-wasip1 -p spektrafilm-cli --bin spektrafilm)

echo "==> Copying outputs to $OUT"
mkdir -p "$OUT"
cp "$CARGO_TARGET_DIR/wasm32-wasip1/release/spektrafilm.wasm" "$OUT/spektrafilm.wasm"
rm -rf "$OUT/data"
mkdir -p "$OUT/data/profiles" "$OUT/data/filters" "$OUT/data/luts/spectral_upsampling"
for stock in $FILMS $PAPERS; do cp "$SRC/data/profiles/$stock.json" "$OUT/data/profiles/"; done
cp "$SRC/data/filters/neutral_print_filters.json" "$OUT/data/filters/"
cp "$SRC/data/luts/spectral_upsampling/irradiance_xy_tc.npy" "$OUT/data/luts/spectral_upsampling/"

echo "==> Manifests (sizes + hashes for download progress and saved copies)"
node "$HERE/../../tools/engine-manifests.mjs"

echo "==> Done"
ls -l "$OUT/spektrafilm.wasm"
du -sh "$OUT/data"
