# Verifying the DuXun port against the original plugin code

`js/engines/duxun/core.js` is a JavaScript port of the plugin's CPU renderer. This folder checks it
against the **original C++**, compiled from `engines/duxun/src/ofx/DuXunFilm/DuXunFilmSim.cpp`.

1. `python make_harness.py ../../src/ofx/DuXunFilm/DuXunFilmSim.cpp ref.cpp` copies the plugin's
   presets, pixel functions and `renderAction` parameter maths **verbatim by line range** into
   `ref.cpp`, replacing only the OpenFX image I/O with raw files. Check the line ranges in the
   script after updating `src/`.
2. Build it: `build.bat` (MSVC Build Tools) or `g++ -O2 -o ref ref.cpp`.
3. `node compare.mjs <repository root>` renders a synthetic 1920×1080 test image through both and
   prints the 8-bit difference per configuration; `node compare.mjs <root> grain` compares grain
   strength.

The WebGL2 renderer (`js/engines/duxun/gpu.js`) was checked against `core.js` in Chrome on the same
image: without grain identical up to 8-bit rounding (mean difference ≤ 0.03 levels, max 1); grain
strength within 0.3 % (3.746 vs 3.742 Portra 400, 10.184 vs 10.174 Tri-X, 11.671 vs 11.666 CineStill
800T, 30.963 vs 30.932 Delta 3200 dye clouds).

Result for DuXun `91357a3` (2026-11-20):

- Every configuration without grain (presets, halation, B&W print, vignette, print stocks, colour
  head, expand, split toning, push/pull, acutance, bloom, Rec.709 transforms, colour-only scope):
  **identical up to 8-bit rounding** (mean difference 0.000, max 1 level, 0 % of pixels > 1 level).
- Grain and damage: the plugin's noise is `fract(sinf(…) * 43758.5)` on large arguments, so the
  random pattern depends on the platform's `sinf`; the port emulates float32 but the browser's
  `Math.sin` rounds differently. The **strength** matches: grain std-dev 3.742 vs 3.744 (Portra
  400), 10.174 vs 10.179 (Tri-X), 11.666 vs 11.664 (CineStill 800T), 30.932 vs 30.932 (Delta 3200,
  dye clouds); average brightness within 0.01 levels.
