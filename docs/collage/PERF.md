# Collage: performance

Measured with Chrome on a MacBook (Apple silicon), through Playwright, on the repo's `python -m http.server`.
The automated browser runner used for the initial rows is not installed in this workspace. The release matrix below is the required manual measurement sheet; blank cells must not be presented as measured results.

| Date | Case | Result |
|---|---|---|
| 2026-11-25 | Preview: 4 photos (1 Kamo, 3 Basic, ≈ 2 MP), open collage until every slot is sharp | ≈ 0.4 s |
| 2026-11-25 | Preview: 6 layout switches with 9 photos | 0 photo decodes; ≈ 2 frames each including the draw |
| 2026-11-25 | Export Full: 9 photos from 24 MP sources (3 Kamo film looks), 3 × 3, sheet capped to the measured 64 MP (8000 × 8000 JPEG) | 6.6 s (target < 15 s) |
| 2026-11-25 | 10 repeated exports (Share size, JPEG/WebP), offline | all succeed; no network requests; browser memory flat (no growth) |

Peak memory per export is one photo's full render plus the sheet canvas: photos are rendered, drawn and freed one at a time
(`js/collage/export.js`). The device limit is measured once per browser (`photokamo:canvas-limit` in localStorage).

## Release measurement matrix

Record wall time from opening the collage until all visible slots are sharp (Preview), and from starting preparation until encoding completes (exports). Use the same source set per device: 4, 9 and 36 photos, once Basic-only and once with exactly 3 Kamo photos. Record peak browser/process memory where the platform exposes it; otherwise write “not exposed”, never an estimate.

| Device | Photos | Mix | Preview | Share time / peak | Full time / peak | Print time / peak |
|---|---:|---|---:|---:|---:|---:|
| Development laptop | 4 | Basic | pending manual QA | pending | pending | pending |
| Development laptop | 4 | 3 film | pending manual QA | pending | pending | pending |
| Development laptop | 9 | Basic | pending manual QA | pending | pending | pending |
| Development laptop | 9 | 3 film | pending manual QA | pending | pending | pending |
| Development laptop | 36 | Basic | pending manual QA | pending | pending | pending |
| Development laptop | 36 | 3 film | pending manual QA | pending | pending | pending |
| Owner phone | 4 | Basic | pending manual QA | pending | pending | pending |
| Owner phone | 4 | 3 film | pending manual QA | pending | pending | pending |
| Owner phone | 9 | Basic | pending manual QA | pending | pending | pending |
| Owner phone | 9 | 3 film | pending manual QA | pending | pending | pending |
| Owner phone | 36 | Basic | pending manual QA | pending | pending | pending |
| Owner phone | 36 | 3 film | pending manual QA | pending | pending | pending |

Print means A4 at 300 dpi before the measured device cap. For 36 photos use the 35 mm contact sheet. Cancel between runs, wait for idle, and repeat each timing three times; report the median. Ten repeated Share exports must also show no retained-memory growth.
