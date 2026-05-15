import { describe, expect, it } from 'bun:test';
import * as piexif from 'piexif-ts';
import {
  bytesToBinaryString,
  binaryStringToBytes,
  flatExifToIExif,
} from '../../libs/utils/exif-embed';

const { TagValues } = piexif;

// Build a minimal valid JPEG: SOI + SOS-marker scan data + EOI. piexif's
// splitIntoSegments accepts this shape because, once it sees the SOS marker
// (0xFFDA), it captures the remainder of the buffer as a single segment.
function buildMinimalJpeg(): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8, // SOI
    0xff,
    0xda, // SOS marker
    0x00,
    0x08, // segment length (placeholder; piexif tolerates trailing scan data)
    0x01,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x11,
    0x22,
    0x33,
    0x44,
    0x55,
    0xff,
    0xd9, // EOI
  ]);
}

function findApp1Offset(bytes: Uint8Array): number | null {
  // APP1 marker = 0xFFE1, immediately after SOI typically.
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xe1) return i;
  }
  return null;
}

describe('bytesToBinaryString / binaryStringToBytes', () => {
  it('round-trips arbitrary bytes including high values and zeros', () => {
    const original = new Uint8Array([0x00, 0xff, 0x7f, 0x80, 0x01, 0xfe]);
    const bin = bytesToBinaryString(original);
    const back = binaryStringToBytes(bin);
    expect(back.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(back[i]).toBe(original[i]);
    }
  });

  it('handles a buffer larger than the 0x8000-byte chunk boundary', () => {
    const big = new Uint8Array(0x8000 + 17);
    for (let i = 0; i < big.length; i++) big[i] = i & 0xff;
    const back = binaryStringToBytes(bytesToBinaryString(big));
    expect(back.length).toBe(big.length);
    expect(back[0]).toBe(0);
    expect(back[0x7fff]).toBe(0x7fff & 0xff);
    expect(back[back.length - 1]).toBe((big.length - 1) & 0xff);
  });
});

describe('flatExifToIExif', () => {
  it('maps Software / Artist into the 0th IFD', () => {
    const out = flatExifToIExif({ Software: 'Aniseekr', Artist: 'Aniseekr Pilgrimage' });
    expect(out['0th']).toBeDefined();
    expect(out['0th']![TagValues.ImageIFD.Software]).toBe('Aniseekr');
    expect(out['0th']![TagValues.ImageIFD.Artist]).toBe('Aniseekr Pilgrimage');
  });

  it('maps DateTimeOriginal and UserComment into the Exif IFD', () => {
    const out = flatExifToIExif({
      DateTimeOriginal: '2026:05:15 12:34:56',
      UserComment: '{"spotId":"x"}',
    });
    expect(out.Exif).toBeDefined();
    expect(out.Exif![TagValues.ExifIFD.DateTimeOriginal]).toBe('2026:05:15 12:34:56');
    expect(out.Exif![TagValues.ExifIFD.UserComment]).toBe('{"spotId":"x"}');
  });

  it('maps GPS fields, coercing GPSLatitude/Longitude to DMS rationals', () => {
    const out = flatExifToIExif({
      GPSLatitude: 35.0,
      GPSLatitudeRef: 'N',
      GPSLongitude: 135.5,
      GPSLongitudeRef: 'E',
      GPSAltitude: 12.345,
      GPSImgDirection: 180,
      GPSImgDirectionRef: 'T',
    });
    expect(out.GPS).toBeDefined();
    const gps = out.GPS!;
    // Latitude is now an array of [num, den] pairs (DMS rational).
    const lat = gps[TagValues.GPSIFD.GPSLatitude];
    expect(Array.isArray(lat)).toBe(true);
    expect(Array.isArray(lat[0])).toBe(true);
    expect(lat[0][0]).toBeGreaterThanOrEqual(0);
    expect(gps[TagValues.GPSIFD.GPSLatitudeRef]).toBe('N');
    const lng = gps[TagValues.GPSIFD.GPSLongitude];
    expect(Array.isArray(lng)).toBe(true);
    expect(gps[TagValues.GPSIFD.GPSLongitudeRef]).toBe('E');
    // Scalar rationals — [value*1000, 1000].
    const alt = gps[TagValues.GPSIFD.GPSAltitude];
    expect(Array.isArray(alt)).toBe(true);
    expect(alt[1]).toBe(1000);
    expect(alt[0]).toBe(Math.round(12.345 * 1000));
    expect(gps[TagValues.GPSIFD.GPSImgDirectionRef]).toBe('T');
  });

  it('drops unknown keys and ignores null/undefined values', () => {
    const out = flatExifToIExif({
      UnknownVendorTag: 'whatever',
      Software: 'Aniseekr',
      GPSLatitude: undefined,
      GPSLongitude: null,
    });
    expect(out['0th']).toBeDefined();
    expect(out['0th']![TagValues.ImageIFD.Software]).toBe('Aniseekr');
    expect(out.GPS).toBeUndefined();
  });

  it('accepts already-nested input ({ "0th": {...}, GPS: {...} })', () => {
    const out = flatExifToIExif({
      '0th': { [TagValues.ImageIFD.Software]: 'X' },
      Exif: { [TagValues.ExifIFD.DateTimeOriginal]: '2026:05:15 00:00:00' },
    });
    expect(out['0th']![TagValues.ImageIFD.Software]).toBe('X');
    expect(out.Exif![TagValues.ExifIFD.DateTimeOriginal]).toBe('2026:05:15 00:00:00');
  });

  it('returns an empty IExif for empty input', () => {
    const out = flatExifToIExif({});
    expect(out['0th']).toBeUndefined();
    expect(out.Exif).toBeUndefined();
    expect(out.GPS).toBeUndefined();
  });
});

