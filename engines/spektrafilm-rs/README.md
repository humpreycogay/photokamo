# Film engine: spektrafilm-rs (WebAssembly)

PhotoKamo's Advanced mode runs [spektrafilm](https://github.com/andreavolpato/spektrafilm) by Andrea Volpato,
a spectral simulation of colour film, printing and scanning. It uses the Rust port
[spektrafilm-rs](https://github.com/turbasvin/spektrafilm-rs), compiled to WebAssembly (`wasm32-wasip1`)
and run in a Web Worker with an in-memory file system. Nothing is uploaded: the photo stays on the device.

| Path | What it is |
|---|---|
| `src/` | PhotoKamo's own copy of the spektrafilm-rs source, with our changes applied. See `UPSTREAM.md`. |
| `runtime/spektrafilm.wasm` | The `spektrafilm` command-line program, built from `src/`. |
| `runtime/data/` | The subset of `src/data/` the app uses, unmodified: one profile per offered film and paper, the neutral print filter database, and the `irradiance_xy_tc.npy` spectral-upsampling LUT. |
| `LICENSE` | GNU GPL v3, the licence of the spektrafilm-rs code. |
| `licenses/SPEKTRAFILM_LICENSE.txt` | CC BY-SA 4.0, the licence of the film and paper profiles (by Andrea Volpato; each profile's `license` field says so too). Copied unchanged, as the file asks. |
| `UPSTREAM.md` | Where `src/` came from (commit), what was left out, our changes, and how to update. |
| `manifest.json` | Size and SHA-256 of every file the app downloads, and a version id: exact download progress, and the key for the copy saved on the device (Cache Storage). Written by `tools/engine-manifests.mjs` (run by `tools/build.sh`). |
| `credits.json` | Authors, licences and links shown in the app. |
| `patches/photokamo.patch` | Our changes to upstream as one file (also applied in `src/`). |
| `tools/build.sh` | Rebuilds `runtime/` from `src/`. |
| `tools/import.sh` | Replaces `src/` with a new upstream version (only when the owner decides; see `UPSTREAM.md`). |

## Source

- Our copy: `src/`, from <https://github.com/turbasvin/spektrafilm-rs> at commit
  `9dd59b0380194b93686aaa230a8bb9680aa270a4`, plus PhotoKamo's changes:
  1. builds for WebAssembly: no GPU backend (`wgpu` off by default) and no native BLAS on wasm (uses the
     existing pure-Rust matrix path);
  2. adds a `lut` command: a colour-only 3D LUT from the full spectral pipeline (spatial effects off,
     whole grid in one batch, auto-exposure metered from a given image) for fast previews;
  3. adds a `defaults` command that prints the default runtime parameters as JSON.

Rebuild (needs Rust 1.85+; engine source comes from `src/`, Rust crates from crates.io pinned by
`Cargo.lock`), from the repository root:

```sh
bash engines/spektrafilm-rs/tools/build.sh
```

## How PhotoKamo uses it

`js/engines/spektrafilm-rs/worker.js` runs two commands (the engine is loaded only when Advanced mode needs it; see `js/engines/registry.js`):

- `lut … --size 33` for previews. The LUT is applied to a 1280 px copy of the photo. Colour matches the full
  model (mean difference 0.16/255 in testing); grain, halation and blur are not shown.
- `process …` for "Render full quality" and Advanced exports: the complete model. Size is capped at 4 MP
  (2.5 MP on touch devices) because the engine needs about 100 MB of memory per megapixel.

Measured on a desktop CPU, single-threaded WebAssembly: 1280 px full render about 10 s; 33³ LUT about 0.7 s.

## Credits and licences

- spektrafilm: Andrea Volpato. Film and paper profiles and the pipeline design come from that project.
- spektrafilm-rs: the Rust port, GPL-3.0.
- Spectral upsampling LUT (`hanatos2025`): Johannes Hanatos ([vkdt](https://github.com/hanatos/vkdt)).
- WASI runtime in the browser: [@bjorn3/browser_wasi_shim](https://github.com/bjorn3/browser_wasi_shim)
  0.4.1, MIT OR Apache-2.0 (`js/engines/spektrafilm-rs/vendor/`).
