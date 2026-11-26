# CLAUDE.md – PhotoKamo

Privacy-first photo editor that runs entirely in the browser. Static site (GitHub Pages), no build step, no backend.

## Run
```
python3 -m http.server 8080   # then open http://localhost:8080 (Windows: py -m http.server 8080)
```
ES modules and the engine Workers need HTTP; opening index.html from disk does not work. Use "No photo handy? Try a sample" (`images/model.jpg`) for testing.

## Layout
- `index.html` – all markup, dialogs
- `css/styles.css` – design tokens at the top (`--bg`, `--surface`, `--accent`, …); use them, never new hex values
- `js/app.js` – entry point: event wiring, keyboard shortcuts, boot splash (nothing imports it)
- `js/state.js` – `elements`, the photo-in-view `state`, open photos `app`, constants, effective Adjust values, `toast`
- `js/history.js` – snapshots, `commit()` / `change()`, slider gestures; upward calls are injected with `setHistoryHooks`
- `js/photos.js` (open/switch photos, filmstrip, apply to selected, render queue), `js/preview.js` (sources, Basic preview, zoom, compare, full screen), `js/export.js` (Save sheet, batch), `js/camera.js`, `js/looks.js`, `js/start-screen.js`, `js/engine-host.js` (film engines and rendering), `js/collage-host.js` (collage glue, undo/redo)
- `js/panels/` – one module per panel: `adjust`, `lens`, `frames`, `crop`, `text`, `film-sheet`, `tabs`
- `js/renderer.js` – Canvas pipeline: `renderImage`, `adjustPixels` (pure), `frameCanvas`, `frameLayout`
- `js/collage/mode.js` – collage mode; its parts (`panel`, `slots-ui`, `text-ui`, `sticker-ui`, `slot-cache`, `ui`) share one context object
- `js/presets.js` – looks, adjustment specs, frames
- `js/advanced-ui.js` – builds film-engine controls from an engine's `sections`
- `js/engines/registry.js` – engine list (lazy `load()`); `js/engines/<id>/index.js` – engine contract
- `engines/<id>/` – vendored engine source, licence, credits, runtime files. **Do not edit** unless the task says so; record any change in that engine's `credits.json` → `changes`.
- `tools/engine-manifests.mjs` – regenerates `engines/*/manifest.json` (sizes + sha256). Run with Node after changing runtime files.

## Current redesign
Follow `plan_workflow.md` (look search, analysis/Auto, IndexedDB recovery, exact export and healing) one task at a time. The collage implementation is complete through Task 9; Task 10's cross-reload saving must integrate with workflow Task 5 rather than creating a second photo store. Show a short plan before editing, then stop after the task's Check list and tell me what to verify. Finished plans are archived in `docs/archive/`. `plan_*.md` and `docs/archive/` are local working notes (ignored by git, so not in a fresh clone); `v3plan.md` and `CollagePlan.md` are tracked.

Stabilisation runs alongside: `v3plan.md` (bugs, main-thread work, memory, parity, accessibility, structure). Tasks 0–13 are done (Task 9's memory bar is not met: `docs/v3/PERF.md`); Task 13's owner decisions are made (plans stay local, `Archive/` is not published, Kamo stays proprietary). Byte-identical exports are checked against `docs/v3/BASELINE.md` with `tools/v3-baseline.mjs`.

## Rules
- Nothing leaves the device: no fetch except engine files and vendored assets already in the repo (`vendor/twemoji/`, CC-BY 4.0, credited in About); no analytics, no CDNs, no new runtime dependencies (write small helpers yourself, e.g. `js/zip.js`).
- Keep files as plain ES modules; no TypeScript, no bundler, no frameworks.
- Rendering heavy work stays in the engine Workers; never block the main thread for full-res renders.
- Undo: every user-visible change goes through `change()` / `commit()` once per gesture (commit on pointer-up, not on every move).
- Accessibility is required: real `<button>`/`<input>`/`<label>`, roles from the spec (listbox, radiogroup, tablist), visible focus, 44 px touch targets, 4.5:1 text contrast, `aria-live` for status text.
- Mobile breakpoint is `(max-width: 900px)` (`mobileQuery` in app.js); check both layouts.
- Licences: PhotoKamo is GPL-3.0; keep engine credits and the About dialog accurate.
- Keep diffs focused; don't reformat unrelated code. Match the existing compact style.

## Verify
No test suite. Verify in the browser: load the sample, exercise the feature, check DevTools console has no errors, and export a file to confirm output matches the preview.
