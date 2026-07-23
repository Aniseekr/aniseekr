import { groupPointsIntoSpots } from '@/libs/services/pilgrimage/anitabi-points';
import { pilgrimageRepository } from '@/libs/services/pilgrimage/pilgrimage-repository';
import type {
  AnitabiSceneProjection,
  AnitabiSceneProjector,
} from '@/libs/services/pilgrimage/locality/repository';
import type {
  BangumiId,
  EntityProvenance,
  IntelProvenance,
  Place,
  PlaceId,
  RoleId,
  SceneRole,
} from '@/libs/services/pilgrimage/locality/types';
import type { AnitabiPoint } from '@/libs/services/pilgrimage/types';

export interface AnitabiDetailedPointSource {
  getDetailedPointsByBangumiId(bangumiId: number): Promise<AnitabiPoint[]>;
}

type VerifiedDateProvider = () => string;

/**
 * Read-only adapter over the existing Anitabi fetch/cache + grouping pipeline.
 * It owns no point storage and therefore cannot diverge from the scene reader.
 */
export class AnitabiPipelineSceneProjector implements AnitabiSceneProjector {
  constructor(
    private readonly source: AnitabiDetailedPointSource = pilgrimageRepository,
    private readonly verifiedDate: VerifiedDateProvider = todayIsoDate
  ) {}

  async getScenePlacesForAnime(animeId: BangumiId): Promise<AnitabiSceneProjection> {
    if (!Number.isInteger(animeId) || animeId <= 0) return { places: [], roles: [] };
    const points = await this.source.getDetailedPointsByBangumiId(animeId);
    const spots = groupPointsIntoSpots(points);
    const places: Place[] = [];
    const roles: SceneRole[] = [];
    const verifiedAt = this.verifiedDate();

    for (const spot of spots) {
      const placeId = `anitabi:${animeId}:${spot.id}` as PlaceId;
      const representative = spot.scenes[0];
      const provenance = anitabiProvenance(animeId, representative, verifiedAt);
      places.push({
        id: placeId,
        name: {
          ja: spot.name,
          ...(spot.cn ? { zhHans: spot.cn } : {}),
        },
        geo: validGeo(spot.geo) ? [spot.geo[0], spot.geo[1]] : null,
        animeIds: [animeId],
        provenance,
      });
      roles.push({
        id: `scene:anitabi:${animeId}:${spot.id}` as RoleId,
        kind: 'scene',
        placeId,
        animeIds: [animeId],
        anitabiRef: { bangumiId: animeId, pointId: spot.id },
        provenance,
      });
    }

    return { places, roles };
  }
}

function anitabiProvenance(
  animeId: number,
  point: AnitabiPoint,
  verifiedAt: string
): EntityProvenance {
  const primary: IntelProvenance = {
    sourceName: { ja: 'Anitabi', en: 'Anitabi', zhHant: 'Anitabi' },
    sourceUrl: `https://www.anitabi.cn/bangumi/${animeId}`,
    verifiedAt,
    license: 'CC BY-NC-SA 4.0',
    copyrightNotice: { ja: point.origin ?? 'Anitabi contributors' },
  };
  if (!point.origin || !point.originURL) return [primary];
  return [
    primary,
    {
      sourceName: { ja: point.origin },
      sourceUrl: point.originURL,
      verifiedAt,
      license: 'CC BY-NC-SA 4.0',
      copyrightNotice: { ja: point.origin },
    },
  ];
}

function validGeo(geo: readonly [number, number]): boolean {
  return (
    Number.isFinite(geo[0]) &&
    geo[0] >= -90 &&
    geo[0] <= 90 &&
    Number.isFinite(geo[1]) &&
    geo[1] >= -180 &&
    geo[1] <= 180 &&
    (geo[0] !== 0 || geo[1] !== 0)
  );
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export const anitabiSceneProjector = new AnitabiPipelineSceneProjector();
