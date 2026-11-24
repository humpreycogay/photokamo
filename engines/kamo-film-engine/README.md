# Kamo Film Engine

A dependency-free JavaScript film engine. It contains:

- **Spectral engine** (`src/spectral/`, current): a datasheet-driven film model
  built on the Film Scan Calibration dataset. 20 stocks and 6
  print/scan/view outputs.
- **v1 creative engine** (`FilmEngine`, `src/index.js`): uncalibrated RGB looks.
- **Material v2 prototype** (`src/material.js`, `src/datasheet-profile.js`):
  superseded; kept for its tests and API.

## Spectral engine

```js
import { readFile } from 'node:fs/promises';
import { SpectralDataStore, renderWithStore } from './src/index.js';

const data = new URL('./data/film-scan-calibration/', import.meta.url);
const store = new SpectralDataStore(async path => JSON.parse(await readFile(new URL(path, data), 'utf8')));

const result = await renderWithStore(store, imageData, {
  stockId: 'kodak-vision3-500t',
  outputId: 'kodak-2393',              // or 'scan-status-m', a paper, 'slide-light-table'
  settings: { filmExposure: 0.5, printBlue: -3, outputSpace: 'display-p3' },
});
// result: { width, height, data: Uint8ClampedArray, histogram, info, outputSpace }
```

Input is either 8-bit sRGB RGBA (`{ width, height, data }`) or scene-linear
Rec.709 (`{ width, height, linear: Float32Array, channels: 3 | 4 }`). In a
browser or worker, pass a `fetch`-based reader to `SpectralDataStore` (see
`../kamo-film-demo/render-worker.js`).

### Pipeline

1. **Input**: sRGB decode, with optional *highlight recovery* that inverts a
   generic camera roll-off for display-referred JPEGs; or scene-linear float.
2. **Scene**: lateral CA and vignette in linear light; reflectance spectrum
   (partition-of-unity basis, 400–740 nm / 5 nm) → layer exposure under the
   scene illuminant, balanced so 18 % grey under the design illuminant lands
   on the stock's normal exposure. This is an exact 3×3 per illuminant.
3. **Film**: halation (exposure above about +2 stops); **datasheet MTF** per
   layer, a constrained Gaussian-bank fit applied in log exposure; grain.
4. **Dyes**: each sheet's neutral series (Status M or A) is inverted once into
   **per-layer dye-amount tables**, and each layer is read on its own log H.
   Optional DIR interlayer inhibition works in amount space, with neutral
   pre-compensation so greys never move. The spectral density includes the
   D-min/orange mask.
5. **Output**:
   - **Optical print** (2393, Portra Endura, Endura Premier): a 3200 K lamp
     through Wratten 47B/99/25 tricolor bands (47B ≈ No. 98 − No. 2B). Band
     weights are solved so a grey card hits the green aim neutrally; any
     unreachable remainder becomes a per-layer residual.
   - **Laser print** (Pro Laser II): 473/532/685 nm lines.
   - Print dyes come from per-layer tables on the Status A neutral series.
     **Neutral lock** (default 100 %) keeps the grey axis neutral at every
     density, down to the paper's D-max.
   - **Status M scan**: per-channel inversion, with a neutral lock that maps
     R/B onto green's neutral ramp, then a filmic display curve.
   - **Slide** (E-6): spectral transmittance under D50; neutral lock optional
     (default 0 %, see below).
   - XYZ → Bradford (media white → D65) → linear **sRGB or Display P3**.
6. The film and output stages are baked into a LUT over log H, with
   tetrahedral interpolation: 49³ for negatives (about 130 ms to build) and
   65³ for slides.
7. **Display editing**: Light, Color, film amount, sharpening.

Controls and their stages: `src/spectral/controls.js`.

### Measured status (2026-11-24)

Tools: `test/` and the audit described below. ΔE2000: about 1 is just
visible; 2–3 is noticeable side by side.

| Check | Result |
| --- | --- |
| Grey card at normal exposure, all 20 stocks × outputs | Neutral; reversal keeps its datasheet bias |
| Grey ramp, negatives, −3…+3 stops, lock on | ≤ 0.3 ΔC\* down to paper D-max |
| Interlayer 0 → 100 % on greys | Δ < 0.05 ΔC\* (neutral by construction) |
| Print stage vs upstream's own print LUTs (Kodak papers; Pro Laser), timing aligned | Mean 1.3–2.6, p95 3.0–4.0 (Munsell + skin); regression test on 3 pairs |
| RGB → spectrum input (true spectra vs RGB) | Mean 1.8–2.9; the floor for RGB input |
| LUT precision | Negatives p95 ≤ 0.3; slides p95 1.35 |
| MTF fits vs published curves | RMS 0.002–0.032 (response 0–1) |

### Known limitations

- **No physical validation.** Nothing has been compared with real film.
  `tools/validate-chart.mjs` is ready for that: shoot a chart on film, measure
  its patches, and run `npm run validate -- chart.json --fit`.
- **Interimage (DIR) effects are not in any datasheet.** Without them the
  model renders chroma at about 0.8–1.0× input; Velvia 50 comes out at 0.86×
  although the real film is famously saturated. The *Interlayer effect*
  control models DIR inhibition (neutral-safe), but its strength is a free
  parameter until measured scans exist.
- Slides' datasheet neutral series is not exactly D50-neutral once traced
  dyes, Status A and the CIE observer meet. Upstream flags this as unresolved,
  so slides default to neutral lock 0 %.
- Grain and halation are not calibrated: the dataset has no RMS granularity
  and no halation data.
- C-41 dye spectra are upstream surrogate-basis fits. Five stocks use a
  surrogate spectral sensitivity. Paper grey aims (Status A 0.74) are a
  convention.
- JPEG input has already been tone-mapped by the camera; highlight recovery is
  a generic estimate. Scene-linear input avoids this.
- Standards tables (ISO 5-3, CIE) are third-party; see
  `data/film-scan-calibration/ATTRIBUTION.md` before commercial distribution.

### Validation tools

- `npm test`: unit tests plus agreement with upstream's print LUTs
  (`test/fixtures/upstream-print-reference.json`).
- `npm run validate -- chart.json [--fit] [--json]`: compares engine
  predictions with Lab values measured from a real film scan. Patches carry a
  spectral reflectance (preferred) or scene RGB. `--fit` fits film exposure
  and printer lights on the neutral patches only.
- `tools/build-reference-fixture.mjs`: rebuilds the reference fixture from
  upstream release cubes.

Copyright © 2026 PhotoKamo. All rights reserved. No open-source license is
granted for the engine code in this repository. Bundled data under
`data/film-scan-calibration/` keeps its own terms; see its `ATTRIBUTION.md`.
