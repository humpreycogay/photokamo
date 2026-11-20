# Upstream: DuXun Film Simulation

`src/` is PhotoKamo's own copy of the DuXun source. It changes only when the PhotoKamo owner
decides to update it; nothing upstream flows in automatically.

| | |
|---|---|
| Project | DuXun Film Simulation (独寻胶片模拟), an OpenFX film plugin for DaVinci Resolve |
| Origin | <https://github.com/DuXun03/duxun-film-simulation> |
| Commit | `91357a308d0b76f1a00a284af274579688613dc0` (2026-06-14, v5.0) |
| Imported | 2026-11-20 |
| Licence | GPL-2.0-or-later (README "License", `SPDX-License-Identifier` in `DuXunFilmSim.cpp`); `LICENSE` is the GPL v2 text. PhotoKamo uses it under GPL-3.0, as "or later" allows. |
| Components | Grain/halation/bloom ideas from NativeEnhancer-FE (MIT); DCTL helpers ported from boomyjee/mycolor (MIT); presets from t3mujinpack (MIT). See `src/THIRD_PARTY_NOTICES.md`. |

## Left out of the copy

- `.git/`, `.github/`
- every `*.cube` file: `presets/film_stocks/*.cube` and `presets/idt/*.cube` (≈ 147 MB) and
  `scripts/luts/`, `scripts/luts_src/` (≈ 169 MB). The plugin's own docs say it does not load
  `.cube` files at render time (`docs/preset-resource-mapping-2026-06-05.md`); some are camera-log
  conversions whose provenance the repository does not record.

Everything else is copied byte-for-byte (LF line endings, as upstream).

## How PhotoKamo uses it

**No changes to `src/`.** The browser can't run an OpenFX plugin, so PhotoKamo **ports** the
plugin's CPU renderer to JavaScript: `js/engines/duxun/core.js` (presets, preset → slider defaults,
profile defaults, and the pixel pipeline of `renderAction`/`renderRows`, function by function).
`js/engines/duxun/gpu.js` runs the same pipeline in WebGL2 (glow buffers, blur passes and the
per-pixel shader, with the constants from `core.js` `prepare()`); the worker uses it when the browser
supports WebGL2 and falls back to `core.js` otherwise. Its noise uses an integer hash instead of
`fract(sin(…) * 43758.5)`, which GPUs compute poorly for large arguments: same distribution, and
grain strength matches. Controls (`js/engines/duxun/params.js`) use the plugin's parameter names, ranges, defaults and
groups, with the Chinese labels translated.

Differences, all for still photos in a browser:

- Film Breath, Gate Weave and Overscan move the picture from frame to frame (video only): left out.
  Render time is 0, so Dust & Scratches keep one pattern.
- The plugin works in timeline pixels; PhotoKamo renders as if the photo were on a 1920 px wide
  timeline (grain coordinates and glow buffers scale with the photo), so the preview and a full-size
  export look the same. At 1920 px wide the two are the same.
- "Timeline / no conversion" uses the photo's sRGB values, as the plugin uses the timeline's.
- The brand + film dropdowns are one film list grouped by brand. Choosing a film applies its preset
  (except "Custom"), as the plugin's `instanceChangedAction` does; Reset returns a slider to the
  film's preset value.

**Verified** against the original C++ (`tools/verify/`): identical up to 8-bit rounding without
grain; grain strength within 0.1 %.

## Updating (only when the owner decides)

1. `git checkout vendor/duxun` (untouched upstream imports only).
2. `bash engines/duxun/tools/import.sh <commit>`, update the commit above, commit "Import DuXun <short>".
3. `git checkout main && git merge vendor/duxun`.
4. Port any renderer changes into `js/engines/duxun/core.js` / `params.js`, then run
   `tools/verify/` until it matches again.
