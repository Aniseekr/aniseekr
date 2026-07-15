import { normalizeAnitabiImageUrl } from './anitabi-image';
import type { AnitabiBangumi, AnitabiPoint, RawAnitabiPoint } from './types';

export const ANITABI_STATIC_CATALOG_URL = 'https://www.anitabi.cn/d/g.json';
export const ANITABI_STATIC_PAGE_URL = (page: number): string =>
  `https://www.anitabi.cn/d/g${page}.json`;

interface StaticCatalogEntry {
  id: number;
  cn: string;
  titleEnglish: string;
  title: string;
  city: string;
  color: string;
  cover: string;
  geo: [number, number];
  zoom: number;
  ordinal: number;
  pointGeos: Map<string, [number, number]>;
}

export interface AnitabiStaticCatalog {
  generatedAt: number;
  pageSize: number;
  entries: StaticCatalogEntry[];
  byId: Map<number, StaticCatalogEntry>;
}

export interface AnitabiStaticDecodedPage {
  page: number;
  anime: AnitabiBangumi;
  points: AnitabiPoint[];
}

export interface AnitabiStaticIndexFile {
  generatedAt: number;
  source: string;
  fallbackUsed: false;
  entries: {
    id: number;
    title: string;
    cn: string;
    titleEnglish?: string;
    city: string;
    cover: string;
    color: string;
    lat: number;
    lng: number;
    zoom: number;
    pointsLength: number;
    builtAt: number;
  }[];
}

/** Decode Anitabi's compact official `/d/g.json` catalog payload. */
export function decodeAnitabiStaticCatalog(payload: unknown): AnitabiStaticCatalog {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    throw new TypeError('Invalid Anitabi static catalog payload');
  }

  const pageSize = finitePositiveInteger(payload[1]);
  const generatedAt = finiteNumber(payload[2]);
  if (pageSize === null || generatedAt === null) {
    throw new TypeError('Invalid Anitabi static catalog metadata');
  }

  const entries: StaticCatalogEntry[] = [];
  const byId = new Map<number, StaticCatalogEntry>();
  for (let ordinal = 0; ordinal < payload[0].length; ordinal += 1) {
    const row = payload[0][ordinal];
    if (!Array.isArray(row)) continue;
    const id = finitePositiveInteger(row[0]);
    const lat = finiteNumber(row[9]);
    const lng = finiteNumber(row[10]);
    if (id === null || lat === null || lng === null) continue;

    const entry: StaticCatalogEntry = {
      id,
      cn: text(row[1]),
      titleEnglish: text(row[2]),
      title: text(row[3]),
      city: text(row[4]),
      color: text(row[5]),
      cover: text(row[6]),
      geo: [lat, lng],
      zoom: finiteNumber(row[11]) ?? 0,
      ordinal,
      pointGeos: decodePointGeos(row[12]),
    };
    entries.push(entry);
    byId.set(id, entry);
  }

  if (entries.length === 0) {
    throw new TypeError('Anitabi static catalog contains no valid entries');
  }
  return { generatedAt, pageSize, entries, byId };
}

/** Convert the catalog to the app's synchronous search/map index shape. */
export function toAnitabiIndexFile(catalog: AnitabiStaticCatalog): AnitabiStaticIndexFile {
  return {
    generatedAt: catalog.generatedAt,
    source: ANITABI_STATIC_CATALOG_URL,
    fallbackUsed: false,
    entries: catalog.entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      cn: entry.cn,
      ...(entry.titleEnglish ? { titleEnglish: entry.titleEnglish } : {}),
      city: entry.city,
      cover: entry.cover,
      color: entry.color,
      lat: entry.geo[0],
      lng: entry.geo[1],
      zoom: entry.zoom,
      pointsLength: entry.pointGeos.size,
      builtAt: catalog.generatedAt,
    })),
  };
}

/**
 * Decode one `/d/g{page}.json` payload and join its point metadata with the
 * coordinates stored compactly in the catalog.
 */
