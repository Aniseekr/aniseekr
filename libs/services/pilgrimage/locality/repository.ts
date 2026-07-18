import type {
  AreaDestination,
  BangumiId,
  EventCategory,
  EventId,
  LocalityDataEnvelope,
  LocalityEvent,
  LocalityNewsSource,
  NewsCategory,
  NewsSourceId,
  Place,
  PlaceGuide,
  PlaceId,
  PlaceRole,
  PlaceRoleKind,
  RoleId,
  SceneRole,
} from '@/libs/services/pilgrimage/locality/types';

/** Filters for canonical Place queries. All supplied filters are intersected. */
export interface PlaceQuery {
  /** Includes direct, role, event, and promoted-destination relationships. */
  animeId?: BangumiId;
  eventId?: EventId;
  roleKinds?: readonly PlaceRoleKind[];
  /** `true` returns precise pins only; area destinations are never Places. */
  hasGeo?: boolean;
}

/** Filters for typed PlaceRole queries. All supplied filters are intersected. */
export interface PlaceRoleQuery {
  ids?: readonly RoleId[];
  placeId?: PlaceId;
  animeId?: BangumiId;
  kinds?: readonly PlaceRoleKind[];
  campaignId?: EventId;
}

/** Filters for event/campaign queries. All supplied filters are intersected. */
export interface EventQuery {
  animeId?: BangumiId;
  placeId?: PlaceId;
  categories?: readonly EventCategory[];
}

/** Filters for coordinate-free administrative destinations. */
export interface AreaDestinationQuery {
  animeId?: BangumiId;
  programId?: string;
  edition?: string;
}

/** Filters for curated news-source queries. */
export interface NewsSourceQuery {
  animeId?: BangumiId;
  placeId?: PlaceId;
  eventId?: EventId;
  categories?: readonly NewsCategory[];
  recommended?: boolean;
}

/**
 * Adapter seam for bundled and remote locality payloads. `loadInitial` must be
 * synchronous and network-free (bundle, persisted snapshot, or bundle-backed
 * remote fallback); `loadLatest` performs optional asynchronous revalidation.
 */
export interface LocalityDataLoader {
  readonly id: string;
  loadInitial(): LocalityDataEnvelope;
  loadLatest(): Promise<LocalityDataEnvelope>;
}

/** Places and scene roles projected from one existing Anitabi anime payload. */
export interface AnitabiSceneProjection {
  places: readonly Place[];
  roles: readonly SceneRole[];
}

/**
 * Adapter over the current Anitabi fetch/cache/grouping pipeline. It projects
 * that pipeline's output and must not ingest or persist a second scene copy.
 */
export interface AnitabiSceneProjector {
  getScenePlacesForAnime(animeId: BangumiId): Promise<AnitabiSceneProjection>;
}

/** Joined read model used where callers need both identity and marker semantics. */
export interface PlaceWithRoles {
  place: Place;
  roles: readonly PlaceRole[];
}

/** Listener notified after a validated snapshot replaces the current one. */
export type LocalityRepositoryListener = () => void;

/**
 * Reader-facing locality seam. Envelope queries are synchronous snapshot reads,
 * so swapping a bundled loader for a remote-backed loader does not change
 * readers or first-paint behavior. `getPlacesForAnime` is asynchronous because
 * it may delegate scene loading to the existing Anitabi projector. A failed
 * refresh must retain the last-known-good envelope.
 */
export interface LocalityRepository {
  getSnapshot(): LocalityDataEnvelope;

  getPlaces(query?: PlaceQuery): readonly Place[];
  getPlaceById(id: PlaceId): Place | null;
  /**
   * Adds projected Anitabi scenes to the same relationship union used by
   * `PlaceQuery.animeId` and returns every matching role with its Place. This
   * is the only Place query that may perform I/O; projected entities are a
   * read overlay and are not claimed to belong to `getSnapshot()`.
   */
  getPlacesForAnime(
    animeId: BangumiId,
    query?: Omit<PlaceQuery, 'animeId'>
  ): Promise<readonly PlaceWithRoles[]>;
  getPlacesForEvent(eventId: EventId): readonly Place[];

  getRoles(query?: PlaceRoleQuery): readonly PlaceRole[];
  getRolesForPlace(placeId: PlaceId): readonly PlaceRole[];

  getEvents(query?: EventQuery): readonly LocalityEvent[];
  getEventById(id: EventId): LocalityEvent | null;
  getEventsForAnime(
    animeId: BangumiId,
    query?: Omit<EventQuery, 'animeId'>
  ): readonly LocalityEvent[];

  getAreaDestinations(query?: AreaDestinationQuery): readonly AreaDestination[];
  getAreaDestinationsForAnime(animeId: BangumiId): readonly AreaDestination[];

  getPlaceGuides(placeId: PlaceId): readonly PlaceGuide[];

  getNewsSources(query?: NewsSourceQuery): readonly LocalityNewsSource[];
  getNewsSourceById(id: NewsSourceId): LocalityNewsSource | null;

  refresh(): Promise<void>;
  subscribe(listener: LocalityRepositoryListener): () => void;
}
