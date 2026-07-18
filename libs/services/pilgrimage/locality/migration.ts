import type { NewsSourceFile } from '@/libs/services/news/types';
import type {
  LocalIntelEvent,
  LocalIntelFile,
  LocalIntelShop,
  LocalIntelViewingHint,
  LocalizedText,
  StampSpot,
} from '@/libs/services/pilgrimage/local-intel/types';
import {
  LOCALITY_SCHEMA_VERSION,
  type AreaDestination,
  type AreaDestinationId,
  type BangumiId,
  type EntityProvenance,
  type EventId,
  type IntelProvenance,
  type LocalityDataEnvelope,
  type LocalityEvent,
  type LocalityNewsSource,
  type NewsSourceId,
  type Place,
  type PlaceGuide,
  type PlaceGuideId,
  type PlaceId,
  type PlaceRole,
  type RoleId,
  type ShopRole,
  type StampStopRole,
} from '@/libs/services/pilgrimage/locality/types';

interface AnimeTourism88SourceEntry {
  id: number;
  year: number;
  region: string;
  prefecture: string;
  city: string;
  externalIds: { bangumi: number | null };
}

export interface AnimeTourism88SourceFile {
  generatedAt: string;
  source: string;
  year: number;
  entries: AnimeTourism88SourceEntry[];
}

export interface LegacyLocalitySources {
  localIntel: LocalIntelFile;
  animeTourism88: AnimeTourism88SourceFile;
  newsSources: NewsSourceFile;
}

type MutableTables = {
  places: Record<string, Place>;
  roles: Record<string, PlaceRole>;
  events: Record<string, LocalityEvent>;
  areaDestinations: Record<string, AreaDestination>;
  placeGuides: Record<string, PlaceGuide>;
  newsSources: Record<string, LocalityNewsSource>;
};

const DEFAULT_TIMEZONE = 'Asia/Tokyo';
const ANIME_TOURISM_88_PROGRAM_ID = 'anime-tourism-88';

/**
 * Reviewed physical-identity decisions. Unlisted stop refs deliberately keep
 * their own durable campaign/index id: name or proximity alone is not enough
 * evidence to merge them.
 */
const REVIEWED_STOP_PLACE_IDS: Readonly<Record<string, string>> = {
  'numazu-machiaruki-stamp:1': 'gamers-numazu',
  'll-sunshine-jr-central-stamp:4': 'gamers-numazu',
  'yohane-jr-central-numazu-stamp:5': 'gamers-numazu',
  'll-sunshine-jr-central-stamp:5': 'numazu-riverside-hotel',
  'yohane-jr-central-numazu-stamp:6': 'numazu-riverside-hotel',
  'll-sunshine-jr-central-stamp:7': 'numazu-goyotei-memorial-park',
  'yohane-jr-central-numazu-stamp:8': 'numazu-goyotei-memorial-park',
  'll-sunshine-jr-central-stamp:8': 'awashima-marine-park',
  'yohane-jr-central-numazu-stamp:9': 'awashima-marine-park',
  'll-sunshine-jr-central-stamp:9': 'sannoura-information-center',
  'yohane-jr-central-numazu-stamp:10': 'sannoura-information-center',
};

const REVIEWED_EVENT_VENUE_IDS: Readonly<Record<string, string>> = {
  'yuwaku-bonbori-matsuri': 'yuwaku-onsen',
  'yuwaku-bonbori-lighting-2026': 'yuwaku-onsen',
};

const GAMERS_REVIEWED_GEO = [35.101505, 138.856827] as const;
const GAMERS_REVIEWED_ADDRESS: LocalizedText = {
  ja: '静岡県沼津市添地町72 青秀ビル1階',
};

/** Deterministically migrates the three reviewed bundled sources to schema v1. */
export function migrateLegacyLocalitySources(sources: LegacyLocalitySources): LocalityDataEnvelope {
  const tables: MutableTables = {
    places: {},
    roles: {},
    events: {},
    areaDestinations: {},
    placeGuides: {},
    newsSources: {},
  };

  const entries = Array.isArray(sources.localIntel.entries) ? sources.localIntel.entries : [];
  for (const entry of entries) {
    if (entry.kind === 'shop') migrateShop(entry, tables);
  }
  for (const entry of entries) {
    if (entry.kind === 'viewing_hint') migrateViewingHint(entry, tables);
  }
  for (const entry of entries) {
    if (entry.kind === 'event') migrateEvent(entry, tables);
  }

  applyReviewedGamersIdentity(tables);
  migrateAnimeTourism88(sources.animeTourism88, tables);
  migrateNewsSources(sources.newsSources, tables);

  return {
    schemaVersion: LOCALITY_SCHEMA_VERSION,
    generatedAt: latestGeneratedAt(sources),
    entities: {
      places: tables.places,
      roles: tables.roles,
      events: tables.events,
      areaDestinations: tables.areaDestinations,
      placeGuides: tables.placeGuides,
      newsSources: tables.newsSources,
    },
  };
}

