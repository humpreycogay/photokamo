# Collage: references and licence register

PhotoKamo's collage mode (`js/collage/`, `tools/collage-check.mjs`) is **original GPL-3.0 code**, written for this repository from `CollagePlan.md`. Nothing third-party is used.

Rules:
- No third-party code, libraries, templates, shapes, masks, textures, fonts or images are copied or bundled. No CDNs and no runtime dependencies (`CLAUDE.md`).
- Shapes (`js/collage/shapes.js`) are drawn by our own path definitions: regular polygons and stars from their geometry, the heart from two mirrored cubic Béziers with our own constants, stamp perforations from evenly spaced half-disc bites. Built-in SVG path data only; no imported masks.
- Paper textures, tape, film-base colours and edge markings are **generated in code** (seeded noise, simple drawing). Film edge text uses generic wording only: no real brand names, logos or trade dress.
- Text uses the fonts already bundled under `fonts/` (OFL-1.1, licences next to the files).
- Every bundled asset added later (image, texture, mask, font) gets a row below with its source and licence **before** it is committed. Nothing GPL-incompatible, CC BY-SA, NC, or without a licence is bundled.

## Asset register

| Asset | Path | Source | Licence | Notes |
|---|---|---|---|---|
| — | — | — | — | No bundled collage assets: every shape, texture and decoration is generated in code |

## Technical references (principles only)

| Topic | Reference | Used for |
|---|---|---|
| Canvas 2D clipping, `Path2D`, `ellipse()` arc rules | HTML Living Standard, canvas section | `shapePath()`; `shapePolygon()` follows the same arc direction rules |
| Flattening cubic Béziers | Wang's formula (segment count from the control polygon's second differences) | `shapePolygon()` tolerance |
| Cubic Bézier bounding box | Roots of the derivative (a quadratic) | Fitting the heart to its box |
| Polygon area, point in polygon | Shoelace formula; even-odd crossing rule | `polygonArea()`, `pointInPolygon()`, checks |
| Polygon clipping | Sutherland–Hodgman clipping and half-plane intersection | Cut grid, radial and free-layout slots to shaped sheets |
| Deterministic pseudo-random values | Integer hash/mixing functions implemented in `scrapbook.js` | Resolution-independent fibre and tape variation; no copied texture assets |

## Persistence and privacy

Saved collage records contain only PhotoKamo document data and references to photos in the local session. They contain no network identifiers and are never uploaded. Until `plan_workflow.md` Task 5 supplies the IndexedDB photo-session store, the list is intentionally memory-only: persisting numeric slot references without their source photos would create broken, misleading records.
