// Metadata privacy report (plan_workflow.md Task 8, A§10.1–10.3): which kinds of private data a JPEG, PNG or WebP file
// carries, never the values. Pure and bounds-checked: every read is checked against the bytes given, offsets may not
// loop, and depth, entry and segment counts are capped, so a hostile file can only end the scan early ('malformed').
// Given the first part of a file (`complete: false`), running off the end is not counted as malformed.
import { crc32 } from '../zip.js';

const MAX_DEPTH = 4, MAX_ENTRIES = 4096, MAX_SEGMENTS = 2048, MAX_SEGMENT = 16 * 1024 * 1024;
const TYPE_WIDTH = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
// IFD0 / Exif IFD tags that matter for privacy (presence only).
const CAMERA_TAGS = new Set([0x010f, 0x0110, 0xa431, 0xa432, 0xa433, 0xa434, 0xa435]); // make, model, body serial, lens info/make/model/serial
const DATE_TAGS = new Set([0x0132, 0x9003, 0x9004]); // DateTime, DateTimeOriginal, DateTimeDigitized
const OWNER_TAGS = new Set([0x013b, 0x8298, 0xa430]); // Artist, Copyright, CameraOwnerName
const EXIF_IFD = 0x8769, GPS_IFD = 0x8825;

/** The private data kinds a report can name, in reading order. */
export const PRIVATE_KINDS = ['gps', 'camera', 'date', 'owner', 'thumbnail', 'xmp', 'text', 'exif'];
const LABELS = { gps: 'location', camera: 'camera details', date: 'capture date', owner: 'owner or copyright', thumbnail: 'an embedded thumbnail', xmp: 'XMP metadata', text: 'text notes', exif: 'Exif data' };
export const kindLabel = kind => LABELS[kind];

const empty = format => ({ format, gps: false, camera: false, date: false, owner: false, thumbnail: false, xmp: false, text: false, exif: false, icc: false, malformed: false });
/** Private kinds present in a report (ICC colour profiles are colour data, not private). */
export const privateKinds = report => PRIVATE_KINDS.filter(kind => report[kind]);

const ascii = (bytes, start, text) => { if (start + text.length > bytes.length) return false; for (let i = 0; i < text.length; i++) if (bytes[start + i] !== text.charCodeAt(i)) return false; return true; };

/** Scans file bytes. Returns { format: 'jpeg'|'png'|'webp'|null, gps, camera, date, owner, thumbnail, xmp, text, exif, icc, malformed }. */
export function scanMetadata(bytes, { complete = true, strict = false } = {}) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  try {
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return scanJpeg(bytes, complete);
    if (ascii(bytes, 0, '\x89PNG\r\n\x1a\n')) return scanPng(bytes, complete);
    if (ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP')) return scanWebp(bytes, complete);
    return empty(null);
  } catch (error) { // a bug here must never break an import or an export: report it as unreadable instead
    if (strict) throw error; // fixtures: an exception is a bug, not a bad file
    return { ...empty(null), malformed: true };
  }
}

function scanJpeg(bytes, complete) {
  const report = empty('jpeg');
  let offset = 2, segments = 0;
  while (offset < bytes.length) {
    if (++segments > MAX_SEGMENTS) { report.malformed = true; break; }
    if (bytes[offset] !== 0xff) { report.malformed = true; break; }
    while (offset < bytes.length && bytes[offset] === 0xff) offset++; // fill bytes
    if (offset >= bytes.length) break;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break; // end of image / start of scan: no metadata after this point
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // standalone markers
    if (offset + 2 > bytes.length) { if (complete) report.malformed = true; break; }
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2) { report.malformed = true; break; }
    const start = offset + 2, end = offset + length;
    if (end > bytes.length) { if (complete) report.malformed = true; break; }
    if (marker === 0xe1 && ascii(bytes, start, 'Exif\0\0')) { report.exif = true; scanTiff(bytes.subarray(start + 6, end), report); }
    else if (marker === 0xe1 && ascii(bytes, start, 'http://ns.adobe.com/xap/1.0/\0')) report.xmp = true;
    else if (marker === 0xe1 && ascii(bytes, start, 'http://ns.adobe.com/xmp/extension/\0')) report.xmp = true;
    else if (marker === 0xe2 && ascii(bytes, start, 'ICC_PROFILE\0')) report.icc = true;
    else if (marker === 0xed && ascii(bytes, start, 'Photoshop 3.0\0')) report.owner = true; // IPTC: bylines, captions, places
    else if (marker === 0xfe) report.text = true; // COM comment
    offset = end;
  }
  return report;
}