function migrateShop(entry: LocalIntelShop, tables: MutableTables): void {
  const id = asPlaceId(entry.id);
  const provenance = provenanceFor(entry.sourceUrl, entry.verifiedAt, entry.officialUrl);
  upsertPlace(tables, {
    id,
    name: entry.name,
    geo: validGeo(entry.geo),
    animeIds: uniqueAnimeIds(entry.bangumiIds),
    provenance,
    ...(entry.hours ? { hours: { ja: entry.hours } } : {}),
    timezone: entry.timezone ?? DEFAULT_TIMEZONE,
  });

  const role: ShopRole = {
    id: asRoleId(`shop:${entry.id}`),
    kind: 'shop',
    placeId: id,
    animeIds: uniqueAnimeIds(entry.bangumiIds),
    provenance,
    shopCategory: entry.category,
    animeConnection: entry.animeConnection,
    description: entry.description,
  };
  tables.roles[role.id] = role;
}

function migrateViewingHint(entry: LocalIntelViewingHint, tables: MutableTables): void {
  const placeId = asPlaceId(entry.id);
  const provenance = provenanceFor(entry.sourceUrl, entry.verifiedAt, entry.officialUrl);
  upsertPlace(tables, {
    id: placeId,
    name: entry.name,
    geo: validGeo(entry.geo),
    animeIds: uniqueAnimeIds(entry.bangumiIds),
    provenance,
    timezone: entry.timezone ?? DEFAULT_TIMEZONE,
  });

  const guide: PlaceGuide = {
    id: entry.id as PlaceGuideId,
    placeId,
    animeIds: uniqueAnimeIds(entry.bangumiIds),
    name: entry.name,
    description: entry.description,
    guidanceKind: entry.hint,
    note: entry.note,
    ...(entry.bestMonths ? { bestMonths: [...entry.bestMonths] } : {}),
    ...(entry.radiusM !== undefined ? { appliesWithinMeters: entry.radiusM } : {}),
    provenance,
  };
  tables.placeGuides[guide.id] = guide;
}

function migrateEvent(entry: LocalIntelEvent, tables: MutableTables): void {
  const eventId = asEventId(entry.id);
  const eventProvenance = provenanceFor(entry.sourceUrl, entry.verifiedAt, entry.officialUrl);
  const placeRefs: PlaceId[] = [];

  if (entry.geo && entry.venue) {
    const placeId = asPlaceId(REVIEWED_EVENT_VENUE_IDS[entry.id] ?? `event-venue:${entry.id}`);
    upsertPlace(tables, {
      id: placeId,
      name: entry.venue,
      geo: validGeo(entry.geo),
      animeIds: uniqueAnimeIds(entry.bangumiIds),
      provenance: eventProvenance,
      timezone: entry.timezone ?? DEFAULT_TIMEZONE,
    });
    pushUnique(placeRefs, placeId);

    const roleId = asRoleId(`festival-venue:${placeId}`);
    const existing = tables.roles[roleId];
    if (existing?.kind === 'festival_venue') {
      tables.roles[roleId] = {
        ...existing,
        animeIds: uniqueAnimeIds([...existing.animeIds, ...entry.bangumiIds]),
        provenance: mergeProvenance(existing.provenance, eventProvenance),
      };
    } else {
      tables.roles[roleId] = {
        id: roleId,
        kind: 'festival_venue',
        placeId,
        animeIds: uniqueAnimeIds(entry.bangumiIds),
        provenance: eventProvenance,
        venueKind: 'route',
        description: entry.description,
      };
    }
  }

  const stampSpots = Array.isArray(entry.stampSpots) ? entry.stampSpots : [];
  stampSpots.forEach((spot, index) => {
    const placeId = resolveStampPlaceId(entry.id, index);
    const stopProvenance = provenanceFor(spot.sourceUrl, entry.verifiedAt, entry.officialUrl);
    upsertPlace(tables, {
      id: placeId,
      name: spot.name,
      geo: validGeo(spot.geo),
      animeIds: [],
      provenance: stopProvenance,
      ...(spot.address ? { address: { ja: spot.address } } : {}),
      timezone: entry.timezone ?? DEFAULT_TIMEZONE,
    });
    pushUnique(placeRefs, placeId);

    const role: StampStopRole = {
      id: asRoleId(`stamp-stop:${entry.id}:${placeId}`),
      kind: 'stamp_stop',
      placeId,
      campaignId: eventId,
      animeIds: [],
      provenance: stopProvenance,
      sourceLabel: spot.name,
      ...(spot.address ? { sourceAddress: { ja: spot.address } } : {}),
      availability: { kind: 'unconfirmed' },
    };
    tables.roles[role.id] = role;
  });

  const event: LocalityEvent = {
    id: eventId,
    category: entry.category,
    name: entry.name,
    description: entry.description,
    schedule: entry.schedule,
    placeRefs,
    areaRefs: [],
    animeIds: uniqueAnimeIds(entry.bangumiIds),
    provenance: eventProvenance,
    timezone: entry.timezone ?? DEFAULT_TIMEZONE,
  };
  tables.events[event.id] = event;
}

