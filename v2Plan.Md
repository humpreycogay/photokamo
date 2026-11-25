# PhotoKamo v2: product roadmap and implementation plan

**Status:** implementation proposal for product confirmation  
**Created:** 2026-11-25  
**Scope:** product priorities followed by browser-native algorithms, mathematics, schemas, integration points, and verification. This document contains no implementation.

## Product review and recommended roadmap

I reviewed the active PhotoKamo codebase and current roadmap. PhotoKamo already has a surprisingly capable editor, especially for a browser-only, privacy-first product.

### What PhotoKamo already does well

Current functionality includes:

- 20 basic looks and 81 film looks
- Detailed spectral film simulation
- Exposure, white balance, tone, color, grain, vignette, and clarity
- Crop, straighten, rotate, flip, and platform dimensions
- Advanced lens effects:
  - Distortion and chromatic aberration
  - Diffusion and bloom
  - Depth of field and focus masks
  - Aperture shapes and bokeh
  - Diffraction and flare
  - Camera formats and focal lengths
- Frames, paper borders, film strips, and blurred backgrounds
- Multiple movable text layers
- Per-photo undo/redo
- Batch editing and batch export
- Saved and favorite looks
- Before/after comparison
- JPEG, PNG, WebP, ZIP, and Web Share
- Entirely local image processing

Because PhotoKamo already has deep film and lens controls, adding more film presets should not be the immediate priority. The largest opportunities are now **automatic improvements, local corrections, workflow persistence, and discoverability**.

### Recommended feature roadmap

#### 1. Auto Enhance

**Priority: Very high · Effort: Medium**

Add one button that analyzes the photo and suggests:

- Exposure
- White balance
- Highlight recovery
- Shadow lifting
- Contrast
- Vibrance

Users commonly want a good result without understanding every slider. This would make PhotoKamo much more approachable.

It can remain privacy-first by analyzing a reduced-size image locally. It should apply normal adjustment values, so users can inspect, change, and undo the result.

Useful options:

- Auto Enhance
- Auto Light
- Auto White Balance
- Auto Color

This is likely the best next feature for broad user value.

#### 2. Healing and Object Removal

**Priority: Very high · Effort: High**

Users frequently want to remove:

- Skin blemishes
- Dust spots
- Sensor marks
- Power lines
- Small distracting objects

Start with a simple **healing brush**, not generative AI:

1. User paints over an unwanted region.
2. The app chooses a nearby source area.
3. Texture and color are blended locally.

Then add:

- Clone stamp
- Adjustable brush size and feather
- Source-point selection
- Show/hide mask
- Individual removable healing operations

This fits PhotoKamo’s local-processing promise better than a cloud-based generative remover.

#### 3. Project Saving and Session Recovery

**Priority: Very high · Effort: Medium–High**

At present, favorites and custom looks persist, but complete editing sessions do not appear to be durable projects.

Users will want to:

- Close the tab and continue later
- Recover work after an accidental refresh
- Save multiple editing projects
- Export or import a project file
- Preserve edits without duplicating the original image

Suggested implementation:

- Store projects and source images in IndexedDB
- Auto-save non-destructive settings
- Add a start-screen “Recent projects” section
- Allow export/import of a PhotoKamo project package
- Display storage use and provide a clear-project-data action

This would make PhotoKamo feel like a real editor rather than a single-session tool.

#### 4. Curves, Levels, and Histogram

**Priority: High · Effort: Medium**

The current adjustment set is good, but advanced users will expect:

- RGB histogram
- Luminance histogram
- Black and white clipping indicators
- Levels: black point, midpoint, white point
- Tone curve
- Optional red, green, and blue channel curves

A strong first version could provide:

- Histogram in the Adjust panel
- Parametric curve with Highlights/Lights/Darks/Shadows
- Clipping warnings when holding a key or pressing an icon

This adds serious editing value without competing with the film engine.

#### 5. Selective Adjustments and Masks

**Priority: High · Effort: High**

PhotoKamo already has mask concepts for depth of field, so expanding that architecture would be valuable.

Mask types:

- Linear gradient
- Radial gradient
- Brush
- Luminance range
- Color range

Each mask could control:

- Exposure
- Highlights and shadows
- Temperature and tint
- Saturation
- Clarity
- Blur
- Vignette or glow

This enables common tasks such as:

- Brightening a face
- Darkening a sky
- Warming only the subject
- Desaturating a background
- Adding a local spotlight

This is one of the strongest long-term additions, but it needs a careful state and rendering design.

#### 6. Portrait Tools

**Priority: High for mobile/social users · Effort: Medium–High**

Useful portrait-specific controls:

- Skin smoothing
- Blemish healing
- Teeth whitening
- Eye brightness
- Under-eye softening
- Skin-tone protection
- Face relighting
- Background blur presets

Avoid automatic face reshaping initially; it can feel intrusive and requires more complex detection.

A good privacy-first approach would use local face landmarks only if they can be shipped and executed fully on-device. Otherwise, begin with manually placed portrait masks.

#### 7. Perspective and Geometry Correction

**Priority: High · Effort: Medium**

PhotoKamo currently supports lens distortion and straightening, but architectural and document photos also need:

- Vertical perspective correction
- Horizontal perspective correction
- Four-corner correction
- Keystone correction
- Auto-level based on visible lines
- Grid overlays
- Guided upright correction

This would help travel, building, interior, product, and document photography. It belongs naturally beside Crop or Lens.

#### 8. Better Noise Reduction and Sharpening

**Priority: High · Effort: Medium–High**

Current clarity/sharpness and film grain are useful, but users may want technical cleanup:

- Luminance noise reduction
- Color noise reduction
- Edge-aware sharpening
- Radius, amount, and threshold
- “Remove JPEG artifacts”
- Detail preview at 100%

This is especially useful for mobile photos, scans, and low-light images.

Keep noise reduction before film grain in the pipeline, so users can clean digital noise and then add intentional film texture.

#### 9. Custom LUT Import and Export

**Priority: Medium–High · Effort: Medium**

Advanced users often want `.cube` LUT support.

Features:

- Import 3D LUT
- Strength slider
- Save LUT as a custom look
- Export a compatible PhotoKamo look as LUT where possible
- Clearly explain that spatial effects such as grain, bloom, and halation cannot be represented in a LUT

This can attract creators who already use Resolve, Lightroom alternatives, or mobile video apps. It can still work entirely offline.

#### 10. Collages and Layouts

**Priority: Medium–High · Effort: Medium–High**

Moved to its own plan: [CollagePlan.md](CollagePlan.md) (grids, diptych/triptych, film contact sheets, masked and scrapbook layouts). It is a separate mode with its own document model, so it is planned and delivered separately from this roadmap.

#### 11. Metadata, Date Stamps, and Camera Labels

**Priority: Medium · Effort: Low–Medium**

PhotoKamo’s film aesthetic would benefit from optional metadata-driven text:

- Capture date
- Camera and lens
- Focal length
- Aperture, shutter speed, ISO
- GPS location, only with explicit permission
- Automatic date stamps
- Film-edge-style camera labels

Also add export privacy options:

- Preserve metadata
- Remove location
- Remove all metadata

Because privacy is a central product promise, explicit metadata controls would be a differentiator.

