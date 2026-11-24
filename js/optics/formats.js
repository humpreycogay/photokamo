// Camera formats for the Lens tab's Camera section (plan_optics.md Task 6).
// Sizes are NOMINAL image areas in mm (long × short side); real exposed areas vary by camera, back and
// maker, so each entry notes where its value comes from. `ratio` is the long:short crop ratio offered by
// "Crop to format" (the nearest simple ratio where the nominal size is not exact).
// Plain data and pure helpers: no DOM.

export const formats = [
  { id: '1inch', name: '1-inch sensor', long: 13.2, short: 8.8, ratio: [3, 2], source: 'Nominal “1-inch type” compact sensor; varies by maker.' },
  { id: 'mft', name: 'Micro Four Thirds', long: 17.3, short: 13, ratio: [4, 3], source: 'Nominal Four Thirds sensor area.' },
  { id: 'aps-c', name: 'APS-C', long: 23.5, short: 15.6, ratio: [3, 2], source: 'Nominal; 22.2–23.6 mm long side depending on maker.' },
  { id: '35mm', name: '35 mm / full frame', long: 36, short: 24, ratio: [3, 2], source: 'Nominal 135 film frame and full-frame sensor.' },
  { id: 'xpan', name: 'Panoramic 35 mm (65 × 24)', long: 65, short: 24, ratio: [65, 24], source: 'Nominal panoramic frame on 135 film.' },
  { id: '645', name: '6 × 4.5', long: 56, short: 41.5, ratio: [4, 3], source: 'Nominal 120 film frame; 41.5–42 mm short side.' },
  { id: '6x6', name: '6 × 6', long: 56, short: 56, ratio: [1, 1], source: 'Nominal 120 film square frame.' },
  { id: '6x7', name: '6 × 7', long: 69.5, short: 56, ratio: [5, 4], source: 'Nominal 120 film frame; ≈ 5:4.' },
  { id: '6x9', name: '6 × 9', long: 84, short: 56, ratio: [3, 2], source: 'Nominal 120 film frame.' },
  { id: '4x5', name: '4 × 5 in sheet', long: 120, short: 96, ratio: [5, 4], source: 'Approximate image area of 4 × 5 inch sheet film; varies by holder.' },
  { id: '8x10', name: '8 × 10 in sheet', long: 245, short: 194, ratio: [5, 4], source: 'Approximate image area of 8 × 10 inch sheet film; varies by holder.' },
];
export const formatById = id => formats.find(format => format.id === id) || null;

export const FOCAL_LENGTHS = [8, 12, 14, 18, 21, 24, 28, 35, 40, 50, 65, 80, 90, 105, 135, 150, 180, 210, 300, 400, 600];
const FULL_FRAME_DIAGONAL = Math.hypot(36, 24);
const degrees = radians => radians * 180 / Math.PI;

/** Angle of view of a rectilinear lens focused at infinity: 2·atan(d / 2f), in degrees, for the format's
 *  long side, short side and diagonal; plus the crop factor and 35 mm-equivalent focal length. */
export function fieldOfView(format, focal) {
  const diagonal = Math.hypot(format.long, format.short), aov = d => degrees(2 * Math.atan(d / (2 * focal)));
  const crop = FULL_FRAME_DIAGONAL / diagonal;
  return { long: aov(format.long), short: aov(format.short), diagonal: aov(diagonal), crop, equivalent: focal * crop };
}

/** Millimetres of format per image pixel for a width × height image that fills the format's long side. */
export const mmPerPixel = (format, width, height) => format.long / Math.max(1, width, height);
