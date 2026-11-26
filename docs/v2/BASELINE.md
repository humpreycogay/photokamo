# Workflow plan baseline

Recorded 2026-11-26 for `plan_workflow.md` Task 0, together with `v3plan.md` Task 5.

The 3 Basic + 2 film export baseline the plan asks for is shared with the v3 plan: see [`docs/v3/BASELINE.md`](../v3/BASELINE.md) (7 exports with sha256, size and time, made by `tools/v3-baseline.mjs`). This file adds the workflow Task 0 check: **every Basic preset** on the sample, exported before and after `processPixels` was split into the pure `adjustPixels`.

## Every Basic preset, sample photo

Steps: **Try a sample** → tap the preset → **Export** (JPEG 92 %, Full size: 1311 × 1514) → **Download**, one page, in headless Chromium 159.0.8154.6 (dev laptop, Apple M5). Time is from clicking Export to the download.

Before = commit `cef1818` (old `processPixels` on the main thread). After = `adjustPixels` in `js/adjust-worker.js` (exports above 1000 px now render in the Worker). **All 17 files are byte-identical.** sha256 shows the first 16 hex digits.

| Preset | sha256 (before = after) | Time before, ms | Time after, ms |
|---|---|---|---|
| original | `b02f7425992aed60` | 129 | 143 |
| clean-pop | `3f8366e945412c94` | 137 | 140 |
| soft-proof | `1c97e09dd229fc7d` | 173 | 161 |
| warm-natural | `0dfe2694b8901143` | 148 | 148 |
| portrait-air | `255d6241bb2721a7` | 162 | 162 |
| vivid-day | `361f3e7f903e70f8` | 147 | 166 |
| quiet-chrome | `e70f6a64bf721c81` | 192 | 1185 |
| golden-hour | `b19af057dcc3a134` | 164 | 168 |
| cool-document | `57629974190fafe8` | 158 | 159 |
| faded-print | `7127eafd61f1ab7c` | 164 | 162 |
| silver-mono | `711e6a6de444426b` | 163 | 172 |
| cinema-teal | `77474fbb51773e9e` | 156 | 184 |
| desert-dream | `2cda266662571fe1` | 163 | 152 |
| forest-matte | `0451d7faae6b7455` | 164 | 162 |
| neon-rain | `eda9fa90ae91bf53` | 187 | 164 |
| rose-memory | `4edb973ae034fee2` | 188 | 165 |
| hard-noir | `91ff482ac577d958` | 163 | 155 |

The after times include copying the photo into an ImageBitmap and transferring it to the Worker (about 0 to 25 ms on this laptop). In exchange, the main thread stays free.

## Synthetic fixtures

`node tools/workflow-fixtures.mjs`: 6 fixtures (grey ramp, warm and cool grey cards, clipped highlights, alpha edges, noisy photo) × 5 adjustment sets = 30 cases. `adjustPixels` gives the same bytes as the old `processPixels`: the goldens in the file were recorded from the old loop via a stand-in canvas context. `tools/workflow-fixtures.html` repeats this in the browser and compares the canvas path with `adjustPixels` on the opaque fixtures and on the sample with all 17 presets.
