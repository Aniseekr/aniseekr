// Offline lookup for the Japanese Anime Tourism 88 (animetourism88.com) annual
// selection. Pure module: reads the bundled JSON, no network.
//
// The 88 selection is anime × city; one anime may appear in several rows
// (e.g. ゆるキャン△ × 6 cities). `get88EntriesByBangumiId` returns every row
// for an anime, while `getUnique88Anime` collapses them into one card per
// anime with its location list.
//
// Regenerate with: `bun run scripts/build-anime-tourism-88.ts`.

import { getCityCentroid, getPrefectureAreaAnchor } from './jp-city-centroids';
import { localityRepository } from './locality/locality-repository';
import type { LocalityRepository } from './locality/repository';
import type { AreaDestination, PlaceId } from './locality/types';

export const ANIME_TOURISM_88_REGIONS = [
  'hokkaido_tohoku',
  'kanto',
  'tokyo',
  'chubu',
  'kinki',
  'chugoku_shikoku',
  'kyushu_okinawa',
] as const;

export type AnimeTourism88Region = (typeof ANIME_TOURISM_88_REGIONS)[number];

export interface AnimeTourism88ExternalIds {
  bangumi: number | null;
  anilist: number | null;
  mal: number | null;
}

export interface AnimeTourism88Entry {
  /** Sequential id within the year's list (1..N). */
  id: number;
  /** Edition year, e.g. 2025. */
  year: number;
  /** Japanese title (canonical). */
  titleJa: string;
  /** English title from the EN edition page. */
  titleEn: string;
  /** Region group used by animetourism88.com (Tokyo is split from Kanto). */
  region: AnimeTourism88Region;
  /** Japanese prefecture, e.g. "東京都" / "京都府" / "北海道". */
  prefecture: string;
  /** City/ward/town within the prefecture, e.g. "世田谷区" / "函館市". */
  city: string;
  /** Raw "Region / City" string as shown in the EN edition table. */
  regionEn: string;
  /** Cross-platform anime IDs. Bangumi is always resolved; anilist/mal may be null. */
  externalIds: AnimeTourism88ExternalIds;
  /** AniList popularity score (null when unresolved on AniList — e.g. tokusatsu). */
  anilistPopularity?: number | null;
  /** AniList mean score 0..100 (null when unresolved). */
  anilistMeanScore?: number | null;
  /** Direct Bangumi CDN cover URL, resolved offline to avoid API redirects. */
  posterUrl?: string;
  /** Free-form note when AniList match used fallback/substring; surface to admin tooling. */
  anilistReviewNote?: string;
}

export interface AnimeTourism88DataFile {
  generatedAt: string;
  resolvedAt?: string;
  source: string;
  year: number;
  count: number;
  entries: AnimeTourism88Entry[];
}

// Lazy + memoized: the 64KB Anime Tourism 88 JSON is required and parsed only
// on first access, not at module-eval time, to keep this ~64KB parse off the
// cold-start JS thread.
let _data: AnimeTourism88DataFile | null = null;

function getData(): AnimeTourism88DataFile {
  if (_data) return _data;
  // require (sync) so every exported lookup below stays sync on first call.
  // Bun returns the parsed object directly; bun:test mock.module wraps it in
  // `{ default }`.
  const mod = require('./anime-tourism-88.data.json');
  _data = (mod?.default ?? mod) as AnimeTourism88DataFile;
  return _data;
}

export interface UniqueAnime88Entry {
  bangumiId: number;
  titleJa: string;
  titleEn: string;
  /** Direct Bangumi CDN cover URL when bundled for this anime. */
  posterUrl?: string;
  /** Every 88 row that maps to this bangumi id (1..N rows). */
  locations: AnimeTourism88Entry[];
  /** Distinct regions this anime touches. */
  regions: AnimeTourism88Region[];
  /** Highest AniList popularity score across this anime's rows; null when unresolved. */
  anilistPopularity: number | null;
}

type AreaDestinationReader = Pick<
  LocalityRepository,
  'getAreaDestinations' | 'getAreaDestinationsForAnime' | 'getPlaceById'
>;

