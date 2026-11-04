import { describe, expect, it } from 'bun:test';

import {
  parseExifDateTime,
  readPhotoPlaceTime,
} from '../../../libs/services/pilgrimage/photo-exif';

describe('readPhotoPlaceTime', () => {
  it('signs iOS {GPS} coordinates by their refs', () => {
    const r = readPhotoPlaceTime({
      '{GPS}': { Latitude: 33.9, LatitudeRef: 'S', Longitude: 151.2, LongitudeRef: 'E' },
    });
    expect(r.latitude).toBe(-33.9);
    expect(r.longitude).toBe(151.2);
  });

  it('keeps Android flat, already-signed values without negating twice', () => {
    const r = readPhotoPlaceTime({ GPSLatitude: -33.9, GPSLatitudeRef: 'S', GPSLongitude: -70.6 });
    expect(r.latitude).toBe(-33.9);
    expect(r.longitude).toBe(-70.6);
  });

  it('treats 0,0 and missing GPS as unknown, not a place', () => {
    expect(readPhotoPlaceTime({ GPSLatitude: 0, GPSLongitude: 0 }).latitude).toBeNull();
    expect(readPhotoPlaceTime({}).longitude).toBeNull();
    expect(readPhotoPlaceTime(undefined).takenAt).toBeNull();
  });

  it('reads DateTimeOriginal with its offset', () => {
    const r = readPhotoPlaceTime({
      '{Exif}': { DateTimeOriginal: '2026:11:03 14:05:09', OffsetTimeOriginal: '+09:00' },
    });
    expect(r.takenAt).toBe(Date.UTC(2026, 10, 3, 5, 5, 9));
  });
});

describe('parseExifDateTime', () => {
  it('rejects malformed and impossible dates', () => {
    expect(parseExifDateTime('0000:00:00 00:00:00')).toBeNull();
    expect(parseExifDateTime('2026-11-03')).toBeNull();
    expect(parseExifDateTime(42)).toBeNull();
  });
});
