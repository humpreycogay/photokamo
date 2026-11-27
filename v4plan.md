# Plan v4: growth (features that bring people in and bring them back)

**Status:** proposed 2026-11-27 from commit `cbc6e45`; checked again against commit `50af609` the same day. None of the tasks below is started. Items the workflow release has since delivered were removed, and gaps found in that check were added (Task 0, Tasks 17–19, and new bullets marked *(added)*).
**Workflow:** same as `v3plan.md` and `plan_workflow.md`: tasks **one at a time**, short plan before editing, stop after each task's **Check** and report what to verify. Mark `- [x]` and add a one-line *Done* note.
**Relation to the other plans:** `v3plan.md` fixed what exists (Tasks 0–13 done). `plan_workflow.md` added the editing workflow: its Tasks 0–10 are done (look search, histogram, Auto white balance, Auto, session recovery, export sizes, max file size, metadata report, Heal); only its Task 11 (release QA and docs) and the owner's Auto review are open. This plan covers what neither does: **being found, being installed, being shared, and being fun**.

## Goal

1. A stranger who sees a PhotoKamo link understands it and wants to tap it.
2. A first visit reaches a good-looking result in under a minute, on a phone, with the photo they already have.
3. Every export and every saved look is a reason for someone else to visit.
4. People come back: the app is on their home screen, works offline and remembers their work.
5. All of it inside the existing rules: nothing leaves the device, no analytics, no CDNs, no new runtime dependencies, plain ES modules.

## Advice in short

