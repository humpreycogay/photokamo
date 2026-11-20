# Upstream: negs

`src/` is PhotoKamo's own copy of the engine source. It changes only when the PhotoKamo owner
decides to update it; nothing upstream flows in automatically.

| | |
|---|---|
| Project | negs: a Rust spectral film engine (spektrafilm lineage) with WebGPU and CPU backends |
| Origin | <https://github.com/noahhaasis/negs> |
| Release | `v0.17.0`, commit `83e8c799ee4c26574db398dcb176b067a2e83808` |
| Imported | 2026-11-20 |
| Code licence | GPL-3.0-only (`LICENSE`, also `src/LICENSE`) |
| Data licences | CC BY-SA 4.0: `src/data/SPEKTRAFILM_LICENSE.txt` (spektrafilm profiles, LUTs), `src/data/FOTUFILM_LICENSE.txt` (29 profiles adapted from Fotufilm) |
| Bundled crate | rawler 0.8.0 (LGPL-2.1, `src/vendor/rawler/LICENSE`), patched by negs (see `src/vendor/README.md`) |

## Left out of the copy

Not needed to build or credit the engine:

- `.git/`, `.github/`, `.claude/`, `CLAUDE.md`
- the desktop and web apps: `macos/`, `windows/`, `linux/`, `web/`
- `docs/`, `research/`, `scripts/`, `assets/`, `release/`, `README.zh-CN.md`
- `data/borders/` (photo-border images for negs's own UI, 35 MB)

Everything else (`crates/`, `vendor/`, `data/`, `tools/`, `.cargo/`, `Cargo.toml`, `Cargo.lock`,
`LICENSE`, `README.md`) is copied byte-for-byte (LF line endings, as upstream).

## PhotoKamo's changes

**None to `src/`.** negs already has a browser engine (`crates/spektrafilm-wasm`); PhotoKamo builds
it unchanged and calls it from its own worker (`js/engines/negs/`). The app reads profiles, LUTs and
filters straight from `src/data/`, so they stay exactly as upstream ships them (the spektrafilm data
licence asks that its files are not modified).

Additions outside `src/`: `tools/build.sh`, `tools/make-catalog.mjs` (adapted from negs
`web/make-catalog.mjs`), `tools/import.sh`, `runtime/` (built output), `credits.json`.

The PhotoKamo controls follow negs's own (`web/controls.js` at the same release: paths, labels,
ranges and steps from its macOS inspector). Defaults come from the engine's catalog
(`runtime/catalog.json`), never from PhotoKamo.

## Updating (only when the owner decides)

1. `git checkout vendor/negs` (this branch holds untouched upstream imports only).
2. `bash engines/negs/tools/import.sh <tag>`, update the release above, commit "Import negs <tag>".
3. `git checkout main && git merge vendor/negs`.
4. `bash engines/negs/tools/build.sh`; compare controls with that release's `web/controls.js`;
   compare test renders (plan §38); commit `runtime/`.
