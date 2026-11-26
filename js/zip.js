// Store-only ZIP writer (SPEC §4 I). JPEG, PNG and WebP are already compressed, so files are
// stored as they are: local header + data per file, then the central directory. Names are UTF-8.
// No ZIP64, so the archive must stay under 4 GB (headers and directory included) and 65 535 files: past either
// limit it fails with a clear message instead of writing a broken archive.
const MAX_FILES = 0xffff, MAX_BYTES = 0xffffffff;
const tooBig = () => new Error('The ZIP would be over 4 GB. Export fewer photos at once, or choose separate files.');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes, crc = 0) {
  crc ^= 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/** files: File/Blob objects with a `name` (or [{ name, blob }]). Returns a Blob (application/zip). */
export async function createZip(files, date = new Date()) {
  if (files.length > MAX_FILES) throw new Error(`A ZIP holds at most 65,535 files; this export has ${files.length.toLocaleString('en')}. Export fewer photos at once, or choose separate files.`);
  const encoder = new TextEncoder();
  const { time, day } = dosDateTime(date);
  const parts = [], central = [];
  let offset = 0;
  for (const file of files) {
    const blob = file.blob || file;
    const name = encoder.encode(file.name);
    const size = blob.size;
    if (offset + 30 + name.length + size > MAX_BYTES) throw tooBig(); // before reading it: the local header and name count too
    const crc = crc32(new Uint8Array(await blob.arrayBuffer()));
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);  // local file header signature
    local.setUint16(4, 20, true);          // version needed (2.0)
    local.setUint16(6, 0x0800, true);      // flags: UTF-8 names
    local.setUint16(8, 0, true);           // method: stored
    local.setUint16(10, time, true); local.setUint16(12, day, true);
    local.setUint32(14, crc, true); local.setUint32(18, size, true); local.setUint32(22, size, true);
    local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
    parts.push(local.buffer, name, blob);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);  // central directory header signature
    entry.setUint16(4, 20, true); entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true); entry.setUint16(10, 0, true);
    entry.setUint16(12, time, true); entry.setUint16(14, day, true);
    entry.setUint32(16, crc, true); entry.setUint32(20, size, true); entry.setUint32(24, size, true);
    entry.setUint16(28, name.length, true); // extra, comment, disk, internal/external attributes stay 0
    entry.setUint32(42, offset, true);
    central.push(entry.buffer, name);
    offset += 30 + name.length + size;
  }
  const centralSize = central.reduce((sum, part) => sum + part.byteLength, 0);
  if (offset + centralSize + 22 > MAX_BYTES) throw tooBig();
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);      // end of central directory signature
  end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}