- **PhotoKamo's edge is already built**: a calibrated spectral film engine, real lens optics, contact sheets and scrapbook collages, all local. Very few free web editors have any of these. The app's problem is not missing editing depth; it is that nobody can discover, install or pass it on. Spend the next effort there before adding more sliders.
- **Lead with one sentence** everywhere (title, link preview, README, start screen): *"Real film looks for your photos. Free, in your browser, nothing uploaded."* The current title "Camera & film looks" and lede "A little darkroom magic" do not say free, private or no-signup, which are the three things that make people try a web tool.
- **Privacy is a feature only if people can check it.** "Works in airplane mode" and a Content-Security-Policy that makes uploads technically impossible are proof; a sentence in About is a claim.
- **Growth without analytics has to be built into the product**: shareable look links, before/after images, distinctive frames. These replace the funnel tracking the rules forbid.
- **Do not add**: accounts, cloud sync, forced watermarks, generative AI, or an ML background remover (a model download of tens of MB plus a runtime dependency breaks two rules and the "light and private" story).
- **Finish the release that is already live.** The workflow release is merged and deployed (PR #2, `0f509ca`), but its by-hand browser checks, the owner's Auto review and the README are still open. Task 0 closes them before the site is promoted.

## What exists today (checked in code at `50af609`, 2026-11-27)

| Area | Fact | Where |
|---|---|---|
| Live site | Deploys from `main` on every push; the workflow release is live (PR #2, `0f509ca`, deployed 2026-11-27). Its Safari, Firefox and phone checks were not done before publishing | `.github/workflows/pages.yml` |
| Published files | The deploy copies everything except `Archive/`: plans (`v3plan.md`, `v4plan.md`, `CollagePlan.md`, `v2Plan.Md`), `CLAUDE.md`, `tools/` and `ideas/` are served on the live site | `pages.yml` (`rsync`) |
| Link previews | No `og:` / `twitter:` tags, no canonical URL, no `apple-touch-icon`; favicon is SVG only. `theme-color` is the dark value until `js/theme.js` runs | `index.html` head |
| Install / offline | No web manifest, no service worker | repo root |
| Privacy enforcement | No Content-Security-Policy | `index.html` head |
| Opening photos | File picker, drag-and-drop, camera, sample. **No paste** (no `paste` listener, no Clipboard API use) | `js/photos.js`, `js/app.js` |
| Formats in | Three file inputs with `accept="image/jpeg,image/png,image/webp,image/gif"`; `addFiles` takes any `image/*` that decodes. AVIF and HEIC are not offered in the picker | `index.html:99`, `:601`, `js/photos.js:74` |
| Formats out | JPEG, PNG, WebP; Full, For sharing or Custom size; max file size; metadata check; Web Share on phones; ZIP batch. **No copy to clipboard, no print sizes for single photos** (collages have them) | `js/export.js`, `js/export/` |
| Persistence | Photos, edits and collages are kept in IndexedDB and offered back on the start screen. Preferences, favourites and My looks stay in `localStorage` | `js/session/`, `js/looks.js` |
| Sharing looks | My looks live in one browser's `localStorage`; no export, import or link | `js/looks.js:46-53` |
| Metadata | The Exif walker reports **presence only** (location, camera, date); it does not read values | `js/export/metadata.js` |
| Camera | Capture dialog only: no look in the viewfinder, no timer, no multi-shot | `js/camera.js` (97 lines) |
| Frames | 15 frames; no date stamp, no camera-info caption | `js/presets.js:64` |
| Collage | Scrapbook kits with tape, stickers (a pushpin sticker exists); no pinboard kit | `js/collage/templates.js`, `stickers.js:232` |
| Language | English only (`lang="en"`, strings inline in HTML and JS) | `index.html` |
| README | No screenshot, no GIF, no link to the live site. Also out of date: says "Dark" UI (a light theme exists), does not list search, histogram, Auto, Heal, recovery or export sizes, and still calls recovery "planned" | `README.md` |
| Release string | Two manual ones that already disagree: `rel. 11222026` in About and `?v=2026-11-27a` on `styles.css` | `index.html:14`, `:980` |
| Help | No first-run hints (only the one-time recovery notice), no shortcut list. Shortcuts exist for undo/redo, `\` compare, `+ − 0` zoom, crop, Heal brush and collage slots, each described only next to its own control | `js/app.js:236-249`, `index.html:197`, `:242`, `:499` |

Page weight is healthy for offline caching: about 1.2 MB of app code and CSS, 1.9 MB images, 1.6 MB stickers, 2.2 MB engine (loaded on demand).

---

## Tasks

Effort: **S** = under a day, **M** = a few days, **L** = a week or more. Each task says why it attracts users, so it can be cut if the reason stops being true.

### Before Release A

#### Task 0: Finish the workflow release (S–M) *(added)*
*Why:* the release is live but only checked in Chromium; later tasks promote the site, so it should be verified and tidy first.
- [ ] `plan_workflow.md` Task 11: the by-hand checks its Done notes still list (Safari, Firefox, iOS Safari, Android Chrome, private windows, phone export with 200 heal strokes), `docs/v2/PERF.md`, About text
- [ ] Owner's Auto review in `docs/v2/AUTO-REVIEW.md` (the table is empty); the sample photo getting Temperature −30 from Auto white balance is reviewed there
- [ ] README features list brought up to date (see the README row above); screenshots wait for Task 2
- [ ] `pages.yml`: publish only what the app serves (`index.html`, `css/`, `js/`, `engines/`, `fonts/`, `images/`, `sounds/`, `vendor/`, `LICENSE`, and the `docs/*/REFERENCES.md` files that About links to); plans, `CLAUDE.md`, `tools/` and `ideas/` stay in git, unpublished
- [ ] `CLAUDE.md` "Current redesign" points at this plan; `plan_workflow.md` archived to `docs/archive/`
**Check:** on the live site in Safari, Firefox and on a phone: Continue after a reload, Auto, Heal and Custom export size all work; `/<site>/v4plan.md` and `/<site>/CLAUDE.md` return 404; About's reference links still open.

### Release A: be found and make a good first impression (all S, no risk to the editor)

#### Task 1: Link previews and search basics (S)
*Why:* every link posted in a chat, on Reddit or on X currently shows a bare URL. This is the cheapest reach there is.
- [ ] `<title>` and meta description rewritten around the one-sentence pitch (free, film looks, browser, nothing uploaded)
- [ ] Open Graph and Twitter card tags with a 1200×630 preview image made in PhotoKamo itself (before/after of the sample with a film look and a frame); absolute URLs
- [ ] `<link rel="canonical">`, `apple-touch-icon` (180 px PNG), PNG favicon fallback
- [ ] `robots.txt` and a one-URL `sitemap.xml`; add both to the `pages.yml` publish list from Task 0
- [ ] Start screen lede says free, no account, nothing uploaded
- [ ] *(added)* Two `theme-color` tags with `media="(prefers-color-scheme: …)"` so the browser bar matches the theme at first paint; `js/theme.js` keeps overriding for a saved choice
**Check:** paste the live URL into a link-preview checker and a chat app; the card shows image, title and description. Lighthouse SEO has no failures.

#### Task 2: README and repository as a landing page (S)
*Why:* GitHub is where the first technical visitors arrive, and the README has no picture and no link to the app.
- [ ] Live-site link and one hero screenshot at the top; a short GIF or three stills (film look, contact sheet, lens bokeh)
- [ ] Repository description, website field and topics (`photo-editor`, `film-simulation`, `privacy`, `pwa`, `no-build`) set on GitHub
- [ ] "Why PhotoKamo" paragraph: spectral film engine, optics, collages, local-only, said plainly with the licence split stated up front (app GPL-3.0, Kamo engine proprietary) so nobody feels misled
**Check:** the README makes sense to someone who has never opened the app.

#### Task 3: Paste in, copy out (S)
*Why:* desktop users live on screenshots and copied images. Paste is the fastest possible "open", and Copy removes the download-then-attach step.
- [ ] `paste` on the document: image items go through `addFiles` (same limits and toasts, and a saved session is restored first as for any open); ignored while a text field or dialog has focus; in collage mode it gives the same toast as a drop
- [ ] Start screen mentions "or paste (Ctrl/Cmd+V)" on desktop
- [ ] **Copy image** button in the Save sheet (`navigator.clipboard.write` with a PNG `ClipboardItem`), hidden where unsupported; rendered at the chosen size from the same render as Download so output matches; max file size does not apply (PNG), and the sheet says so
- [ ] *(added)* The same Copy button in the collage Save sheet (`js/collage/export.js`)
- [ ] `aria-live` confirmation ("Copied")
**Check:** paste a screenshot on the start screen and inside the editor; copy an edited photo and a collage into another app; typing Ctrl+V in the Text panel and the look search field still pastes text.

#### Task 4: Open more of what people actually have (S)
*Why:* "it didn't open my photo" ends a first visit.
- [ ] Add `image/avif` to the three file inputs (`fileInput`, `collageFileInput`; `cameraInput` is already `image/*`); all current browsers decode it
- [ ] *(added)* `js/export/metadata.js` recognises AVIF/HEIC containers well enough to say "not checked" instead of reporting nothing found; recovery stores and restores such a source like any other
- [ ] HEIC/HEIF: add to `accept` only where a decode probe succeeds (Safari); elsewhere keep the picker's automatic conversion on iOS and show a specific message for a dropped `.heic` ("This browser can't read HEIC. On iPhone choose Most Compatible, or open PhotoKamo in Safari.") instead of the generic type toast
- [ ] No decoder library is added (rule: no new runtime dependencies)
- [ ] Format list on the start screen and in toasts updated
**Check:** AVIF opens in Chrome, Firefox, Safari. A HEIC file opens in Safari and gets the specific message in Chrome.

#### Task 5: Provable privacy (S)
*Why:* privacy is the headline, and a sceptical user or reviewer can verify this in ten seconds.
- [ ] `<meta http-equiv="Content-Security-Policy">`: `default-src 'self'`, `connect-src 'self'`, `img-src 'self' blob: data:`, `worker-src 'self' blob:`, `style-src`/`script-src` as tight as the inline theme script and styles allow (hash the inline script rather than `'unsafe-inline'`)
- [ ] All Workers (engine, adjust, analysis, optics), fonts, stickers, camera, session recovery, Web Share and downloads still work under the policy
- [ ] About dialog: one line, "Your browser is instructed to block any upload from this page", next to the existing privacy text
- [ ] Save sheet: the existing metadata line (`#exportPrivacy`, "Location and camera data removed…") gains "Nothing was uploaded."; no second line
**Check:** DevTools console shows no CSP violations across the regression list; a test `fetch('https://example.com')` from the console is blocked.

### Release B: install it and come back

#### Task 6: Installable, offline PWA (M)
*Why:* a home-screen icon is the difference between a tool tried once and a tool used weekly, and "works in airplane mode" is the strongest privacy demonstration available.
- [ ] `manifest.webmanifest`: name, short name, `start_url: "./"` and `scope: "./"` (the site lives under `/photokamo/`), `display: standalone`, theme colours for both themes, 192/512 and maskable icons
- [ ] `sw.js`: precache the app shell (HTML, CSS, JS modules, fonts, logo, sample); cache engine runtime files and stickers **on first use**, not up front; same-origin requests only
- [ ] Versioned cache tied to one release string that replaces both the manual `?v=` on `styles.css` and `rel. …` in About; old caches deleted on activate
- [ ] Update flow: new version waits, a toast offers "Update ready · Reload"; never reloads mid-edit; the reload comes back through session recovery, so the edit in progress is saved first
- [ ] The existing "Remove engine files" control in About also clears the service-worker caches; it never touches the saved session (IndexedDB `photokamo`), which keeps its own "Stop keeping and clear…" control
- [ ] *(added)* About shows one storage summary (app files, engine files, saved photos) from `navigator.storage.estimate()`, since all three now share the origin's quota
- [ ] *(added)* An installed app with a saved session opens on "Continue where you left off", not the marketing start screen
- [ ] iOS: `apple-mobile-web-app-*` tags; a short "Add to Home Screen" hint on iOS Safari where there is no install prompt
- [ ] `CLAUDE.md` rule wording updated: the service worker fetches app files from the same origin
**Check:** install on Android Chrome, desktop Chrome/Edge and iOS; turn on airplane mode, open the app, edit the sample with a Basic look and a previously used film look, export. Deploy a change and confirm the update toast.

#### Task 7: Open photos from other apps (S–M, needs Task 6)
*Why:* "Share → PhotoKamo" from the phone gallery makes it feel like a native editor.
- [ ] `share_target` in the manifest (POST, `multipart/form-data`, images); the service worker hands the files to the page, which calls `addFiles` (Android Chrome)
- [ ] `file_handlers` + `launchQueue` for "Open with PhotoKamo" on desktop Chromium
- [ ] Both degrade silently elsewhere
- [ ] *(added)* Shared or opened files are added to a saved session (restored first, as `addFiles` already does), never replacing it; over the 50-photo limit gives the usual toast
**Check:** share two photos from Android's gallery into the installed app, once with an empty app and once with a saved session; right-click → Open with on desktop.

### Release C: every result brings someone new

#### Task 8: Look links and look files (M)
*Why:* this is the growth loop. "Here's the look I used" becomes a link that opens PhotoKamo with that look ready for the recipient's own photo. No server is involved: the recipe sits in the URL fragment, which browsers never send to a host.
- [ ] Pure `js/look-link.js`: encode look id, strength, Adjust deltas, lens and frame (never the photo, crop, text or Heal strokes, the same exclusions as My looks) into a compact, versioned fragment; decode with strict validation and clamping through the existing specs
- [ ] *(added)* Auto results travel as their plain Adjust values; the link carries no "Auto" marker, because Auto is fitted to one photo
- [ ] "Share this look" in the look header and for My looks: Web Share where available, otherwise copy link
- [ ] Opening a link: start screen shows "Look ready: *Name* · choose a photo", then applies it as one undo step; offers "Save to My looks"
- [ ] Export / import My looks as a small `.json` file (backup and moving between browsers)
- [ ] Owner decision first: whether Kamo engine parameters may travel in links (see Open decisions 2)
**Check:** round-trip in Node for every Basic look and five film looks; a malformed or oversized fragment is ignored with a toast, never an error; link opened on a second device gives the same preview.

#### Task 9: Before/after export (S–M)
*Why:* before/after is the format people post when they are pleased with an edit, and it shows the product at work.
- [ ] Save sheet option "Before / after": side by side or split with a thin divider, composed from the existing original and rendered canvases; respects crop; frame applied to the whole
- [ ] Optional small labels ("Before", "After") in the app's fonts
- [ ] *(added)* "Before" is exactly what hold-to-compare shows (same crop and lens geometry, no look); one rule decides whether Heal fixes appear on the Before side, and the option's hint states it
- [ ] *(added)* Custom size and max file size apply to the composed image; the dimension readout shows the composed size
- [ ] Later, only if wanted: a short wipe animation via `MediaRecorder` on a canvas stream (format varies by browser, so stills come first)
**Check:** exported split matches the on-screen compare at the same position; works for film looks at full size without blocking the main thread.

#### Task 10: Date stamp and camera-info frames (M)
*Why:* the orange date stamp and the "shot on" caption border are two of the most shared film-style finishes, and both make an export recognisable.
- [ ] *(added)* Value reader: `js/export/metadata.js` only reports presence today. Add a pure, bounds-checked reader for capture date, make, model, lens, focal length, aperture, shutter and ISO (ASCII, SHORT and RATIONAL types), with the same caps and the same fuzz fixtures in `tools/workflow-fixtures.mjs`. It runs only when the user picks one of these frames; the photo menu's presence-only note is unchanged
- [ ] **Date stamp** option in Frames: corner, colour (orange, red, white), format; date from capture time when known, else today, always editable; drawn in `frameCanvas` so export matches preview
- [ ] **Info caption** frame: paper border with camera, lens, focal length, aperture, shutter and ISO from the value reader; every field editable or removable; clear note that the text is drawn into the image by choice while file metadata is still stripped
- [ ] *(added)* The chosen text is an ordinary edit, so session recovery keeps it; About's privacy text says the saved session may then hold those values
- [ ] Both go through `change()` and are part of "apply to selected"
**Check:** a photo with Exif shows correct values; a photo without Exif gets empty editable fields, not an error; export matches preview; baseline exports with neither feature stay byte-identical.

### Release D: reasons to play

#### Task 11: Roll mode, a browser film camera (L)
*Why:* the most distinctive thing PhotoKamo could offer and the easiest to talk about: pick a stock, shoot a roll of 12, 24 or 36 with the phone camera, "develop" it, get a contact sheet. It reuses the camera, the film looks and the contact sheets that already exist.
- [ ] Camera dialog gains a stock picker and a frame counter; shots go straight into the strip with that look applied
- [ ] Viewfinder shows an approximate look at low resolution (Basic maths on a small canvas; film looks show a labelled approximation, the real engine runs on the captured frame in its Worker)
- [ ] "Develop roll": one tap builds a film contact sheet from the roll (existing collage path) and opens the batch export
- [ ] Optional date stamp from Task 10; each shot is saved by session recovery as it is taken, so a roll survives a reload or a closed tab
- [ ] *(added)* A roll of 36 fits the 50-photo limit only when little else is open: the roll length offered is capped by the room left, and storage is checked before the roll starts (`navigator.storage.estimate()`)
- [ ] Original design and naming; not modelled on any specific app
**Check:** shoot 12 frames on a mid-range phone without memory warnings (`docs/v3/PERF.md` limits); viewfinder stays above 24 fps; develop → contact sheet → export works offline.

#### Task 12: Photo booth strip (M)
*Why:* instantly understood, works on laptops and phones, and the output is made for sharing.
- [ ] Camera option: countdown, four shots, short flash; announced through `aria-live`, with a reduced-motion variant
- [ ] Result opens as a vertical strip collage (new template) with the current look; normal collage editing and export from there
**Check:** keyboard-only run through; strip exports at Share and Print sizes.

#### Task 13: Pinboard scrapbook kit (S–M)
*Why:* the reference in `ideas/image.png`: pinned instant prints on a board, each with a date, a headline and a caption. Good for year-in-review and travel posts.
- [ ] Generated cork or felt board paper (code-drawn, like the existing paper fibres)
- [ ] Kit: instant prints with slight rotation, pushpin stickers, per-slot date + headline + caption text styles, optional banner headline
- [ ] Asset register in `docs/collage/REFERENCES.md` updated (all generated, nothing bundled)
**Check:** 5-photo board matches the reference's structure; text stays readable at Share size; export matches preview.

### Release E: depth that people search for

#### Task 14: Colour mixer (HSL) (M)
*Why:* per-colour hue, saturation and lightness is the most asked-for control in any colour-focused editor and the natural partner to film looks ("make the greens less yellow").
- [ ] Eight colour bands with smooth overlaps, in pure `adjustPixels` so it runs in the adjust Worker; neutral values are an exact no-op
- [ ] Section in Adjust; values are ordinary edits (undo, apply to selected, My looks, look links)
- [ ] *(added)* The histogram and clipping overlay follow the mixer like any other Adjust change; Auto leaves mixer values alone
**Check:** Node fixtures for band isolation and no banding on a hue ramp; untouched photos export byte-identical to `docs/v3/BASELINE.md`.

#### Task 17: Print sizes for single photos (S) *(added)*
*Why:* collages export at 300 dpi paper sizes; a single photo cannot, and "print my photo at 4×6" is a common search.
- [ ] **Print** choice beside Full / For sharing / Custom in the Save sheet: 4×6, 5×7, 8×10, A4 at 300 dpi, reusing the collage paper list (`js/collage/sizes.js`) and `js/export/size.js`
- [ ] When the photo's ratio differs from the paper, the sheet says so and offers "Crop to fit" (opens Crop at that ratio) or "Fit with border"; never crops silently
- [ ] Upscaling follows the existing "Allow upscaling" rule, with the effective dpi shown when the photo is too small
**Check:** each preset exports at the exact pixel size; a 3:2 photo at 5×7 shows both choices; baseline exports unchanged.

#### Task 18: Recently used looks (S) *(added)*
*Why:* with 98 looks, getting back to the one used yesterday is the most common search. It was left out of workflow Task 1 because a new chip row did not fit on phones.
- [ ] Last 12 looks in `localStorage`, shown as a "Recent" style chip in the existing chip row (no new row); hidden until two looks have been used
- [ ] Listing recent film looks fetches no engine file until a tile is on screen (the existing rule)
**Check:** 360 px layout has no extra row; the list survives a reload; clearing site data empties it without errors.

#### Task 19: Heal follows lens distortion (S–M) *(added)*
*Why:* known gap from workflow Task 9: with strong Lens distortion the brush lands slightly off the spot under the pointer.
- [ ] Invert the distortion mapping when converting pointer positions to source space (the forward model is in `js/optics/`); the stored strokes do not change format
**Check:** at maximum barrel and pincushion distortion, a heal stamp is centred within 2 px of the pointer at fit and 100 % zoom; strokes saved before the change render the same.

#### Already planned elsewhere, worth pulling forward for reach
- Curves and levels, perspective correction: "Later" in `plan_workflow.md` (A§11, A§12). Still not built.

### Ongoing: help people stay

#### Task 15: First-run guidance and shortcut sheet (S)
- [ ] Three dismissible hints on first edit (pick a look · hold to compare · Save), stored in `localStorage`, never shown again; they wait until the one-time recovery notice is gone, so a first visit never shows two notices at once
- [ ] `?` opens a keyboard shortcut list (a real dialog, also reachable from About), covering undo/redo, compare, zoom, look search (Enter, Escape), crop, the neutral picker, the Heal brush and collage slots
- [ ] "What's new" list in About, keyed to the release string, with a small dot on the About button after an update
**Check:** hints do not trap focus and are announced once; every listed shortcut works as written (`js/app.js`, `js/panels/crop.js`, `js/panels/heal.js`, `js/panels/auto.js`, `js/collage/slots-ui.js`).

#### Task 16: Languages (L, later)
*Why:* the largest single multiplier on audience, and the most work: strings are inline in `index.html` and across the modules.
- [ ] Small `t()` helper and per-language JSON files in the repo (same origin, cached by the service worker); `lang` attribute follows the choice
- [ ] Start with the owner's own languages; look and stock names stay untranslated
**Check:** no layout breaks at 360 px with the longest strings; screen reader reads the chosen language.

---

## Telling people (no code)

- A custom domain is optional; a short, memorable URL helps word of mouth.
- Post where the edge matters: film photography communities (the spectral engine and contact sheets), privacy and self-hosting lists (local-only, CSP, offline), "Show" threads for developers (no build step, no dependencies, Workers). State the Kamo licence up front in any open-source venue.
- List on alternative-finder directories under "online photo editor", "film emulation", "collage maker".
- Measuring without analytics: Search Console (verification file only, no script on the page), GitHub stars and Pages traffic in repository Insights, and a visible feedback link (GitHub Issues or an email address) in About. Do not add a tracker.
- Make one good example per feature (film look, bokeh, contact sheet, pinboard) and reuse them in the README, the link preview and posts.

## Regression QA (after every task)

- [ ] Photos that use no new feature export **byte-identical** to `docs/v3/BASELINE.md` (`tools/v3-baseline.mjs`)
- [ ] `node tools/workflow-fixtures.mjs` passes
- [ ] A reload restores photos, edits and collages, including anything the task added to an edit; a session saved before the task still opens
- [ ] Heal strokes are never copied by Apply, My looks or look links
- [ ] One undo step per gesture for anything user-visible
- [ ] Network panel: no request to any other origin; with Task 5, the CSP reports no violations
- [ ] Desktop and phone layouts (360 and 430 px, breakpoint 900 px); keyboard only; 44 px targets; 4.5:1 contrast; status text announced
- [ ] Film engine still loads only when a film look is chosen
- [ ] No console errors; no main-thread task over 100 ms during full-size work
- [ ] About dialog, README and licence credits still accurate

## Recommended order

1. Task 0 (finish the workflow release).
2. Release A, Tasks 1–5 (about a week in total, no editor risk).
3. Tasks 6–7 (PWA, share target).
4. Task 8 (look links) and Task 9 (before/after); Tasks 17–18 fit here as small wins.
5. Task 10 (date stamp, info caption).
6. One "play" feature, Task 11 or 12, chosen by the owner; Task 13 alongside.
7. Release E (Tasks 14, 19) and languages as demand shows.

## Not recommended

| Idea | Why not |
|---|---|
| Accounts, cloud sync, galleries of user photos | Ends the privacy story and needs a backend |
| "Made with PhotoKamo" watermark by default | Drives away the audience the app is for; distinctive frames and look links do the job by choice |
| ML background removal, AI upscaling, generative fill | Large model downloads and a runtime dependency; against the rules and the lightweight promise |
| RAW decoding | Already "revisit on demand" in the workflow plan; needs a decoder dependency |
| More film presets | 98 looks exist and search now finds them; recently used (Task 18) helps more than adding to them |
| Display-P3 export | Already out of scope in `v3plan.md` |

## Open decisions (owner)

1. Whether the tracked plans are published on the live site. (Recommended: no; Task 0 keeps them in git and out of the deploy.)
2. Look links (Task 8): may Kamo engine parameters be included, or only the look id plus Adjust, lens and frame? (Recommended: look id and strength only for film looks, since the engine is proprietary.)
3. `.cube` LUT import or export: import is safe; exporting a Kamo look as a LUT publishes the engine's colour response. (Recommended: neither for now.)
4. Play feature first: Roll mode (bigger, more distinctive) or Photo booth (smaller, quicker).
5. Feedback channel shown in About: GitHub Issues, email, or none.
6. Custom domain: yes or stay on `github.io`.
7. Licence for new modules (same pending question as `plan_workflow.md` Open decision 3).