type CityCentroidLookup = (prefecture: string, city: string) => { lat: number; lng: number } | null;

const defaultAreaAnchor: CityCentroidLookup = (prefecture, city) =>
  getCityCentroid(prefecture, city) ?? (!city.trim() ? getPrefectureAreaAnchor(prefecture) : null);

/**
 * Compatibility projection over canonical AreaDestinations. Data and locality
 * readers are injected so tests and a future remote locality loader do not
 * depend on process-global module mocks.
 */
export class AnimeTourism88Repository {
  constructor(
    private readonly data: AnimeTourism88DataFile,
    private readonly locality: AreaDestinationReader,
    private readonly cityCentroid: CityCentroidLookup = defaultAreaAnchor
  ) {}

  getAllEntries(): readonly AnimeTourism88Entry[] {
    return this.joinAreaDestinations(this.getAreaDestinations());
  }

  getEditionYear(): number {
    const first = this.getAreaDestinations()[0];
    return first ? Number(first.edition) : this.data.year;
  }

  getEntryCount(): number {
    return this.getAreaDestinations().length;
  }

  getEntriesByBangumiId(bangumiId: number | null | undefined): AnimeTourism88Entry[] {
    if (typeof bangumiId !== 'number' || !Number.isFinite(bangumiId)) return [];
    return this.joinAreaDestinations(this.locality.getAreaDestinationsForAnime(bangumiId));
  }

  getEntriesByRegion(region: AnimeTourism88Region): AnimeTourism88Entry[] {
    return this.joinAreaDestinations(
      this.getAreaDestinations().filter((area) => area.region === region)
    );
  }

  includesAnime(bangumiId: number | null | undefined): boolean {
    if (typeof bangumiId !== 'number' || !Number.isFinite(bangumiId)) return false;
    return this.locality
      .getAreaDestinationsForAnime(bangumiId)
      .some((area) => this.isAnimeTourism88Area(area));
  }

  getEntriesWithCoords(): AnimeTourism88EntryWithCoords[] {
    const out: AnimeTourism88EntryWithCoords[] = [];
    for (const entry of this.getAllEntries()) {
      const centroid = this.cityCentroid(entry.prefecture, entry.city);
      if (!centroid) continue;
      out.push({ ...entry, lat: centroid.lat, lng: centroid.lng });
    }
    return out;
  }

  getExactPlaces(): AnimeTourism88ExactPlace[] {
    const rowsById = new Map(this.data.entries.map((entry) => [String(entry.id), entry]));
    const out: AnimeTourism88ExactPlace[] = [];
    for (const area of this.getAreaDestinations()) {
      const row = rowsById.get(area.sourceEntryId);
      if (!row) continue;
      for (const placeId of area.placeRefs) {
        const place = this.locality.getPlaceById(placeId);
        if (!place?.geo) continue;
        out.push({
          ...row,
          placeId,
          lat: place.geo[0],
          lng: place.geo[1],
        });
      }
    }
    return out;
  }

  getUniqueAnime(): UniqueAnime88Entry[] {
    const seen = new Map<number, UniqueAnime88Entry>();
    for (const entry of this.getAllEntries()) {
      const bangumiId = entry.externalIds.bangumi;
      if (typeof bangumiId !== 'number') continue;
      const popularity =
        typeof entry.anilistPopularity === 'number' ? entry.anilistPopularity : null;
      const existing = seen.get(bangumiId);
      if (existing) {
        existing.locations.push(entry);
        if (!existing.regions.includes(entry.region)) {
          existing.regions.push(entry.region);
        }
        if (popularity !== null) {
          existing.anilistPopularity = Math.max(existing.anilistPopularity ?? 0, popularity);
        }
      } else {
        seen.set(bangumiId, {
          bangumiId,
          titleJa: entry.titleJa,
          titleEn: entry.titleEn,
          posterUrl: entry.posterUrl,
          locations: [entry],
          regions: [entry.region],
          anilistPopularity: popularity,
        });
      }
    }
    return Array.from(seen.values());
  }

