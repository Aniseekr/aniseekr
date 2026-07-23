import type {
  EventCategory as LegacyEventCategory,
  EventSchedule as LegacyEventSchedule,
  LocalizedText as LegacyLocalizedText,
  ShopCategory as LegacyShopCategory,
  ViewingHintKind as LegacyViewingHintKind,
} from '@/libs/services/pilgrimage/local-intel/types';
import type {
  NewsCategory as LegacyNewsCategory,
  NewsFormat as LegacyNewsFormat,
} from '@/libs/services/news/types';

/**
 * JP-first localized content reused from the current local-intel model during
 * the review/migration window. Keeping the alias avoids a second text shape.
 */
export type LocalizedText = LegacyLocalizedText;

/**
 * The existing, tested event schedule state machine input. Locality events
 * deliberately reuse it instead of introducing a parallel recurrence model.
 */
export type EventSchedule = LegacyEventSchedule;

/** Event categories already understood by the current event state machine and UI. */
export type EventCategory = LegacyEventCategory;

/** Shop categories already carried by curated local-intel shop records. */
export type ShopCategory = LegacyShopCategory;

/** Curated viewing conditions already supported by the local-intel layer. */
export type ViewingHintKind = LegacyViewingHintKind;

/** News categories already used by the curated news-source catalog. */
export type NewsCategory = LegacyNewsCategory;

/** Feed formats already handled by the news parser. */
export type NewsFormat = LegacyNewsFormat;

declare const LOCALITY_ID_BRAND: unique symbol;

type LocalityId<Kind extends string> = string & {
  readonly [LOCALITY_ID_BRAND]: Kind;
};

/** Stable, serialized-as-string identity for one physical location. */
export type PlaceId = LocalityId<'place'>;

/** Stable, serialized-as-string identity for one typed relationship to a Place. */
export type RoleId = LocalityId<'role'>;

/** Stable, serialized-as-string identity for one event or campaign. */
export type EventId = LocalityId<'event'>;

/** Event identity when the referenced entity is acting as a campaign. */
export type CampaignId = EventId;

/** Stable, serialized-as-string identity for a non-pin administrative destination. */
export type AreaDestinationId = LocalityId<'area_destination'>;

/** Stable, serialized-as-string identity for sourced visiting guidance. */
export type PlaceGuideId = LocalityId<'place_guide'>;

/** Stable, serialized-as-string identity for a curated news feed. */
export type NewsSourceId = LocalityId<'news_source'>;

/** Positive Bangumi subject id, the canonical anime link throughout locality data. */
export type BangumiId = number;

/** ISO-8601 calendar date (`YYYY-MM-DD`), validated at the loader boundary. */
export type IsoDate = string;

/** ISO-8601 timestamp, validated and normalized at the loader boundary. */
export type IsoDateTime = string;

/** IANA timezone name such as `Asia/Tokyo`. */
export type IanaTimezone = string;

/** Exact WGS84 coordinate in `[latitude, longitude]` order. */
export type GeoPoint = readonly [latitude: number, longitude: number];

/**
 * One display-ready source credit. Consumers render `sourceName`, link to
 * `sourceUrl` (or `officialUrl`), and show verification/license details rather
 * than hiding provenance as internal metadata.
 */
export interface IntelProvenance {
  /** Human-readable source identity; never derived by the UI from a hostname. */
  sourceName: LocalizedText;
  /** Page that substantiates the entity's locality fact. */
  sourceUrl: string;
  /** Official entity/program page when it differs from the evidence page. */
  officialUrl?: string;
  /** Date on which a human or trusted build verified the source. */
  verifiedAt: IsoDate;
  /** Displayable license identifier, for example `CC BY-NC-SA 4.0`. */
  license?: string;
  /** Source-supplied copyright or rights-holder credit. */
  copyrightNotice?: LocalizedText;
}

/**
 * Non-empty provenance carried by every canonical entity. The first credit is
 * the primary display credit; later credits preserve merged/deduped evidence.
 */
