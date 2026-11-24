# Optics: references and licence register

PhotoKamo's optics stage (`js/optics/`) is **proprietary, original code**. Each effect is implemented from textbook optics described in our own words in `plan_optics.md`. No third-party code, shaders, tests, comments, images or data are copied or bundled.

Rules:
- A candidate repository may be read for ideas only if its status below is `research-only`. Nothing from it is pasted, translated or closely paraphrased.
- Nothing licensed GPL, LGPL, AGPL, MPL, CC BY-SA or NC, or without a licence, is bundled.
- Every measured value that ships (a lens profile or a format size) records its source in the profile itself. Illustrative profiles say `source: original`.
- Test images are generated in code (`tools/optics-fixtures.html`, Task 3) or are PhotoKamo's own sample.

## Candidate register

Licences as reported on 2026-11-24; not re-audited at a pinned commit, because nothing is reused.

| Candidate | URL | Reported licence | Status | Notes |
|---|---|---|---|---|
| Codrops SDF lens blur | https://github.com/guilanier/codrops-sdf-lensblur | MIT | research-only | Aperture-shaped blur idea; our bokeh kernel (Task 8) is written from scratch |
| Dioptric | https://github.com/tasleson/dioptric | MIT code, CC BY-SA database | research-only | Database never bundled |
| Lensfun | https://github.com/lensfun/lensfun | LGPL-3.0 code, CC BY-SA data | docs only | Model definitions in its public docs used as a cross-check of the standard radial polynomial |
| Film Lab | https://github.com/thedevmark/film-lab | MIT code, CC BY-SA LUT | not needed | Film scope; PhotoKamo already has an effect pipeline |
| RC014 FilmLab | https://github.com/RC014/FilmLab | MIT (reported) | not needed | |
| CineSuite | https://github.com/wavequant/cinesuite | MIT (reported) | not needed | |
| FE (physically based film emulation) | https://github.com/zyoung11/FE | none established | reject | Film scope; no reuse licence |
| spektrafilm-webui | https://github.com/OHW0nder/spektrafilm-webui | GPL-3.0 + separate data | reject | Film scope; GPL |
| Deep Analog | https://github.com/EtonMu/deep-analog | restrictive terms | reject | Restrictive reuse and patent notices |

## Technical references (principles only)

| Topic | Reference | Used for |
|---|---|---|
| Lens geometry, thin lens, depth of field | MIT Vision Book, Lenses: https://visionbook.mit.edu/lenses.html | Tasks 6–7 |
| Cameras and lenses | Berkeley CS184 lecture 15 (2022) | Thin lens, aperture, CoC |
| Thin-lens image formation | Wandell, *Foundations of Image Systems Engineering*: https://wandell.github.io/FISE-git/chapters/optics-03-thinlens.html | Tasks 6–7, 9 |
| Glare and scattering | Spencer, Shirley, Zimmerman, Greenberg, *Physically-Based Glare Effects for Digital Images*, SIGGRAPH 1995 | Task 4 bloom and glare |
| Radial distortion | Brown–Conrady radial polynomial (standard photogrammetry) | Task 3 |
| Diffraction | Airy disk, first minimum `r ≈ 1.22 λ N` (standard optics) | Task 9 |
| sRGB transfer | IEC 61966-2-1 piecewise sRGB curve | Linear-light decode and encode |

## Implemented models

| Effect | File | Model | Limitations |
|---|---|---|---|
| Light falloff | `js/optics/pipeline.js` | Gain `2^(E · s(r)/s(1))` in linear light; `s` is a smoothstep around the midpoint; `r` is normalised to the half-diagonal | Artistic approximation, not a measured lens profile; brightening clips at white when used alone (the highlight shoulder applies only with diffusion or bloom) |
| Distortion | `js/optics/pipeline.js` | Inverse-mapped radial polynomial `p·(1 + k1·r²)`, k1 = −0.15·d, bilinear in linear light; auto-fill zoom keeps every frame-edge sample inside the photo | One term (k1); k2 comes with profiles. Bilinear resampling softens very slightly when on |
| Colour fringing | `js/optics/pipeline.js` | Lateral CA: red (positive) or blue (negative) image magnified by up to 0.5 % at the corners, in the same resample | Lateral only; no longitudinal (depth-dependent) CA |
| Diffusion | `js/optics/pipeline.js`, `layers.js` | Energy-preserving scatter `I − s·H + s·(PSF ∗ H)`, PSF = 0.65 core + 0.35 wide Gaussian; H weighted towards highlights by a control | Blur computed on a ≤ 1024 px working grid and read back bilinearly; spatially uniform PSF |
| Bloom | `js/optics/pipeline.js`, `layers.js` | Soft-knee threshold on linear luminance, four Gaussian scales (σ, 2σ, 4σ, 8σ; weights .35/.3/.2/.15), tinted, added; shoulder above 0.9 linear | Screen-space glare, not a simulation of a specific lens; 8-bit input limits how bright a highlight can be |
| Lens profiles | `js/optics/profiles.js` | Declarative presets (schema 1.0) listing differences from neutral; each has `source.type: 'original'` and a note | Tuned by eye; none are measured or named after a real lens model |
