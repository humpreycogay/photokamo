# PhotoKamo

PhotoKamo is a privacy-first, browser-native photo editor for camera-inspired color, film-inspired looks, manual adjustments, comparisons, and vintage frames. Images are processed locally and are never uploaded.

## Run locally

This project has no build step or dependencies. ES modules require serving the files over HTTP:

```powershell
cd D:\root\PhotoKamo
python -m http.server 8080
```

Open <http://localhost:8080>.

## Features

- Upload, drag-and-drop, live camera preview/capture, camera switching, and mobile capture fallback
- Camera, film, utility, and creative preset strips
- Light, color, grain, clarity, fade, and vignette controls
- Original/edited split comparison
- Undo, redo, and reset
- Independent classic, instant, and film-strip frames
- Full-resolution JPEG, PNG, and WebP export
- Responsive and keyboard-accessible UI

## Privacy and accuracy

There is no backend, account, telemetry, or image upload. Camera and film names describe creative approximations rather than measured emulations.

The **Spektrafilm-inspired** processing family is an approximation informed by the concepts documented by Andrea Volpato's [Spektrafilm project](https://github.com/andreavolpato/spektrafilm). PhotoKamo does not bundle or directly integrate Spektrafilm code or assets. RawTherapee-inspired labels similarly describe workflow inspiration rather than bundled profiles or exact reproduction.

## Browser support

Use a current version of Chrome, Edge, Firefox, or Safari. Mobile camera behavior depends on browser and operating-system support for the HTML file capture hint.

Live camera preview uses `getUserMedia()` and therefore requires user permission plus HTTPS or `localhost`. Opening `index.html` directly from disk does not provide a secure camera context.