/** TIFF (Exif) block: IFD0, its Exif and GPS sub-IFDs, and whether IFD1 (the thumbnail) exists. */
function scanTiff(tiff, report) {
  if (tiff.length < 8) { report.malformed = true; return; }
  const little = ascii(tiff, 0, 'II');
  if (!little && !ascii(tiff, 0, 'MM')) { report.malformed = true; return; }
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const u16 = at => view.getUint16(at, little), u32 = at => view.getUint32(at, little);
  if (u16(2) !== 42) { report.malformed = true; return; }
  const visited = new Set();
  let entries = 0;
  const walk = (offset, kind, depth) => {
    if (depth > MAX_DEPTH || visited.has(offset)) { report.malformed = true; return null; }
    visited.add(offset);
    if (offset < 8 || offset + 2 > tiff.length) { report.malformed = true; return null; }
    const count = u16(offset), tableEnd = offset + 2 + count * 12;
    if (tableEnd + 4 > tiff.length) { report.malformed = true; return null; }
    entries += count;
    if (entries > MAX_ENTRIES) { report.malformed = true; return null; }
    let valid = 0;
    for (let i = 0; i < count; i++) {
      const at = offset + 2 + i * 12, tag = u16(at), type = u16(at + 2), n = u32(at + 4), width = TYPE_WIDTH[type];
      if (!width) { report.malformed = true; continue; }
      const byteCount = n * width; // ≤ 2^32 · 8: exact in a double
      if (byteCount > 4) { const valueOffset = u32(at + 8); if (valueOffset + byteCount > tiff.length) { report.malformed = true; continue; } }
      valid++;
      if (kind === 'gps') continue;
      if (CAMERA_TAGS.has(tag)) report.camera = true;
      else if (DATE_TAGS.has(tag)) report.date = true;
      else if (OWNER_TAGS.has(tag)) report.owner = true;
      else if (tag === EXIF_IFD && kind === 'ifd0' && (type === 4 || type === 13)) walk(u32(at + 8), 'exif', depth + 1);
      else if (tag === GPS_IFD && kind === 'ifd0' && (type === 4 || type === 13)) { if (walk(u32(at + 8), 'gps', depth + 1) > 0) report.gps = true; }
    }
    if (kind === 'ifd0') { const next = u32(tableEnd); if (next) report.thumbnail = next >= 8 && next + 2 <= tiff.length; }
    return valid;
  };
  walk(u32(4), 'ifd0', 0);
}

function scanPng(bytes, complete) {
  const report = empty('png');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8, chunks = 0;
  while (offset + 8 <= bytes.length) {
    if (++chunks > MAX_SEGMENTS * 8) { report.malformed = true; break; }
    const length = view.getUint32(offset), type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8, end = dataStart + length + 4;
    if (length > 0x7fffffff || end > bytes.length) { if (complete || length > 0x7fffffff) report.malformed = true; break; }
    // Only metadata chunks are checked (and their CRC): pixel data is large and doesn't need it here.
    const meta = { eXIf: 1, tEXt: 1, zTXt: 1, iTXt: 1, iCCP: 1, tIME: 1 }[type];
    if (meta) {
      if (length > MAX_SEGMENT || crc32(bytes.subarray(offset + 4, dataStart + length)) !== view.getUint32(dataStart + length)) { report.malformed = true; offset = end; continue; }
      const data = bytes.subarray(dataStart, dataStart + length);
      if (type === 'eXIf') { report.exif = true; scanTiff(data, report); }
      else if (type === 'iCCP') report.icc = true;
      else if (type === 'tIME') report.date = true;
      else if (type === 'iTXt' && ascii(data, 0, 'XML:com.adobe.xmp\0')) report.xmp = true;
      else report.text = true;
    }
    if (type === 'IEND') break;
    offset = end;
  }
  return report;
}

function scanWebp(bytes, complete) {
  const report = empty('webp');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riffEnd = 8 + view.getUint32(4, true);
  if (riffEnd > bytes.length && complete) report.malformed = true;
  const end = Math.min(riffEnd, bytes.length);
  let offset = 12, chunks = 0;
  while (offset + 8 <= end) {
    if (++chunks > MAX_SEGMENTS) { report.malformed = true; break; }
    const fourcc = String.fromCharCode(...bytes.subarray(offset, offset + 4)), size = view.getUint32(offset + 4, true);
    const dataStart = offset + 8, next = dataStart + size + (size & 1);
    if (dataStart + size > end) { if (complete) report.malformed = true; break; }
    const data = bytes.subarray(dataStart, dataStart + size);
    if (fourcc === 'EXIF') { report.exif = true; scanTiff(ascii(data, 0, 'Exif\0\0') ? data.subarray(6) : data, report); }
    else if (fourcc === 'XMP ') report.xmp = true;
    else if (fourcc === 'ICCP') report.icc = true;
    offset = next;
  }
  return report;
}

/** How much of a file to read for a report: metadata sits before the pixel data in all three formats. */
export const SCAN_BYTES = 1024 * 1024;
/** Reads the start of a Blob and scans it (async: reads the bytes). */
export async function scanBlob(blob) {
  const head = blob.size > SCAN_BYTES ? blob.slice(0, SCAN_BYTES) : blob;
  return scanMetadata(new Uint8Array(await head.arrayBuffer()), { complete: blob.size <= SCAN_BYTES });
}