export function decodeAnitabiStaticPage(
  catalog: AnitabiStaticCatalog,
  payload: unknown,
  bangumiId: number
): AnitabiStaticDecodedPage {
  const entry = catalog.byId.get(bangumiId);
  if (!entry) throw new TypeError(`Anitabi static catalog has no entry for ${bangumiId}`);
  if (!Array.isArray(payload)) throw new TypeError('Invalid Anitabi static page payload');

  const expectedRow = payload[entry.ordinal % catalog.pageSize];
  const row =
    Array.isArray(expectedRow) && Number(expectedRow[0]) === bangumiId
      ? expectedRow
      : payload.find((candidate) => Array.isArray(candidate) && Number(candidate[0]) === bangumiId);
  if (!Array.isArray(row) || !Array.isArray(row[2])) {
    throw new TypeError(`Anitabi static page has no detail row for ${bangumiId}`);
  }

  const rawPoints = row[2]
    .map((point) => decodePoint(point, entry.pointGeos))
    .filter((point): point is RawAnitabiPoint => point !== null);
  const points = normalizeStaticPoints(rawPoints, bangumiId);
  const modified = finiteNumber(row[3]) ?? catalog.generatedAt;

  return {
    page: Math.floor(entry.ordinal / catalog.pageSize),
    anime: {
      id: entry.id,
      cn: entry.cn,
      title: entry.title,
      city: entry.city,
      cover: normalizeAnitabiImageUrl(entry.cover, entry.id),
      color: entry.color,
      geo: entry.geo,
      zoom: entry.zoom,
      modified,
      litePoints: points.slice(0, 10),
      pointsLength: entry.pointGeos.size,
      imagesLength: points.length,
    },
    points,
  };
}

export function getAnitabiStaticPage(
  catalog: AnitabiStaticCatalog,
  bangumiId: number
): number | null {
  const entry = catalog.byId.get(bangumiId);
  return entry ? Math.floor(entry.ordinal / catalog.pageSize) : null;
}

function decodePointGeos(value: unknown): Map<string, [number, number]> {
  const geos = new Map<string, [number, number]>();
  if (!Array.isArray(value)) return geos;
  for (let index = 0; index + 3 < value.length; index += 4) {
    const id = pointId(value[index]);
    const lat = finiteNumber(value[index + 1]);
    const lng = finiteNumber(value[index + 2]);
    if (id && lat !== null && lng !== null) geos.set(id, [lat, lng]);
  }
  return geos;
}

function decodePoint(
  value: unknown,
  pointGeos: ReadonlyMap<string, [number, number]>
): RawAnitabiPoint | null {
  if (!Array.isArray(value)) return null;
  const id = pointId(value[0]);
  if (!id) return null;
  const fid = pointId(value[7]);
  return {
    id,
    name: text(value[1]),
    cn: text(value[2]),
    isFolder: value[3] === true || value[3] === 1,
    image: text(value[6]),
    ...(fid ? { fid } : {}),
    ep: value[8],
    s: value[9],
    geo: pointGeos.get(id) ?? [0, 0],
    origin: text(value[11]),
    originURL: text(value[12]),
  };
}

function normalizeStaticPoints(raw: readonly RawAnitabiPoint[], bangumiId: number): AnitabiPoint[] {
  const points: AnitabiPoint[] = [];
  for (const point of raw) {
    const id = text(point.id);
    const name = text(point.name);
    const image = text(point.image);
    if (!id || !name || !image) continue;
    const geo = Array.isArray(point.geo) ? point.geo : [];
    const lat = finiteNumber(geo[0]) ?? 0;
    const lng = finiteNumber(geo[1]) ?? 0;
    points.push({
      id,
      name,
      ...(text(point.cn) ? { cn: text(point.cn) } : {}),
      image: normalizeAnitabiImageUrl(image, bangumiId),
      ep: finiteNumber(point.ep) ?? 0,
      s: finiteNumber(point.s) ?? 0,
      geo: [lat, lng],
      ...(text(point.fid) ? { fid: text(point.fid) } : {}),
      ...(point.isFolder === true ? { isFolder: true } : {}),
      ...(text(point.origin) ? { origin: text(point.origin) } : {}),
      ...(text(point.originURL) ? { originURL: text(point.originURL) } : {}),
    });
  }
  return points;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function pointId(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value) && value !== 0) return String(value);
  return '';
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function finitePositiveInteger(value: unknown): number | null {
  const number = finiteNumber(value);
  if (number === null || number <= 0) return null;
  return Math.floor(number);
}
