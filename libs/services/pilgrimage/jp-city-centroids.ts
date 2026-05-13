// Offline lookup of Japanese city centroids used to drop one map pin per
// (anime × city) row in the Anime Tourism 88 dataset.
//
// Source: Nominatim (OpenStreetMap). Regenerate with
// `bun run scripts/build-jp-city-centroids.ts` after refreshing the 88
// dataset, since the unique city list is keyed off it.

import centroidsJson from './jp-city-centroids.data.json';

export interface JpCityCentroid {
  prefecture: string;
  city: string;
  lat: number;
  lng: number;
  queryUsed: string;
  source: 'nominatim' | 'manual';
  displayName?: string;
}

interface CentroidsFile {
  generatedAt: string;
  source: string;
  count: number;
  entries: JpCityCentroid[];
  failures: { prefecture: string; city: string }[];
}

const DATA = centroidsJson as unknown as CentroidsFile;

const INDEX: ReadonlyMap<string, JpCityCentroid> = (() => {
  const m = new Map<string, JpCityCentroid>();
  for (const e of DATA.entries) m.set(`${e.prefecture}\t${e.city}`, e);
  return m;
})();

/** Centroid for a (prefecture, city) pair, or null when not in the table. */
export function getCityCentroid(
  prefecture: string | null | undefined,
  city: string | null | undefined
): JpCityCentroid | null {
  if (!prefecture || !city) return null;
  return INDEX.get(`${prefecture}\t${city}`) ?? null;
}

/** All entries — useful for diagnostics. Do NOT mutate. */
export function getAllCityCentroids(): readonly JpCityCentroid[] {
  return DATA.entries;
}
