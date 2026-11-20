# Film engine: DuXun (JavaScript port)

[DuXun Film Simulation](https://github.com/DuXun03/duxun-film-simulation) is an OpenFX film plugin
for DaVinci Resolve (GPL-2.0-or-later). PhotoKamo ports its CPU renderer to JavaScript and runs it
in a Web Worker: 54 film presets, tone curve, film colour matrices, print stocks and printer lights,
grain, halation, bloom, dust & scratches and vignette. Nothing is uploaded.

| Path | What it is |
|---|---|
| `src/` | PhotoKamo's own copy of the plugin source (commit `91357a3`), unchanged, without its `.cube` LUTs. See `UPSTREAM.md`. |
| `LICENSE` | GNU GPL v2 text (the project is GPL-2.0-or-later; PhotoKamo uses it under GPL-3.0). |
| `UPSTREAM.md` | Source, what was left out, how the port differs, how to update. |
| `credits.json` | Authors, licences and links shown in the app. |
| `tools/import.sh` | Replaces `src/` with a new upstream commit (only when the owner decides). |
| `tools/verify/` | Compiles the plugin's original C++ pixel code and compares it with the port. |

The port lives in `js/engines/duxun/`: `core.js` (renderer and presets), `params.js` (controls, as
the plugin defines them), `index.js` (engine contract), `worker.js`. There is nothing to build or
download beyond those scripts (about 60 KB).

Verified against the original C++ on a 1920×1080 test image: identical up to 8-bit rounding
without grain; grain strength within 0.1 % (`tools/verify/README.md`).
