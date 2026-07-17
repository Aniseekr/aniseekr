import { formatCoordinate, isFiniteCoordinate } from './coords';

const MAPILLARY_BASE_URL = 'https://graph.mapillary.com/images';
const SEARCH_RADIUS_M = 50;
const BBOX_DELTA_DEGREES = 0.0025;
const MAPILLARY_FIELDS = [
  'id',
  'thumb_1024_url',
  'geometry',
  'computed_geometry',
  'compass_angle',
  'is_pano',
  'quality_score',
  'captured_at',
].join(',');

const EARTH_RADIUS_M = 6_371_000;

export interface MapillaryImage {
  id: string;
  thumb1024Url: string;
  latitude: number;
  longitude: number;
  compassAngle: number | null;
  isPano: boolean;
  qualityScore: number | null;
  capturedAt: string | null;
  distanceMeters: number;
}

export interface MapillaryClientOptions {
  fetchImpl?: typeof fetch;
  token?: string;
  timeoutMs?: number;
}

interface FetchOutcome {
  images: MapillaryImage[];
}

export class MapillaryClient {
  static async findNearbyImages(
    latitude: number,
    longitude: number,
    opts: MapillaryClientOptions = {}
  ): Promise<MapillaryImage[] | null> {
    if (!isFiniteCoordinate(latitude, longitude)) return null;

    const token = (opts.token ?? process.env.EXPO_PUBLIC_MAPILLARY_TOKEN ?? '').trim();
    if (!token) return null;

    const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') return null;

    const radius = await fetchMapillaryImages(
      buildRadiusUrl(latitude, longitude, token),
      latitude,
      longitude,
      fetchImpl,
      opts.timeoutMs
    );
    if (!radius) return null;
    if (radius.images.length > 0) return sortImages(radius.images);

    const bbox = await fetchMapillaryImages(
      buildBboxUrl(latitude, longitude, token),
      latitude,
      longitude,
      fetchImpl,
      opts.timeoutMs
    );
    if (!bbox) return null;
    // Empty array = both queries answered and there is genuinely no imagery
    // here — callers cache that miss, unlike null (error / no token).
    return sortImages(bbox.images);
  }
}

async function fetchMapillaryImages(
  url: string,
  latitude: number,
  longitude: number,
  fetchImpl: typeof fetch,
  timeoutMs = 15_000
): Promise<FetchOutcome | null> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const timer =
    controller !== undefined && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : undefined;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller?.signal,
    });
  } catch {
    if (timer !== undefined) clearTimeout(timer);
    return null;
  }
  if (timer !== undefined) clearTimeout(timer);

  if (!response.ok) return null;

  try {
    const payload = (await response.json()) as unknown;
    return parseMapillaryPayload(payload, latitude, longitude);
  } catch {
    return null;
  }
}

function parseMapillaryPayload(
  payload: unknown,
  latitude: number,
  longitude: number
): FetchOutcome | null {
  const record = asRecord(payload);
  if (!record || !Array.isArray(record.data)) return null;

  const images: MapillaryImage[] = [];
  for (const item of record.data) {
    const parsed = parseMapillaryImage(item, latitude, longitude);
    if (parsed) images.push(parsed);
  }

  return { images };
}

function parseMapillaryImage(
  value: unknown,
  targetLatitude: number,
  targetLongitude: number
): MapillaryImage | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = stringOrNull(record.id);
  const thumb1024Url = stringOrNull(record.thumb_1024_url);
  if (!id || !thumb1024Url) return null;

  const coordinate = pointCoordinate(record.geometry) ?? pointCoordinate(record.computed_geometry);
  if (!coordinate) return null;

  return {
    id,
    thumb1024Url,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    compassAngle: finiteNumberOrNull(record.compass_angle),
    isPano: record.is_pano === true,
    qualityScore: finiteNumberOrNull(record.quality_score),
    capturedAt: stringOrNull(record.captured_at),
    distanceMeters: distanceMeters(
      [targetLatitude, targetLongitude],
      [coordinate.latitude, coordinate.longitude]
    ),
  };
}

function buildRadiusUrl(latitude: number, longitude: number, token: string): string {
  const url = new URL(MAPILLARY_BASE_URL);
  url.searchParams.set('fields', MAPILLARY_FIELDS);
  url.searchParams.set('lat', formatCoordinate(latitude));
  url.searchParams.set('lng', formatCoordinate(longitude));
  url.searchParams.set('radius', String(SEARCH_RADIUS_M));
  url.searchParams.set('access_token', token);
  return url.toString();
}

function buildBboxUrl(latitude: number, longitude: number, token: string): string {
  const west = longitude - BBOX_DELTA_DEGREES;
  const south = latitude - BBOX_DELTA_DEGREES;
  const east = longitude + BBOX_DELTA_DEGREES;
  const north = latitude + BBOX_DELTA_DEGREES;

  const url = new URL(MAPILLARY_BASE_URL);
  url.searchParams.set('fields', MAPILLARY_FIELDS);
  url.searchParams.set(
    'bbox',
    [west, south, east, north].map((coord) => formatCoordinate(coord)).join(',')
  );
  url.searchParams.set('access_token', token);
  return url.toString();
}

function sortImages(images: MapillaryImage[]): MapillaryImage[] {
  return [...images].sort((a, b) => {
    const distance = a.distanceMeters - b.distanceMeters;
    if (distance !== 0) return distance;

    const quality =
      (b.qualityScore ?? Number.NEGATIVE_INFINITY) - (a.qualityScore ?? Number.NEGATIVE_INFINITY);
    if (quality !== 0) return quality;

    if (a.isPano !== b.isPano) return a.isPano ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

function pointCoordinate(value: unknown): { latitude: number; longitude: number } | null {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.coordinates) || record.coordinates.length < 2) return null;
  const longitude = Number(record.coordinates[0]);
  const latitude = Number(record.coordinates[1]);
  return isFiniteCoordinate(latitude, longitude) ? { latitude, longitude } : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function finiteNumberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function distanceMeters(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
