import { IDMappingService } from '../sync/id-mapping-service';
import { atlasClient, AtlasClient } from './atlas/atlas-client';
import { resolveAtlasWork } from './atlas/atlas-resolver';
import type { AtlasWork, AtlasWorkDetail } from './atlas/types';
import { LocationService, locationService, type LatLng } from './location-service';
import type { PilgrimageSpot, PilgrimageWork } from './types';

export interface NearbyAnimeResult {
  anime: PilgrimageWork;
  distanceKm: number;
}

export interface AnimeContext {
  sourcePlatform?: string;
  id?: string | number;
  bangumiId?: number | string | null;
  malId?: number | string | null;
  anilistId?: number | string | null;
  title?: string | null;
  titleJa?: string | null;
  titleEn?: string | null;
  platformData?: {
    bangumi?: { id?: number | string | null } | null;
    myanimelist?: { id?: number | string | null } | null;
    anilist?: { id?: number | string | null } | null;
    [key: string]: unknown;
  };
}

export interface AnimeDetailAtlasSource {
  id: string;
  sourcePlatform?: string | null;
  idMal?: number | null;
  title?: string | null;
  titleJapanese?: string | null;
  titleEnglish?: string | null;
  titleRomaji?: string | null;
  platformData?: AnimeContext['platformData'];
}

/** Build an Atlas context from IDs whose platform is known. */
export function animeDetailAtlasContext(anime: AnimeDetailAtlasSource): AnimeContext {
  const malId = anime.platformData?.myanimelist?.id ?? anime.idMal;
  return {
    ...(malId != null ? { sourcePlatform: 'myanimelist', id: malId } : {}),
    anilistId:
      anime.platformData?.anilist?.id ??
      (anime.sourcePlatform === 'anilist' ? anime.id : null),
    malId,
    bangumiId: anime.platformData?.bangumi?.id,
    titleJa: anime.titleJapanese,
    titleEn: anime.titleEnglish,
    title: anime.titleRomaji ?? anime.title,
  };
}

/** Reads a downloaded offline trip pack (see offline-pack/offline-pack-store). */
export interface OfflinePackReader {
  readWork(key: string): Promise<{
    manifest: { downloadedAt: number };
    entry: AtlasWork;
    detail: AtlasWorkDetail;
  } | null>;
}

const defaultOfflinePacks: OfflinePackReader = {
  readWork: async (key) => {
    const { offlinePackStore } = await import('./offline-pack/offline-pack-store');
    return offlinePackStore.readWork(key);
  },
};

interface RepositoryOptions {
  client?: AtlasClient;
  offlinePacks?: OfflinePackReader;
  mappingService?: IDMappingService;
  locationService?: LocationService;
}

export class PilgrimageRepository {
  private readonly client: AtlasClient;
  private readonly mappingService: IDMappingService;
  private readonly locationService: LocationService;
  private readonly offlinePacks: OfflinePackReader;

  constructor(options: RepositoryOptions = {}) {
    this.client = options.client ?? atlasClient;
    this.offlinePacks = options.offlinePacks ?? defaultOfflinePacks;
    this.mappingService = options.mappingService ?? IDMappingService.getInstance();
    this.locationService = options.locationService ?? locationService;
  }

  async getSpotsForAnime(context: AnimeContext): Promise<PilgrimageWork | null> {
    const works = (await this.client.works()).works;
    const resolutionContext = resolveContextIds(context);
    if (resolutionContext.bgmId == null) {
      resolutionContext.bgmId = await this.resolveBangumiId(context);
    }
    const key = await resolveAtlasWork(resolutionContext, works);
    if (!key) return null;
    return this.loadWork(key, works.find((work) => work.key === key));
  }

  async getWorksIndex(): Promise<AtlasWork[]> {
    return (await this.client.works()).works;
  }

  async getSpotsByBangumiId(bangumiId: number): Promise<PilgrimageWork | null> {
    const indexEntry = (await this.client.works()).works.find((work) =>
      (work.bgm ?? []).includes(bangumiId)
    );
    if (!indexEntry) return null;
    return this.loadWork(indexEntry.key, indexEntry);
  }

  async getSpotsByKey(key: string): Promise<PilgrimageWork | null> {
    const indexEntry = (await this.client.works()).works.find((work) => work.key === key);
    return this.loadWork(key, indexEntry);
  }

