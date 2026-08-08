// ---------------------------------------------------------------------------
// Minimal ZIP writer (store-only, no compression).
//
// A .docx is a ZIP archive of XML parts. Rather than pull in a compression
// library for one feature, this writes the archive directly using STORED
// entries — permitted by the ZIP spec and read correctly by Word, Pages,
// LibreOffice and Google Docs. Notices are a few kilobytes of XML, so the
// bytes saved by DEFLATE would not be worth a dependency.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  /** Path within the archive, e.g. "word/document.xml". */
  name: string
  data: Uint8Array
}

/** Encodes a Date as the DOS time/date pair ZIP headers use. */
function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

class ByteWriter {
  private chunks: Uint8Array[] = []
  length = 0

  push(bytes: Uint8Array) {
    this.chunks.push(bytes)
    this.length += bytes.length
  }

  u16(n: number) {
    this.push(new Uint8Array([n & 0xff, (n >>> 8) & 0xff]))
  }

  u32(n: number) {
    this.push(new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]))
  }

  toUint8Array(): Uint8Array {
    const out = new Uint8Array(this.length)
    let offset = 0
    for (const c of this.chunks) {
      out.set(c, offset)
      offset += c.length
    }
    return out
  }
}

/** Builds a ZIP archive from the given entries. */
export function makeZip(entries: ZipEntry[], now = new Date()): Uint8Array {
  const encoder = new TextEncoder()
  const { time, date } = dosDateTime(now)
  const body = new ByteWriter()
  const central = new ByteWriter()

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const offset = body.length

    // --- Local file header ---
    body.u32(0x04034b50)
    body.u16(20) // version needed
    body.u16(0x0800) // UTF-8 filenames
    body.u16(0) // stored
    body.u16(time)
    body.u16(date)
    body.u32(crc)
    body.u32(entry.data.length) // compressed size == uncompressed (stored)
    body.u32(entry.data.length)
    body.u16(nameBytes.length)
    body.u16(0) // extra field length
    body.push(nameBytes)
    body.push(entry.data)

    // --- Central directory header ---
    central.u32(0x02014b50)
    central.u16(20) // version made by
    central.u16(20) // version needed
    central.u16(0x0800)
    central.u16(0)
    central.u16(time)
    central.u16(date)
    central.u32(crc)
    central.u32(entry.data.length)
    central.u32(entry.data.length)
    central.u16(nameBytes.length)
    central.u16(0) // extra
    central.u16(0) // comment
    central.u16(0) // disk number start
    central.u16(0) // internal attributes
    central.u32(0) // external attributes
    central.u32(offset)
    central.push(nameBytes)
  }

  // --- End of central directory ---
  const end = new ByteWriter()
  end.u32(0x06054b50)
  end.u16(0) // this disk
  end.u16(0) // disk with central directory
  end.u16(entries.length)
  end.u16(entries.length)
  end.u32(central.length)
  end.u32(body.length)
  end.u16(0) // comment length

  const out = new Uint8Array(body.length + central.length + end.length)
  out.set(body.toUint8Array(), 0)
  out.set(central.toUint8Array(), body.length)
  out.set(end.toUint8Array(), body.length + central.length)
  return out
}
