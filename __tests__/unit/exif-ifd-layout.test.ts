// Regression: piexif-ts wrote the Exif and GPS IFDs without their 4-byte
// next-IFD offset, so the first value overlapped where a strict reader expects
// that offset. Android's ExifInterface then dropped the GPS of every photo the
// camera saved (and of anything re-imported from the gallery). Patched in
// patches/piexif-ts@2.1.0.patch.
import { describe, expect, it } from 'bun:test';
import piexif from 'piexif-ts';

function tiffOf(exifBinary: string): Uint8Array {
  const bytes = Uint8Array.from(exifBinary, (c) => c.charCodeAt(0));
  // dump() returns "Exif\0\0" + TIFF.
  return bytes.slice(6);
}

const u16 = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
const u32 = (b: Uint8Array, o: number) =>
  ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;

function ifdLayout(tiff: Uint8Array, offset: number) {
  const count = u16(tiff, offset);
  const end = offset + 2 + count * 12;
  const entries = Array.from({ length: count }, (_, i) => {
    const at = offset + 2 + i * 12;
    return {
      tag: u16(tiff, at),
      type: u16(tiff, at + 2),
      count: u32(tiff, at + 4),
      value: u32(tiff, at + 8),
    };
  });
  return { entries, next: u32(tiff, end), end: end + 4 };
}

describe('piexif-ts IFD layout', () => {
  it('ends Exif and GPS IFDs with a zero next offset and keeps values past it', () => {
    const { ExifIFD, GPSIFD } = piexif.TagValues;
    const tiff = tiffOf(
      piexif.dump({
        '0th': {},
        Exif: { [ExifIFD.DateTimeOriginal]: '2026:11:01 10:12:00' },
        GPS: {
          [GPSIFD.GPSLatitudeRef]: 'N',
          [GPSIFD.GPSLatitude]: [
            [34, 1],
            [50, 1],
            [182616, 10000],
          ],
          [GPSIFD.GPSLongitudeRef]: 'E',
          [GPSIFD.GPSLongitude]: [
            [137, 1],
            [58, 1],
            [178284, 10000],
          ],
        },
      })
    );
    const zeroth = ifdLayout(tiff, u32(tiff, 4));
    const pointer = (tag: number) => zeroth.entries.find((e) => e.tag === tag)!.value;

    for (const tag of [0x8769, 0x8825]) {
      const ifd = ifdLayout(tiff, pointer(tag));
      expect(ifd.next).toBe(0);
      for (const entry of ifd.entries) {
        const size = entry.type === 5 ? 8 * entry.count : entry.type === 2 ? entry.count : 0;
        if (size > 4) expect(entry.value).toBeGreaterThanOrEqual(ifd.end);
      }
    }
  });
});
