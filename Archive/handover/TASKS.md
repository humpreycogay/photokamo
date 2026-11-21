# PhotoKamo – Implementation tasks (do one at a time)

Each task is one PR-sized change. Read `SPEC.md` section noted, look at the mockup, implement, then run the **Check** list in a browser (`python -m http.server 8080`, open http://localhost:8080, "Try a sample"). Commit after each task. Don't start the next task until the checks pass.

Suggested prompt for Claude in VS Code:
> Read `CLAUDE.md`, `docs/handover/SPEC.md` and `docs/handover/TASKS.md`. Do **T1** only. Show me the plan first, then implement. Stop after the T1 checks.

---

## T1 · One engine model, no Simple/Advanced  (SPEC §1, §3, §4 A/B, Adjust)
- Replace `state.mode` with `look.engine` where `'presets'` is a pseudo-engine. Keep the existing single-photo `state` for now (multi-photo comes in T5).
- Remove both `.mode-switch` groups from `index.html`, `setMode`, `syncMode` mode logic, `body.is-advanced` CSS that hides `.control-tabs` / `.panel-body`. Advanced panel content moves **inside the Looks tab panel**, under the engine control.
- Keep the native `#engineSelect` for now, add a "Presets" option first.
- `pickLook()` sets engine to presets, no toast. My looks switch to their engine.
- Apply Adjust `edits` after engine renders (preview, full render, export). Include edits in `fullRenderKey()` and `exportKey()`.
- Migrate snapshots and saved My looks (`mode` → `engine`).
- **Check:** with Negs, Adjust › Exposure +1 brightens preview and export; Frames tab reachable on desktop; undo after switching engine returns to the previous engine; no console errors.

## T2 · Grouped engine picker  (SPEC §4 A/B, mockup C)
- New `js/engine-picker.js`: button + popover listbox per §4, groups Quick / Film simulation, size or Downloaded badge, WebGPU note.
- Replaces `#engineSelect` (keep engine About ⓘ button next to it). On mobile, open as a bottom sheet.
- **Check:** full keyboard use (Tab to button, Enter, ↑↓, Enter, Esc); screen reader announces "Engine, Negs, Ready…"; badge shows Downloaded after an engine was fetched once.

## T3 · Paper print frame + export fix  (SPEC §4 F, mockup F)
- Add `paper` frame + `border` settings; `frameLayout()` / `frameCanvas()` draw it; Frames panel gets the Print border section.
- Remove CSS paper (`--print-border`, `--paper` usage on `.canvas-wrap`, `no-paper`).
- Film engine default: frame `none` → `paper` once when `showsPaper()`.
- **Check:** Negs + Paper print → export file has the border; width/bottom/color change preview and export; Presets + Paper print also works.

## T4 · Crop tab  (SPEC §3, §4 G/H, mockups G, H)
- Add `crop` to settings and snapshot; `cropSource()` in `renderer.js`; pipeline uses it for presets and engines; caches by crop key.
- Crop tab UI: ratio grid (10 + Swap), overlay with thirds + handles, pointer drag / wheel / pinch, Zoom, Straighten, Rotate, Flip, Center, Reset, Done, Output px.
- Commit history on pointer-up / slider change end only.
- **Check:** 4:5 on the sample → export is 4:5 at the shown px; 16:9 + Swap = 9:16; Straighten 10° leaves no empty corners; undo steps through crop changes; Hold to compare shows the cropped original.

## T5 · Multi-photo model + filmstrip  (SPEC §2, §4 Filmstrip)
- Move per-image fields into `photos[]` with per-photo `settings`, `undo`, `redo`; `activeId`, `selected`.
- `<input multiple>`, multi-file drop, Add photos tile, filmstrip with selection rules, selection bar, Export N label.
- Lazy decode: only the photo in view keeps full image/bitmap; 256 px thumbs for all.
- **Check:** open 5 photos; switching photo keeps each one's look/crop/frame/undo; Ctrl/Shift selection works with mouse and keyboard; memory stays flat after switching 20 times (DevTools).

## T6 · Apply to selected + live edit + render queue  (SPEC §4 D, §5)
- Dialog with 5 checkboxes and summaries; remembers choice; one undo step per target.
- Live switch.
- `js/render-queue.js`: one job at a time, active photo first, dedupe, abort; strip progress states.
- **Check:** apply Negs look to 2 others → their thumbs re-render with progress; Crop ratio unchecked keeps their crops; checked gives centered ratio; undo on a target restores it; live mode updates selected photos after each commit.

## T7 · Batch export + zip.js  (SPEC §4 I)
- Multi-photo export dialog: ZIP vs separate, format, quality, progress k of N, cancel.
- `js/zip.js` store-only writer; unique filenames; Web Share with files when supported.
- **Check:** export 3 → ZIP opens on Windows/macOS with 3 correct images; separate mode downloads 3 files; cancel stops after current photo.

## T8 · Mobile pass  (SPEC §4 E, mockups E, H)
- 4-item bottom nav, filmstrip above the sheet, engine chip, Apply to N, Save N, crop gestures (pinch, two-finger rotate optional).
- **Check:** at 390×844 every target ≥ 44 px, nothing overlaps, crop pinch works on a real phone.

## T9 · QA & docs
- Keyboard-only run through all tabs; axe DevTools has no serious issues; README "Features" updated (no Simple/Advanced, crop, multi-photo, batch export); About dialog text updated.
- **Check:** full manual run of every Check above on Chrome + Firefox + Safari (iOS if possible).
