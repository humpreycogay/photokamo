# v3 baseline exports

Recorded 2026-11-26 at commit `57806ec` (+ Task 0, which changes no app code) for `v3plan.md`. Tasks marked **Output changes: no** must reproduce these hashes exactly; tasks that change output re-record only the rows they list.

## How the exports were made

`tools/v3-baseline.mjs` drives the real app (repo files served through Playwright routing as `http://localhost:8080/`) in headless Chromium **159.0.8154.6** (Playwright, installed outside the repo; see the script header), viewport 1400 × 900, dev laptop Apple M5. Each look gets a fresh browser context (empty storage):

- Photo exports: **Try a sample** (`images/model.jpg`) → pick the look (Basic: click its tile; Kamo: `pickFilmLook("film:<id>")`) → **Export** with the dialog defaults (JPEG, quality 92 %, Full size) → **Download**.
- Collage: add `images/model.jpg` four times (`sample-1…4.jpg`) → **Create collage** → template **2 × 2** (`grid-4`) → **Export** with defaults → **Download**.

Time = from clicking **Export** to the download event (includes rendering and encoding). Two runs shown; both runs gave identical hashes for all seven files. JPEG encoding is browser-specific: compare hashes with the same Chromium build, or re-record both sides when the browser changes.

## Exports

| # | Export | sha256 | Pixels | Bytes | Time ms (laptop, 2 runs) | Time ms (owner phone) |
|---|---|---|---|---|---|---|
| 1 | Basic · clean-pop | `3f8366e945412c94eb6a4ce0680ca165535c571d47da631ef80b1bc0dde702cd` | 1311 × 1514 | 619,933 | 130 / 127 | — |
| 2 | Basic · warm-natural | `0dfe2694b89011432f4a8cc1373d2c2432db89211b402422c76028c07f0e0acd` | 1311 × 1514 | 596,971 | 124 / 129 | — |
| 3 | Basic · faded-print | `b28a6e664d5a6c967b6fb5fe1ba1f55f94bb9b90281e320fc14abb63369e15b7` | 1311 × 1514 | 559,304 | 199 / 170 | — |
| 4 | Kamo · kodak-portra-400 | `8198929ecd4ec266567b40007e8f416f2dc8e9b04bb59413ba64e16af9e0cb04` | 1311 × 1514 | 726,525 | 929 / 940 | — |
| 5 | Kamo · look-superia-xtra-400 | `df5e40881a38f945944d13b36ee015cd075afd70a3960d9ce63698160a533dda` | 1311 × 1514 | 705,327 | 808 / 805 | — |
| 6 | Kamo · bw-ilford-hp5-plus | `1060a1b737377536a28f0723aeb481cd00d60a676933e462d4593c824e53290d` | 1311 × 1514 | 622,091 | 731 / 752 | — |
| 7 | Collage · grid-4 (2 × 2), 4 × sample | `514fc96dcf782a884444f69104ad95354e461862d8fe34d01fd26cdcd18f3d7e` | 2913 × 2913 | 1,861,683 | 278 / 284 | — |
| 8 | Basic · clean-pop · share size | `e2363841364d5be70279216c2fd6301b0cb9e7698c93d60e9665953952c7cdda` | 1080 × 1247 | 394,670 | 186 / 185 | — |
| 9 | Collage · diptych-side, slot 2 empty | `c8e6cbdd2673dae958f4c1d901a4e469ca4610123f1e239aef4b0237bb0efa9a` | 3433 × 2289 | 570,774 | 1026 / 1015 | — |

The owner phone column is still to fill in: same steps by hand on the phone, timed from tapping Export (or Save) to the file being ready.

Console: no errors or warnings during any run. Network: no request outside `http://localhost:8080`.

## Changes since recording

- Task 4 (optics highlights): no baseline export uses the Lens stage, so all 7 hashes still hold.
- Task 6 (2026-11-27): rows 8 and 9 added. Both scale the photo down, which rows 1–7 never do. They caught a Task 5 regression the other rows missed: the Worker path re-sampled an ImageBitmap instead of drawing the `<img>` at the smaller size, which changed every Share-size export and collage slots that need less than the full photo (max 12 levels). Fixed in Task 6: the scaling draw stays on the main thread, and the pixel loop stays in the Worker. Both rows were recorded at `cef1818` (before Task 5) and are equal to the current code.

- Task 8 (2026-11-27, approved): rows 3 and 6 re-recorded. Grain above the preview size is now sized to the picture (Basic grain above 1000 px, Kamo creative-look grain above 900 px), so those two exports changed. The other 7 rows are unchanged.

- Task 9 (2026-11-27, approved): rows 4 and 5 re-recorded. Spectral grain is now hashed by position in the frame (so tiles match), which changes its pattern for every spectral film look. Creative looks (row 6) and everything else are unchanged.

## Node checks

```
$ node tools/check-film-looks.mjs
looks 81 (stock recipes 20, presets 61); menu 81; errors 0
$ node tools/collage-check.mjs                # 10 kit-* errors before Task 0
OK: 14776 checks, 0 errors (60 templates, 11 shapes)
$ node tools/v3-check.mjs
OK: 1 cases, 0 failed
$ (cd engines/kamo-film-engine && node --test)
tests 40, pass 40, fail 0
```