#### 12. Search and Better Look Discovery

**Priority: Medium · Effort: Low–Medium**

There are already more than 100 looks. Filtering only by broad category will become difficult.

Add:

- Search by look name
- Filters such as Portrait, Night, Landscape, Warm, Cool, Fine Grain
- Recently used
- Most used on this device
- Side-by-side look comparison
- “Similar looks”
- Favorite collections or folders

The tags already present in `/Users/humprey/root/Dev/PhotoKamo/js/film-looks.js` provide a foundation for this.

This is relatively inexpensive and would improve the value of existing content immediately.

#### 13. Recipe Sharing

**Priority: Medium · Effort: Medium**

Let users share an edit recipe without sharing the photo:

- Export a small `.photokamo-look` or JSON file
- Import a recipe
- Generate a compact share link encoded in the URL fragment
- Optional QR code generated locally
- Include Basic adjustments, film settings, lens settings, frame, and crop ratio

URL fragments are not sent to the server, which aligns well with the privacy-first architecture.

Add versioning so future settings can be migrated safely.

#### 14. PWA and Offline Installation

**Priority: Medium · Effort: Low–Medium**

PhotoKamo is well suited to becoming an installable Progressive Web App:

- Add to home screen
- Offline application shell
- Offline bundled assets
- Dedicated app window
- File handling where browsers support it
- Share-target integration on supported platforms

Care must be taken around the film engine cache and service-worker updates, but this could considerably improve mobile retention.

#### 15. Export Improvements

**Priority: Medium · Effort: Low–Medium**

Expand export options with:

- Exact pixel dimensions
- Maximum file-size target
- Compression estimate before export
- Resize modes: fit, fill, long edge, short edge
- Filename templates
- Suffixes such as `_photokamo`, look name, date
- DPI metadata for printing
- Background handling for PNG transparency
- Side-by-side before/after export
- Contact sheet export (see [CollagePlan.md](CollagePlan.md))

A “Compress to under 2 MB” option would be particularly practical.

### Best first release

Recommended order:

#### Quick wins

1. **Look search and tag filters**
2. **Histogram and clipping warnings**
3. **Exact-size and target-file-size export**
4. **Metadata privacy controls**
5. **Auto white balance**

#### Next meaningful release

6. **Auto Enhance**
7. **Project auto-save and Recent Projects**
8. **Perspective correction**
9. **Levels and curves**
10. **Basic noise reduction**

#### Larger differentiating release

11. **Healing brush**
12. **Selective masks**
13. **Portrait tools**
14. **Collage/contact-sheet mode** (separate plan: [CollagePlan.md](CollagePlan.md))
15. **LUT and recipe sharing**

### Features not to prioritize yet

#### More film presets

PhotoKamo already has 81 film looks and detailed customization. Discovery and search are now more important than adding more choices.

#### Cloud accounts and synchronization

This would weaken the simple privacy positioning and introduce significant backend, authentication, and compliance work.

#### Generative AI replacement

It is expensive to run locally, usually requires large model downloads, and may conflict with the lightweight browser-native architecture. Traditional healing and clone tools should come first.

#### Full layer-based compositing

A Photoshop-style layer stack would greatly expand UI and memory complexity. Selective masks and purpose-built overlays would deliver more value for less complexity.

#### RAW support as the immediate next task

RAW support is desirable, but browser decoding, color profiles, memory use, and bundled decoder size make it a substantial project. It should follow workflow features unless user feedback strongly demands it.

### Strongest recommendation

The most effective product direction is:

> **Make PhotoKamo easier for beginners while preserving its deep film controls for enthusiasts.**

The best next three additions are therefore:

1. **Auto Enhance**
2. **Project auto-save and recovery**
3. **Healing brush**

Those solve three major user needs: “make it look better,” “don’t lose my work,” and “remove that distraction.”

---

## Technical implementation details

The product roadmap above explains what PhotoKamo should prioritize and why. The technical details, formulas, data schemas, algorithms, integration points, tests, delivery phases, and research references are below.

## 1. Goal and decisions

PhotoKamo v2 should add automation, recovery, local correction, export control, and discovery without sending an image off-device or requiring a framework, bundler, backend, WebGPU, WebCodecs, WASM, EyeDropper, or File System Access.

Recommended release order:

1. shared analysis foundation, histogram, clipping warnings, Auto Enhance, and Auto White Balance;
2. crash/reload recovery;
3. export dimensions, target file size, and metadata privacy reporting;
4. clone-heal brush;
5. optional inpainting, perspective, curves/levels, and offline app shell.

The algorithms below are proposed baselines. Constants marked **tunable** must be frozen only after evaluation on the approved image corpus. No third-party implementation is to be copied; cited papers and specifications are principles-only unless a later licence register says otherwise.

## 2. Existing contracts and constraints

The plan maps to the current code rather than an imagined renderer:

- `/Users/humprey/root/Dev/PhotoKamo/js/app.js` owns one active editor state, per-photo `File`, settings, and 50-entry undo/redo arrays. `snapshot()`, `commit()`, `change()`, `stashActive()`, and `showPhoto()` are the integration seams.
- Basic rendering in `/Users/humprey/root/Dev/PhotoKamo/js/renderer.js` is currently 8-bit sRGB-like Canvas data. Exposure is `2^exposure`; the remaining Adjust controls are empirical 8-bit operations. Auto must therefore optimize against the actual renderer, not pretend its sliders are scene-linear photographic controls.
- The current Adjust ranges are defined by `controlSpec` from `/Users/humprey/root/Dev/PhotoKamo/js/presets.js`; generated values must be quantized to each control's step and clamped with the existing `clampToRange()`.
- Crop coordinates are normalized in oriented image space. `cropGeometry()` and `cropSource()` define rotate/flip/straighten behavior.
- Worker patterns already exist in `/Users/humprey/root/Dev/PhotoKamo/js/optics/index.js`, `/Users/humprey/root/Dev/PhotoKamo/js/optics/worker.js`, film Workers, and `/Users/humprey/root/Dev/PhotoKamo/js/adjust-worker.js`.
- `/Users/humprey/root/Dev/PhotoKamo/js/render-queue.js` establishes one-running-job, deduplication, and stale-result semantics.
- Export currently uses Canvas `toBlob()` and supports JPEG, PNG, WebP, full/share size, batches, ZIP, download, and Web Share.
- `/Users/humprey/root/Dev/PhotoKamo/js/zip.js` is store-only ZIP32: no ZIP64, at most 65,535 entries, and less than 4 GiB.
- `/Users/humprey/root/Dev/PhotoKamo/docs/optics/PERF.md` records an approximately 16.7 MP iOS canvas limit and substantial full-resolution memory use. All new full-image algorithms require caps or tiles.

PhotoKamo remains an 8-bit, browser-decoded, Canvas-oriented editor. It must not claim RAW highlight recovery, scene-linear processing, exact cross-browser resampling, or metadata preservation that it does not implement.

## 3. Shared numerical and rendering contracts

### 3.1 Color representation

For analysis and algorithms that say “linear,” normalize an 8-bit sRGB code `C8` to `c = C8 / 255`, then use the IEC sRGB transfer curve already implemented in `/Users/humprey/root/Dev/PhotoKamo/js/optics/color.js`:

```text
linear(c) = c / 12.92                         when c <= 0.04045
          = ((c + 0.055) / 1.055)^2.4        otherwise

srgb(l)   = 12.92 l                           when l <= 0.0031308
          = 1.055 l^(1/2.4) - 0.055          otherwise
```

Clamp only at the final 8-bit boundary. Linear luminance is:

```text
Y = 0.2126 R + 0.7152 G + 0.0722 B
```

For inexpensive chroma rejection in analysis:

```text
M = max(R,G,B); m = min(R,G,B)
S = M == 0 ? 0 : (M - m) / M
```

Alpha contributes weight `a = A8 / 255`; ignore pixels with `a < 0.01`. Histograms add `a` rather than one so transparent edges do not bias statistics.

### 3.2 Coordinates and sampling

- Persist source-space points as normalized `(u,v) in [0,1]^2` relative to the browser-oriented, uncropped source.
- Convert to oriented pixels with `(x,y) = (u(W-1), v(H-1))`.
- Geometry renderers inverse-map destination pixel centers. For source coordinate `(x,y)`, let `i=floor(x)`, `j=floor(y)`, `a=x-i`, `b=y-j`; bilinear sampling is:

```text
I(x,y) = (1-a)(1-b) I[i,j] + a(1-b) I[i+1,j]
       + (1-a)b I[i,j+1]   + ab I[i+1,j+1]
```

- Define edge behavior per algorithm: reject outside candidates for healing; transparent or chosen fill color for perspective; clamp-to-edge only for convolution halos.

### 3.3 Worker protocol

Every heavy Worker request is:

```js
{ schema: 1, jobId, photoId, sourceRevision, algorithmVersion, payload }
```

Every result repeats those identity fields. The page accepts a result only if all four identifiers still match. Preview jobs are replaceable; full export, persistence, and explicit user actions are not. Transfer `ImageBitmap`/`ArrayBuffer`; close bitmaps and zero temporary canvas dimensions after use.

### 3.4 Render stages

Freeze this order before healing:

```text
decode and browser orientation
  -> source-coordinate local corrections (healing)
  -> crop / 90° rotate / flip / straighten / later perspective
  -> lens optics
  -> Basic or film engine
  -> global Adjust edits
  -> frame and text
  -> export resize and encode
```

This differs from the old draft by putting source-coordinate healing before crop; otherwise strokes outside the current crop cannot survive a later crop change. If the product chooses crop-relative healing, change both stage and schema before implementation.

## 4. Shared analysis engine

### 4.1 Input and histogram algorithm

Create `/Users/humprey/root/Dev/PhotoKamo/js/analysis/histogram.js`, `auto.js`, `worker.js`, and `index.js`.

1. Use `cropSource()` to produce the current oriented crop with long edge 768 px (**tunable 512–1024**). Analyze source pixels for Auto; analyze the settled rendered preview for the visible histogram.
2. Decode RGB through the 256-entry `toLinear` LUT.
3. Use `B = 1024` luminance bins and 256 channel bins. Map a clamped value `z` to `min(B-1, floor(z B))`.
4. Keep total alpha weight `N`, sums `sumY`, `sumY2`, channel sums, clipped counts, and a 16×16 grid of count/mean/variance.
5. Percentile `Pq` is the bin where cumulative weight first reaches `qN`; linearly interpolate within the bin when its weight is nonzero.
6. Compute mean `mu = sumY/N`, population variance `sigma² = max(0, sumY2/N - mu²)`, clipped fractions `f0 = count(Y <= 1/255)/N` and `f1 = count(Y >= 254/255)/N`.

Histogram complexity is `O(n + B)` time and `O(B + 16²)` memory. With a 768 px long edge it analyzes at most 0.59 MP.

Result schema:

```js
{
  schema: 1,
  algorithmVersion: 'analysis-1',
  source: { width, height, cropKey, rendered: false },
  luminance: { bins, percentiles, mean, variance, clippedBlack, clippedWhite },
  channels: { r, g, b },
  grid: { width: 16, height: 16, count, mean, variance },
  auto: { values, confidence, reasons }
}
```

Cache key: `[photo source fingerprint, cropKey, analysis-1, source|rendered]`. A settings edit invalidates only rendered analysis; crop invalidates both.

### 4.2 Histogram display and clipping warnings

For display bin `k`, plot a log-normalized height to keep sparse highlights visible:

```text
h[k] = log(1 + lambda * count[k]) / log(1 + lambda * maxCount), lambda = 100
```

Clipping overlays come from the settled rendered preview:

```text
shadow  := Y <= 1/255
highlight := max(R,G,B) >= 254/255
```

Generate a one-byte mask in the Worker (`0` none, `1` shadow, `2` highlight, `3` both). Draw a hatch pattern, not color alone. The adjacent text reports weighted percentages. Thresholds are settings, not hard-wired UI labels.

Do not trigger an engine render from histogram computation. Debounce analysis 150 ms after the current render settles and drop stale results.

**Acceptance:** histogram counts equal alpha-weighted fixture counts within `1e-6`; percentile error is at most one bin; overlay coordinates match the preview; toggling warnings changes no exported pixel; keyboard/screen-reader users receive the same numeric summary.

## 5. Auto Enhance and Auto White Balance

### 5.1 Why Auto needs a renderer-in-the-loop solver

The current Basic renderer applies empirical 8-bit operations in a fixed order. A direct formula such as “set shadows from P5” cannot reliably predict the slider result. Use image statistics for initialization, then optimize current slider values against the actual pure pixel transform on a 256 px proxy. This preserves one renderer and makes every proposal reproducible.

### 5.2 Robust exposure initialization

Use source linear luminance percentiles. Set target median `T50 = 0.18` (**tunable**):

```text
EV0 = clamp(log2(T50 / max(P50, 1e-6)), -1.5, 1.5)
```

Constrain positive exposure by the 99.5th percentile and a linear shoulder target `T995 = 0.98`:

```text
EVhi = log2(T995 / max(P99.5, 1e-6))
EV0 = min(EV0, EVhi) when EV0 > 0
```

Low-key/high-key guard: compute grid median variance and spatial occupancy. If more than 70% of weighted pixels are below `Y=0.1` or above `Y=0.8`, halve the EV magnitude and reduce confidence; this avoids forcing intentional scenes to middle gray.

### 5.3 White-balance estimators

Run both estimators over non-clipped pixels with `0.02 <= Y <= 0.95` and `S <= 0.35`.

**Shades of Gray.** For channel `c` and `p=6`:

```text
e_c = (sum_i w_i * c_i^p / sum_i w_i)^(1/p)
g_c = geometricMean(e_R,e_G,e_B) / max(e_c, epsilon)
```

Normalize gains so `(g_R g_G g_B)^(1/3)=1`, then clamp each to `[0.5, 2]`.

**Bright-neutral.** Among eligible pixels above luminance `P90`, use the weighted channel medians `m_c`; gains are `g_c = geometricMean(m_R,m_G,m_B)/m_c` with the same normalization.

Estimator agreement is measured in log-gain space:

```text
d = sqrt(sum_c (log2(g_c^SoG) - log2(g_c^BN))² / 3)
agreement = exp(-(d / 0.25)²)
coverage = min(1, eligibleWeight / (0.05 N))
confidenceWB = agreement * coverage
```