export type EntityProvenance = readonly [IntelProvenance, ...IntelProvenance[]];

/**
 * Canonical identity for one physical location. A Place is independent of why
 * it matters; scene, stamp, shop, and festival semantics live in PlaceRole.
 * `geo: null` means no verified exact coordinate, never an area centroid.
 */
export interface Place {
  id: PlaceId;
  name: LocalizedText;
  geo: GeoPoint | null;
  /**
   * Evidence-backed direct links plus the validated union of role/destination
   * links. May be empty when only an event-level relationship is known.
   */
  animeIds: readonly BangumiId[];
  provenance: EntityProvenance;
  address?: LocalizedText;
  hours?: LocalizedText;
  timezone?: IanaTimezone;
}

/** The four approved ways a physical Place participates in the locality domain. */
export type PlaceRoleKind = 'scene' | 'stamp_stop' | 'shop' | 'festival_venue';

interface PlaceRoleBase {
  id: RoleId;
  placeId: PlaceId;
  /**
   * Anime tied to this particular relationship. The loader validates that
   * every role link is represented in its Place's canonical animeIds.
   */
  animeIds: readonly BangumiId[];
  provenance: EntityProvenance;
}

/** Qualified Anitabi identity; point ids are only stable within one anime. */
export interface AnitabiSceneRef {
  bangumiId: BangumiId;
  pointId: string;
}

/**
 * Projection of an existing grouped Anitabi spot into the canonical model.
 * Scene images and point detail remain owned by the Anitabi pipeline.
 */
export interface SceneRole extends PlaceRoleBase {
  kind: 'scene';
  anitabiRef: AnitabiSceneRef;
}

/**
 * Per-stop availability without repeating the campaign schedule on every
 * role. Overrides are used only when an official source documents a difference.
 */
export type StampStopAvailability =
  | { kind: 'campaign_schedule' }
  | { kind: 'schedule_override'; schedule: EventSchedule }
  | { kind: 'unavailable'; note?: LocalizedText }
  | { kind: 'unconfirmed'; note?: LocalizedText };

/** One campaign-specific stamp-stop relationship at a canonical Place. */
export interface StampStopRole extends PlaceRoleBase {
  kind: 'stamp_stop';
  campaignId: CampaignId;
  /** Exact stop label as published by this campaign, without normalization. */
  sourceLabel: LocalizedText;
  /** Exact campaign-listed address, when the source supplies one. */
  sourceAddress?: LocalizedText;
  /** Per-stop anime links; these may be narrower than the campaign animeIds. */
  animeIds: readonly BangumiId[];
  availability: StampStopAvailability;
}

/** Anime-related commercial use of a canonical Place. */
export interface ShopRole extends PlaceRoleBase {
  kind: 'shop';
  shopCategory: ShopCategory;
  animeConnection: LocalizedText;
  /** Role-specific copy retained from current shop records. */
  description?: LocalizedText;
}

/** Supported physical shapes for a festival venue relationship. */
export type FestivalVenueKind = 'primary' | 'secondary' | 'route' | 'other';

/** Festival use of a canonical Place; events point to the Place separately. */
export interface FestivalVenueRole extends PlaceRoleBase {
  kind: 'festival_venue';
  venueKind: FestivalVenueKind;
  description?: LocalizedText;
}

/** Typed Place relationship, stored separately from Place identity. */
export type PlaceRole = SceneRole | StampStopRole | ShopRole | FestivalVenueRole;

/**
 * First-class dated event or ongoing campaign. Stamp rallies are campaigns in
 * this same collection, allowing StampStopRole.campaignId to remain a normal
 * foreign key rather than introducing a parallel campaign hierarchy.
 */
export interface LocalityEvent {
  id: EventId;
  category: EventCategory;
  name: LocalizedText;
  description: LocalizedText;
  schedule: EventSchedule;
  /** Exact venues/stops only; every id must resolve in `entities.places`. */
  placeRefs: readonly PlaceId[];
  /** Honest administrative destinations for area-wide records with no pin. */
  areaRefs: readonly AreaDestinationId[];
  animeIds: readonly BangumiId[];
  provenance: EntityProvenance;
  timezone?: IanaTimezone;
}

