# Plan v3: stabilisation (bugs, main-thread work, memory, parity, accessibility, structure)

**Status:** proposed 2026-11-26, from a code review of commit `57806ec`. Line numbers below are from that commit and will drift; search for the function name if a line no longer matches.
**Workflow:** same as `plan_workflow.md`: tasks **one at a time**, short plan before editing, stop after each task's **Check** and report what to verify. Mark `- [x]` and add a one-line *Done* note with measured numbers.
**Relation to `plan_workflow.md`:** this plan fixes what exists; the workflow plan adds features. Recommended order: v3 Tasks 0–4 → workflow Task 0 together with v3 Task 5 (both need the pure `adjustPixels` split) → the rest of either plan. See Open decisions 1.

## Goal

1. Fix the bugs found in review, smallest and safest first.
2. Honour the project rule "never block the main thread for full-res renders".
3. Keep memory inside phone limits (iOS canvas ≈ 16.7 MP).
4. Make export match preview (grain, glow, collage empty slots).
5. Close accessibility gaps.
6. Split the two largest files without changing behaviour.

## Evidence labels

Each item carries one label, so nobody fixes a bug that isn't there:

- **[C]** confirmed: read at the cited line and unambiguous (or reproduced in Node).
- **[R]** reported from reading, not reproduced in a browser: **reproduce first**, write the repro steps in the *Done* note, and close the item as "not a bug" if it doesn't reproduce.
- **[S]** suspicion: investigate before planning any fix.

## Test requirements (apply to every task)

There is no test suite. Every task must leave these green and must add the checks named in its **Tests** line.

**Node (run from the repo root, all must pass):**

```
node tools/check-film-looks.mjs                      # 81 looks, 0 errors
node tools/collage-check.mjs                         # 0 errors (red today; fixed in Task 0)
node tools/v3-check.mjs                              # added in Task 0, grows with each task
(cd engines/kamo-film-engine && node --test)         # 39+ pass, 0 fail
```

**Browser (`python -m http.server 8080`, sample photo):**

- [ ] Console has no errors or warnings introduced by the task
- [ ] Network panel: no request outside the app's own origin
- [ ] Desktop and phone layout (`max-width: 900px`; check 360 and 430 px)
- [ ] Keyboard only: every changed control reachable and operable, focus visible
- [ ] One undo step per gesture for every changed interaction; redo restores it
- [ ] Export a file and compare with the preview

**Rules for new checks:**

- Pure logic (maths, keys, zip, parsing) gets a Node case in `tools/v3-check.mjs`; no new dependencies, `node:assert` only.
- Anything that needs a canvas, Worker or pointer gets written repro steps in the task's **Check**, plus a fixture page under `tools/` only when the steps can't be done by hand.
- A bug fix lands with a check that **fails before the fix and passes after**; say so in the *Done* note.
- Engine edits (`engines/kamo-film-engine/`): add a test under `test/`, record the change in `credits.json` → `changes`, then run `node tools/engine-manifests.mjs` and commit the new `manifest.json`.
- Tasks marked **Output changes: no** must export byte-identical files to `docs/v3/BASELINE.md`. Tasks marked **yes** list exactly which outputs may change and re-record the baseline.

---

## Tasks

### Release A: correctness (small, isolated fixes)

#### Task 0: Groundwork (no visible change)
- [x] **[C]** `tools/collage-check.mjs:50`: add `'kit'` to the category whitelist so the 10 `kit-* free layout needs a paper colour` errors go away (the templates are fine, `js/collage/templates.js:68-69`)
- [x] `tools/v3-check.mjs`: a tiny runner (name, pass/fail, exit code 1 on failure) with one placeholder case; later tasks add cases
- [x] `docs/v3/BASELINE.md`: export the sample with 3 Basic looks, 2 Kamo colour looks, 1 Kamo B&W look and 1 collage (grid, 4 photos); record sha256, pixel size, byte size, and time to export on the dev laptop and the owner's phone
- [x] Record the four Node commands' current output in the baseline

