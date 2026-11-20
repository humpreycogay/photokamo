# PhotoKamo

PhotoKamo is a privacy-first, browser-native photo editor for camera-inspired color, film looks, manual adjustments, physical film simulation, cropping, and print frames. Images are processed locally and are never uploaded.

## Run locally

This project has no build step or runtime dependencies. ES modules and the WebAssembly film engine require serving the files over HTTP:

```powershell
cd D:\root\PhotoKamo
python -m http.server 8080
```

Open <http://localhost:8080>.

## Features

- Open several photos at once (file picker, drag-and-drop, sample photo, live camera or mobile capture); a filmstrip to switch between them, with Ctrl/Cmd-click, Shift-click, keyboard or long-press selection
- One **Engine** picker in the Look tab: **Basic** (20 camera, film and creative looks with strength and favorites) or a film engine (Spektrafilm, Negs, DuXun; see below) with film stocks incl. B&W, papers, enlarger filtration, grain, halation, couplers and scanner settings
- Adjust (light, color, character) on top of every engine
- Crop: 10 aspect ratios with Swap W×H, zoom, drag and resize, straighten (no empty corners), rotate 90°, flip, and the output size in pixels
- Frames: Paper print (border width, extra at the bottom, paper colour, match the print paper), classic, instant and film strip, all drawn into the exported image
- Apply the look, adjustments, frame or crop ratio of the photo in view to the other selected photos, or edit them together live
- Per-photo undo/redo, hold to compare, and saved looks
- JPEG, PNG and WebP export, a size for sharing, Web Share on supported phones, and batch export of the selected photos as one ZIP or separate files
- Dark, responsive and keyboard-accessible UI

## Privacy and accuracy

There is no backend, account, telemetry, or image upload. Camera and film names describe creative approximations rather than measured emulations.

Among the Basic looks, the **Spektrafilm-inspired** ones are approximations made with PhotoKamo's own renderer, informed by Andrea Volpato's [spektrafilm](https://github.com/andreavolpato/spektrafilm); RawTherapee-inspired labels likewise describe workflow inspiration, not bundled profiles.

**The film engines are real film simulations**, chosen in the Engine picker and downloaded only when selected. Each runs on your device in a Web Worker, has its own controls (modelled on the original project) and its own licence and credits (ⓘ next to the picker). PhotoKamo keeps its own copy of every engine's source in [`engines/`](engines/) and updates it only deliberately.

| Engine | What it is | Version (our copy) | Licence | Folder |
|---|---|---|---|---|
| Spektrafilm | The spektrafilm model by Andrea Volpato via the Rust port [spektrafilm-rs](https://github.com/turbasvin/spektrafilm-rs), WebAssembly. Colour-LUT preview; grain, halation and blur in the full-quality render (≤ 4 MP). | spektrafilm-rs `9dd59b0` + PhotoKamo patch | Code GPL-3.0; profiles CC BY-SA 4.0 | [`engines/spektrafilm-rs/`](engines/spektrafilm-rs/README.md) |
| Negs | [negs](https://github.com/noahhaasis/negs): the spektrafilm model on WebGPU (CPU fallback), the complete model in every preview, 52 films incl. B&W and 10 papers (29 profiles adapted from Fotufilm). | v0.17.0 (`83e8c79`), unchanged | Code GPL-3.0; profiles CC BY-SA 4.0 | [`engines/negs/`](engines/negs/README.md) |
| DuXun | [DuXun Film Simulation](https://github.com/DuXun03/duxun-film-simulation), a DaVinci Resolve plugin, its renderer ported to JavaScript: 54 film presets, print stocks, grain, halation, bloom, dust and vignette. Verified against the plugin's C++. | v5.0 (`91357a3`), ported | GPL-2.0-or-later (used under GPL-3.0) | [`engines/duxun/`](engines/duxun/README.md) |

## Licence

PhotoKamo is free software, licensed under the [GNU General Public License v3](LICENSE), because it includes GPL-3.0 film engines (spektrafilm-rs, negs) and DuXun (GPL-2.0-or-later, used under GPL-3.0). Credits: spektrafilm by Andrea Volpato; spektrafilm-rs; negs; spektrafilm and Fotufilm film profiles (CC BY-SA 4.0); spectral upsampling LUTs by Johannes Hanatos and others; rawler (LGPL-2.1, inside negs); [browser_wasi_shim](https://github.com/bjorn3/browser_wasi_shim) (MIT OR Apache-2.0); Inter and Playfair Display fonts (SIL Open Font License).

## Browser support

Use a current version of Chrome, Edge, Firefox, or Safari. Mobile camera behavior depends on browser and operating-system support for the HTML file capture hint.

Live camera preview uses `getUserMedia()` and therefore requires user permission plus HTTPS or `localhost`. Opening `index.html` directly from disk does not provide a secure camera context.