describe('piexif round-trip through dump → insert → load', () => {
  // Validates the byte-level contract that embedExifIntoJpegFile relies on:
  // a flat EXIF object survives encoding, splicing into a JPEG, and re-parsing.
  it('emits an APP1 segment in the output JPEG and round-trips key tags', () => {
    const jpegBytes = buildMinimalJpeg();
    const jpegBinary = bytesToBinaryString(jpegBytes);
    expect(findApp1Offset(jpegBytes)).toBeNull();

    const iexif = flatExifToIExif({
      Software: 'Aniseekr',
      Artist: 'Aniseekr Pilgrimage',
      DateTimeOriginal: '2026:05:15 12:34:56',
      UserComment: '{"spotId":"spot-1","spotName":"修学院駅"}',
      GPSLatitude: 35.0,
      GPSLatitudeRef: 'N',
      GPSLongitude: 135.5,
      GPSLongitudeRef: 'E',
    });

    const exifBinary = piexif.dump(iexif);
    const merged = piexif.insert(exifBinary, jpegBinary);
    const mergedBytes = binaryStringToBytes(merged);

    // Output must still be a valid JPEG (starts with SOI) and now contain APP1.
    expect(mergedBytes[0]).toBe(0xff);
    expect(mergedBytes[1]).toBe(0xd8);
    const app1 = findApp1Offset(mergedBytes);
    expect(app1).not.toBeNull();
    // APP1 length lives in the two bytes after the marker; sanity check it
    // covers at least the "Exif\0\0" header (>= 8 bytes).
    const app1Length = (mergedBytes[app1! + 2] << 8) | mergedBytes[app1! + 3];
    expect(app1Length).toBeGreaterThanOrEqual(8);
    // "Exif\0\0" identifier right after marker+length.
    expect(String.fromCharCode(mergedBytes[app1! + 4])).toBe('E');
    expect(String.fromCharCode(mergedBytes[app1! + 5])).toBe('x');
    expect(String.fromCharCode(mergedBytes[app1! + 6])).toBe('i');
    expect(String.fromCharCode(mergedBytes[app1! + 7])).toBe('f');

    // Parse back and verify the key tags survived.
    const loaded = piexif.load(merged);
    expect(loaded['0th']).toBeDefined();
    expect(loaded['0th']![TagValues.ImageIFD.Software]).toBe('Aniseekr');
    expect(loaded['0th']![TagValues.ImageIFD.Artist]).toBe('Aniseekr Pilgrimage');
    expect(loaded.Exif).toBeDefined();
    expect(loaded.Exif![TagValues.ExifIFD.DateTimeOriginal]).toBe('2026:05:15 12:34:56');
    expect(loaded.Exif![TagValues.ExifIFD.UserComment]).toBe(
      '{"spotId":"spot-1","spotName":"修学院駅"}'
    );
    expect(loaded.GPS).toBeDefined();
    expect(loaded.GPS![TagValues.GPSIFD.GPSLatitudeRef]).toBe('N');
    expect(loaded.GPS![TagValues.GPSIFD.GPSLongitudeRef]).toBe('E');
  });

  it('replaces an existing APP1 segment rather than appending a second one', () => {
    const jpegBytes = buildMinimalJpeg();
    const jpegBinary = bytesToBinaryString(jpegBytes);

    const firstDump = piexif.dump(flatExifToIExif({ Software: 'First' }));
    const once = piexif.insert(firstDump, jpegBinary);

    const secondDump = piexif.dump(flatExifToIExif({ Software: 'Second' }));
    const twice = piexif.insert(secondDump, once);
    const twiceBytes = binaryStringToBytes(twice);

    // Count APP1 occurrences — should be exactly one.
    let count = 0;
    for (let i = 0; i < twiceBytes.length - 1; i++) {
      if (twiceBytes[i] === 0xff && twiceBytes[i + 1] === 0xe1) count++;
    }
    expect(count).toBe(1);

    const reloaded = piexif.load(twice);
    expect(reloaded['0th']![TagValues.ImageIFD.Software]).toBe('Second');
  });
});