Blend log gains so uncertain corrections tend to identity:

```text
log2(g_c) = confidenceWB * (log2(g_c^SoG) + log2(g_c^BN)) / 2
```

The two PhotoKamo WB sliders are not calibrated channel gains. Find them numerically:

1. Take a deterministic stratified sample of at most 16,384 eligible proxy pixels.
2. Define target pixels `q_i = diag(g_R,g_G,g_B) p_i` in linear RGB, clipped only for objective evaluation.
3. For candidate `(temperature,tint)`, run the current Basic transform with all other controls zero, linearize output `r_i`, and minimize:

```text
L_WB = sum_i w_i ||r_i - q_i||² / sum_i w_i + 1e-4(temperature² + tint²)
```

4. Perform deterministic coarse-to-fine grid search: step 8 over current slider bounds, then steps 2 and 1 in the neighborhood of the best pair. Quantize with `roundToStep()`.

If `confidenceWB < 0.25`, propose no WB change. The neutral picker bypasses scene confidence: average an odd square footprint corresponding to 5×5 source pixels, reject if over 20% is clipped or the mean `Y < 0.02`, and compute gains from the linear channel means by the same geometric-mean rule.

### 5.4 Auto Enhance objective

Optimize only existing controls:

```text
x = [exposure, brightness, contrast, highlights, shadows,
     temperature, tint, vibrance]
```

Start with exposure/WB above and zeros elsewhere. Render the 256 px proxy with the exact current Basic transform. From candidate output calculate percentiles and clipped fractions. Use:

```text
L(x) = 4(log2((P50'+e)/(0.18+e)))²
     + 2(max(0, 0.02 - P5'))²
     + 2(max(0, P99' - 0.98))²
     + 50 max(0, fWhite' - fWhiteSource - 0.005)²
     + 30 max(0, fBlack' - fBlackSource - 0.005)²
     + 0.5(max(0, 0.55 - (P95'-P5')))²
     + sum_j lambda_j (x_j / range_j)²
```

Use `e=1e-4`; regularization weights `lambda=[0.02,0.04,0.06,0.08,0.08,0.05,0.05,0.1]` are **tunable**. They favor conservative edits.

Deterministic coordinate descent:

1. slider step schedule is 25%, 10%, 5%, 2%, and 1% of each control range, never smaller than its UI step;
2. in fixed control order, test `x_j-step`, current, and `x_j+step` within conservative Auto bounds (`exposure ±1.5 EV`; other controls initially ±30, WB ±40, vibrance 0…25);
3. accept only a strict improvement greater than `1e-9`; ties choose smaller absolute value, then lower value;
4. repeat a scale until a complete pass has no improvement; at most three passes per scale;
5. quantize and run the final proxy prediction. Reject or back off exposure one UI step until newly clipped white and black are each no more than 0.5%.

Worst-case work is approximately `8 controls × 3 candidates × 3 passes × 5 scales × proxyPixels`, under 30 million simple pixel transforms for a 256 px proxy. It belongs in a Worker.

Confidence combines WB confidence, clipping feasibility, and intentional-scene guard. The UI reports reasons such as “lifted a dark midtone; protected bright highlights; WB uncertain.” Applying a proposal calls one `change()` and therefore creates exactly one undo entry. Film looks receive Auto through ordinary global Adjust controls; no engine-specific Auto branch is added in v2.0.

### 5.5 Evaluation

- Unit fixtures: neutral ramps, one-stop under/over exposure, known RGB illuminant gains, clipped highlights, saturated single-color scenes, transparent borders, high-key and low-key images.
- Curated set: at least 60 owned/licensed images, including varied skin tones, snow, night, tungsten, mixed light, foliage, products, high-key, low-key, and strong dominant colors.
- Blind review target: at least 70% “better,” below 10% “worse,” and no skin-tone subgroup regression.
- Determinism: identical source/crop/algorithm version produces bit-identical settings.
- Performance target: analysis plus recommendation under 250 ms on the development laptop and under 1 s on the agreed mid-range phone; UI input stays responsive.

## 6. Crash/reload recovery and projects

This feature is a transactional algorithm rather than image mathematics.

### 6.1 IndexedDB schema

Database `photokamo-projects`, schema version 1:

| Store | Key | Value |
|---|---|---|
| `projects` | `projectId` | name, active/selected/order, committed revision, timestamps |
| `sources` | `sourceId` | original `File`/`Blob`, MIME, size, lastModified, fingerprint |
| `photos` | `[projectId, photoId]` | source reference, dimensions, settings, undo, redo, revision |
| `thumbnails` | `[projectId, photoId]` | small encoded Blob and settings revision |

Do not create a separate “recovery marker” transaction: one read-write transaction across `projects` and all dirty `photos` is atomic. The project record's `revision` is the commit marker.

### 6.2 Identity and deduplication

Fast source fingerprint:

```text
fingerprint = SHA-256(
  UTF8(name) || uint64(size) || uint64(lastModified) ||
  first min(64 KiB,size) bytes || last min(64 KiB,size) bytes
)
```

Use `crypto.subtle.digest`. This is deduplication, not authenticity; if fingerprint and metadata match an existing source, compare full Blob only if collision-sensitive behavior is required. Never make a security decision from this fingerprint.

### 6.3 Save state machine

Maintain `dirtyPhotoIds`, `manifestDirty`, `saveRunning`, and `saveAgain`.

1. On a successful `commit()`, mark the active photo dirty; debounce 1,000 ms. Slider input without commit does not persist.
2. At save start, snapshot immutable copies of all dirty settings and remove those IDs from the pending set.
3. Open one `readwrite` transaction covering `photos` and `projects`.
4. Set `nextRevision = project.revision + 1`. Put every captured photo with that revision. Put the manifest with new order/selection/active ID and `revision=nextRevision` last in request order, but rely on transaction atomicity—not request order—for consistency.
5. Resolve save only on `transaction.oncomplete`. On `abort/error`, merge captured IDs back into dirty state and surface status. Never treat individual request success as durable completion.
6. If edits arrived while saving, set `saveAgain` and immediately run the next transaction after completion.
7. On `visibilitychange` to hidden, call save immediately; do not depend on `beforeunload`, and do not attempt async work from unload.

The source Blob is inserted once on import in the same transaction as its first photo. Settings saves never rewrite it.

On startup, read the project manifest at revision `r`, then include only photo records with revision `<= r`; an atomic transaction should make mismatches impossible, but this validation detects corruption or old migration bugs. Validate all records before mutating app state.

### 6.4 Durable history bounds

Retain the current 50 snapshots, with an additional serialized byte budget of 2 MiB per photo (**tunable**). Estimate exact JSON UTF-8 bytes using `TextEncoder`. Remove oldest undo entries until both limits pass; redo is discarded first under pressure. Source blobs, thumbnails, and settings are separate, so history pruning never affects pixels.

### 6.5 Quota algorithm

`navigator.storage.estimate()` returns approximate, potentially padded values. Therefore:

```text
headroom = max(0, quota - usage)
required = sum(new source Blob sizes) + 1 MiB + 0.02 * sourceBytes
```