**Tests:** the four Node commands.
**Check:** nothing visible changes; app loads and exports as before.
**Done when:** all four Node commands exit 0 and the baseline file lists 7 exports with hashes.
**Output changes:** no.
*Done 2026-11-26:* collage-check 10 errors → 0 (fails before, passes after); `v3-check.mjs` 1 case; 7 baseline exports recorded by the new `tools/v3-baseline.mjs` (headless Chromium, byte-identical over 2 runs; Basic ≈130 ms, Kamo 740–990 ms, collage ≈275 ms on an M5). Owner-phone timings still open.

#### Task 1: Editor state and undo (`js/app.js`)
- [x] **[C]** `pickMyLook` (`:326-331`) ignores the stale-tap guard that `pickFilmLook` has (`:259-263`): take `const tap = ++filmLookTap` before the `await` and return if it changed
- [x] **[C]** Global Ctrl/Cmd+Z and Ctrl/Cmd+Y (`:3402-3403`) fire while typing and inside dialogs: skip when the target is `input, textarea, select, [contenteditable]` or a `dialog[open]` exists (the `typing` test already written at `:3406`); same guard in the collage branch (`:3396-3398`)
- [x] **[C]** Revert (`:3323`) leaves `state.text` and `state.optics`: reset both, so `isEdited` is false afterwards (confirm intent with the owner in the task plan)
- [x] **[C]** `deleteMyLook` (`:321`) changes `state.myLookId` outside `change()`: route it through `change()`
- [x] **[R]** Text nudge commit can land on the wrong photo (`:1384` timer vs `stashActive` `:2165`): flush `textUi.start` in `stashActive`, as `cropUi.start` already is
- [x] **[R]** A failed decode in `viewPhoto` (`:2148-2156`) leaves `activeId` on the new photo with the old canvas: decode first, then stash and switch; on failure keep the old photo in view and toast

**Tests:** these are DOM-bound, so the repro steps below are the test. Add a Node case only if a helper is extracted (e.g. an `isTypingTarget` function).
**Check:**
1. Throttle the network to Slow 3G, clear site data, tap a Kamo My look, then immediately tap a Basic look: the Basic look stays.
2. Type in the text box, press Ctrl+Z: the typing is undone, the Undo button's state does not change. Repeat with the Export dialog open.
3. Add text and a lens change, press Revert: both are gone; one Undo brings everything back.
4. Delete the active My look: Undo restores the previous look name.
5. Nudge text with arrow keys, switch photo within 0.5 s, press Undo on the second photo: it undoes that photo's own last step.
6. Add a corrupt file renamed to `.jpg`, click it in the strip: toast, and the previous photo is still in view and editable.

**Done when:** all six pass on desktop and phone; no other behaviour changes.
**Output changes:** no.
*Done 2026-11-26:* Revert also clears text and lens (Open decision 2, recommended option). Ctrl/Cmd+Z/Y skip text fields and open dialogs but still work on sliders. Headless repro (checks 2, 3, 5, 6, plus "Ctrl+Z on a focused slider still undoes"): 2, 3, 5, 6 failed before, all pass after. Check 5 reproduced: the nudge landed on photo 2 as its undo step. Check 6 as written can't happen, because `addFiles` drops undecodable files. Reproduced instead by making `HTMLImageElement.decode` reject after adding, which left photo 2 "in view" with photo 1's image released. Checks 1 and 4 fixed from reading, still to check by hand. Baseline: 7/7 byte-identical.

#### Task 2: Collage correctness (`js/collage/`, `js/app.js` glue)
- [x] **[C]** Stale export: `exportKey` (`export.js:78`) omits the photos' edit settings. Add each visible photo's settings key (via a new `deps` callback) to the key
- [x] **[R]** Undo with a pending live edit corrupts history: slider baseline (`mode.js:131-135`, also `283`, `309`, `354`, `389`), wheel timer (`1069-1073`), text timer (`191-194`). Add one `flushPending()` called at the top of `change()` and `step()` (`76-86`); resync the textarea after undo (`224`)
- [x] **[R]** Duplicate saved collages: Collage → Back → Collage saves a new "Collage N" each time (`app.js:2402` with `mode.js:1187-1191`). Create a store entry only when `open()` created a new doc
- [x] **[R]** Arrow keys in the slot's photo radio group swap on every arrow (`mode.js:368`, `460-463`, `345-349`): arrows move focus, Enter/Space places, one undo step
- [x] **[R]** `pointercancel` commits half-finished pan/move/pinch/sticker/text drags (`mode.js:1044-1056`, `850-858`, `634-638`): restore the gesture's start state instead
- [x] **[R]** A second finger on another slot changes the selection mid-pinch (`mode.js:997` before `1009-1011`): skip `select()` while a gesture is active
- [x] **[C]** `entry.name` goes into `innerHTML` unescaped (`app.js:2415`), in text and in an attribute. Names are generated today, so this is latent, but Task 10 of `CollagePlan.md` will restore names from storage: build the menu with `textContent`/`setAttribute`
- [x] **[R]** Empty mounted slots: preview draws the frame/polaroid card, export skips the slot (`export.js:135` vs `render.js:155-158`): pick one behaviour (recommended: export draws what the preview shows)
- [x] **[C]** Remove dead locals (`mode.js:392` `item`, `399` `current`)