  /**
   * Live Atlas (network or CacheService) first. Only when that throws — no
   * network and no cached copy — does a downloaded offline pack answer, and
   * the result carries `offlineCopy` so it is never shown as fresh data.
   */
  private async loadWork(key: string, indexEntry: AtlasWork | undefined) {
    try {
      if (!indexEntry) throw new Error(`Atlas work not in index: ${key}`);
      const detail = await this.client.work(indexEntry.key);
      return detail ? this.toPilgrimageWork(indexEntry, detail) : null;
    } catch (error) {
      const pack = await this.offlinePacks.readWork(key).catch(() => null);
      if (!pack) {
        if (!indexEntry) return null;
        throw error;
      }
      return {
        ...this.toPilgrimageWork(pack.entry, pack.detail),
        offlineCopy: { downloadedAt: pack.manifest.downloadedAt },
      };
    }
  }

  async getDetailedPointsByBangumiId(bangumiId: number): Promise<PilgrimageSpot[]> {
    const work = await this.getSpotsByBangumiId(bangumiId);
    return work?.spots ?? [];
  }

  async getNearbyAnime(
    userLocation: LatLng,
    candidates: number[],
    options: { limit?: number } = {}
  ): Promise<NearbyAnimeResult[]> {
    if (candidates.length === 0) return [];

    const fetched = await Promise.all(
      candidates.map((id) => this.getSpotsByBangumiId(id).catch(() => null))
    );
    const results: NearbyAnimeResult[] = [];
    for (const anime of fetched) {
      if (!anime) continue;
      const distances = anime.spots.flatMap((spot) => {
        if (spot.lat === null || spot.lon === null) return [];
        return [
          this.locationService.getDistanceKm(userLocation, {
            latitude: spot.lat,
            longitude: spot.lon,
          }),
        ];
      });
      const distanceKm = distances.length ? Math.min(...distances) : Number.NaN;
      if (Number.isFinite(distanceKm)) results.push({ anime, distanceKm });
    }

    results.sort((a, b) => a.distanceKm - b.distanceKm);
    return options.limit && options.limit > 0 ? results.slice(0, options.limit) : results;
  }

  async resolveBangumiId(context: AnimeContext): Promise<number | null> {
    const direct = numericId(
      context.bangumiId ??
        context.platformData?.bangumi?.id ??
        (context.sourcePlatform === 'bangumi' ? context.id : null)
    );
    if (direct !== null) return direct;
    if (!context.sourcePlatform || context.id == null) return null;

    try {
      const translated = await this.mappingService.mapID(
        context.sourcePlatform,
        context.id,
        'bangumi'
      );
      return numericId(translated);
    } catch {
      return null;
    }
  }

  private toPilgrimageWork(
    row: AtlasWork,
    detail: Awaited<ReturnType<AtlasClient['work']>>
  ): PilgrimageWork {
    if (!detail) throw new Error(`Atlas work missing: ${row.key}`);
    return {
      ...row,
      dataVersion: detail.dataVersion,
      titleJa: detail.titleJa,
      titleEn: detail.titleEn ?? row.en ?? '',
      titleZh: row.zh ?? detail.titleZh ?? undefined,
      spots: detail.spots.map((spot): PilgrimageSpot => ({
        id: spot.id,
        workKey: row.key,
        name: spot.name_ja,
        address: spot.address_ja || '',
        note: spot.note_ja || '',
        lat: spot.location?.lat ?? null,
        lon: spot.location?.lon ?? null,
        precision: spot.location?.precision ?? null,
        confidence: spot.confidence,
        scenes: spot.scenes ?? [],
        sources: spot.sources,
      })),
    };
  }
}

function resolveContextIds(context: AnimeContext) {
  const sourceId = context.id;
  return {
    bgmId:
      context.bangumiId ??
      context.platformData?.bangumi?.id ??
      (context.sourcePlatform === 'bangumi' ? sourceId : null),
    malId:
      context.malId ??
      context.platformData?.myanimelist?.id ??
      (context.sourcePlatform === 'myanimelist' ? sourceId : null),
    anilistId:
      context.anilistId ??
      context.platformData?.anilist?.id ??
      (context.sourcePlatform === 'anilist' ? sourceId : null),
    title: context.title,
    titleJa: context.titleJa,
    titleEn: context.titleEn,
  };
}

function numericId(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

export const pilgrimageRepository = new PilgrimageRepository();
