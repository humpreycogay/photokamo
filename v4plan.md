# Plan v4: growth (features that bring people in and bring them back)

**Status:** proposed 2026-11-27, from a review of commit `cbc6e45`. Nothing here is started.
**Workflow:** same as `v3plan.md` and `plan_workflow.md`: tasks **one at a time**, short plan before editing, stop after each task's **Check** and report what to verify. Mark `- [x]` and add a one-line *Done* note.
**Relation to the other plans:** `v3plan.md` fixed what exists (Tasks 0–13 done). `plan_workflow.md` adds editing workflow (search, histogram, Auto, recovery, export, healing; only Task 0 is done). This plan covers what neither does: **being found, being installed, being shared, and being fun**. Where an idea already has a home in another plan, it is linked here and not repeated.

> File name: this was requested as `v3plan.md`, but that file is the tracked stabilisation plan that `CLAUDE.md`, `pages.yml` and `tools/v3-*.mjs` refer to, so it was not overwritten. Rename freely.

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
- **Finish workflow Task 5 (session recovery) early.** Losing work on a reload is the most likely reason a first-time user does not return, and Release B below builds on it.

## What exists today (checked in code, 2026-11-27)

| Area | Fact | Where |
|---|---|---|
| Link previews | No `og:` / `twitter:` tags, no canonical URL, no `apple-touch-icon`; favicon is SVG only | `index.html` head |
| Install / offline | No web manifest, no service worker | repo root (workflow plan lists PWA as "Later") |
| Privacy enforcement | No Content-Security-Policy | `index.html` head |
| Opening photos | File picker, drag-and-drop, camera, sample. **No paste** (no `paste` listener, no Clipboard API use) | `js/photos.js`, `js/app.js` |
| Formats in | `accept="image/jpeg,image/png,image/webp,image/gif"`; `addFiles` takes any `image/*` that decodes. AVIF and HEIC are not offered in the picker | `index.html:94`, `js/photos.js:70` |
| Formats out | JPEG, PNG, WebP; Full or 1080 px; Web Share on phones; ZIP batch. **No copy to clipboard** | `js/export.js` |
| Persistence | Only preferences, favourites, My looks, recent stickers in `localStorage`. Photos and edits are lost on reload | `js/looks.js`, workflow Task 5 |
| Sharing looks | My looks live in one browser's `localStorage`; no export, import or link | `js/looks.js:47-52` |
| Camera | Capture dialog only: no look in the viewfinder, no timer, no multi-shot | `js/camera.js` (97 lines) |
| Frames | 15 frames; no date stamp, no camera-info caption | `js/presets.js:53-68` |
| Collage | Scrapbook kits with tape, stickers (a pushpin sticker exists); no pinboard kit | `js/collage/templates.js`, `stickers.js` |
| Language | English only (`lang="en"`, strings inline in HTML and JS) | `index.html` |
| README | No screenshot, no GIF, no link to the live site | `README.md` |
| Help | No first-run hints, no shortcut list (`\` compare, `+ − 0` zoom, Ctrl+Z exist but are only in tooltips) | `js/app.js:202-216` |

Page weight is healthy for offline caching: about 1 MB of app code and CSS, 1.9 MB images, 1.6 MB stickers, 2.2 MB engine (loaded on demand).

---

## Tasks

Effort: **S** = under a day, **M** = a few days, **L** = a week or more. Each task says why it attracts users, so it can be cut if the reason stops being true.

### Release A: be found and make a good first impression (all S, no risk to the editor)

#### Task 1: Link previews and search basics (S)
*Why:* every link posted in a chat, on Reddit or on X currently shows a bare URL. This is the cheapest reach there is.
- [ ] `<title>` and meta description rewritten around the one-sentence pitch (free, film looks, browser, nothing uploaded)
- [ ] Open Graph and Twitter card tags with a 1200×630 preview image made in PhotoKamo itself (before/after of the sample with a film look and a frame); absolute URLs
- [ ] `<link rel="canonical">`, `apple-touch-icon` (180 px PNG), PNG favicon fallback
- [ ] `robots.txt` and a one-URL `sitemap.xml`; check `pages.yml` copies them
- [ ] Start screen lede says free, no account, nothing uploaded
**Check:** paste the live URL into a link-preview checker and a chat app; the card shows image, title and description. Lighthouse SEO has no failures.

#### Task 2: README and repository as a landing page (S)
*Why:* GitHub is where the first technical visitors arrive, and the README has no picture and no link to the app.
- [ ] Live-site link and one hero screenshot at the top; a short GIF or three stills (film look, contact sheet, lens bokeh)
- [ ] Repository description, website field and topics (`photo-editor`, `film-simulation`, `privacy`, `pwa`, `no-build`) set on GitHub
- [ ] "Why PhotoKamo" paragraph: spectral film engine, optics, collages, local-only, said plainly with the licence split stated up front (app GPL-3.0, Kamo engine proprietary) so nobody feels misled
**Check:** the README makes sense to someone who has never opened the app.

#### Task 3: Paste in, copy out (S)
*Why:* desktop users live on screenshots and copied images. Paste is the fastest possible "open", and Copy removes the download-then-attach step.
- [ ] `paste` on the document: image items go through `addFiles` (same limits and toasts); ignored while a text field or dialog has focus
- [ ] Start screen mentions "or paste (Ctrl/Cmd+V)" on desktop
- [ ] **Copy image** button in the Save sheet (`navigator.clipboard.write` with a PNG `ClipboardItem`), hidden where unsupported; uses the same rendered canvas as Download so output matches
- [ ] `aria-live` confirmation ("Copied")
**Check:** paste a screenshot on the start screen and inside the editor; copy an edited photo into another app; typing Ctrl+V in the Text panel still pastes text.

#### Task 4: Open more of what people actually have (S)
*Why:* "it didn't open my photo" ends a first visit.
- [ ] Add `image/avif` to both file inputs (all current browsers decode it)
- [ ] HEIC/HEIF: add to `accept` only where a decode probe succeeds (Safari); elsewhere keep the picker's automatic conversion on iOS and show a specific message for a dropped `.heic` ("This browser can't read HEIC. On iPhone choose Most Compatible, or open PhotoKamo in Safari.") instead of the generic type toast
- [ ] No decoder library is added (rule: no new runtime dependencies)
- [ ] Format list on the start screen and in toasts updated
**Check:** AVIF opens in Chrome, Firefox, Safari. A HEIC file opens in Safari and gets the specific message in Chrome.

#### Task 5: Provable privacy (S)
*Why:* privacy is the headline, and a sceptical user or reviewer can verify this in ten seconds.
- [ ] `<meta http-equiv="Content-Security-Policy">`: `default-src 'self'`, `connect-src 'self'`, `img-src 'self' blob: data:`, `worker-src 'self' blob:`, `style-src`/`script-src` as tight as the inline theme script and styles allow (hash the inline script rather than `'unsafe-inline'`)
- [ ] Engine Workers, fonts, stickers, camera, Web Share and downloads all still work under the policy
- [ ] About dialog: one line, "Your browser is instructed to block any upload from this page", next to the existing privacy text
- [ ] Save sheet: short "Saved on this device. Nothing was uploaded." line (the metadata report itself is workflow Task 8)
**Check:** DevTools console shows no CSP violations across the regression list; a test `fetch('https://example.com')` from the console is blocked.

### Release B: install it and come back

#### Task 6: Installable, offline PWA (M)
*Why:* a home-screen icon is the difference between a tool tried once and a tool used weekly, and "works in airplane mode" is the strongest privacy demonstration available.
- [ ] `manifest.webmanifest`: name, short name, `start_url: "./"` and `scope: "./"` (the site lives under `/photokamo/`), `display: standalone`, theme colours for both themes, 192/512 and maskable icons
- [ ] `sw.js`: precache the app shell (HTML, CSS, JS modules, fonts, logo, sample); cache engine runtime files and stickers **on first use**, not up front; same-origin requests only
- [ ] Versioned cache tied to one release string that also replaces the manual `?v=` on `styles.css`; old caches deleted on activate
- [ ] Update flow: new version waits, a toast offers "Update ready · Reload"; never reloads mid-edit
- [ ] The existing "Remove engine files" control in About also clears the service-worker caches
- [ ] iOS: `apple-mobile-web-app-*` tags; a short "Add to Home Screen" hint on iOS Safari where there is no install prompt
- [ ] `CLAUDE.md` rule wording updated: the service worker fetches app files from the same origin
**Check:** install on Android Chrome, desktop Chrome/Edge and iOS; turn on airplane mode, open the app, edit the sample with a Basic look and a previously used film look, export. Deploy a change and confirm the update toast.

#### Task 7: Open photos from other apps (S–M, needs Task 6)
*Why:* "Share → PhotoKamo" from the phone gallery makes it feel like a native editor.
- [ ] `share_target` in the manifest (POST, `multipart/form-data`, images); the service worker hands the files to the page, which calls `addFiles` (Android Chrome)
- [ ] `file_handlers` + `launchQueue` for "Open with PhotoKamo" on desktop Chromium
- [ ] Both degrade silently elsewhere
**Check:** share two photos from Android's gallery into the installed app; right-click → Open with on desktop.

#### Session recovery
Not repeated here: it is **workflow Task 5**. Recommended to schedule it with this release, because an installed app that forgets everything on relaunch is worse than a website that does.

### Release C: every result brings someone new

#### Task 8: Look links and look files (M)
*Why:* this is the growth loop. "Here's the look I used" becomes a link that opens PhotoKamo with that look ready for the recipient's own photo. No server is involved: the recipe sits in the URL fragment, which browsers never send to a host.
- [ ] Pure `js/look-link.js`: encode look id, strength, Adjust deltas, lens and frame (never the photo, crop or text) into a compact, versioned fragment; decode with strict validation and clamping through the existing specs
- [ ] "Share this look" in the look header and for My looks: Web Share where available, otherwise copy link
- [ ] Opening a link: start screen shows "Look ready: *Name* · choose a photo", then applies it as one undo step; offers "Save to My looks"
- [ ] Export / import My looks as a small `.json` file (backup and moving between browsers)
- [ ] Owner decision first: whether Kamo engine parameters may travel in links (see Open decisions 2)
**Check:** round-trip in Node for every Basic look and five film looks; a malformed or oversized fragment is ignored with a toast, never an error; link opened on a second device gives the same preview.

#### Task 9: Before/after export (S–M)
*Why:* before/after is the format people post when they are pleased with an edit, and it shows the product at work.
- [ ] Save sheet option "Before / after": side by side or split with a thin divider, composed from the existing original and rendered canvases; respects crop; frame applied to the whole
- [ ] Optional small labels ("Before", "After") in the app's fonts
- [ ] Later, only if wanted: a short wipe animation via `MediaRecorder` on a canvas stream (format varies by browser, so stills come first)
**Check:** exported split matches the on-screen compare at the same position; works for film looks at full size without blocking the main thread.

#### Task 10: Date stamp and camera-info frames (M, camera info needs workflow Task 8)
*Why:* the orange date stamp and the "shot on" caption border are two of the most shared film-style finishes, and both make an export recognisable.
- [ ] **Date stamp** option in Frames: corner, colour (orange, red, white), format; date from capture time when known, else today, always editable; drawn in `frameCanvas` so export matches preview
- [ ] **Info caption** frame: paper border with camera, lens, focal length, aperture, shutter and ISO, read on-device with the workflow Task 8 Exif walker; every field editable or removable; clear note that the text is drawn into the image by choice while file metadata is still stripped
- [ ] Both go through `change()` and are part of "apply to selected"
**Check:** a photo with Exif shows correct values; a photo without Exif gets empty editable fields, not an error; export matches preview; baseline exports with neither feature stay byte-identical.

### Release D: reasons to play

#### Task 11: Roll mode, a browser film camera (L)
*Why:* the most distinctive thing PhotoKamo could offer and the easiest to talk about: pick a stock, shoot a roll of 12, 24 or 36 with the phone camera, "develop" it, get a contact sheet. It reuses the camera, the film looks and the contact sheets that already exist.
- [ ] Camera dialog gains a stock picker and a frame counter; shots go straight into the strip with that look applied
- [ ] Viewfinder shows an approximate look at low resolution (Basic maths on a small canvas; film looks show a labelled approximation, the real engine runs on the captured frame in its Worker)
- [ ] "Develop roll": one tap builds a film contact sheet from the roll (existing collage path) and opens the batch export
- [ ] Optional date stamp from Task 10; rolls survive reload once workflow Task 5 exists
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

### Release E: depth that people search for (after the workflow plan's Release A)

#### Task 14: Colour mixer (HSL) (M)
*Why:* per-colour hue, saturation and lightness is the most asked-for control in any colour-focused editor and the natural partner to film looks ("make the greens less yellow").
- [ ] Eight colour bands with smooth overlaps, in pure `adjustPixels` so it runs in the adjust Worker; neutral values are an exact no-op
- [ ] Section in Adjust; values are ordinary edits (undo, apply to selected, My looks, look links)
**Check:** Node fixtures for band isolation and no banding on a hue ramp; untouched photos export byte-identical to `docs/v3/BASELINE.md`.

#### Already planned elsewhere, worth pulling forward for reach
- Curves and levels, perspective correction: "Later" in `plan_workflow.md` (A§11, A§12).
- Look search and tags, Auto Enhance, clone/heal: `plan_workflow.md` Tasks 1, 4, 9–10. Auto and Heal are the two that non-photographers expect to find.
- Custom export sizes and target file size: `plan_workflow.md` Tasks 6–7. Add **print presets** (4×6, 5×7, A4 at 300 dpi) there, since single photos have no print size today while collages do.

### Ongoing: help people stay

#### Task 15: First-run guidance and shortcut sheet (S)
- [ ] Three dismissible hints on first edit (pick a look · hold to compare · Save), stored in `localStorage`, never shown again
- [ ] `?` opens a keyboard shortcut list (a real dialog, also reachable from About)
- [ ] "What's new" list in About, keyed to the release string, with a small dot on the About button after an update
**Check:** hints do not trap focus and are announced once; shortcut list matches `js/app.js`.

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
- [ ] One undo step per gesture for anything user-visible
- [ ] Network panel: no request to any other origin; with Task 5, the CSP reports no violations
- [ ] Desktop and phone layouts (360 and 430 px, breakpoint 900 px); keyboard only; 44 px targets; 4.5:1 contrast; status text announced
- [ ] Film engine still loads only when a film look is chosen
- [ ] No console errors; no main-thread task over 100 ms during full-size work
- [ ] About dialog, README and licence credits still accurate

## Recommended order

1. Release A, Tasks 1–5 (about a week in total, no editor risk).
2. Workflow Task 5 (recovery), then Tasks 6–7 (PWA, share target).
3. Task 8 (look links) and Task 9 (before/after).
4. Workflow Tasks 1–4 and 8, then Task 10 (date stamp, info caption).
5. One "play" feature, Task 11 or 12, chosen by the owner; Task 13 alongside.
6. Release E and languages as demand shows.

## Not recommended

| Idea | Why not |
|---|---|
| Accounts, cloud sync, galleries of user photos | Ends the privacy story and needs a backend |
| "Made with PhotoKamo" watermark by default | Drives away the audience the app is for; distinctive frames and look links do the job by choice |
| ML background removal, AI upscaling, generative fill | Large model downloads and a runtime dependency; against the rules and the lightweight promise |
| RAW decoding | Already "revisit on demand" in the workflow plan; needs a decoder dependency |
| More film presets | 98 looks exist; finding them (workflow Task 1) matters more than adding to them |
| Display-P3 export | Already out of scope in `v3plan.md` |

## Open decisions (owner)

1. This file's name and whether it is tracked (it is not covered by `.gitignore` as written).
2. Look links (Task 8): may Kamo engine parameters be included, or only the look id plus Adjust, lens and frame? (Recommended: look id and strength only for film looks, since the engine is proprietary.)
3. `.cube` LUT import or export: import is safe; exporting a Kamo look as a LUT publishes the engine's colour response. (Recommended: neither for now.)
4. Play feature first: Roll mode (bigger, more distinctive) or Photo booth (smaller, quicker).
5. Feedback channel shown in About: GitHub Issues, email, or none.
6. Custom domain: yes or stay on `github.io`.
7. Licence for new modules (same pending question as `plan_workflow.md` Open decision 3).
