# Optics: performance and parity (plan_optics Task 10)

Measured 2026-11-24 on the development laptop (Apple Silicon, Node 24 for the pipeline timings; headless Chromium for the app and parity page). The pipeline is plain JavaScript in a Web Worker; times in the browser Worker are within ~10 % of Node.

## Time per effect

`node bench.mjs` style run on a synthetic textured photo (3:2). "1 MP" is the preview size (the app previews at ≤ 1000 px).

| Effect | 1 MP (preview) | 12 MP | 24 MP |
|---|---|---|---|
| Light falloff | 9 ms | 110 ms | 210 ms |
| Distortion + fringing | 33 ms | 360 ms | 740 ms |
| Diffusion | 90 ms | 410 ms | 760 ms |
| Bloom | 110 ms | 470 ms | 630 ms |
| Lens flare | 70 ms | 310 ms | 580 ms |
| Depth of field | 260 ms | 1.0 s | 1.5 s |
| Depth of field + bokeh | 390 ms | 1.5 s | 2.1 s |
| Diffraction (f/22, MFT) | 45 ms | 450 ms | 1.15 s |

Everything on at once (falloff, distortion, fringing, diffusion, bloom, flare, depth of field with 6-blade bokeh, diffraction):

| Size | Time | Process RSS |
|---|---|---|
| 1 MP | 0.56 s | 0.18 GB |
| 12 MP | 1.9 s | 0.30 GB |
| 24 MP | 3.3 s | 0.38 GB |
| 45 MP | 6.0 s | 0.54 GB |
| 100 MP | 14.5 s | 1.18 GB |

Memory: the image itself (4 bytes/px), one copy for the geometry resample, a 16-bit plane for diffraction (2 bytes/px), and ≈ 70 MB of working-grid float layers regardless of size. In the browser add the source bitmap the main thread holds and the result bitmap. The Worker now releases its decode canvas before processing.

## What changed in Task 10

| Change | Effect |
|---|---|
| Box blur: inline edge handling; vertical pass row by row (one running sum per column) instead of column by column | All blurs ≈ 2× faster (1 MP depth of field 392 → 260 ms) |
| Bokeh: stamp cache (radius ¼ px, cat-eye shift ½ px); only points of light that stand out from their surroundings become shapes | 1 MP depth of field + bokeh 1066 → 390 ms; shapes unchanged (disc 81 px vs 80 expected, squeeze 1.9×, hexagon 0.90) |
| Diffraction: padded rows, vertical pass row by row | 24 MP 1.85 → 1.15 s; edge widths unchanged |
| Optics Worker queue: one job at a time; a newer preview request replaces a waiting one | Dragging a slider no longer builds a backlog (30 rapid steps with heavy optics: preview settles ≈ 0.2 s after release, Basic and Kamo) |
| Film-engine previews take preview-size optics scaled up to full size (the engine needs full-size input for its physical scale); Render full quality and export still use full-size optics | Kamo preview with heavy optics ≈ 1.2 s instead of several seconds at 24 MP |
| Worker frees the decode canvas before running the pipeline | One full-size buffer less at peak |

## Preview / export parity

`tools/optics-parity.html`: the sample photo at 3000 px (full) and 1000 px (preview); the full render is box-averaged down and compared. Pass: mean difference < 2 / 255 and no 16 × 16 block > 8 / 255. The ≈ 0.95 mean even for falloff is the floor from resampling the source, not the optics.

| Case | Mean | Worst block | Result |
|---|---|---|---|
| Light falloff | 0.95 | 0.83 | Pass |
| Distortion + fringing | 1.30 | 2.64 | Pass |
| Diffusion | 0.96 | 2.53 | Pass |
| Bloom | 1.03 | 1.11 | Pass |
| Flare (brightest area) | 1.01 | 2.66 | Pass |
| Flare (by hand) | 0.99 | 0.89 | Pass |
| Depth of field | 0.55 | 2.16 | Pass |
| Depth of field + bokeh | 0.88 | 4.62 | Pass |
| Diffraction f/22 MFT | 1.79 | 1.42 | Pass (≈ 1 px at full size; the preview skips it) |
| Everything | 0.57 | 3.72 | Pass |

## WebGPU decision

**Not now.** Each effect alone previews in ≤ 0.4 s, and the queue keeps the preview current while dragging. Full-size renders run in the Worker without blocking the page (24 MP ≈ 3 s with everything on). Revisit WebGPU if one of these becomes a goal:
- live preview while dragging with everything on (now ≈ 0.6 s per frame);
- 45–100 MP exports in a few seconds (now 6–15 s).
Moving the working-grid blurs and the composite passes to compute shaders would cover both.

## Limits and risks

- **Canvas size limits.** iOS Safari caps a canvas at about 16.7 MP. That already limits PhotoKamo's full-size export of larger photos (renderImage, the film engines); the optics Worker hits the same cap. Not new, but worth a dedicated fix (tiled export) if large photos on iPhone matter.
- **100 MP** needs ≈ 1.2 GB in the Worker plus the page's own buffers. Fine on desktop; phones may run out of memory. A strip-based geometry pass would remove the full-size copy if needed.
- Timings are from one fast laptop; mid-range phones are typically 3–6× slower.