Warn when `required > 0.8 * headroom`; do not call this a guarantee. Catch `QuotaExceededError` from the actual transaction. If sources fail, keep the in-memory session, save a source-free manifest if possible, and offer relink/project download rather than claiming recovery succeeded.

Request `navigator.storage.persist()` only after explicit user intent to retain a project. `false` is non-fatal and means storage may still be evicted under pressure.

### 6.6 Portable `.photokamo` format

Phase v2.1 unless product explicitly pulls it forward:

```text
manifest.json
sources/<hex-source-id>.<allowlisted-extension>
thumbnails/<hex-photo-id>.webp
```

Because the existing writer is ZIP32/store-only, reject projected archive size `>= 0xFFFFFFFF`, entry count `> 65535`, UTF-8 names over 65535 bytes, absolute paths, `..`, backslashes, duplicate normalized paths, and unknown top-level paths. Import preflights central-directory sizes before extracting; cap entries at 100, total uncompressed bytes at 2 GiB (**product/device decision**), and each source at the current 40 MiB app limit. Ordinary download/input is baseline; File System Access is optional.

### 6.7 Recovery tests

Test new DB, every migration, blocked `versionchange`, transaction abort after each request, quota failure, source missing, corrupt settings, stale revision, two rapid saves, edit-during-save, 50 photos, deletion/orphan cleanup, browser storage denial, and reload during save. Forced reload must produce all of revision `N` or all of `N+1`, never a mixed project.

## 7. Healing brush

### 7.1 Persistent stroke model

```js
healing: {
  schema: 1,
  strokes: [{
    id,
    mode: 'heal' | 'clone' | 'inpaint',
    points: [{ u, v, pressure }],
    sourceOffset: { du, dv } | null,
    radiusSourcePx,
    hardness,
    opacity,
    algorithmVersion: 'clone-heal-1'
  }]
}
```

Points are oriented, uncropped source coordinates. `radiusSourcePx` is measured at original source resolution, so crop/preview/export do not change the corrected area. One pointer gesture is one `commit()`.

Sample pointer paths at most once per animation frame. Simplify position with Ramer–Douglas–Peucker: recursively retain the point with maximum perpendicular distance to the endpoint segment when that distance exceeds `epsilon = max(0.25, 0.02 * radius)` source pixels. Force retention where pressure changes by more than 0.05.

Stamp centers along the simplified polyline at arc-length spacing `s = max(1, 0.25 radius)` using interpolation, so rendering does not depend on pointer event rate.

### 7.2 Brush mask

For normalized radial distance `r=d/R`, hardness `h in [0,1]`, and opacity `o`:

```text
alpha(r) = o                                  if r <= h
         = o * (1 - smoothstep(h,1,r))        if h < r < 1
         = 0                                  otherwise

smoothstep(a,b,x): t=clamp((x-a)/(b-a),0,1); t²(3-2t)
```

Combine overlapping stamps as coverage, `Anew = 1 - (1-Aold)(1-Astamp)`, not simple addition.

### 7.3 Automatic source search

Search only if no manual source offset is set.

1. Build a source linear-luma/chroma proxy at scale `s <= 1`, making brush radius 8–32 proxy pixels.
2. Search candidate centers on an annulus `2R <= distance <= 6R`, stride `max(1, floor(R/4))`; reject candidates whose patch crosses an edge or any destination mask.
3. Represent each pixel by `Y`, `Cb=B-Y`, `Cr=R-Y`, and Sobel gradient `(Gx,Gy)` on `Y`.
4. Evaluate only the destination's known boundary band `B={p | R <= distance(p,center) <= R+max(2,0.15R)}`. For candidate offset `delta`, compute:

```text
SSD(delta) = sum_p w_p [
    1.0 (Ys(p+delta)-Yd(p))²
  + 0.25(Cbs(p+delta)-Cbd(p))²
  + 0.25(Crs(p+delta)-Crd(p))²
  + 0.15||Gs(p+delta)-Gd(p)||²
] / sum_p w_p

score = SSD
      + 0.1 ((mu_s-mu_d)² + (sigma_s-sigma_d)²)
      + 0.01 (||delta||/(6R))²
```

`w_p = alphaBoundary(p)` and constants are **tunable**. Keep the five best proxy candidates, then rescore at preview resolution with stride one. Ties choose shorter distance, then top-to-bottom/left-to-right for determinism.

With `C ≈ area(annulus)/stride² = O(1)` relative to radius and boundary `O(R)`, proxy search is approximately `O(CR)` rather than full-patch `O(CR²)`.

### 7.4 Low-frequency matching and blend

For selected source patch `S` and known destination boundary `D`, calculate weighted per-channel linear means and standard deviations. Match conservatively:

```text
scale_c = clamp(sigmaD_c / max(sigmaS_c, 1e-4), 0.8, 1.25)
S'_c = muD_c + scale_c (S_c - muS_c)
```

Clone mode skips this match. Heal mode composites in linear light:

```text
O = A S' + (1-A) D
```

If seams fail acceptance, add a three-level Laplacian blend:

```text
G0(I)=I; G(k+1)=downsample(gaussian5(Gk))
Lk(I)=Gk(I)-upsample(G(k+1)(I)); Llast=Glast
Lk(out)=Gk(A)Lk(S') + (1-Gk(A))Lk(D)
out=reconstruct from coarse to fine
```

Use separable normalized kernel `[1,4,6,4,1]/16`; each downsample takes every second sample after filtering. Render in tiles (suggested 512×512) with halo `R + 2^(levels+1)` and crop halos after processing. Invalidate destination-intersecting tiles; a source edit invalidates dependent destination tiles too.

### 7.5 Optional automatic small-mask inpainting

Do not call the baseline clone-heal “content aware.” For v2.1, implement Telea-family fast marching only after acquiring the original paper and recording the exact equations in the reference register. The verified high-level procedure is:

1. states are `KNOWN`, `BAND`, `UNKNOWN`; initialize mask boundary as a min-heap BAND keyed by distance `T`;
2. pop minimum `T`, mark KNOWN, update UNKNOWN neighbors with the upwind Eikonal solution `|grad T|=1`, and push/decrease-key;
3. estimate each newly accepted color as a normalized weighted sum of known neighbors, favoring short distance, alignment with the boundary normal, and proximity to the level set;
4. restrict radius/tile and process linear RGB.

This is intentionally not an implementation-ready equation set yet; therefore it is a research gate, not a v2.0 commitment. OpenCV documentation is conceptual reference only and no OpenCV code is bundled.

### 7.6 Healing acceptance

- Correct after crop, rotation, flip, straighten, optics, Basic/film looks, preview, export, undo/redo, recovery, and project transfer.
- Corrected-region preview/full mean absolute channel difference under `2/255`; no tile boundary discontinuity over `3/255`.
- 100 px-radius preview patch under 100 ms on development laptop and 300 ms on agreed phone after source selection; input overlay stays at display refresh rate while Worker work is pending.
- Fixtures cover flat sky, skin blemish, sensor dust, diagonal edge, periodic brick, source near edge, overlapping strokes, and impossible source search.
- Manual source selection is always available and keyboard/touch controls do not rely on Alt/Option alone.

## 8. Look search and tag filters

The catalog is currently small, so use a deterministic in-memory index rather than a dependency.