function migrateAnimeTourism88(file: AnimeTourism88SourceFile, tables: MutableTables): void {
  const verifiedAt = isoDate(file.generatedAt);
  const provenance = provenanceFor(file.source, verifiedAt, file.source, {
    ja: 'Anime Tourism 88',
    en: 'Anime Tourism 88',
    zhHant: 'Anime Tourism 88',
  });

  for (const entry of Array.isArray(file.entries) ? file.entries : []) {
    const id = `${ANIME_TOURISM_88_PROGRAM_ID}:${entry.year}:${entry.id}` as AreaDestinationId;
    const locality = entry.city.trim() || entry.prefecture.trim();
    const destination: AreaDestination = {
      id,
      areaKind: 'administrative_area',
      name: { ja: locality },
      prefecture: entry.prefecture,
      locality,
      region: entry.region,
      animeIds:
        typeof entry.externalIds?.bangumi === 'number'
          ? uniqueAnimeIds([entry.externalIds.bangumi])
          : [],
      programId: ANIME_TOURISM_88_PROGRAM_ID,
      edition: String(entry.year),
      sourceEntryId: String(entry.id),
      placeRefs: [],
      provenance,
    };
    tables.areaDestinations[destination.id] = destination;
  }
}

function migrateNewsSources(file: NewsSourceFile, tables: MutableTables): void {
  for (const entry of Array.isArray(file.entries) ? file.entries : []) {
    const id = entry.id as NewsSourceId;
    const provenance = provenanceFor(
      entry.feedUrl,
      entry.verifiedAt,
      entry.homepageUrl,
      entry.name
    );
    tables.newsSources[id] = {
      id,
      name: entry.name,
      feedUrl: entry.feedUrl,
      homepageUrl: entry.homepageUrl,
      category: entry.category,
      language: entry.language,
      format: entry.format,
      recommended: entry.recommended,
      frequency: entry.frequency,
      animeIds: [],
      placeRefs: [],
      eventRefs: [],
      provenance,
      ...(entry.notes ? { operationalNotes: entry.notes } : {}),
    };
  }
}

function resolveStampPlaceId(campaignId: string, zeroBasedIndex: number): PlaceId {
  const sourceRef = `${campaignId}:${zeroBasedIndex + 1}`;
  const reviewed = REVIEWED_STOP_PLACE_IDS[sourceRef];
  return asPlaceId(
    reviewed ?? `stamp-place:${campaignId}:${String(zeroBasedIndex + 1).padStart(3, '0')}`
  );
}

function applyReviewedGamersIdentity(tables: MutableTables): void {
  const id = asPlaceId('gamers-numazu');
  const place = tables.places[id];
  if (!place) return;
  tables.places[id] = {
    ...place,
    geo: GAMERS_REVIEWED_GEO,
    address: GAMERS_REVIEWED_ADDRESS,
  };
}

