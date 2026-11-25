# Plan: Collage mode, layouts, shaped (transparent) collages and film contact sheets

**Status:** proposed 2026-11-25, revision 2 (re-checked against the code; adds transparent shaped templates). Moved out of `v2Plan.Md` (roadmap item 10), merged with the external proposal "PhotoKamo — Collage & Layout Engine".
**Workflow:** same as `plan_optics.md`: tasks **one at a time**, short plan before editing, stop after each task's **Check** and report what to verify. Mark `- [x]` and add a one-line *Done* note with measured numbers.
**Depends on:** nothing to start. Task 10 (saving collages) needs session recovery (`plan_workflow.md` Task 5). Export sizes reuse `plan_workflow.md` Task 6 if done, otherwise the sizes listed in Task 3.

---

## Product brief (moved from v2Plan.Md)

**Priority: Medium–High · Effort: Medium–High**

Frames currently apply to one photo. A dedicated collage mode could support:

- 2–9 photo grids
- Film contact sheets
- Diptych and triptych layouts
- Scrapbook layouts
- Adjustable gutters and paper colors
- Drag-to-reorder photos
- Independent crop positioning
- Shared caption and date

This works especially well with PhotoKamo's existing filmstrip, frames, print-paper styling, and text tools.

A **contact sheet generator** would strongly reinforce the analog-photography identity.

**Added in revision 2:** **shaped, transparent collages**. The sheet itself can be a heart, circle, star, hexagon, arch, stamp, etc., and photos fill the shape. Everything outside the shape (and, optionally, the gutters) is transparent in the exported PNG/WebP. Use cases: stickers, story overlays, cut-out prints, layering in other apps.

## Goal

Lay out 2–9 photos (up to 36 on a contact sheet, 1–9 in shaped templates) on one sheet: grids, diptychs/triptychs, contact sheets, shaped transparent collages, masked and scrapbook layouts. Each photo keeps **its own PhotoKamo edit** (look, film engine, optics, Adjust, crop). Everything renders on the device and exports at a size the device can actually allocate.

---

## Verification log (revision 2, checked in code)

These facts shaped the revision. Each one corrects something in revision 1 or the proposal.

| # | Fact (where) | Consequence |
|---|---|---|
| V1 | **The Kamo engine needs full-size input for its physical scale (grain, MTF)**: see the `ensurePreviewBitmap` comment in `js/app.js` and `docs/optics/PERF.md` | Rev 1's "render each slot at slot size" is **wrong for film looks**: grain and sharpness would change scale. Film photos must be engine-rendered from full-size input and *then* downscaled to the slot. Basic looks and optics are resolution-independent (optics by design; Basic grain is per output pixel, which matches today's Share export), so they can render at slot size. |
| V2 | `renderPhotoFull` and `renderPhotoThumb` always apply frame and text (`frameCanvas(...)`) | Needs a small refactor: `renderPhotoEdit(photo, { edge, quality })` returns the unframed edit; the two existing functions call it and then frame. Their output must stay byte-identical. |
| V3 | `renderPhotoThumb` renders from the 256 px `photo.thumb` (`QUEUE_EDGE = THUMB_EDGE`) | Fine as the first, instant slot preview; too soft for big slots, so a second pass at slot size follows (V1 rules for film). |
| V4 | No selection bar exists. Multi-select is Ctrl/⌘-click or strip checkboxes; panels have "Apply to selected photos" buttons; the photo menu is the `#fileMenu` popover | Entry points: a **Make collage** button shown in the strip when 2+ photos are selected, plus a **Make collage…** item in `#fileMenu`. |
| V5 | Undo/redo shortcuts are global (`keydown` handler calling `undo()`/`redo()`, `js/app.js` ≈ line 3207) and use the photo's history | In collage mode the same keys and buttons must route to the collage history: one `history` switch, not a second set of listeners. |
| V6 | Text fonts load through `document.fonts` (`ensureTextFonts`) | Text can't be drawn reliably in a Worker (font availability in workers varies, especially Safari). **Composite on the main thread.** It is ≤ 36 `drawImage` calls plus text: cheap. The heavy per-photo renders already run in the engine/optics/adjust Workers. Rev 1's "export compositing in a Worker" is dropped. |
| V7 | Nothing in the app handles alpha today; all exports are opaque photos | Transparent collages need explicit rules: PNG/WebP keep alpha; JPEG must flatten onto a chosen colour (a transparent canvas encoded as JPEG turns black in most browsers). |
| V8 | Export file extensions come from the requested type (`extensionFor(type)`), not `blob.type` | If a browser can't encode WebP, `toBlob` returns PNG, which would be saved as `.webp`. Collage export uses `blob.type`. Check the single-photo export for the same issue (possible existing bug; see Task 3). |
| V9 | Film-strip drawing already exists: `drawFilmStrip(ctx, layout, photo, kind)`, `perforations`, `filmWear`, `drawFilmCollage`, `FRAME_COLORS`, `paperColors` in `js/renderer.js`/`js/presets.js` | Contact sheets reuse them (generalised); single-photo film frames must stay byte-identical. |
| V10 | `MAX_PHOTOS = 50`, `ZOOM_MAX_EDGE = 4096`; ≈ 16.7 MP canvas limit on iOS (`docs/optics/PERF.md`) | Contact sheets ≤ 36; output canvas capped by a measured device limit. |
| V11 | A photo's own crop is part of its edit | Slot pan/zoom applies **on top of** the photo's crop (a 16:9-cropped photo in a square slot can pan within its 16:9 crop only). Say so in the UI ("Uses this photo's crop. Edit photo to change it."). |