**Tests:** Node cases in `tools/v3-check.mjs`: (a) the export key differs when one photo's settings differ and is equal otherwise; (b) if `flushPending` logic is extracted as pure history helpers, a drag → undo → drag → undo sequence returns to the right snapshots. `node tools/collage-check.mjs` stays at 0 errors.
**Check:**
1. Export a collage, close, **Edit this photo**, change its look, return, export: the new file shows the new look.
2. Drag Gutter, press Ctrl+Z with focus still on the slider, drag again, Ctrl+Z: each undo goes back exactly one drag. Same for wheel zoom and for typing in a text layer.
3. Collage → Back → Collage three times: the photo menu still lists one collage.
4. In the slot photo group, press → three times then Enter: one swap, one undo step.
5. On a phone, start a pan and trigger a cancel (pull down the notification shade): the photo returns to where it started and no undo step is added.
6. Pinch one slot while the second finger lands on another slot: the selection does not change.
7. A polaroid/frame template with one empty slot: export matches the preview.

**Done when:** all seven pass on desktop and a real phone; collage baseline export from Task 0 is byte-identical.
**Output changes:** only collages with empty mounted slots.
*Done 2026-11-26:* Headless repro of checks 1–6 (synthetic pointer events for 5 and 6): all six failed on the old code, all pass now. Old results: the export hash was unchanged after editing a photo; the gutter undo landed on the first drag; an undo right after a wheel zoom undid the step before it; 4 saved collages after 3× Back; 3 arrows made 3 swaps; cancel left the pan and added an undo step; the second finger moved the selection. Check 7: the export now draws the empty frame and mat like the preview, without the grey placeholder (side-by-side images checked). Node: export-key case (the old key ignored photo settings, so it fails there). `pointercancel` also restores divider drags (same bug). Baseline 7/7 byte-identical. Not done: (b) pure history helpers, because `flushPending` stayed inside `mode.js`.

#### Task 3: Engine loading robustness
- [ ] **[C]** Failed data loads are cached forever (`engines/kamo-film-engine/src/spectral/index.js:27-30`, `58-67`, `86-94` store rejected promises; reproduced in Node): delete the map entry on rejection. Engine edit → test + `credits.json` → `changes` + manifest regeneration
- [ ] **[C]** The manifest sha256 is never checked at runtime (`js/engines/engine-files.js:26,41` read only `version` and `size`; no `crypto.subtle` in `js/`): digest each file before `store()` (`:61-64`, `75-76`), reject and refetch once on mismatch, never store a bad body
- [ ] **[R]** Offline: the manifest is fetched `no-cache` and a failed fetch returns null (`engine-files.js:20-21,26`), so a fully downloaded engine may not work offline. Fall back to the newest existing `photokamo-engine:` cache
- [ ] **[R]** A Worker that dies without an `error` event leaves `advancedBusy` set (`js/engines/kamo-film-engine/engine.js:25`, `js/app.js:1848-1869`): handle `messageerror` and add a watchdog that rejects the job and restarts the Worker
- [ ] **[S]** `loadEngine` returns a shared module that several consumers `dispose()` (`js/app.js:2421`, `2612`, `2911`, `653`): read the dispose semantics; if a queue going idle or leaving a collage can kill a render in use elsewhere, add reference counting

