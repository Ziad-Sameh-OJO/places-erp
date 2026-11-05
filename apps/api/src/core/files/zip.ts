import { once } from "node:events";
import type { Writable } from "node:stream";
import { crc32 } from "node:zlib";

/** The time a ZIP entry shows, in its MS-DOS form (2-second steps, from 1980). */
function dosTime(d: Date): [time: number, date: number] {
  return [(d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()];
}

/**
 * A stored (uncompressed) ZIP, written to `out` one entry at a time so only one file is in memory: photos and PDFs are
 * compressed already. Names are UTF-8 (flag bit 11) so Arabic names survive. Returns how many entries it wrote.
 * shortcut: no ZIP64, so under 4 GB and 65k entries in all (a unit folder is ≤ 40 files of ≤ 20 MB); add ZIP64 for bigger ones.
 */
export async function writeZip(out: Writable, entries: AsyncIterable<{ name: string; data: Buffer }>, now = new Date()): Promise<number> {
  const put = async (b: Buffer) => { if (!out.write(b)) await once(out, "drain"); };
  const [time, date] = dosTime(now);
  const dir: Buffer[] = [];
  let offset = 0, count = 0;
  for await (const { name, data } of entries) {
    const n = Buffer.from(name, "utf8"), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(time, 12); central.writeUInt16LE(date, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(offset, 42);
    dir.push(central, n);
    await put(local); await put(n); await put(data);
    offset += 30 + n.length + data.length;
    count++;
  }
  const size = dir.reduce((s, b) => s + b.length, 0), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10); end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
  for (const b of [...dir, end]) await put(b);
  return count;
}
