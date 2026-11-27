# Workflow release: references and licence register

Register for the code added by `plan_workflow.md` (look search, histogram, Auto, recovery, export, healing). Same rules as [`docs/optics/REFERENCES.md`](../optics/REFERENCES.md): each method is written from the cited papers or specifications in our own words. No third-party code, tests, comments, images or data are copied or bundled.

**Licence of the new modules:** not decided yet (`plan_workflow.md` Open decision 3: GPL-3.0 like the app, or proprietary like `js/optics/`). Decide before Task 1 ships.

Rules:
- A source may be read for ideas only if its status below is `research-only`. Nothing from it is pasted, translated or closely paraphrased.
- Nothing licensed GPL, LGPL, AGPL, MPL, CC BY-SA or NC, or without a licence, is bundled.
- Test images are generated in code (`tools/workflow-fixtures.mjs`) or are PhotoKamo's own sample (`images/model.jpg`).

## Technical references (principles only)

| Topic | Reference | Equations / ideas used | Code reused | Task |
|---|---|---|---|---|
| Basic adjustments | PhotoKamo's own `processPixels` (now `adjustPixels`, `js/renderer.js`) | none new: Task 0 only moved the loop | none | 0 |
| sRGB transfer | IEC 61966-2-1 | encode/decode curve (already in `js/optics/color.js`) | none | 2–4 |
| Session recovery | W3C Indexed Database API 3.0; WHATWG Storage Standard (`estimate`, `persist`); W3C Web Locks API; FIPS 180-4 (SHA-256 via `crypto.subtle`) | one read-write transaction per save, durable on `complete`; revision marker; fingerprint of name, size, date, first/last 64 KiB (A§6.2) | none | 5 |
| Export size | PhotoKamo's own pipeline | exact target by rounding, render just above it and trim ≤ 2 px; progressive halving for resizes | none | 6 |
| Target file size | none (black-box search over the browser encoder's quality) | bisection over whole-percent quality, best fit ≤ target (A§9.3) | none | 7 |
| Healing brush | Ramer, U. (1972) and Douglas & Peucker (1973) line simplification; smoothstep brush falloff; coverage compositing (Porter & Duff 1984, "over" for independent coverage) | source-space strokes, RDP, arc-length stamps, 1 - Π(1 - a) coverage (A§7.1–7.2) | none | 9 |
| Heal source and blend | Sobel gradient operator; block matching by SSD on Y/Cb/Cr + gradients over the boundary band; Reinhard et al. (2001) mean/std colour transfer, per channel in linear RGB | annulus search 2R–6R, band max(3, R/2), mean/std match clamped 0.8–1.25, linear composite (A§7.3–7.4) | none | 10 |
| Metadata scanner | JEITA CP-3451 (Exif 2.3); Adobe TIFF 6.0; ISO/IEC 10918-1 (JPEG markers); W3C PNG (Third Edition) incl. `eXIf`; Google WebP container (RIFF) specification | marker/segment, IFD (12-byte entries, type widths), chunk + CRC-32, RIFF chunk walks with bounds, depth, entry and cycle caps (A§10.2–10.3) | none (CRC-32 is `js/zip.js`) | 8 |

| Histogram | Rec. 709 luma weights (ITU-R BT.709) on 8-bit code values | 256-bin display histogram, code-value clipping (A§4, C6) | none | 2 |
| Auto white balance | Finlayson & Trezzi (2004) Shades of Gray (p = 6); bright-pixel neutral estimate; CIE76 ΔE for fixtures | two estimators, agreement × coverage confidence, fit through `adjustPixels` (A§5.3) | none | 3 |
| Auto | coordinate descent over the existing controls on a percentile/clipping loss (A§5.2, A§5.4) | none beyond the plan | none | 4 |

## Candidate register

None yet. Add a row (name, URL, reported licence, status, notes) before reading any repository for a task.
