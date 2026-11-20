# PhotoKamo

PhotoKamo is a privacy-first, browser-native photo editor for camera-inspired color, film looks, manual adjustments, a physical film simulation, and vintage frames. Images are processed locally and are never uploaded.

## Run locally

This project has no build step or runtime dependencies. ES modules and the WebAssembly film engine require serving the files over HTTP:

```powershell
cd D:\root\PhotoKamo
python -m http.server 8080
```

Open <http://localhost:8080>.

## Features

- Upload, drag-and-drop, sample photo, live camera preview/capture, camera switching, and mobile capture fallback
- Simple mode: 20 camera, film and creative looks with strength, favorites, and light/color/character adjustments
- Advanced mode: spectral film → print → scan engines (Spektrafilm, Negs; see below) with film stocks incl. B&W,
  papers, enlarger filtration, grain, halation, couplers and scanner settings; each engine with its own controls
- Hold to compare, undo/redo, and saved looks
- Independent classic, instant, and film-strip frames
- JPEG, PNG and WebP export, a size for sharing, and Web Share on supported phones
- Dark, responsive and keyboard-accessible UI

## Privacy and accuracy

There is no backend, account, telemetry, or image upload. Camera and film names describe creative approximations rather than measured emulations.

In Simple mode, the **Spektrafilm-inspired** looks are approximations made with PhotoKamo's own renderer, informed by Andrea Volpato's [spektrafilm](https://github.com/andreavolpato/spektrafilm); RawTherapee-inspired labels likewise describe workflow inspiration, not bundled profiles.

**Advanced mode runs real film engines**, chosen from the Engine dropdown and downloaded only when selected. Each runs on your device in a Web Worker, has its own controls (modelled on the original project) and its own licence and credits (ⓘ next to the dropdown). PhotoKamo keeps its own copy of every engine's source in [`engines/`](engines/) and updates it only deliberately.

| Engine | What it is | Licence | Folder |
|---|---|---|---|
| Spektrafilm | The spektrafilm model via the Rust port [spektrafilm-rs](https://github.com/turbasvin/spektrafilm-rs), WebAssembly. Colour-LUT preview; grain, halation and blur in the full-quality render (≤ 4 MP). | GPL-3.0 | [`engines/spektrafilm-rs/`](engines/spektrafilm-rs/README.md) |
| Negs | [negs](https://github.com/noahhaasis/negs) v0.17.0: the spektrafilm model on WebGPU (CPU fallback), the complete model in every preview, 52 films incl. B&W and 10 papers. | GPL-3.0; profiles CC BY-SA 4.0 | [`engines/negs/`](engines/negs/README.md) |
| DuXun | [DuXun Film Simulation](https://github.com/DuXun03/duxun-film-simulation), a DaVinci Resolve plugin, its renderer ported to JavaScript: 54 film presets, print stocks, grain, halation, bloom, dust and vignette. Verified against the plugin's C++. | GPL-2.0-or-later | [`engines/duxun/`](engines/duxun/README.md) |

## Licence

PhotoKamo is free software, licensed under the [GNU General Public License v3](LICENSE), because it includes GPL-3.0 film engines (spektrafilm-rs, negs) and DuXun (GPL-2.0-or-later, used under GPL-3.0). Credits: spektrafilm by Andrea Volpato; spektrafilm-rs; negs; spektrafilm and Fotufilm film profiles (CC BY-SA 4.0); spectral upsampling LUTs by Johannes Hanatos and others; rawler (LGPL-2.1, inside negs); [browser_wasi_shim](https://github.com/bjorn3/browser_wasi_shim) (MIT OR Apache-2.0); Inter and Playfair Display fonts (SIL Open Font License).

## Browser support

Use a current version of Chrome, Edge, Firefox, or Safari. Mobile camera behavior depends on browser and operating-system support for the HTML file capture hint.

Live camera preview uses `getUserMedia()` and therefore requires user permission plus HTTPS or `localhost`. Opening `index.html` directly from disk does not provide a secure camera context.