function upsertPlace(tables: MutableTables, candidate: Place): void {
  const existing = tables.places[candidate.id];
  if (!existing) {
    tables.places[candidate.id] = candidate;
    return;
  }
  tables.places[candidate.id] = {
    ...existing,
    animeIds: uniqueAnimeIds([...existing.animeIds, ...candidate.animeIds]),
    provenance: mergeProvenance(existing.provenance, candidate.provenance),
    ...(existing.address ? {} : candidate.address ? { address: candidate.address } : {}),
    ...(existing.hours ? {} : candidate.hours ? { hours: candidate.hours } : {}),
    ...(existing.geo ? {} : candidate.geo ? { geo: candidate.geo } : {}),
  };
}

function provenanceFor(
  sourceUrl: string,
  verifiedAt: string,
  officialUrl?: string,
  explicitSourceName?: LocalizedText
): EntityProvenance {
  const sourceName = explicitSourceName ?? sourceNameForUrl(sourceUrl);
  const credit: IntelProvenance = {
    sourceName,
    sourceUrl,
    ...(officialUrl ? { officialUrl } : {}),
    verifiedAt: isoDate(verifiedAt),
    copyrightNotice: sourceName,
  };
  return [credit];
}

function sourceNameForUrl(url: string): LocalizedText {
  const known: readonly [string, LocalizedText][] = [
    ['yuwaku.gr.jp', { ja: '湯涌温泉観光協会', en: 'Yuwaku Onsen Tourism Association' }],
    ['llsunshine-numazu.jp', { ja: '沼津まちあるきスタンプ' }],
    ['recommend.jr-central.co.jp', { ja: 'JR東海 推し旅', en: 'JR Central Oshi-tabi' }],
    ['yurumeguristamp.com', { ja: 'ゆる巡りスタンプ' }],
    ['oarai-info.jp', { ja: '大洗観光協会', en: 'Oarai Tourism Association' }],
    ['kenshinbank.co.jp', { ja: '茨城県信用組合' }],
    ['visit-chiyoda.tokyo', { ja: '千代田区観光協会', en: 'Chiyoda Tourism Association' }],
    ['gamers.co.jp', { ja: 'ゲーマーズ' }],
    ['numazukanko.jp', { ja: '沼津観光ポータル', en: 'Numazu Tourism Portal' }],
    ['shougetsu-web.com', { ja: '和洋菓子 松月' }],
    ['awashimahotel.com', { ja: '淡島ホテル' }],
    ['hayagumo.xyz', { ja: 'はや雲' }],
    ['inhamamatsu.com', { ja: 'iN HAMAMATSU.COM', en: 'iN HAMAMATSU.COM' }],
    ['prtimes.jp', { ja: 'PR TIMES', en: 'PR TIMES' }],
  ];
  const match = known.find(([host]) => url.includes(host));
  if (match) return match[1];
  try {
    return { ja: new URL(url).hostname };
  } catch {
    return { ja: 'Source' };
  }
}

function mergeProvenance(left: EntityProvenance, right: EntityProvenance): EntityProvenance {
  const credits: IntelProvenance[] = [];
  const keys = new Set<string>();
  for (const credit of [...left, ...right]) {
    const key = `${credit.sourceUrl}\u0000${credit.verifiedAt}`;
    if (keys.has(key)) continue;
    keys.add(key);
    credits.push(credit);
  }
  return credits as [IntelProvenance, ...IntelProvenance[]];
}

function uniqueAnimeIds(values: readonly number[]): BangumiId[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}

function validGeo(geo: readonly [number, number] | null): readonly [number, number] | null {
  if (!geo) return null;
  const [latitude, longitude] = geo;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return [latitude, longitude];
}

function pushUnique<T>(values: T[], value: T): void {
  if (!values.includes(value)) values.push(value);
}

function latestGeneratedAt(sources: LegacyLocalitySources): string {
  const values = [
    toTimestamp(sources.localIntel.generatedAt),
    toTimestamp(sources.animeTourism88.generatedAt),
    toTimestamp(sources.newsSources.generatedAt),
  ].filter((value) => Number.isFinite(value));
  return new Date(Math.max(...values)).toISOString();
}

function toTimestamp(value: string | number): number {
  if (typeof value === 'number') return value;
  return Date.parse(value);
}

function isoDate(value: string): string {
  const match = /^\d{4}-\d{2}-\d{2}/u.exec(value);
  if (match) return match[0];
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : value;
}

function asPlaceId(value: string): PlaceId {
  return value as PlaceId;
}

function asRoleId(value: string): RoleId {
  return value as RoleId;
}

function asEventId(value: string): EventId {
  return value as EventId;
}

/** Legacy field kept in the input signature for documentation/type discovery. */
export type LegacyStampSpot = StampSpot;