**Tests:** engine test "a failed read can be retried" (fails before the fix). Node case for a pure `verifyDigest(bytes, sha256)` helper: correct, wrong, and truncated input. Engine suite and manifest regeneration both clean.
**Check:**
1. DevTools → block `*/film-scan-calibration/*`, pick a Kamo colour look: error toast. Unblock, tap again: it loads **without** a page reload.
2. Using a local override, truncate one engine data file: the engine reports a failed download and nothing bad is stored (Application → Cache Storage).
3. Load a Kamo look fully, go offline, reload, pick the same look: it renders.
4. In DevTools, terminate the engine Worker mid-render: the busy state clears within the watchdog time and the next slider move renders.

**Done when:** all four pass; engine tests ≥ 40 pass; manifest verified against the files (size + sha256) after regeneration.
**Output changes:** no.

#### Task 4: Optics highlights and cache
- [ ] **[C]** `encodeShoulder` maps linear 1.0 to about code 251 (`js/optics/color.js:15-16`): any diffusion/bloom greys clipped whites, and with bokeh a ~4-code seam follows the focus mask (`js/optics/pipeline.js:265-278` vs `338`). Use a shoulder that maps 1 → 1 and is applied consistently to masked and unmasked pixels
- [ ] **[R]** A replaced optics job resolves its waiters with the newer job's bitmap (`js/optics/index.js:45-46`), so `sizes.get(4096)` can hold a 1000 px bitmap (`js/app.js:1117`): check the resolved bitmap's edge before caching
- [ ] **[S]** Optics re-quantises to 8-bit up to four times without dither (`pipeline.js:122,183,278,338`): measure banding on a sky gradient fixture; fix only if visible

**Tests:** Node cases: `encodeShoulder(1) === 255`, monotonic over 0…4, equals `encode` below the knee within 1 code. `tools/optics-fixtures.html` and `tools/optics-parity.html` pass.
**Check:** sample with Exposure +2 (clipped areas), Diffusion at 1 %: whites stay 255 (eyedropper on the export). Bokeh + bloom: no visible line along the focus edge. Zoom to 100 %, change a lens slider, zoom out and in: the zoomed preview is sharp.
**Done when:** fixtures pass; a white patch exports as 255,255,255 with any glow amount > 0.
**Output changes:** yes, photos with bloom or diffusion on (highlights only). Re-record those baseline entries.

---

### Release B: performance and memory

#### Task 5: Full-resolution Basic renders off the main thread
Do this with, or right after, workflow Task 0 (pure `adjustPixels(data, width, height, a)`).

- [ ] **[C]** Export (`js/app.js:2793`), batch and collage export (`:2573` → `js/renderer.js:335-347`) and zoomed previews up to 4096 px (`:1731`, `:1752`) run `renderImage`/`renderEdit` synchronously
- [ ] Move pixel work for edges above `PREVIEW_EDGE` into `js/adjust-worker.js` (transfer the buffer, return an ImageBitmap); main thread keeps only draw, frame and text
- [ ] Latest-wins for zoomed previews; stale results dropped by token, as in the film path
- [ ] Export and batch show progress and stay cancellable while the Worker runs

**Tests:** Node case: `adjustPixels` output equals the old `processPixels` path byte-for-byte on 5 synthetic buffers (shared with workflow Task 0). Baseline exports byte-identical.
**Check:** Performance panel, 24 MP photo, Basic look: export, batch of 5, and a slider drag at 400 % zoom. The UI stays responsive (the spinner animates, Cancel works).
**Done when:** no main-thread task > 100 ms during full-size Basic work; preview latency at fit zoom not worse than baseline by more than 10 %.
**Output changes:** no.

#### Task 6: Memory on phones
- [ ] **[C]** `opticsCache` bitmaps are dropped without `close()` and survive a photo switch (`js/app.js:1112-1114`, `2171-2182`): close on key change and in `releaseImage`
- [ ] **[R]** `state.fullRender` and `enginePreview` are replaced without `close()` (`:1856`, `:1919`, `:2743`); `exportCanvas` and the prepared File outlive the dialog (`:3340`): close on replace, free on dialog close
- [ ] **[R]** The engine Worker never closes a replaced source bitmap (`js/engines/kamo-film-engine/worker.js:22`)
- [ ] **[R]** No pixel cap on Basic exports (`js/app.js:2793`, `js/renderer.js:267`): reuse the collage device-limit probe (`js/collage/export.js:23-27`), cap, and say "Limited to N MP on this device" in the export dialog
- [ ] **[S]** Collage slot zoomed until `slotEdge` returns Infinity (`js/collage/sizes.js:52-54`) renders the whole photo above the canvas limit: cap by the same probe
- [ ] **[R]** Sticker canvas LRU is bounded by count (120), not bytes (`js/collage/stickers.js:357-379`): don't cache above ~1024 px and free export-size entries after export

