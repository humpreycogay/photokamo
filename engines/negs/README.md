# Film engine: negs (WebAssembly + WebGPU)

[negs](https://github.com/noahhaasis/negs) is a Rust spectral film engine from the spektrafilm
family (Andrea Volpato's [spektrafilm](https://github.com/andreavolpato/spektrafilm), via
turbasvin's [spektrafilm-rs](https://github.com/turbasvin/spektrafilm-rs)). PhotoKamo builds its
browser engine (`crates/spektrafilm-wasm`) unchanged and runs it in a Web Worker. Nothing is
uploaded: the photo stays on the device.

| Path | What it is |
|---|---|
| `src/` | PhotoKamo's own copy of the negs v0.17.0 source, unchanged. See `UPSTREAM.md`. |
| `runtime/pkg/` | The engine, built from `src/` with wasm-bindgen (`spektrafilm_wasm.js` + `_bg.wasm`, 8.7 MB). |
| `runtime/catalog.json` | Films, papers, colour filters and every default setting, made by the engine at build time. |
| `LICENSE` | GNU GPL v3 (negs). Data licences: `src/data/SPEKTRAFILM_LICENSE.txt`, `src/data/FOTUFILM_LICENSE.txt` (CC BY-SA 4.0). |
| `UPSTREAM.md` | Where `src/` came from, what was left out, and how to update. |
| `credits.json` | Authors, licences and links shown in the app. |
| `tools/build.sh` | Rebuilds `runtime/` from `src/`. |
| `tools/make-catalog.mjs` | Writes `runtime/catalog.json` (adapted from negs `web/make-catalog.mjs`). |
| `tools/import.sh` | Replaces `src/` with a new upstream release (only when the owner decides). |

Profiles, LUTs and filters are not copied into `runtime/`: the app fetches each file from
`src/data/` the first time a render needs it, so they stay exactly as upstream ships them.

Rebuild (Rust 1.89+, `wasm32-unknown-unknown`, `wasm-bindgen-cli` 0.2.121, Node 18+), from the
repository root:

```sh
bash engines/negs/tools/build.sh
```

## How PhotoKamo uses it

`js/engines/negs/worker.js` starts the engine on **WebGPU** when the browser has it, otherwise on
the **CPU**, and renders the complete film model (grain, halation, couplers, glare…) in every
preview. Controls (`js/engines/negs/params.js`) follow negs's own inspector (`web/controls.js`):
same parameters, labels, ranges and steps; defaults come from `runtime/catalog.json`.

Measured in desktop Chrome on the 1311 × 1514 sample photo:

| | First preview | Each change | Full render |
|---|---|---|---|
| WebGPU, 1280 px preview | 1.7 s | 0.04–0.06 s | 0.08 s |
| CPU, 512 px preview (no WebGPU) | ≈ 3 s | ≈ 3 s | 18–25 s |

The CPU engine takes about 11 µs per pixel, so without WebGPU previews are 512 px. WebGPU and CPU
renders are identical (mean ΔE2000 ≤ 0.08). Compared with the spektrafilm-rs engine on the same
stock and paper (effects off), negs differs by mean ΔE2000 2.8–4.1: it is a newer version of the
model (gamut compression, updated defaults).
