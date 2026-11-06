// Read where and when a picked photo was taken from the EXIF dictionary the
// image picker hands back. iOS nests tags ({GPS}, {Exif}); Android flattens
// them and already signs the coordinates. Rule 8: a missing or zeroed tag is
// "unknown", never a default.

export interface PhotoPlaceTime {
  latitude: number | null;
  longitude: number | null;
  /** epoch ms; null when the photo carries no capture time. */
  takenAt: number | null;
}

type Dict = Record<string, unknown>;

function asDict(value: unknown): Dict | null {
  return value && typeof value === 'object' ? (value as Dict) : null;
}

function asNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function signed(value: number | null, ref: unknown, negativeRef: 'S' | 'W'): number | null {
  if (value === null) return null;
  return typeof ref === 'string' && ref.toUpperCase() === negativeRef && value > 0 ? -value : value;
}

const EXIF_DATE = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;
const OFFSET = /^[+-]\d{2}:\d{2}$/;

/** `YYYY:MM:DD HH:MM:SS` (+ optional `±HH:MM` offset) → epoch ms. */
export function parseExifDateTime(raw: unknown, offset?: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = EXIF_DATE.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  if (typeof offset === 'string' && OFFSET.test(offset)) {
    const ms = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${offset}`);
    return Number.isFinite(ms) ? ms : null;
  }
  // No offset tag: the camera wrote wall-clock time; read it in the phone's zone.
  const ms = new Date(y, mo - 1, d, h, mi, s).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function readPhotoPlaceTime(exif: unknown): PhotoPlaceTime {
  const root = asDict(exif) ?? {};
  const gps = asDict(root['{GPS}']);
  const exifDict = asDict(root['{Exif}']) ?? root;

  const latitude = gps
    ? signed(asNumber(gps.Latitude), gps.LatitudeRef, 'S')
    : signed(asNumber(root.GPSLatitude), root.GPSLatitudeRef, 'S');
  const longitude = gps
    ? signed(asNumber(gps.Longitude), gps.LongitudeRef, 'W')
    : signed(asNumber(root.GPSLongitude), root.GPSLongitudeRef, 'W');
  const valid =
    latitude !== null &&
    longitude !== null &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    !(latitude === 0 && longitude === 0);

  const takenAt =
    parseExifDateTime(exifDict.DateTimeOriginal, exifDict.OffsetTimeOriginal) ??
    parseExifDateTime(root.DateTime ?? asDict(root['{TIFF}'])?.DateTime, exifDict.OffsetTime);

  return {
    latitude: valid ? latitude : null,
    longitude: valid ? longitude : null,
    takenAt,
  };
}
