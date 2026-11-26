# Twemoji (subset)

Vector emoji used for collage emoji stickers (`js/collage/stickers.js`).

- Source: https://github.com/jdecked/twemoji, release **v17.0.3**, `assets/svg/`
- Graphics licence: **CC-BY 4.0** (`LICENSE-GRAPHICS`), © Twitter, Inc and other contributors. Code licence (not used here): MIT (`LICENSE`).
- Only the SVGs PhotoKamo offers as stickers are included, **unmodified**. At load time `stickers.js` adds a `width`/`height` to the root `<svg>` in memory so every browser can draw it at any size; the files themselves are untouched.
- Served from this site like any other file; nothing is fetched from a CDN.

To refresh or change the set: download a Twemoji release, then run
`node tools/twemoji-subset.mjs <path-to-extracted-release>/assets/svg` (copies exactly the files the sticker list needs and reports any missing).
