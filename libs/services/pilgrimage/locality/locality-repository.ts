import { bundledLocalityDataLoader } from '@/libs/services/pilgrimage/locality/bundled-loader';
import { anitabiSceneProjector } from '@/libs/services/pilgrimage/locality/anitabi-scene-projector';
import type {
  AnitabiSceneProjector,
  AreaDestinationQuery,
  EventQuery,
  LocalityDataLoader,
  LocalityRepository,
  NewsSourceQuery,
  PlaceQuery,
  PlaceRoleQuery,
  PlaceWithRoles,
} from '@/libs/services/pilgrimage/locality/repository';
import type {
  AreaDestination,
  BangumiId,
  EventId,
  LocalityDataEnvelope,
  LocalityEvent,
  LocalityNewsSource,
  NewsSourceId,
  Place,
  PlaceGuide,
  PlaceId,
  PlaceRole,
} from '@/libs/services/pilgrimage/locality/types';
import { validateLocalityDataEnvelope } from '@/libs/services/pilgrimage/locality/validator';

/** Validated synchronous snapshot queries plus the async Anitabi scene overlay. */
export class LocalityRepositoryImpl implements LocalityRepository {
  private snapshot: LocalityDataEnvelope | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly loader: LocalityDataLoader,
    private readonly sceneProjector: AnitabiSceneProjector = anitabiSceneProjector
  ) {}

  getSnapshot(): LocalityDataEnvelope {
    this.snapshot ??= validateLocalityDataEnvelope(this.loader.loadInitial());
    return this.snapshot;
  }

  getPlaceById(id: PlaceId): Place | null {
    return this.getSnapshot().entities.places[id] ?? null;
  }

  getPlaces(query: PlaceQuery = {}): readonly Place[] {
    const { entities } = this.getSnapshot();
    const roles = Object.values(entities.roles);
    const events = Object.values(entities.events);
    const areas = Object.values(entities.areaDestinations);
    const eventPlaceIds = query.eventId
      ? new Set(entities.events[query.eventId]?.placeRefs ?? [])
      : null;

    return Object.values(entities.places).filter((place) => {
      if (eventPlaceIds && !eventPlaceIds.has(place.id)) return false;
      if (query.hasGeo !== undefined && (place.geo !== null) !== query.hasGeo) return false;
      if (
        query.roleKinds &&
        !roles.some((role) => role.placeId === place.id && query.roleKinds?.includes(role.kind))
      ) {
        return false;
      }
      if (query.animeId !== undefined) {
        const animeId = query.animeId;
        const direct = place.animeIds.includes(animeId);
        const viaRole = roles.some(
          (role) => role.placeId === place.id && role.animeIds.includes(animeId)
        );
        const viaEvent = events.some(
          (event) => event.animeIds.includes(animeId) && event.placeRefs.includes(place.id)
        );
        const viaArea = areas.some(
          (area) => area.animeIds.includes(animeId) && area.placeRefs.includes(place.id)
        );
        if (!direct && !viaRole && !viaEvent && !viaArea) return false;
      }
      return true;
    });
  }

  async getPlacesForAnime(
    animeId: BangumiId,
    query: Omit<PlaceQuery, 'animeId'> = {}
  ): Promise<readonly PlaceWithRoles[]> {
    const rows = new Map<PlaceId, { place: Place; roles: PlaceRole[] }>();
    for (const place of this.getPlaces({ ...query, animeId })) {
      const roles = this.getRolesForPlace(place.id).filter(
        (role) => !query.roleKinds || query.roleKinds.includes(role.kind)
      );
      rows.set(place.id, { place, roles: [...roles] });
    }

    if (query.eventId === undefined && (!query.roleKinds || query.roleKinds.includes('scene'))) {
      const projection = await this.sceneProjector.getScenePlacesForAnime(animeId);
      const projectedPlaces = new Map(projection.places.map((place) => [place.id, place]));
      for (const role of projection.roles) {
        const place = projectedPlaces.get(role.placeId);
        if (!place) {
          throw new Error(
            `projected scene role ${role.id} references missing place ${role.placeId}`
          );
        }
        if (!role.animeIds.every((id) => place.animeIds.includes(id))) {
          throw new Error(`projected scene role ${role.id} has inconsistent anime links`);
        }
      }
      for (const place of projection.places) {
        if (!place.animeIds.includes(animeId)) continue;
        if (query.hasGeo !== undefined && (place.geo !== null) !== query.hasGeo) continue;
        const roles = projection.roles.filter(
          (role) => role.placeId === place.id && role.animeIds.includes(animeId)
        );
        const existing = rows.get(place.id);
        if (existing) {
          existing.roles.push(
            ...roles.filter((role) => !existing.roles.some((current) => current.id === role.id))
          );
        } else {
          rows.set(place.id, { place, roles: [...roles] });
        }
      }
    }

    return [...rows.values()];
  }

  getPlacesForEvent(eventId: EventId): readonly Place[] {
    return this.getPlaces({ eventId });
  }

  getRoles(query: PlaceRoleQuery = {}): readonly PlaceRole[] {
    const ids = query.ids ? new Set(query.ids) : null;
    return Object.values(this.getSnapshot().entities.roles).filter((role) => {
      if (ids && !ids.has(role.id)) return false;
      if (query.placeId !== undefined && role.placeId !== query.placeId) return false;
      if (query.animeId !== undefined && !role.animeIds.includes(query.animeId)) return false;
      if (query.kinds && !query.kinds.includes(role.kind)) return false;
      if (
        query.campaignId !== undefined &&
        (role.kind !== 'stamp_stop' || role.campaignId !== query.campaignId)
      ) {
        return false;
      }
      return true;
    });
  }

  getRolesForPlace(placeId: PlaceId): readonly PlaceRole[] {
    return this.getRoles({ placeId });
  }

  getEvents(query: EventQuery = {}): readonly LocalityEvent[] {
    return Object.values(this.getSnapshot().entities.events).filter((event) => {
      if (query.animeId !== undefined && !event.animeIds.includes(query.animeId)) return false;
      if (query.placeId !== undefined && !event.placeRefs.includes(query.placeId)) return false;
      if (query.categories && !query.categories.includes(event.category)) return false;
      return true;
    });
  }

  getEventById(id: EventId): LocalityEvent | null {
    return this.getSnapshot().entities.events[id] ?? null;
  }

  getEventsForAnime(
    animeId: BangumiId,
    query: Omit<EventQuery, 'animeId'> = {}
  ): readonly LocalityEvent[] {
    return this.getEvents({ ...query, animeId });
  }

  getAreaDestinations(query: AreaDestinationQuery = {}): readonly AreaDestination[] {
    return Object.values(this.getSnapshot().entities.areaDestinations).filter((area) => {
      if (query.animeId !== undefined && !area.animeIds.includes(query.animeId)) return false;
      if (query.programId !== undefined && area.programId !== query.programId) return false;
      if (query.edition !== undefined && area.edition !== query.edition) return false;
      return true;
    });
  }

  getAreaDestinationsForAnime(animeId: BangumiId): readonly AreaDestination[] {
    return this.getAreaDestinations({ animeId });
  }

  getPlaceGuides(placeId: PlaceId): readonly PlaceGuide[] {
    return Object.values(this.getSnapshot().entities.placeGuides).filter(
      (guide) => guide.placeId === placeId
    );
  }

  getNewsSources(query: NewsSourceQuery = {}): readonly LocalityNewsSource[] {
    return Object.values(this.getSnapshot().entities.newsSources).filter((source) => {
      if (query.animeId !== undefined && !source.animeIds.includes(query.animeId)) return false;
      if (query.placeId !== undefined && !source.placeRefs.includes(query.placeId)) return false;
      if (query.eventId !== undefined && !source.eventRefs.includes(query.eventId)) return false;
      if (query.categories && !query.categories.includes(source.category)) return false;
      if (query.recommended !== undefined && source.recommended !== query.recommended) return false;
      return true;
    });
  }

  getNewsSourceById(id: NewsSourceId): LocalityNewsSource | null {
    return this.getSnapshot().entities.newsSources[id] ?? null;
  }

  async refresh(): Promise<void> {
    const current = this.getSnapshot();
    const candidate = validateLocalityDataEnvelope(await this.loader.loadLatest());
    if (candidate === current) return;
    this.snapshot = candidate;
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const localityRepository = new LocalityRepositoryImpl(bundledLocalityDataLoader);
