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
- One Looks grid: **Basic** (20 camera, film and creative looks with strength and favorites) and **Kamo**, the film engine (see below), with 81 one-tap film looks: 20 calibrated colour stocks, 30 lab/cinema pairings, push/pull, CineStill and look-alike recipes, and 31 B&W, instant, creative and extreme looks (infrared, negatives, cross-processing, redscale, cyanotype…)
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

**Film looks use Kamo**, PhotoKamo's calibrated spectral film engine. It runs on your device in a Web Worker and its calibration assets download only when a film look is selected. Its controls, licence and credits are available from the film settings (ⓘ beside the engine controls). Kamo also includes an uncalibrated RGB look model for the B&W, instant and creative looks, which the calibration data does not cover. Retired engines (Spektrafilm-rs, Negs, DuXun) are kept for provenance in [`Archive/engines/`](Archive/engines/) and [`Archive/engine-adapters/`](Archive/engine-adapters/); the app does not load them.

| Engine | What it is | Version (our copy) | Licence | Folder |
|---|---|---|---|---|
| Kamo | PhotoKamo’s dependency-free spectral engine: 20 datasheet-derived colour stocks with negative scans, photographic paper, cinema print and reversal viewing, plus an uncalibrated RGB look model for B&W, instant and creative looks. | 0.1.0 | Engine code proprietary; calibration data CC BY 4.0; standards tables retain third-party rights | [`engines/kamo-film-engine/`](engines/kamo-film-engine/README.md) |

## Licence

PhotoKamo is free software under the [GNU General Public License v3](LICENSE). Kamo’s engine code has separate proprietary terms. Credits: Film Scan Calibration by OwlMightyCh (CC BY 4.0); Inter, Playfair Display and Caveat fonts (SIL Open Font License). Retired third-party engine copies retain the licences and credits recorded in their source directories.

## Browser support

Use a current version of Chrome, Edge, Firefox, or Safari. Mobile camera behavior depends on browser and operating-system support for the HTML file capture hint.

Live camera preview uses `getUserMedia()` and therefore requires user permission plus HTTPS or `localhost`. Opening `index.html` directly from disk does not provide a secure camera context.