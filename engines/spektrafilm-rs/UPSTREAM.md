# Upstream: spektrafilm-rs

`src/` is PhotoKamo's own copy of the engine source. It changes only when the PhotoKamo owner
decides to update it; nothing upstream flows in automatically.

| | |
|---|---|
| Project | spektrafilm-rs, Rust port of [spektrafilm](https://github.com/andreavolpato/spektrafilm) by Andrea Volpato |
| Origin | <https://github.com/turbasvin/spektrafilm-rs> |
| Commit | `9dd59b0380194b93686aaa230a8bb9680aa270a4` |
| Imported | 2026-11-20 |
| Licence | GPL-3.0 (`LICENSE`, also `src/LICENSE`) |

## Left out of the copy

- `.git/` (upstream history)
- `docs/` (only a promotional image, `card.jpg`)

Everything else (all crates, `Cargo.toml`, `Cargo.lock`, `data/`, `scripts/`, `assets/`, `.github/`)
is copied as-is. `src/.github/` is inert here: GitHub only reads workflows at the repository root.

## PhotoKamo's changes

Kept as separate commits on top of the untouched import, so `git log -- engines/spektrafilm-rs/src`
lists them. The same changes as one file: `patches/photokamo.patch`.

1. Builds for WebAssembly (`wasm32-wasip1`): GPU backend (`wgpu`) off by default; no native BLAS on
   wasm (uses the existing pure-Rust matrix path).
2. `lut` command: a colour-only 3D LUT from the full spectral pipeline (spatial effects off, whole grid
   in one batch, auto-exposure metered from a given image), used for fast previews.
3. `defaults` command: prints the default runtime parameters as JSON.

## Updating (only when the owner decides)

1. `git checkout vendor/spektrafilm-rs` (this branch holds untouched upstream imports only).
2. `bash engines/spektrafilm-rs/tools/import.sh <commit-or-tag>`, update the commit above, commit
   "Import spektrafilm-rs <short-commit>".
3. `git checkout main && git merge vendor/spektrafilm-rs`, resolve any conflicts with our changes.
4. `bash engines/spektrafilm-rs/tools/build.sh`, compare test renders (plan §38), commit `runtime/`.