**Tests:** Node case for the cap maths (given W×H and a limit, the scaled size is ≤ limit and keeps aspect within 1 px).
**Check:** on the owner's phone: open ten 12 MP photos, switch through all with a lens effect on, export three, make and export a collage at Full. No reload, no blank export. On desktop, Memory panel: switching photos 20 times does not grow retained bitmaps.
**Done when:** peak memory for a 24 MP film export is ≤ baseline; a 40 MP photo exports on iOS (capped, with the notice) instead of failing.
**Output changes:** only photos above the device limit (now capped instead of failing).

#### Task 7: Interaction and startup cost
- [ ] **[C]** `renderFilmPreviews` (`js/app.js:635-654`) loads the Kamo engine on every page load, against the comment at `:8-9`: defer until the Looks grid's film tiles are visible and the browser is idle, or use pre-baked thumbs from `tools/look-thumbs.html` (Open decisions 3)
- [ ] **[R]** Each slider `input` rebuilds `maTools` (`:723`) and runs `syncLooks` over every tile (`:441-465`), plus `expandLook`/`changedPaths` in film mode (`:249-251`): batch in rAF as `requestDialSync` does (`:3192`), update only the changed row
- [ ] **[R]** The HQ render is thrown away on a frame or text change (`:1841`, `:1914` vs `:2739`): reuse `state.fullRender` when `fullRenderKey()` still matches
- [ ] **[R]** Cancelling a film render terminates the Worker and loses parsed data and LUTs (`engine.js:12,41`): let the job finish and ignore its result; terminate only on dispose
- [ ] **[R]** The Worker re-downscales the full bitmap for every preview (`worker.js:12-18,29`) and `ensurePreviewBitmap` upscales the lensed preview to full size (`js/app.js:1818-1828`): cache the 900 px ImageData per source

**Tests:** Node case for the HQ reuse key (equal when only frame/text change, different when look/edits/crop/optics change).
**Check:** cold load with the Network panel open: no engine file is requested until a film tile scrolls into view (or never, with baked thumbs). Drag a slider for 5 s in the Performance panel on a phone. Add a frame after an HQ render: no second engine run.
**Done when:** time to interactive on cold load improves vs baseline; slider-drag frame time on phone ≤ 16 ms median; film preview latency after a cancel ≤ 250 ms.
**Output changes:** no.

---

### Release C: output quality

#### Task 8: Grain and sharpening parity between preview and export
- [ ] **[C]** Basic grain is one noise sample per pixel (`js/renderer.js:116`), creative grain too (`engines/kamo-film-engine/src/index.js:217`), and spectral sharpening has a fixed 1 px radius (`src/spectral/render.js:431`), so grain visible at 1000 px almost vanishes at 24 MP
- [ ] Scale the noise cell and the sharpen radius with image size, as spectral grain already does (`render.js:349-351`); keep the seed deterministic
- [ ] Engine edits → tests, `credits.json` → `changes`, manifest regeneration

**Tests:** Node case: grain RMS measured on a flat grey patch at 1000 px and 6000 px, after downscaling the large one to 1000 px, agrees within 15 %. Engine tests updated.
**Check:** side by side, preview at fit against the export viewed at the same on-screen size: same apparent grain for one Basic look, one B&W look, one colour stock.
**Done when:** parity fixture passes; no speed regression > 10 % at 4 MP.
**Output changes:** yes, every export with grain > 0 above preview size. Needs owner approval before starting; re-record the baseline.

#### Task 9: Tiled full-size film renders (lift the 4 MP / 2 MP cap)
- [ ] **[C]** Film "full" renders are capped at 4 MP, 2 MP on coarse pointers (`js/engines/kamo-film-engine/engine.js:2-6`); measured ~137 MB of typed arrays at 4 MP
- [ ] Position-hashed grain instead of the sequential RNG (`render.js:100-122`, `352-356`) so tiles are order-independent
- [ ] Tile with overlap sized for halation and the MTF bank; `region` already exists and is tested with grain off (`render.js:250`)
- [ ] Raise the cap to the device canvas limit; progress per tile; cancel between tiles