Normalization `N(s)`:

```text
s.normalize('NFKD')
 -> remove Unicode combining marks
 -> toLocaleLowerCase('en-US')
 -> replace non-letter/non-number runs with spaces
 -> trim and split on whitespace
```

Index each look's weighted fields: name 4, tags 3, style/engine 2, description 1. Map every token to a posting list `{lookId, weight}`. Explicit synonym groups add canonical tokens (`bw`, `black and white`, `monochrome`; `people`, `portrait`) without implicit semantic guesses.

For query tokens `q`, candidate set is the union of exact/prefix postings. Rank:

```text
score(look) = sum_q max_t [
  fieldWeight(t) * match(q,t)
]

match = 1.0 exact
      = 0.8 token prefix
      = 0.6 substring when |q| >= 3
      = 0 otherwise
```

Optional typo matching only when exact/prefix returns no result and query token length is at least 4. Levenshtein recurrence:

```text
D[0,j]=j; D[i,0]=i
D[i,j]=min(D[i-1,j]+1, D[i,j-1]+1,
           D[i-1,j-1] + (a[i-1] != b[j-1]))
```

Accept normalized distance `D/max(|a|,|b|) <= 0.25`, using two rows for `O(min(m,n))` memory and `O(mn)` time. Sort score descending, then original catalog order. Search/filtering must never load an engine.

**Acceptance:** normalization fixtures include accents, punctuation, case, and empty queries; ranking has golden expected order; active look stays visible/identified; result count and empty state are announced without per-keystroke spam.

## 9. Export dimensions and target file size

### 9.1 Dimension equations

Let the cropped photo size before frame be `(W,H)`, aspect `r=W/H`.

```text
long edge L: s = L/max(W,H)
width w:     s = w/W
height h:    s = h/H
percent p:   s = p/100
megapixels M:s = sqrt((M*1,000,000)/(W*H))

outW=max(1, round(Ws)); outH=max(1, round(Hs))
```

Clamp `s <= 1` unless “Allow upscaling” is explicit. If exact width and height are both supplied under aspect lock, fit inside: `s=min(w/W,h/H)`. The UI must distinguish photo dimensions from final framed dimensions. Because current frames add dimensions based on the photo short edge, resize the photo first and then call the existing frame layout; report that resulting canvas as authoritative.

### 9.2 Deterministic downsampling

Canvas does not guarantee the same resampling kernel across browsers. Baseline quality path:

1. while both current dimensions are at least twice target, draw to `round(current/2)` with smoothing high;
2. final draw reaches exact target;
3. release each previous intermediate immediately.

This is progressive area reduction through browser filters, not a guaranteed Lanczos implementation. If parity fixtures fail, implement separable Lanczos-3 in a Worker:

```text
sinc(x)=x==0 ? 1 : sin(pi*x)/(pi*x)
L3(x)=sinc(x)sinc(x/3) for |x|<3, else 0
O[j]=sum_i I[i] L3((center_j-i)/scale) / sum_i L3(...)
```

For downscale, widen support by `1/scale` and include the scale in the kernel argument to prevent aliasing. Process horizontal strips with halos to cap memory.

### 9.3 Target-size search

Browser `quality` is a hint and encoding is implementation-defined. Treat the encoder as a black-box function `S(q)=Blob.size`.

1. Lossy formats only. Use `qMin=0.2`, `qMax=0.98`, requested bytes `T`, tolerance `tau=max(2048,0.05T)`.
2. Encode both endpoints. Record the candidate minimizing `|S(q)-T|`, preferring `S<=T`, then larger `q`.
3. If `S(qMin)>T+tau`, report infeasible and offer dimensions; if `S(qMax)<T-tau`, return `qMax` and state that maximum quality is smaller than target.
4. Binary search for eight iterations. If endpoint samples violate expected monotonicity, do not trust bracketing: evaluate a fixed grid `q=0.2,0.3,...,0.9,0.98`, keep the best, then sample midpoints around that best up to 12 total encodes.
5. Cache `{renderRevision,format,width,height,q}->Blob`; cancel by generation ID. Blob creation itself is not abortable, so stale results are discarded and dereferenced.

PNG does not expose useful quality control and has no target-size option. Batch search runs independently per photo and reports infeasible files rather than silently resizing.

**Acceptance:** exact dimensions, aspect error at most one output pixel, no implicit upscaling, JPEG/WebP within ±5% or 2 KiB when feasible on each supported browser, cancellation frees canvases/blobs, and golden edge/checkerboard fixtures show no new aliasing regression.

## 10. Metadata privacy controls

### 10.1 Baseline policy

Canvas re-encoding normally creates a new image and drops source metadata, but encoder output is browser-defined. Label default behavior **“Re-encode pixels and strip source metadata (recommended)”** and verify actual output. Do not offer “keep safe metadata” in v2.0.

### 10.2 Bounds-checked JPEG/Exif scanner

Scan only enough source bytes to report risk. In a Worker:

1. Require JPEG SOI `FF D8`. Read markers until SOS `FF DA` or EOI `FF D9`. Standalone markers have no length; other segment length is big-endian and includes its own two bytes. Require `length>=2` and `offset+length<=file.size` before slicing.
2. APP1 `FF E1` beginning `Exif\0\0` contains TIFF. TIFF bytes 0–1 are `II` or `MM`; magic is 42; first IFD offset is relative to TIFF start.
3. An IFD starts with a 2-byte entry count, then exactly `count*12` bytes and a 4-byte next-IFD offset. Each entry is `(tag:uint16,type:uint16,count:uint32,valueOrOffset:uint32)` in declared byte order.
4. Let type widths be BYTE/ASCII/SBYTE/UNDEFINED=1, SHORT/SSHORT=2, LONG/SLONG/FLOAT=4, RATIONAL/SRATIONAL/DOUBLE=8. Check multiplication overflow and `byteCount=count*width`. If `byteCount<=4`, value is inline; otherwise validate TIFF-relative offset and end before reading.
5. Follow only an allowlisted graph: IFD0, Exif IFD pointer `0x8769`, and GPS IFD pointer `0x8825`. Maintain visited offsets, maximum depth 4, maximum 4096 entries, and maximum APP segment 16 MiB. Never parse MakerNote payload.

Report presence—not full values—for GPS, capture date, make/model, camera serial, owner/artist/copyright, embedded thumbnail, ICC, and XMP. GPS presence means a valid GPS IFD pointer with at least one valid entry; malformed metadata is reported separately, never as “not detected.”

### 10.3 Output verification by format

After export, scan output and fail the privacy assertion if forbidden metadata remains:

- JPEG: reject APP1 Exif/XMP and APP13; APP2 ICC is color data, not private by default, but report it.
- PNG: chunks are `length(4) + type(4) + data(length) + CRC(4)`. Validate length and CRC-32 (polynomial `0xEDB88320` reflected implementation, already present in `zip.js`). Privacy chunks include `eXIf`, `tEXt`, `zTXt`, and `iTXt`; color chunks such as `iCCP` are separately reported.
- WebP: validate RIFF `WEBP`; every chunk has FourCC, little-endian payload size, payload, and one zero pad byte when size is odd. Report/reject `EXIF` and `XMP `; report `ICCP`. Ensure every `8 + size + (size&1)` step remains inside RIFF bounds.

