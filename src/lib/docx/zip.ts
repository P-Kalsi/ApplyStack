// Minimal ZIP reader/writer for .docx files (server-side only).
//
// A .docx is a ZIP archive. ApplyStack only ever replaces word/document.xml,
// so the writer passes every other entry through byte-for-byte (same
// compressed bytes, same CRC), which keeps fonts, styles, numbering and
// relationships exactly as the user's template had them.
//
// Supports stored (0) and deflate (8) entries. ZIP64 is not supported; a
// resume template never comes close to 4 GB.

import { deflateRawSync, inflateRawSync } from "node:zlib";

export interface ZipEntry {
  name: string;
  method: number; // 0 = stored, 8 = deflate
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  dosTime: number;
  dosDate: number;
  flags: number;
  /** Raw (still compressed) bytes, exactly as stored in the archive. */
  compressed: Buffer;
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

let CRC_TABLE: Uint32Array | null = null;

export function crc32(buf: Buffer): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function findEocd(buf: Buffer): number {
  // EOCD is 22 bytes plus an optional comment of up to 65535 bytes.
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  throw new Error("Not a ZIP file (end of central directory not found).");
}

export function readZip(buf: Buffer): ZipEntry[] {
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (cdOffset === 0xffffffff || count === 0xffff) {
    throw new Error("ZIP64 archives are not supported.");
  }

  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== SIG_CENTRAL) throw new Error("Corrupt ZIP central directory.");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const dosTime = buf.readUInt16LE(p + 12);
    const dosDate = buf.readUInt16LE(p + 14);
    const crc = buf.readUInt32LE(p + 16);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    if (buf.readUInt32LE(localOffset) !== SIG_LOCAL) throw new Error(`Corrupt ZIP local header for ${name}.`);
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;

    entries.push({
      name,
      method,
      crc32: crc,
      compressedSize,
      uncompressedSize,
      dosTime,
      dosDate,
      flags,
      compressed: buf.subarray(dataStart, dataStart + compressedSize),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export function entryData(entry: ZipEntry): Buffer {
  if (entry.method === 0) return Buffer.from(entry.compressed);
  if (entry.method === 8) return inflateRawSync(entry.compressed);
  throw new Error(`Unsupported ZIP compression method ${entry.method} for ${entry.name}.`);
}

/** Build a replacement entry with new uncompressed content (deflated). */
export function makeEntry(template: ZipEntry, data: Buffer): ZipEntry {
  const compressed = deflateRawSync(data);
  return {
    name: template.name,
    method: 8,
    crc32: crc32(data),
    compressedSize: compressed.length,
    uncompressedSize: data.length,
    dosTime: template.dosTime,
    dosDate: template.dosDate,
    flags: template.flags & 0x0800, // keep only the UTF-8 name flag; sizes are in the local header
    compressed,
  };
}

export function writeZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const flags = e.flags & ~0x0008; // never write data descriptors
    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(e.method, 8);
    local.writeUInt16LE(e.dosTime, 10);
    local.writeUInt16LE(e.dosDate, 12);
    local.writeUInt32LE(e.crc32, 14);
    local.writeUInt32LE(e.compressedSize, 18);
    local.writeUInt32LE(e.uncompressedSize, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIG_CENTRAL, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(e.method, 10);
    central.writeUInt16LE(e.dosTime, 12);
    central.writeUInt16LE(e.dosDate, 14);
    central.writeUInt32LE(e.crc32, 16);
    central.writeUInt32LE(e.compressedSize, 20);
    central.writeUInt32LE(e.uncompressedSize, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    locals.push(local, name, e.compressed);
    centrals.push(central, name);
    offset += local.length + name.length + e.compressed.length;
  }

  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, cd, eocd]);
}

export const DOCUMENT_XML = "word/document.xml";

/** Pull word/document.xml out of a .docx buffer. */
export function readDocumentXml(docx: Buffer): string {
  const entry = readZip(docx).find((e) => e.name === DOCUMENT_XML);
  if (!entry) throw new Error("Not a Word document (word/document.xml is missing).");
  return entryData(entry).toString("utf8");
}

/** Rebuild a .docx with a new word/document.xml; every other part is untouched. */
export function replaceDocumentXml(templateDocx: Buffer, documentXml: string): Buffer {
  const entries = readZip(templateDocx).map((e) =>
    e.name === DOCUMENT_XML ? makeEntry(e, Buffer.from(documentXml, "utf8")) : e
  );
  if (!entries.some((e) => e.name === DOCUMENT_XML)) {
    throw new Error("Template is missing word/document.xml.");
  }
  return writeZip(entries);
}
