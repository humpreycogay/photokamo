# Collage: performance

Measured with Chrome on a MacBook (Apple silicon), through Playwright, on the repo's `python -m http.server`.
Phone rows and the full table (4, 9 and 36 photos at Share/Full/Print) come with CollagePlan.md Task 10.

| Date | Case | Result |
|---|---|---|
| 2026-11-25 | Preview: 4 photos (1 Kamo, 3 Basic, ≈ 2 MP), open collage until every slot is sharp | ≈ 0.4 s |
| 2026-11-25 | Preview: 6 layout switches with 9 photos | 0 photo decodes; ≈ 2 frames each including the draw |
| 2026-11-25 | Export Full: 9 photos from 24 MP sources (3 Kamo film looks), 3 × 3, sheet capped to the measured 64 MP (8000 × 8000 JPEG) | 6.6 s (target < 15 s) |
| 2026-11-25 | 10 repeated exports (Share size, JPEG/WebP), offline | all succeed; no network requests; browser memory flat (no growth) |

Peak memory per export is one photo's full render plus the sheet canvas: photos are rendered, drawn and freed one at a time
(`js/collage/export.js`). The device limit is measured once per browser (`photokamo:canvas-limit` in localStorage).