Since v2.0 re-encodes instead of rewriting segments, no metadata-copy code is needed. If preservation is approved later, it requires format-specific allowlist reconstruction, fresh lengths/offsets/CRC, and a separate threat model.

**Acceptance:** malformed lengths, integer overflow, cycles, huge counts, truncated entries, wrong endian markers, and decompression bombs cannot read out of bounds or hang; GPS fixtures are detected in source and absent in default output; orientation remains correct in pixels after tags are gone.

## 11. Perspective correction (v2.1)

Ship manual four-corner correction before automatic line detection.

Given four source points `(x_i,y_i)` and destination rectangle corners `(u_i,v_i)`, solve homography `H` with `h33=1`:

```text
u_i = (h11 x_i + h12 y_i + h13) / (h31 x_i + h32 y_i + 1)
v_i = (h21 x_i + h22 y_i + h23) / (h31 x_i + h32 y_i + 1)
```

Each correspondence yields two linear equations in eight unknowns:

```text
[x y 1 0 0 0 -ux -uy] h = u
[0 0 0 x y 1 -vx -vy] h = v
```

Normalize coordinates before solving: translate centroid to origin and scale mean distance to `sqrt(2)`. Solve the 8×8 system using Gaussian elimination with scaled partial pivoting; reject pivot magnitude `<1e-10` after normalization. Denormalize `H`, invert it, inverse-map each destination pixel, and bilinearly sample.

Validate source quadrilateral: all consecutive cross products have the same nonzero sign, shoelace area exceeds `0.001WH`, points are in bounds, and no edge is shorter than 1% of the image diagonal. Choose output dimensions from opposite-edge averages:

```text
outW = round((|p1-p0| + |p2-p3|)/2)
outH = round((|p3-p0| + |p2-p1|)/2)
```

Cap to source megapixels unless upscaling is explicit. Tile full output. Complexity `O(outW*outH)`, constant memory per tile.

Automatic follow-up: grayscale Gaussian smoothing, Sobel gradients, non-maximum suppression, hysteresis edges, probabilistic Hough voting `rho=x cos(theta)+y sin(theta)`, cluster near-horizontal/vertical lines, intersect robust line pairs for vanishing points, and ask the user to confirm. This is not in v2.0.

## 12. Curves, levels, and local adjustments (v2.1)

### 12.1 Levels

For normalized input `x`, black `b`, white `w>b`, and UI midpoint `m in (0,1)`, define gamma so input `m` maps to 0.5:

```text
z = clamp((x-b)/(w-b),0,1)
gamma = log(0.5) / log(clamp((m-b)/(w-b),1e-6,1-1e-6))
y = z^gamma
```

Build a 4096-entry linear-light LUT and linearly interpolate neighboring entries. Reject `w-b<1/4095`.

### 12.2 Monotone curves

Sort strictly increasing control points `(x_k,y_k)`. Set interval widths `h_k=x_{k+1}-x_k` and secants `d_k=(y_{k+1}-y_k)/h_k`. For interior derivative `m_k`:

```text
m_k = 0 if d_(k-1)*d_k <= 0
otherwise:
w1 = 2h_k + h_(k-1); w2 = h_k + 2h_(k-1)
(w1+w2)/m_k = w1/d_(k-1) + w2/d_k
```

Use one-sided endpoint estimates and shape-limit them:

```text
m0=((2h0+h1)d0-h0d1)/(h0+h1)
if sign(m0)!=sign(d0): m0=0
else if sign(d0)!=sign(d1) and |m0|>3|d0|: m0=3d0
```

Mirror for the last endpoint. On interval `k`, `t=(x-x_k)/h_k`:

```text
y = (2t³-3t²+1)y_k + (t³-2t²+t)h_k m_k
  + (-2t³+3t²)y_(k+1) + (t³-t²)h_k m_(k+1)
```

Sample to a 4096-entry LUT. This is PCHIP-style shape-preserving interpolation: monotone control points do not overshoot. Luminance mode scales linear RGB by `y/max(x,epsilon)` with a cap to avoid exploding black noise; RGB modes map channels independently.

Local adjustments reuse healing masks, stamp spacing, tile invalidation, and history rather than adding a second brush implementation.

## 13. Offline app shell (v2.1)

This is a precise cache state machine, not project storage.

1. Cache name is `photokamo-shell:<buildHash>`; manifest contains immutable URLs and expected byte sizes/hashes generated at release time.
2. `install`: `event.waitUntil()` opens the new cache and fetches every mandatory shell asset. Any mandatory failure rejects install, leaving the old worker active.
3. Do not call `skipWaiting()` automatically while a project is open. Notify clients that an update is waiting; activate only on explicit “Update” or when no controlled clients remain.
4. `activate`: claim only after approval, then delete cache names with the shell prefix other than current. Never delete engine caches or IndexedDB.
5. `fetch`: cache-first for hashed immutable assets; network-first with cached fallback for navigation HTML; network-only for unknown cross-origin requests. Cache only successful same-origin GET responses.
6. A service worker may be terminated between events; all required asynchronous work is attached to `waitUntil()`/`respondWith()`.

Offline acceptance: cold offline launch after one complete online visit, failed partial install preserves old shell, update never reloads an open project unexpectedly, and optional engine assets retain existing on-demand cache/licensing behavior.

## 14. Schemas and module boundaries

Suggested durable project shape:

```js
{
  schema: 1,
  id: crypto.randomUUID(),
  name: 'Untitled project',
  revision: 0,
  createdAt: 0,
  updatedAt: 0,
  photoOrder: [],
  activePhotoId: null,
  selectedPhotoIds: [],
  photos: [{ id, sourceId, name, width, height, settingsVersion: 1 }]
}
```

Every durable object has `schema`; every numerical algorithm has `algorithmVersion`. Migrations are pure functions from version `n` to `n+1`, tested on frozen fixtures, and executed inside IndexedDB's upgrade transaction. Unknown future schema versions are rejected read-only; never overwrite them.

Suggested new modules:

```text
js/analysis/{index,worker,histogram,auto}.js
js/projects/{db,schema,recovery,portable}.js
js/healing/{index,worker,mask,search,blend}.js
js/export/{resize,target-size,metadata}.js
js/geometry/{homography,warp}.js
```

Pure mathematical modules have no DOM and accept typed arrays plus dimensions, so browser fixture pages and Node-compatible checks can call the same code.

## 15. Delivery and exit gates

### Phase 0 — contracts and baselines (1 week)

- Freeze render-stage, settings v2, project v1, and analysis v1 contracts.
- Add deterministic fixture page and owned/licensed corpus manifest.
- Record Basic/film preview/full/export parity, peak memory, and 1/12/24 MP timings.
- Confirm benchmark laptop, iOS device, and mid-range Android device.

**Exit:** current output baselines captured; no feature work begins with unresolved coordinate or stage semantics.

### Phase 1 — analysis and Auto (3–4 weeks)

- Histogram core/Worker, clipping UI, WB estimators and neutral picker.
- Renderer-in-the-loop optimizer and evaluation harness.
- Look search can proceed independently.

**Exit:** objective fixtures, corpus gates, one-step undo, determinism, latency, and stale-result tests pass.