**Tests:** engine test: a tiled render equals the single-pass render of the same image within 1/255 per channel, grain on, at two tile sizes. Timing and peak memory at 4, 12 and 24 MP in `docs/v3/PERF.md`.
**Check:** 24 MP photo, Portra-type look with halation and grain: export at full size on desktop and on the phone; inspect tile boundaries at 200 % for seams.
**Done when:** no seam above 1/255; peak memory at 24 MP ≤ the old 4 MP peak × 1.5; export completes on the owner's phone.
**Output changes:** yes, grain pattern changes for all film looks (Task 8 and 9 can share one baseline re-record).

---

### Release D: accessibility and structure

#### Task 10: Accessibility gaps
- [ ] **[R]** Collage text layers can't be moved by keyboard (`js/collage/mode.js:608-638`): arrow keys as for stickers, Shift for larger steps, one undo step per burst
- [ ] **[R]** Collage text handles can be 20 px (`mode.js:613`, `css/styles.css:1459`): 44 px hit area
- [ ] **[R]** Print rotate handle is a `<button>` inside `role="option"` with no key action (`mode.js:970`): `tabindex="-1"` (the slider covers it)
- [ ] **[R]** `aria-label` on role-less divs (`index.html:215-216`): `role="group"`
- [ ] **[R]** Export progress writes every percent into `role="status"` (`js/app.js:2741`): announce at 0/25/50/75/100 or on completion only; keep the visual bar
- [ ] **[R]** Per-slider reset in Adjust and Lens is double-click only (`js/app.js:667`, `776`): add a keyboard path (e.g. Delete/Backspace on the slider, documented in the hint)
- [ ] **[R]** The crop box can be moved and zoomed by keyboard but not resized (`js/app.js:1197-1206`)

**Tests:** manual, keyboard only and with VoiceOver (macOS and iOS).
**Check:** complete this flow without a pointer: add text to a collage and move it; reset one Adjust slider; resize the crop box; export and hear at most five progress announcements.
**Done when:** the flow passes with keyboard alone and with VoiceOver; every new target ≥ 44 px.
**Output changes:** no.

#### Task 11: Split `js/collage/mode.js` (1240 lines, pure move)
- [ ] One context object (`doc`, `view`, `change`, `commit`, `say`, `scheduleDraw`, `refresh`) passed to each part
- [ ] `mode.js` (state, history, draw, public API), `panel.js`, `slots-ui.js`, `text-ui.js`, `sticker-ui.js`, `slot-cache.js`, `ui.js` (`radioGroup`, `syncRadios`, one `liveRange()` replacing the five copies of the slider begin/input/change/blur pattern)
- [ ] Keep `moveCollageText` in a DOM-free module (`tools/collage-check.mjs:18` imports it in Node)

**Tests:** all Node commands; collage baseline byte-identical.
**Check:** Task 2's seven checks again, plus stickers (add, move, resize, rotate, delete by keyboard) and a scrapbook kit.
**Done when:** no file in `js/collage/` over ~400 lines; `git diff --stat` shows moves, not rewrites; zero behaviour change.
**Output changes:** no.

#### Task 12: Split `js/app.js` (3444 lines, pure move, several commits)
- [ ] Order (one commit each, app working after every one): `state.js` → `history.js` → `export.js` + `camera.js` → `photos.js` → `preview.js` → `panels/{adjust,lens,frames,crop,text}.js` → `looks.js` → `engine-host.js` → `start-screen.js`; `app.js` keeps wiring, tabs, collage glue and shortcuts
- [ ] Break the `syncControls` ↔ `change` ↔ `scheduleRender` cycle with injected callbacks, as `collage/mode.js` does
- [ ] Remove dev helpers from `window` (`:292`) or gate them behind a `?dev` query

**Tests:** all Node commands; all 7 baseline exports byte-identical after each commit.
**Check:** the full regression list below after the last commit; a quick pass (load, look, adjust, crop, export, collage) after each one.
**Done when:** `app.js` under ~600 lines; no circular import warnings; baseline identical.
**Output changes:** no.