  getUniqueAnimeByPopularity(): UniqueAnime88Entry[] {
    return this.getUniqueAnime().sort((a, b) => {
      const ap = a.anilistPopularity ?? -1;
      const bp = b.anilistPopularity ?? -1;
      if (ap !== bp) return bp - ap;
      return a.locations[0].id - b.locations[0].id;
    });
  }

  private getAreaDestinations(): readonly AreaDestination[] {
    return this.locality.getAreaDestinations({
      programId: 'anime-tourism-88',
      edition: String(this.data.year),
    });
  }

  private isAnimeTourism88Area(area: AreaDestination): boolean {
    return area.programId === 'anime-tourism-88' && area.edition === String(this.data.year);
  }

  private joinAreaDestinations(areas: readonly AreaDestination[]): AnimeTourism88Entry[] {
    const rowsById = new Map(this.data.entries.map((entry) => [String(entry.id), entry]));
    return areas.flatMap((area) => {
      if (!this.isAnimeTourism88Area(area)) return [];
      const row = rowsById.get(area.sourceEntryId);
      return row ? [row] : [];
    });
  }
}

let _repository: AnimeTourism88Repository | null = null;

function getRepository(): AnimeTourism88Repository {
  _repository ??= new AnimeTourism88Repository(getData(), localityRepository);
  return _repository;
}

/** All 88 rows, in the canonical 1..N order. Do NOT mutate. */
export function getAll88Entries(): readonly AnimeTourism88Entry[] {
  return getRepository().getAllEntries();
}

/** Year of the bundled selection (e.g. 2025). */
export function get88EditionYear(): number {
  return getRepository().getEditionYear();
}

/** Total row count (anime × city pairs). */
export function get88EntryCount(): number {
  return getRepository().getEntryCount();
}

/** All rows for a single anime. Empty array if the anime is not in the 88 list. */
export function get88EntriesByBangumiId(
  bangumiId: number | null | undefined
): AnimeTourism88Entry[] {
  return getRepository().getEntriesByBangumiId(bangumiId);
}

/** Rows whose region matches. Region ids are the 7-group taxonomy. */
export function get88EntriesByRegion(region: AnimeTourism88Region): AnimeTourism88Entry[] {
  return getRepository().getEntriesByRegion(region);
}

/** Whether an anime (by Bangumi id) is part of the current 88 selection. */
export function is88(bangumiId: number | null | undefined): boolean {
  return getRepository().includesAnime(bangumiId);
}

export interface AnimeTourism88EntryWithCoords extends AnimeTourism88Entry {
  /** Administrative label anchor in WGS84; never an exact visitable coordinate. */
  lat: number;
  lng: number;
}

/**
 * Every 88 row joined to an administrative label anchor. Named cities use
 * their known city centroid; prefecture-only rows use a prefecture viewport
 * anchor derived from known cities. Callers must render these as AREA labels,
 * never Place pins or navigation targets.
 */
export function get88EntriesWithCoords(): AnimeTourism88EntryWithCoords[] {
  return getRepository().getEntriesWithCoords();
}

export interface AnimeTourism88ExactPlace extends AnimeTourism88Entry {
  placeId: PlaceId;
  lat: number;
  lng: number;
}

/**
 * Exact, provenance-backed Places explicitly promoted by an 88 area record.
 * Current city-only rows return an empty list; centroids never enter this path.
 */
export function get88ExactPlaces(): AnimeTourism88ExactPlace[] {
  return getRepository().getExactPlaces();
}

/**
 * One entry per unique anime (collapses multi-city anime into a single record
 * with its location list). Order follows the first-seen row order of the
 * canonical list.
 *
 * Rows with `externalIds.bangumi === null` are skipped, since downstream
 * features (collection-link, AniList popularity) cannot key on a null id.
 */
export function getUnique88Anime(): UniqueAnime88Entry[] {
  return getRepository().getUniqueAnime();
}

/**
 * Same as `getUnique88Anime` but sorted by AniList popularity descending.
 * Anime with no AniList resolution sort last in canonical (id) order so the
 * tail stays deterministic between renders.
 */
export function getUnique88AnimeByPopularity(): UniqueAnime88Entry[] {
  return getRepository().getUniqueAnimeByPopularity();
}
