# v3 Task 9: tiled full-size film renders, performance

Measured 2026-11-27 on the dev laptop (Apple M5), headless Chromium 159, through the real app (`tools/v3-baseline.mjs`-style driver): open the photo, pick **Kodak Portra 400**, set Halation 80 and Grain 60 in the film settings, Export at Full size. Photos are the sample scaled to 4, 12 and 24 MP. "Before" is commit `dd76286` (film exports capped at 4 MP); "after" is the tiled render (1024 px tiles on desktop).

Memory is the resident size of Chromium's renderer processes (the page and its Workers), sampled every 100 ms. "Added" is the peak during the export minus the size just before it, i.e. what the export itself costs.

## Time and size

| Photo | Before: export size, time | After: export size, time |
|---|---|---|
| 4 MP (2449 × 1633) | 2449 × 1633, 2.9 s | 2449 × 1633, 2.7 s (single pass, as before) |
| 12 MP (4243 × 2828) | 2450 × 1633 (capped), 3.1 s | 4243 × 2828, 14.7 s |
| 24 MP (6000 × 4000) | 2449 × 1633 (capped), 3.0 s | 6000 × 4000, 40.2 s |

The tile margin at 24 MP is 316 px (halation's blur reach is about 150 px, and the film MTF bank about 160 px), so a 1024 px tile renders a 1656 px square: about 2.6× the work of the pixels it keeps. That overhead, not the pixel count, dominates the 24 MP time.

## Memory added by the export

| Export | Before (4 MP cap) | After, 1024 px tiles | After, 512 px tiles |
|---|---|---|---|
| 4 MP, JPEG | 111 MB | (single pass) | — |
| 4 MP, PNG | 331 MB | 208 MB | — |
| 12 MP, JPEG | (capped to 4 MP) | 471 MB | — |
| 24 MP, JPEG | (capped to 4 MP) | 683 MB | 524 MB |
| 24 MP, PNG | 307 MB at 4 MP | 721 MB | — |

**The plan's bar (24 MP peak ≤ 1.5 × the old 4 MP peak) is not met.** A full-size result needs several full-size buffers at once: the Worker's copy of the photo, its output canvas, the bitmap returned to the page, the framed export canvas, and the encoder. That's 96 MB each at 24 MP before any engine work, plus one tile's working set (about 80–100 MB at 1024 px with a 316 px margin). Phones (coarse pointer) use 512 px tiles, and their canvas limit (measured, typically 16.7 MP on iOS) caps the render.

The next step that would meet the bar is computing halation and the wide MTF terms once for the whole frame at low resolution (they are large, smooth blurs) and upsampling them per tile. The margin would drop from about 316 px to a few pixels, so tiles could be small without the overlap overhead. It changes the rendered result slightly, so it needs its own approval.

## Equivalence

- Engine test (`test/tiles.test.js`): tiles of 256 and 333 px with grain, halation, MTF, chromatic aberration and sharpening on equal the single-pass render to within 1/255 (two stocks). Sanity check: without the margin the difference is 4/255; with per-tile grain (the old sequential RNG) it is 70/255.
- Browser path (tiles drawn from the bitmap): a 6 MP export rendered tiled and in one pass (PNG) differs by at most 1/255, in 46 of 6,000,000 pixels.
- 24 MP export: the pixel steps across the tile boundaries are within the normal spread of neighbouring columns (no seam).

## Not measured here

- The owner's phone: whether a 16.7 MP film export completes, and its time and memory.