/** Locality event viewed specifically as a campaign. */
export type Campaign = LocalityEvent;

/**
 * A city/area destination backed by a program such as Anime Tourism 88.
 * Deliberately has no `geo`: administrative centroids may navigate a viewport
 * but must never masquerade as precise visitable pins. Verified exact sites
 * become Place entities instead.
 */
export interface AreaDestination {
  id: AreaDestinationId;
  areaKind: 'administrative_area';
  name: LocalizedText;
  prefecture: string;
  locality: string;
  region?: string;
  animeIds: readonly BangumiId[];
  /** Stable source program id, for example `anime-tourism-88`. */
  programId: string;
  /** Source edition label, for example `2025`. */
  edition: string;
  /** Upstream row identity retained for reproducible re-ingestion. */
  sourceEntryId: string;
  /**
   * Exact verified sites promoted from this area record. City-only records use
   * an empty array and therefore cannot surface as pins.
   */
  placeRefs: readonly PlaceId[];
  provenance: EntityProvenance;
}

/**
 * Sourced visiting guidance attached to a Place. This keeps the existing
 * viewing-hint record normalized without inventing a fifth PlaceRole kind.
 */
export interface PlaceGuide {
  id: PlaceGuideId;
  placeId: PlaceId;
  animeIds: readonly BangumiId[];
  name: LocalizedText;
  description: LocalizedText;
  guidanceKind: ViewingHintKind;
  note: LocalizedText;
  bestMonths?: readonly number[];
  appliesWithinMeters?: number;
  provenance: EntityProvenance;
}

/** Expected update cadence for a curated news source. */
export type NewsSourceFrequency = 'high' | 'medium' | 'low';

/** Language of articles emitted by a curated news source. */
export type NewsSourceLanguage = 'ja' | 'en';

/**
 * Curated feed definition in the same canonical envelope as locality data.
 * Optional relation arrays support evidence-backed news cross-links later;
 * empty arrays mean no relationship is currently known.
 */
export interface LocalityNewsSource {
  id: NewsSourceId;
  name: LocalizedText;
  feedUrl: string;
  homepageUrl: string;
  category: NewsCategory;
  language: NewsSourceLanguage;
  format: NewsFormat;
  recommended: boolean;
  frequency: NewsSourceFrequency;
  animeIds: readonly BangumiId[];
  placeRefs: readonly PlaceId[];
  eventRefs: readonly EventId[];
  provenance: EntityProvenance;
  /** Maintainer-facing transport caveat; never presented as article content. */
  operationalNotes?: string;
}

/**
 * Id-keyed normalized table. A loader validates that each object key exactly
 * matches the contained entity's `id` and rejects duplicate/missing references.
 */
export type EntityTable<Id extends string, Entity extends { readonly id: Id }> = Readonly<
  Record<Id, Entity>
>;

/** All normalized canonical entity collections. */
export interface LocalityEntities {
  places: EntityTable<PlaceId, Place>;
  roles: EntityTable<RoleId, PlaceRole>;
  events: EntityTable<EventId, LocalityEvent>;
  areaDestinations: EntityTable<AreaDestinationId, AreaDestination>;
  placeGuides: EntityTable<PlaceGuideId, PlaceGuide>;
  newsSources: EntityTable<NewsSourceId, LocalityNewsSource>;
}

/** Current schema understood by this design pass. */
export const LOCALITY_SCHEMA_VERSION = 1 as const;

/**
 * Versioned backend/bundle payload. It contains no nested Places, Roles, or
 * Events: all relationships are stable foreign-key references in `entities`.
 */
export interface LocalityDataEnvelope {
  schemaVersion: typeof LOCALITY_SCHEMA_VERSION;
  generatedAt: IsoDateTime;
  entities: LocalityEntities;
}