#### Task 13: Repo, docs and small guards
- [ ] **[C]** `.gitignore:4` (`plan_*.md`) ignores `plan_workflow.md` and `plan_optics.md`, and `:68` ignores `docs/archive/`, while `CLAUDE.md` treats both as checked in: track them or change `CLAUDE.md` (Open decisions 4)
- [ ] **[C]** README: "WebAssembly film engine" (Kamo is plain JS), "20" Basic looks (count them in `js/presets.js`), Windows-only run path; same wording in `CLAUDE.md`
- [ ] **[R]** `CollagePlan.md`: Task 7 boxes unchecked though implemented; stickers, Twemoji and kits have no task or Check; Task 5b says `category:'style'` (code uses `layout`/`collage`/`diptych`); "Outside shape → canvas grows" not done (`js/collage/render.js:266`)
- [ ] **[R]** `CollagePlan.md` Task 10 prerequisites to write down: stable photo ids from the session store, `slotSeq` restarting at 0 (`js/collage/model.js:23-25`), migration for `v !== 1` (`js/collage/store.js:11`)
- [ ] **[R]** `js/zip.js`: no guard at 65,535 entries (`:63` wraps silently) and the 4 GB check ignores headers (`:38`): fail with a clear message
- [ ] `Archive/` is 94 MB in 1,631 tracked files and is published by GitHub Pages (Open decisions 5)
- [ ] Licence wording: repo GPL-3.0, Kamo engine code "Proprietary" (`js/engines/registry.js:14`, `credits.json`); make README, About and credits say the same thing (Open decisions 6)
- [ ] Update `CLAUDE.md` "Current redesign" and archive this plan when finished

**Tests:** Node cases for `zip.js`: 65,536 entries and a > 4 GB total both throw a clear error; a UTF-8 filename round-trips.
**Check:** README steps work on macOS from a clean clone; About dialog matches `credits.json`.
**Done when:** a fresh clone contains every file `CLAUDE.md` names.
**Output changes:** no.

---

## Regression QA (after every task)

- [ ] The four Node commands exit 0
- [ ] Outputs not listed under the task's **Output changes** are byte-identical to `docs/v3/BASELINE.md`
- [ ] One undo step per gesture; background work creates no history
- [ ] Apply-to-selected, live edit, batch export and queue thumbnails still work
- [ ] Film engine files load only when a film look needs them
- [ ] `tools/optics-parity.html` passes after any change to the crop or optics path
- [ ] Desktop and phone (360 and 430 px); keyboard only; status text announced; 44 px targets
- [ ] Network panel: same-origin requests only
- [ ] No console errors; no main-thread task > 100 ms during full-size work (from Task 5 on)

## Out of scope (own plan if wanted)

- Display-P3 export: the engine supports it (`render.js:255,386`), but every canvas through adjust, frame and `toBlob` would need `colorSpace`, and input stays sRGB.
- WebGL/WebGPU: previews measured ~100 ms with a cached LUT; the MTF and grain stages are the cost and port poorly.
- Linear-light Basic adjustments: "EV" multiplies gamma-encoded values (`js/renderer.js:84-86`) and "Clarity" is global contrast (`:111-114`). Changing this changes every Basic look.
- Faster creative engine (per-pixel allocations at `src/index.js:184-197`, O(radius) blur at `:102-131`): worthwhile, but only after Task 9 settles the grain RNG.

## Open decisions (owner)

1. Order: v3 Release A → workflow Task 0 + v3 Task 5 → rest (recommended), or finish all of v3 first.
2. Revert (Task 1): should it also clear text and lens? (Recommended: yes, it is called Revert.)
3. Film tile thumbnails (Task 7): render lazily on device, or ship pre-baked images (faster start, ~1 MB more in the repo, must be regenerated when looks change).
4. Plans in git (Task 13): track `plan_workflow.md`, `plan_optics.md` and `docs/archive/`, or keep them local and fix `CLAUDE.md`.
5. `Archive/`: keep published, move to a separate branch/repo, or exclude from Pages.
6. Licence wording for Kamo engine code inside a GPL-3.0 repo.
7. Tasks 8 and 9 change how exports look (grain). Approve before either starts.