---

## Review of the external proposal

**Keep** (adopted): separate preview and export rendering; data-driven templates with normalised 0–1 coordinates; one renderer for every template; Canvas 2D + Path2D clipping; Workers for heavy work; `ImageBitmap.close()` and freeing buffers; device-adaptive export with checks on canvas allocation; iOS Safari tested on purpose; contact sheets as the signature feature; reuse the existing crop and text tools; phased delivery; the acceptance table (merged into the Checks); and the rule that fonts, textures and masks are licence-checked separately from code.

**Change** (conflicts with `CLAUDE.md` or the code):

| # | Proposal says | Problem | This plan |
|---|---|---|---|
| R1 | **Konva.js** as the interactive editor | `CLAUDE.md`: no new runtime dependencies, frameworks or CDNs. Konva is a second scene graph next to the existing canvas code. | **No Konva.** Own `js/collage/stage.js`: pointer events, hit tests on slot paths (`isPointInPath`), pinch/wheel zoom, as the app already does for crop, text and the DoF focus point. ≤ 36 objects need no scene graph. |
| R2 | TypeScript interfaces, JSON/TS templates | No TypeScript, no build step | Plain ES modules; schema as JSDoc `@typedef`; templates as JS objects. |
| R3 | Pica, Comlink, Cropper.js, browser-image-compression | Same rule; Pica also uses WASM | None. Resize: `createImageBitmap` / progressive halving; Workers: existing `{ id, … }` messages; crop: own slot pan/zoom; compression: `toBlob` quality (+ target size from `plan_workflow.md` Task 7). |
| R4 | npm license-checker, OSV, CI | No npm dependencies or CI | `docs/collage/REFERENCES.md` register: original code only; every bundled asset needs a licence line, or it is generated in code. |
| R5 | "Proprietary, closed-source" | Repo `LICENSE` and About say **GPL-3.0**; app public on GitHub Pages; optics and Kamo code marked proprietary (unresolved since `plan_optics.md`) | **Owner decision** (Open decisions #1). Only original code + OFL fonts already in the repo, so either answer works. |
| R6 | Import 2–9 photos into collage mode | Duplicates the strip (≤ 50 photos with per-photo settings and undo) | Slots **reference strip photos by id**. "Add photo" in collage uses the same file input; new files join the strip. |
| R7 | "Preserve adjustments where supported" | Raw sources would lose looks, film, optics, healing | Each slot shows the photo's **finished edit without frame and text** (V2). Editing the photo updates its slot. |
| R8 | Preview 1200–1600 px; export from original resolution | 9 × 12 MP ≈ 430 MB; slow | **Per-look render size** (V1): Basic → slot size; film → engine render from full-size input, downscaled to the slot (export), engine preview quality (preview). One photo at a time at export, freed immediately. |
| R9 | Template stores px size and per-slot crop | Pixel size belongs to export, crop position to the user's fill; gutters can't be adjusted | Templates hold an aspect + grid tracks or free slots; layout engine applies gutter/margin; pan/zoom lives in the collage document. |
| R10 | Profiles Preview/Standard/High/Print | Undefined sizes | Share (1080 long edge / platform), Full (device limit), Print (A4/Letter/4×6/5×7/8×10 @ 300 dpi, capped). |
| R11 | Phases without checks | Doesn't fit the workflow | Tasks with checklists, **Check**, **Done when**. |
| R12 | Little on accessibility | Required by `CLAUDE.md` | Listbox slots, keyboard pan/zoom/swap, "Move to slot…", live status, 44 px targets. |
| R13 | Contact sheets as a new visual system | Film-strip drawing exists (V9) | Reuse and generalise. |
| R14 | Export compositing in a Worker with OffscreenCanvas | Fonts in Workers (V6); extra complexity for cheap drawing | Composite on the main thread; heavy per-photo renders stay in their Workers; `toBlob` encodes asynchronously. |

---

## What exists today (relevant code)

| Area | Where | Use in collage |
|---|---|---|
| Photo strip, multi-select | `app.photos`, `app.selected`, `syncStrip`, strip checkboxes | Collage photos; Make collage button (V4) |
| Per-photo render | `renderPhotoThumb`, `renderPhotoFull` | Refactor to `renderPhotoEdit` (V2) |
| Film/paper drawing | `frameLayout`, `frameCanvas`, `drawFilmStrip`, `perforations`, `filmWear`, `drawFilmCollage`, `FRAME_COLORS`, `paperColors` | Contact sheets, paper colours, borders |
| Text | `drawTexts(ctx, rect, texts)`, text layer UI, `ensureTextFonts` | Captions/date (rect = sheet or slot) |
| Export | export sheet (`#formatOptions` JPEG/PNG/WebP, quality), `toBlob`, `preparedExport`, `navigator.share`, `js/zip.js` | Collage export |
| History | `undo`/`redo`, global shortcuts | Routed to collage history in collage mode (V5) |

---

## Decisions (proposed; confirm before Task 1)

1. **Collage is a mode, not a frame**, with its own document and undo history. Photo edits stay in the photos.
2. **Slots reference photos**; removing a photo from the strip empties its slot (with an "Add photo" button), never breaks the collage.
3. **One renderer** (`js/collage/render.js`) for every template, called by preview and export with different scales.
4. **Pure layout engine** (`js/collage/layout.js`, `js/collage/shapes.js`): no DOM, Node-checkable.
5. **Render size per look** (V1): Basic at slot size; film from full-size input, downscaled.
6. **Main-thread compositing**, heavy renders in existing Workers (V6, R14).
7. **One undo step per gesture**; collage history ≤ 50 compact snapshots; global undo keys routed by mode (V5).
8. **Text reuses text layers** with `target: 'sheet' | slotId`.
9. **Transparency is explicit** (V7): sheet background `paper` or `transparent`; sheet shape clips everything; PNG/WebP keep alpha; JPEG flattens onto a chosen colour, with a visible note.

### Document model (JSDoc, `js/collage/model.js`)

```js
/** @typedef {{ id: string, photoId: number|null, pan: {x:number,y:number}, zoom: number, rotate: number, angle: number, flip: boolean }} SlotFill
 *  pan 0–1 (0.5 = centred) within the photo's own crop (V11); zoom 1–5 (1 = cover); rotate in 90° steps; angle −45…45° */
/** @typedef {{
 *   v: 1, templateId: string,
 *   aspect: { w: number, h: number },
 *   sheet: {
 *     shape: ShapeRef,                         // 'rect' for normal collages; heart, circle, star… for shaped ones
 *     background: 'paper' | 'transparent',     // transparent: gutters/margins see-through
 *     outline: { width: number, color: string } | null,   // die-cut sticker keyline around the shape
 *     shadow: boolean                          // soft drop shadow outside the shape (PNG/WebP only)
 *   },
 *   gutter: number, margin: number, radius: number,       // fractions of the sheet's short edge
 *   paper: { color: string, texture: 'none'|'fibre'|'film-base' },
 *   border: { width: number, color: string } | null,      // around each slot
 *   splits: number[] | null,                   // diptych/triptych dividers, 0–1
 *   slots: SlotFill[],
 *   text: TextLayer[],                         // existing text layer shape + target
 *   film: { startNumber: number, date: string, edge: 'generic'|'plain', base: 'colour'|'bw' } | null,
 *   flatten: string                            // colour used when exporting a transparent collage as JPEG
 * }} CollageDoc */
/** @typedef {{ kind: 'rect'|'rounded'|'circle'|'ellipse'|'polygon'|'star'|'heart'|'hexagon'|'arch'|'stamp'|'path',
 *   points?: number[], n?: number, inner?: number, radius?: number, d?: string }} ShapeRef
 *  All shapes are defined in a 0–1 box and scaled to the target rect. */
```

### Template schema (`js/collage/templates.js`)

```js
// Grid: relative track sizes; layout engine applies gutter/margin.
{ id: 'grid-2x2', name: '2 × 2', category: 'grid', aspect: [1, 1], kind: 'grid',
  cols: [1, 1], rows: [1, 1], cells: [[0,0],[1,0],[0,1],[1,1]] /* [col,row,colSpan?,rowSpan?] */ }
// Free: normalised rects, rotation, z, per-slot shape (scrapbook, masked).
{ id: 'scrap-3', category: 'scrapbook', aspect: [4, 5], kind: 'free',
  slots: [{ x: .08, y: .1, w: .5, h: .42, rotate: -4, z: 1, shape: { kind: 'rect' }, shadow: true }, …] }
// Shaped: a sheet shape + a fill layout that is clipped by it. Outside the shape is transparent.
{ id: 'heart-4', name: 'Heart · 4', category: 'shape', aspect: [1, 1], kind: 'shaped',
  sheet: { shape: { kind: 'heart' }, background: 'transparent' },
  fill: { kind: 'grid', cols: [1, 1], rows: [1, 1], cells: [[0,0],[1,0],[0,1],[1,1]] } }
{ id: 'circle-pie-6', category: 'shape', aspect: [1, 1], kind: 'shaped',
  sheet: { shape: { kind: 'circle' } }, fill: { kind: 'radial', slices: 6, rings: 1, rotate: -90 } }
{ id: 'hex-honeycomb-7', category: 'shape', aspect: [1, 1.1547], kind: 'shaped',
  sheet: { shape: { kind: 'hexagon' } }, fill: { kind: 'free', slots: [/* 7 hexagon slots */] } }
// Contact: strips × frames, frame aspect, edge style.
{ id: 'contact-35-36', category: 'contact', aspect: [8.5, 11], kind: 'contact', strips: 6, frames: 6, frame: [3, 2] }
```

### Shapes (`js/collage/shapes.js`, pure, drawn by us)

`shapePath(ref, rect) → Path2D` (browser) and `shapePolygon(ref, rect, tolerance) → number[]` (Node checks and hit tests), from the same definitions:

| Shape | Definition (0–1 box) |
|---|---|
| rounded | rect with corner radius r (fraction of short side) |
| circle / ellipse | centre .5,.5, radii .5 (ellipse fills the box) |
| polygon / hexagon | regular n-gon, flat or pointy top; or explicit points |
| star | n points, inner radius ratio (default .45) |
| heart | two cubic Béziers mirrored about x = .5 (constants fixed in the module, checked by area ≈ 0.66 of the box ± 2 %) |
| arch | rect with a semicircular top |
| stamp | rect with semicircular bites along the edges (perforated postage stamp), bite count from size |
| path | SVG path data in a 0–1 box, **built-in set only** (no user import in this plan) |

### Rendering order

```
sheet canvas (export size, or stage size × dpr for preview), cleared to transparent
  → if sheet.shadow: draw shape shadow (outside only)
  → clip(sheet shape)
      → if background = paper: paper colour / generated texture
      → for each slot by z: save → clip(slot ∩ sheet shape) → draw photo bitmap (pan/zoom/rotate) → restore → border
      → decorations: film base, perforations, edge text, frame numbers (contact sheets)
      → text layers (sheet rect or slot rect)
  → unclip → outline stroke along the shape (keyline), if set
  → export: JPEG → draw onto a canvas filled with `flatten` colour first
```

Slot bitmap = the photo's unframed edit (V2), cached by `[photoId, settingsKey, edge]`; only visible slots keep bitmaps.

---

## Tasks

### Release 1: grids and export

#### Task 0: Groundwork
- [x] Refactor `renderPhotoEdit(photo, { edge, quality })` out of `renderPhotoFull`/`renderPhotoThumb` (V2); applies V1 (film: full-size input)
- [x] `js/collage/layout.js` (pure): grid tracks + gutter + margin + radius → slot rects; free slots; contact frames; last track absorbs rounding
- [x] `js/collage/shapes.js` (pure): shape definitions → polygon (Node) and `Path2D` (browser)
- [x] `js/collage/templates.js`: 2, 3, 4, 6, 9-photo grids
- [x] `tools/collage-check.mjs` (Node): template validation (unique ids, in-bounds, no zero-size slot), layout golden numbers, shape areas (circle π/4 ± 0.5 %, heart, star, hexagon), polygons simple (no self-intersection)
- [x] `docs/collage/REFERENCES.md`: licence rule and asset register

*Done:* SHA-256 of 9 renders (thumb + full × Basic+frame+text, Basic+crop+optics, Kamo+frame+text, Kamo+Adjust, and the in-view photo) are identical before/after in Chrome. The renderer also gained `renderEdit()` (the Basic edit without frame). `collage-check.mjs` runs 4660 checks with 0 errors across 12 grids × 3 sizes × 3 spacings and 11 shapes × 3 sizes. Path2D vs polygon area is within 0.05 %. The heart ratio is 0.674.

**Check:** single-photo export of the sample with a Basic look, a Kamo look, a frame and text is **byte-identical** to before the refactor; `node tools/collage-check.mjs` passes.
**Done when:** layout rects are pixel-exact at 3 sizes, and cells + gutters + margins = sheet size exactly; refactor causes zero output change.

#### Task 1: Collage mode shell and grid preview
- [x] **Make collage** button in the strip when 2–9 photos are selected, and **Make collage…** in `#fileMenu` (V4); **Back to photo**; Escape leaves
- [x] Stage replaces the viewport; template picker (`role="listbox"`, thumbnails drawn from the layout engine); gutter, margin, corner radius, paper colour (`paperColors`, tokens only), sheet aspect (1:1, 4:5, 3:2, 2:3, 9:16, 16:9)
- [x] Slots show queue thumbs instantly, then sharper renders at slot size (V1, V3)
- [x] Collage history: undo/redo buttons and global shortcuts route to it in collage mode (V5)
- [x] Phone: stage on top, controls in the bottom sheet; 44 px targets

*Done:*
- **Code:** `js/collage/mode.js` (stage, panel, slot cache, history), `model.js` and `render.js` (the one compositor). `renderPhotoEdit` gained `from: 'full'`, so film slots get full-size input at engine preview quality.
- **Fidelity:** a Kamo slot shows the photo's own look. Single-photo renders are still byte-identical to the Task 0 hashes.
- **Speed:** 4 photos (Basic + Kamo) are ready in ≈ 0.4 s on a laptop. 6 layout switches cost 0 decodes, ≈ 2 frames each including the draw.
- **Undo:** one step per slider drag; 8 of 8 steps undone.
- **Leaving:** Esc and Back restore the photo, tab, look, selection and undo exactly; Ctrl+Z then acts on the photo.
- **Phones:** 360/430 px have no targets under 44 px; the keyboard-only flow works; no console errors.
- **Defaults chosen:**
  - Sheet aspect follows the template until the user picks one.
  - The background render queue pauses in collage mode.
  - Dropping files in collage mode is blocked with a toast.
  - Export is hidden until Task 3.

**Check:** 4 photos (one Basic, one Kamo) → 2×2 with each photo's own look; gutter/margin/radius/paper (one undo per drag); template change keeps order; Ctrl/⌘-Z undoes collage steps in collage mode and photo steps after Back; desktop and phone 360/430 px; keyboard only; no console errors.
**Done when:** template switching never re-decodes a photo (count decodes); slider drags at display refresh; leaving collage mode restores the editor exactly (photo, undo, selection, tab).

#### Task 2: Slot editing (pan, zoom, rotate, swap, replace)
- [x] Select a slot (tap; slot `listbox` for keyboard); drag pans, pinch/wheel zooms (1–5×), rotate 90°, fine angle (−45…45°), flip; double-click resets
- [x] Swap by drag; **Move to slot…** menu and buttons as non-drag alternatives
- [x] Replace from the strip or a new file; remove from slot (empty slot with "Add photo")
- [x] Photo always covers its slot; pan is limited to the photo's own crop, with the hint "Uses this photo's crop" (V11)
- [x] **Edit this photo** opens the editor; returning refreshes that slot only

*Done:*
- **Code:** `js/collage/fill.js` holds the one framing geometry used by drawing, dragging and the checks.
- **Coverage:** `collage-check.mjs` maps the slot corners of 2000 random fills (pan, zoom, rotate, angle, flip); all land inside the photo. A mutation that ignores the angle fails 1029 of them. Preview vs export scale differ by < 0.01 slot px.
- **Browser:** 0 paper pixels in a slot at 45° with pan in the corner.
- **Gestures:** drag pans, and dropping on another slot swaps, as one undo step each. Wheel zoom commits after 400 ms; pinch was tested with synthetic touch.
- **Non-drag paths:** Move to slot, the photo picker (swaps when the photo is already in another slot), Empty slot, and Add photo… (new files join the strip without changing the editor).
- **Keys:** arrows choose a slot, Alt+arrows pan, + − zoom, R rotates, F flips, 0 resets, Delete empties, and Esc clears the selection before leaving.
- **Edit this photo:** opens the editor with **Back to collage**; returning re-rendered only that slot (0 decodes).
- **Status:** every action reports in the status line; no console errors.

**Check:** pan/zoom a face into place; swap by drag and by menu; replace; edit a photo's look and come back; undo per gesture; touch, mouse, keyboard.
**Done when:** slot crop at preview and export matches within 1 output px; no gaps at any pan/zoom/angle; every action has a keyboard path and a status message.

#### Task 3: Collage export
- [x] Export sheet in collage mode: format (JPEG, PNG, WebP), quality, size **Share** (1080 long edge / platform), **Full** (device limit), **Print** (A4, Letter, 4×6, 5×7, 8×10 @ 300 dpi)
- [x] Device canvas limit: measure once (allocate, write and read a pixel at the far corner, cache in localStorage per user agent); cap Full/Print and show "Limited to N MP on this device"
- [x] Export: photos one at a time through `renderPhotoEdit` at their export slot size (film: full-size input then downscale, V1), drawn and **closed immediately**; progress + Cancel; composite on the main thread (V6)
- [x] Share via `preparedExport` (ready before the tap); file extension from `blob.type` (V8); name `PhotoKamo-collage-<yyyy-mm-dd>.<ext>`
- [x] Check the single-photo export for the V8 extension issue and record the result (fix in its own commit if real)

*Done:*
- **Code:** `js/collage/export.js` (sheet, device limit, render), `js/collage/sizes.js` (pure sizes, checked in Node), and `drawPaper`/`drawSlot` split out of the compositor.
- **Sizes:** Share is 1080 on the short edge, at most 1920 on the long. Full is the sheet at which the most detailed slot shows its photo 1:1, capped by the device limit. Print fits the paper at 300 dpi and shows the dpi when capped.
- **V8 was real:** single and batch exports saved a PNG fallback as `.webp`. Fixed in its own commit, which names files after `blob.type` and adds a toast; simulated no-WebP browser → `….png`.
- **Speed:** Chrome laptop, 9 photos from 24 MP sources, 3 with Kamo looks, Full at 8000 × 8000 (capped by the measured 64 MP): prepared in 6.6 s.
- **Layout:** export vs preview slot edges are within 1 px scaled (30/383/397/749 vs 31/382/398/749).
- **Robustness:** Cancel works. 10 repeated offline exports succeed with no network requests, and browser memory stays flat.
- **Phones:** the sharing size is the default and no target is under 44 px. Phone memory/iOS and Share-on-first-tap still need a real device.
- **Film fidelity:** a Kamo slot is that photo's full render scaled down, the same pipeline as exporting it alone and scaling.
- **Not measured:** peak memory per export was not measured on its own; the design keeps one photo render plus the sheet.
- **Timings:** `docs/collage/PERF.md`.

**Check:** 9-photo collage with 3 Kamo photos at Full on laptop and phone; a Kamo slot looks the same (grain size) as that photo exported alone and scaled; Share opens on first tap; 10 repeated exports; offline after load still exports.
**Done when:** layout matches preview within 1 px scaled; peak memory ≤ one full photo render + the sheet canvas + ~20 % (DevTools Memory); no growth over 10 exports; no iOS crash at the capped size; no network requests; 9-photo export with 3 film photos at 24 MP < 15 s on laptop (recorded in PERF).

### Release 2: shaped transparent collages

#### Task 4: Transparency foundation
- [x] `sheet.background: 'transparent'` for any template ("Paper: None"); stage shows a checkerboard behind transparent areas (CSS pattern built from tokens), with a backdrop switch **Checker / Light / Dark** (preview only, never exported)
- [x] Format rules: PNG and WebP keep alpha; choosing JPEG shows "JPEG has no transparency — background filled with [colour]" and a flatten colour picker; WebP fallback to PNG handled by V8
- [x] Template thumbnails show the checkerboard where transparent
- [x] Hit testing ignores transparent areas (tap between slots selects nothing)
- [ ] ~~Text contrast hint uses the current backdrop when the background is transparent~~ → moved to Task 8 (collages have no text layers yet)

*Done:*
- **Code:** Paper: None swatch (checkerboard), backdrop switch remembered per device (`photokamo:collage-backdrop`), checkerboard thumbnails, tap on gutters/margins clears the selection. The export sheet defaults to PNG for transparent collages (until a format is picked), shows the JPEG note + flatten swatches/custom colour (`doc.flatten`, one undo step), and `drawPaper` fills the flatten colour *under* the photos, so JPEG edges blend with it instead of black.
- **Found:** lossy WebP turns transparent edges dark: the black stored under alpha 0 bleeds in (edge pixels up to 63/255 off, e.g. 177,70,56 for 200,60,40). Transparent collages now encode WebP at quality 1, which Chrome writes lossless (exact edges); the quality slider hides and the note says so.
- **Fixture:** `tools/collage-alpha.html` draws a transparent 2 × 2 grid through `drawPaper`/`drawSlot` (one slot rotated + zoomed, one turned + flipped), encodes, decodes and checks every pixel. Chrome, 540/1080/2400 px, corners 0/4/10 %: PNG and WebP alpha exactly 0 outside and 255 inside (e.g. 1 579 584 + 4 142 896 px at 2400), edge colour after un-premultiplying within 2/255 (alpha ≥ 64); JPEG equals the flatten colour (± 16, ≥ 8 px from edges), never black.
- **Not run here:** Safari and Firefox (Playwright builds missing). Safari can't encode WebP (falls back to PNG, V8); Firefox's WebP at quality 1 still needs the fixture run.

**Check:** grid with Paper: None → export PNG; open it in another app over a coloured background (gutters show through); JPEG export is filled with the flatten colour, not black; Safari, Chrome, Firefox.
**Done when:** exported alpha is exactly 0 in gutters/margins and exactly 255 inside photo areas (pixel check on the fixture page), antialiased only along edges; no dark fringes on edges (premultiplied-alpha check: edge pixels' colour equals the photo colour within 2/255 after un-premultiplying).

#### Task 5: Shaped collage templates
- [ ] `kind: 'shaped'` templates: sheet shape clips the fill layout; slots are `slot ∩ sheet shape`; slots that keep < 15 % of their area inside the shape are not created (template validation fails)
- [ ] Shapes: circle, rounded square, heart, star (5, 6), hexagon, arch, stamp (perforated edges), ellipse
- [ ] Fill layouts: grid (clipped), **radial** slices/rings (pie, donut) and free slots (honeycomb hexagons inside a hexagon, circles in a circle)
- [ ] Starter set (≈ 12): Heart 1/2/4, Circle 1/4-pie/6-pie, Donut 6, Star 1/5-point split, Hexagon 1/honeycomb 7, Arch 2, Stamp 1/4
- [ ] **Sticker options:** outline keyline (width, colour; drawn outside the clip so it isn't cut in half), soft drop shadow (off by default; PNG/WebP only)
- [ ] One-photo shaped templates allowed ("photo in a heart"); collage requires 1+ photos only for `category: 'shape'`
- [ ] Export canvas = the shape's bounding box plus the outline/shadow margin (no wasted transparent pixels beyond that)

**Check:** Heart · 4 with gutters → PNG over a coloured backdrop: heart edge clean, gutters transparent; keyline on/off; shadow; pan/zoom inside a pie slice; tap outside the heart selects nothing; phone touch; one-photo heart from a single selected photo.
**Done when:** shape edges in export match the preview shape within 1 px scaled; outline width exact (± 0.5 px scaled) all the way round; every starter template passes `collage-check.mjs` (areas, slot coverage, no slivers); transparent pixels outside the shape are alpha 0 (corner pixels of the bounding box checked).

### Release 3: classic layouts

#### Task 6: Diptych and triptych
- [ ] 2 and 3 photos, horizontal and vertical, draggable dividers (`splits`; keyboard: focus divider, arrows move 1 %); min slot 15 %
- [ ] Border option (width, colour); per-slot caption space under each photo (gallery style)

**Check:** drag a divider (one undo), keyboard divider, both orientations, export.
**Done when:** gutters stay exact while dividers move; captions never overlap photos.

#### Task 7: Text and captions
- [ ] Text layers on the sheet; `target` = sheet or slot (slot captions move with the slot, decision #3)
- [ ] Presets: **Shared caption**, **Date** (today or typed; capture date waits for the metadata reader), **Slot captions**; on shaped collages, text is clipped by the shape unless "Outside shape" is chosen (then the canvas grows to fit)
- [ ] Fonts, colour, alignment from the existing controls; fonts loaded before export (`ensureTextFonts`)
- [ ] Text contrast hint uses the current backdrop when the background is transparent ("Contrast depends on where you place it") (moved from Task 4)

**Check:** caption + date on a grid and on a heart; swapped photos leave slot captions in place; export matches preview.
**Done when:** text positions within 1 px scaled; no font fallback in export.

#### Task 8: Film contact sheets
- [ ] Generalise `drawFilmStrip`/`perforations`/`filmWear` (V9) so single frames and contact sheets share code; single-photo film frames stay byte-identical
- [ ] Templates: 35 mm (6 frames × up to 6 strips = 36), 120 6×6 (3 × 4), 120 6×7 (3 × 3); strips laid on paper with seeded small offsets/rotation
- [ ] Edge markings in code: frame numbers from `startNumber` (with "A" half numbers), DX-style dashes, user-editable **generic** stock text (no real brand names or logos), date; colour-negative (orange) or B&W base
- [ ] Optional grease-pencil circle/cross on a chosen frame (off by default)
- [ ] More than 9 photos only in contact sheets; small frames preview from queue thumbs

**Check:** 12 photos → contact sheet numbered 1…12 (or from start); both bases; Print export; existing Film strip frames byte-compare unchanged.
**Done when:** a 36-frame sheet previews in < 1 s once thumbs exist and exports without crash on phone at the capped size.

### Release 4: creative layouts

#### Task 9: Masks, free layouts, scrapbook
- [ ] Per-slot shapes from `shapes.js` on normal (rect) sheets; free templates with overlap and z-order (Bring forward / Send back buttons); hit test by shape, top-most first
- [ ] Scrapbook: rotated prints with white borders and soft shadows, generated tape corners, generated paper textures (seeded fibre noise, resolution-independent)
- [ ] Rotation handle + slider, drag to move in free layouts, snap to 0° within 2°
- [ ] Scrapbook 3/4/5 templates

**Check:** circle/heart slot masks clip the same in preview and export; overlapping slots select the top one; move/rotate (one undo per gesture); textures look the same at 1080 and 4000 px.
**Done when:** mask edges ± 1 px scaled between preview and export; no bundled image assets without a licence line.

### Release 5: keep and polish

#### Task 10: Saving collages and QA
- [ ] With session recovery (`plan_workflow.md` Task 5): store collage documents in the session; missing photos → empty slots
- [ ] "Collages (N)" list in `#fileMenu` to reopen or delete
- [ ] `docs/collage/PERF.md`: preview/export time and peak memory for 4, 9 and 36 photos (Basic-only and 3-film mixes) at Share/Full/Print, laptop and phone
- [ ] About dialog, README, `docs/collage/REFERENCES.md` complete; CLAUDE.md "Current redesign" updated and this plan archived

**Check:** build a collage, reload, reopen; delete a photo used in a collage; full regression list.
**Done when:** every success criterion below holds on Chrome, Firefox, Safari (macOS), iOS Safari, Android Chrome.

---

## Regression QA (after every task)

- [ ] Single-photo editor unchanged: frames, text and export byte-identical to before for photos not in a collage
- [ ] Entering/leaving collage mode keeps the active photo, its undo, selection and tab
- [ ] One undo step per gesture in collage mode; undo keys act on the right history
- [ ] Engines and Workers load only when a slot's photo needs them
- [ ] Desktop and phone (360/430 px), keyboard only, screen reader status, 44 px targets, 4.5:1 text, visible focus, reduced motion
- [ ] Transparent exports: alpha 0 outside, no dark fringes; JPEG flattened, never black
- [ ] Network panel: same-origin app/engine files only; no console errors

## Success criteria (release)

| Area | Criterion |
|---|---|
| Fidelity | Each slot shows the photo's own edit; film grain scale matches a single export of that photo; preview and export layouts within 1 px scaled |
| Transparency | PNG/WebP outside the shape and transparent gutters are alpha 0; inside photos alpha 255; edges antialiased without fringes; JPEG flattens to the chosen colour |
| Shapes | All starter shapes validate (area, coverage, no slivers); keyline exact width all round |
| Performance | Template/gutter changes < 50 ms with 9 photos; slot drag at display refresh |
| Memory | Export holds at most one full photo render at a time; no growth over 10 exports; no iOS crash at the capped size |
| Limits | Layouts 2–9 photos, shapes 1–9, contact sheets ≤ 36; output capped to the measured device limit, and the cap is shown |
| Accessibility | Every gesture has a keyboard/button alternative; templates and slots are real listbox options; nothing colour-only |
| Privacy | Works offline after load; no uploads; no third-party code or assets |

## Risks

| Risk | Mitigation |
|---|---|
| Film photos slow to export (full-size engine render each, V1) | One at a time with progress/cancel; cache the full render per `[photo, settings]` for the session only while memory allows; show an estimate before Full/Print exports |
| iOS canvas and memory limits | Measured cap; free each photo right after drawing; Share size by default on phones |
| Alpha edge artefacts (premultiplied alpha, shadows) | Fringe check in Task 4; draw photos clipped on a transparent canvas, never over a temporary background |
| Platforms flatten PNG transparency when shared (some social apps) | Note in the export sheet: "Some apps add a background to transparent images" |
| WebP encoding missing in some browsers | `blob.type` decides the extension (V8); tell the user when it fell back to PNG |
| Scope creep (stickers, user templates, custom shapes) | Listed under Later |
| Licence ambiguity (R5) | Original code and generated assets only until decided |

## Later (not in this plan)

User-created templates and a layout editor; importing SVG masks/shapes (needs a sanitiser and path validation); batch contact sheets for a whole roll; print DPI metadata; stickers/decoration library; text-shaped masks (photo inside letters); animated or video collages.

## Open decisions (owner)

1. **Licence:** proprietary (proposal) or GPL-3.0 (repo) (R5).
2. Entry point: strip button + `#fileMenu` item (recommended) or a tab in the tab bar.
3. Slot captions belong to the **slot** (recommended) or follow the **photo** on swap.
4. Contact sheet maximum: 36 (recommended) or 50.
5. One-photo shaped templates ("photo in a heart"): in collage mode (recommended) or also as single-photo frames.
6. Default export format for transparent collages: PNG (recommended, universal) or WebP (smaller, less universal).
7. Include collages in "Export all"? (Recommended: no.)
