# CLAUDE.md – PhotoKamo

Privacy-first photo editor that runs entirely in the browser. Static site (GitHub Pages), no build step, no backend.

## Run
```
python -m http.server 8080   # then open http://localhost:8080
```
ES modules + WebAssembly need HTTP; opening index.html from disk does not work. Use "No photo handy? Try a sample" (`images/model.jpg`) for testing.

## Layout
- `index.html` – all markup, dialogs
- `css/styles.css` – design tokens at the top (`--bg`, `--surface`, `--accent`, …); use them, never new hex values
- `js/app.js` – state, UI wiring, render scheduling, export
- `js/renderer.js` – Canvas pipeline: `renderImage`, `processPixels`, `frameCanvas`, `frameLayout`
- `js/presets.js` – looks, adjustment specs, frames
- `js/advanced-ui.js` – builds film-engine controls from an engine's `sections`
- `js/engines/registry.js` – engine list (lazy `load()`); `js/engines/<id>/index.js` – engine contract
- `engines/<id>/` – vendored engine source, licence, credits, runtime files. **Do not edit** unless the task says so; record any change in that engine's `credits.json` → `changes`.
- `tools/engine-manifests.mjs` – regenerates `engines/*/manifest.json` (sizes + sha256). Run with Node after changing runtime files.

## Current redesign
Follow `docs/handover/SPEC.md` and do tasks from `docs/handover/TASKS.md` **one at a time**. Mockups are in `docs/handover/mockups/`. Show a short plan before editing, then stop after the task's Check list and tell me what to verify.

## Rules
- Nothing leaves the device: no fetch except engine files already in the repo; no analytics, no CDNs, no new runtime dependencies (write small helpers yourself, e.g. `js/zip.js`).
- Keep files as plain ES modules; no TypeScript, no bundler, no frameworks.
- Rendering heavy work stays in the engine Workers; never block the main thread for full-res renders.
- Undo: every user-visible change goes through `change()` / `commit()` once per gesture (commit on pointer-up, not on every move).
- Accessibility is required: real `<button>`/`<input>`/`<label>`, roles from the spec (listbox, radiogroup, tablist), visible focus, 44 px touch targets, 4.5:1 text contrast, `aria-live` for status text.
- Mobile breakpoint is `(max-width: 900px)` (`mobileQuery` in app.js); check both layouts.
- Licences: PhotoKamo is GPL-3.0; keep engine credits and the About dialog accurate.
- Keep diffs focused; don't reformat unrelated code. Match the existing compact style.

## Verify
No test suite. Verify in the browser: load the sample, exercise the feature, check DevTools console has no errors, and export a file to confirm output matches the preview.