### Phase 2 — recovery (3–5 weeks)

- IndexedDB schema/migrations, atomic save loop, startup restore/delete UI, quota/persistence behavior.
- Portable project only if product approves v2.0 scope.

**Exit:** interrupted transaction and forced-reload suites pass on Chrome, Firefox, Safari, iOS Safari, and Android Chrome.

### Phase 3 — export/privacy (2–3 weeks)

- Dimension math, progressive resize/Lanczos decision, target-size search, metadata source/output scanners.

**Exit:** exact dimensions, feasible size tolerance, malformed-metadata safety, and no-GPS output tests pass.

### Phase 4 — clone-heal (5–8 weeks)

- Source-space stroke UI, mask, source search, color match, Worker tiles, history/project/export integration.
- Add Laplacian blend only if fixture/art review requires it.

**Exit:** parity, artifact, latency, undo, restore, touch/pen/mouse, keyboard alternative, and memory tests pass.

### Phase 5 — optional v2.1 (2–4 weeks each)

- Implementation-ready Telea research and small-mask inpainting.
- Perspective correction.
- Curves/levels.
- Portable projects if deferred.
- Offline app shell.

## 16. Cross-feature requirements

### Correctness and performance

- Identity settings remain on the current byte-identical path where guaranteed.
- Preview/full/export call the same pure algorithm with scale-normalized parameters.
- Every gesture is one history step; background analysis creates none.
- One heavy full-resolution Worker job runs at a time by default.
- No feature allocates multiple full-size float RGB images without an explicit measured budget; use preview proxies, channel planes, strips, or tiles.
- Re-run `/Users/humprey/root/Dev/PhotoKamo/tools/optics-parity.html` after stage changes.

### Accessibility

- WCAG 2.2 AA target. Real controls, names, visible focus, logical order, and complete keyboard operation.
- Keep PhotoKamo's 44 CSS px product target. WCAG 2.5.8 itself requires 24×24 CSS px or sufficient non-intersecting spacing, with specified exceptions.
- Canvas tools have adjacent instructions, numeric/state summaries, Escape cancellation, and non-drag alternatives.
- Clipping, healing source, and status are never color-only. Progress uses throttled polite live regions.
- Text contrast is at least 4.5:1; control boundaries/focus are at least 3:1; preserve reduced motion.

### Privacy and security

- No source, pixel, histogram, metadata, or usage event leaves the origin.
- Treat projects, archives, metadata offsets, dimensions, counts, and MIME claims as untrusted.
- Cap every allocation from file data; validate addition and multiplication before slicing.
- Show local storage use and deletion; explain that browser/site-data clearing can remove projects.

### Required browsers

- Current and previous major Chrome/Edge, Firefox, and Safari on macOS.
- Agreed current iOS Safari and Android Chrome devices at 360 and 430 CSS px.
- Feature detection controls Workers, `OffscreenCanvas`, storage APIs, sharing, and optional file-system behavior. Canvas/main-thread fallback may be slower but must remain correct where a required Worker API is absent.

## 17. Product decisions required

1. Approve release order: **Analysis/Auto → Recovery → Export/privacy → Clone-heal**.
2. Approve automatic recovery by default after first import, with local-storage notice and delete control; or choose opt-in.
3. Approve durable undo/redo: recommended 50 entries and 2 MiB JSON per photo.
4. Approve healing in oriented uncropped source space before crop/optics/look.
5. Decide whether `.photokamo` belongs in v2.0 or v2.1 and choose its maximum archive size.
6. Name benchmark devices and approve an owned/licensed evaluation corpus before tuning constants.
7. Decide whether v2.0 Auto applies only global Adjust controls to film renders (recommended) or may modify engine parameters.

## 18. Research and reuse register

Principles/specifications only; no implementation code is copied by this plan:

- CSS Color 4 conversion code and IEC 61966-2-1 sRGB transfer: <https://www.w3.org/TR/css-color-4/#color-conversion-code>
- Existing PhotoKamo sRGB implementation: `/Users/humprey/root/Dev/PhotoKamo/js/optics/color.js`
- G. Buchsbaum, “A spatial processor model for object colour perception,” *Journal of the Franklin Institute*, 1980 (Gray World family).
- G. D. Finlayson and E. Trezzi, “Shades of Gray and Colour Constancy,” IS&T/SID Color Imaging Conference, 2004.
- N. Limare et al., “Simplest Color Balance,” IPOL, 2011: <https://www.ipol.im/pub/art/2011/llmps-scb/>
- A. Telea, “An Image Inpainting Technique Based on the Fast Marching Method,” *Journal of Graphics Tools* 9(1), 2004.
- OpenCV inpainting overview, concepts only: <https://docs.opencv.org/4.x/df/d3d/tutorial_py_inpainting.html>
- P. J. Burt and E. H. Adelson, “A Multiresolution Spline with Application to Image Mosaics,” 1983.
- R. Szeliski, *Computer Vision: Algorithms and Applications*, 2nd ed.: <https://szeliski.org/Book/>
- Indexed Database API 3.0: <https://www.w3.org/TR/IndexedDB-3/>
- Storage estimate and persistence: <https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate> and <https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist>
- PNG 3, chunk/CRC/metadata rules: <https://www.w3.org/TR/png-3/>
- RFC 9649, WebP RIFF and metadata chunks: <https://www.rfc-editor.org/rfc/rfc9649.html>
- Exif 3.0, CIPA DC-008; obtain and pin the official publication before parser implementation: <https://www.cipa.jp/e/std/std-sec.html>
- NIST DADS, Levenshtein distance and inverted index: <https://www.nist.gov/dads/HTML/Levenshtein.html> and <https://www.nist.gov/dads/HTML/invertedIndex.html>
- Fritsch and Butland PCHIP slope definition, summarized by SciPy: <https://docs.scipy.org/doc/scipy/reference/generated/scipy.interpolate.PchipInterpolator.html>
- Service Workers specification: <https://www.w3.org/TR/service-workers/>
- WCAG 2.2 and target-size understanding: <https://www.w3.org/TR/WCAG22/> and <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html>

Before coding any paper-derived algorithm, create `/Users/humprey/root/Dev/PhotoKamo/docs/v2/REFERENCES.md` modeled on the optics register. Record citation, equations used, whether any code/data is reused, licence, pinned version/commit, and shipped limitations. Telea inpainting cannot enter implementation until its exact weighting equations and a clean-room implementation note are in that register.

## 19. Definition of v2.0 done

PhotoKamo v2.0 is done when:

- analysis, Auto Enhance, and Auto WB pass deterministic fixture, clipping, corpus, latency, and one-undo-step gates;
- complete projects recover atomically after reload/interrupted writes and can be inspected/deleted locally;
- histogram/clipping, look search, exact sizing, feasible target-size export, and truthful metadata privacy reporting ship accessibly;
- source-space clone-heal survives history, projects, every renderer, crop changes, preview, and export with measured parity and latency;
- no required path uses cloud processing, WebGPU, WebCodecs, WASM, EyeDropper, or File System Access;
- browser/device, memory, batch, keyboard, screen-reader, privacy, malformed-input, and existing optics parity suites pass;
- every algorithm's assumptions, constants, version, references, and known failure modes are documented.