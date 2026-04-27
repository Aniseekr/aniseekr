// Higher-level entrypoint for the pilgrimage feature.
// - Resolves an anime's Bangumi subject ID (direct or via IDMappingService)
// - Delegates to AnitabiService for the actual fetch + cache
// See spec/pilgrimage_spec.md §5 and spec/architecture.md §4.

import { IDMappingService } from '../sync/id-mapping-service';
import { AnitabiService, anitabiService } from './anitabi-service';
import type { AnitabiBangumi, AnitabiPointDetail } from './types';

/**
 * Anime context passed by callers. Either pass a raw {@link bangumiId}, or
 * a `unifiedItem`-shaped object whose Bangumi id may live under
 * `platformData.bangumi.id`.
 */
export interface AnimeContext {
  /** The anime's source platform (e.g. 'anilist'). Used for fallback ID translation. */
  sourcePlatform?: string;
  /** Source-platform-native id (used when bangumi id missing). */
  id?: string | number;
  /** Direct Bangumi subject id, if known. */
  bangumiId?: number | null;
  /** Optional UnifiedAnimeItem-like platformData bag. */
  platformData?: {
    bangumi?: { id?: number | string | null } | null;
    [key: string]: unknown;
  };
}

interface RepositoryOptions {
  service?: AnitabiService;
  mappingService?: IDMappingService;
}

export class PilgrimageRepository {
  private service: AnitabiService;
  private mappingService: IDMappingService;

  constructor(opts: RepositoryOptions = {}) {
    this.service = opts.service ?? anitabiService;
    this.mappingService = opts.mappingService ?? IDMappingService.getInstance();
  }

  /**
   * Fetch the lite pilgrimage payload for an anime.
   * Returns null when:
   *   - the anime has no Bangumi id (and ID-mapping fallback also yields nothing)
   *   - Anitabi returns 404 for the resolved id
   */
  async getSpotsForAnime(
    context: AnimeContext
  ): Promise<AnitabiBangumi | null> {
    const bangumiId = await this.resolveBangumiId(context);
    if (bangumiId === null) return null;

    return this.service.getAnimePilgrimage(bangumiId);
  }

  /**
   * Convenience overload — fetch directly by Bangumi subject id.
   */
  async getSpotsByBangumiId(
    bangumiId: number
  ): Promise<AnitabiBangumi | null> {
    return this.service.getAnimePilgrimage(bangumiId);
  }

  /**
   * Lazy-load the full points list (e.g. once the user opens the map screen).
   */
  async getDetailedPointsByBangumiId(
    bangumiId: number
  ): Promise<AnitabiPointDetail[]> {
    return this.service.getDetailedPoints(bangumiId);
  }

  /**
   * Resolve a usable Bangumi subject id for the supplied anime context.
   * Returns null when no id can be derived.
   */
  async resolveBangumiId(context: AnimeContext): Promise<number | null> {
    // 1. Direct bangumiId field wins.
    if (typeof context.bangumiId === 'number' && context.bangumiId > 0) {
      return context.bangumiId;
    }

    // 2. platformData.bangumi.id
    const fromPlatform = context.platformData?.bangumi?.id;
    if (typeof fromPlatform === 'number' && fromPlatform > 0) {
      return fromPlatform;
    }
    if (typeof fromPlatform === 'string' && fromPlatform.trim().length > 0) {
      const parsed = Number(fromPlatform);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }

    // 3. ID-mapping translation when source/id known.
    if (context.sourcePlatform && context.id !== undefined && context.id !== null) {
      try {
        const translated = await this.mappingService.mapID(
          context.sourcePlatform,
          context.id,
          'bangumi'
        );
        if (typeof translated === 'number' && translated > 0) return translated;
        if (typeof translated === 'string') {
          const parsed = Number(translated);
          if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[PilgrimageRepository] ID mapping failed:', err);
      }
    }

    return null;
  }
}

export const pilgrimageRepository = new PilgrimageRepository();
