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
| 3 | Basic · faded-print | `7127eafd61f1ab7c646e22cd58fc3f7c71aef3de4f9e331769ea4c75d6368b2e` | 1311 × 1514 | 551,455 | 135 / 135 | — |
| 4 | Kamo · kodak-portra-400 | `efa5ca8a2b5c2d45f4751830c8cfcd0c76bfc03f2b1d36889f6c810f55cd51ab` | 1311 × 1514 | 726,314 | 964 / 961 | — |
| 5 | Kamo · look-superia-xtra-400 | `eb0840a36dcf37f266dc5a2caa5682f80bc88a9c3c11991f354c3ab58e432091` | 1311 × 1514 | 705,185 | 880 / 996 | — |
| 6 | Kamo · bw-ilford-hp5-plus | `7fae11339683b1a89e9b65258fceec4a6f73ae78d092536836bbfb07ca389f04` | 1311 × 1514 | 626,431 | 742 / 750 | — |
| 7 | Collage · grid-4 (2 × 2), 4 × sample | `514fc96dcf782a884444f69104ad95354e461862d8fe34d01fd26cdcd18f3d7e` | 2913 × 2913 | 1,861,683 | 278 / 284 | — |

The owner phone column is still to fill in: same steps by hand on the phone, timed from tapping Export (or Save) to the file being ready.

Console: no errors or warnings during any run. Network: no request outside `http://localhost:8080`.

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
