import {
  LOCALITY_SCHEMA_VERSION,
  type AreaDestination,
  type IntelProvenance,
  type LocalityDataEnvelope,
  type LocalityEvent,
  type LocalityNewsSource,
  type LocalizedText,
  type Place,
  type PlaceGuide,
  type PlaceRole,
} from '@/libs/services/pilgrimage/locality/types';

/** Validates a complete candidate before any repository reader can observe it. */
export function validateLocalityDataEnvelope(value: unknown): LocalityDataEnvelope {
  assertRecord(value, 'locality envelope');
  if (value.schemaVersion !== LOCALITY_SCHEMA_VERSION) {
    throw new Error(`unsupported locality schemaVersion ${String(value.schemaVersion)}`);
  }
  assertIsoDateTime(value.generatedAt, 'locality generatedAt');
  assertRecord(value.entities, 'locality entities');

  const places = validateTable<Place>(value.entities.places, 'place', validatePlace);
  const roles = validateTable<PlaceRole>(value.entities.roles, 'role', validateRoleShape);
  const events = validateTable<LocalityEvent>(value.entities.events, 'event', validateEventShape);
  const areas = validateTable<AreaDestination>(
    value.entities.areaDestinations,
    'area destination',
    validateAreaShape
  );
  const guides = validateTable<PlaceGuide>(
    value.entities.placeGuides,
    'place guide',
    validateGuideShape
  );
  const newsSources = validateTable<LocalityNewsSource>(
    value.entities.newsSources,
    'news source',
    validateNewsSourceShape
  );

  for (const role of Object.values(roles)) {
    const place = places[role.placeId];
    if (!place) throw new Error(`role ${role.id} references missing place ${role.placeId}`);
    for (const animeId of role.animeIds) {
      if (!place.animeIds.includes(animeId)) {
        throw new Error(`role ${role.id} animeId ${animeId} is missing from place ${role.placeId}`);
      }
    }
    if (role.kind === 'stamp_stop') {
      const campaign = events[role.campaignId];
      if (!campaign) {
        throw new Error(`stamp role ${role.id} references missing campaign ${role.campaignId}`);
      }
      if (campaign.category !== 'stamp_rally') {
        throw new Error(`stamp role ${role.id} campaign ${role.campaignId} is not a stamp rally`);
      }
      if (!campaign.placeRefs.includes(role.placeId)) {
        throw new Error(
          `stamp role ${role.id} place ${role.placeId} is missing from campaign ${role.campaignId}`
        );
      }
    }
  }

  for (const event of Object.values(events)) {
    for (const placeId of event.placeRefs) {
      if (!places[placeId])
        throw new Error(`event ${event.id} references missing place ${placeId}`);
    }
    for (const areaId of event.areaRefs) {
      if (!areas[areaId]) throw new Error(`event ${event.id} references missing area ${areaId}`);
    }
  }

  for (const area of Object.values(areas)) {
    for (const placeId of area.placeRefs) {
      const place = places[placeId];
      if (!place) throw new Error(`area ${area.id} references missing place ${placeId}`);
      for (const animeId of area.animeIds) {
        if (!place.animeIds.includes(animeId)) {
          throw new Error(`area ${area.id} animeId ${animeId} is missing from place ${placeId}`);
        }
      }
    }
  }

  for (const guide of Object.values(guides)) {
    const place = places[guide.placeId];
    if (!place)
      throw new Error(`place guide ${guide.id} references missing place ${guide.placeId}`);
    for (const animeId of guide.animeIds) {
      if (!place.animeIds.includes(animeId)) {
        throw new Error(
          `place guide ${guide.id} animeId ${animeId} is missing from place ${guide.placeId}`
        );
      }
    }
  }

  for (const source of Object.values(newsSources)) {
    for (const placeId of source.placeRefs) {
      if (!places[placeId]) {
        throw new Error(`news source ${source.id} references missing place ${placeId}`);
      }
    }
    for (const eventId of source.eventRefs) {
      if (!events[eventId]) {
        throw new Error(`news source ${source.id} references missing event ${eventId}`);
      }
    }
  }

  return value as unknown as LocalityDataEnvelope;
}

function validatePlace(place: Place): void {
  assertLocalizedText(place.name, `place ${place.id} name`);
  assertAnimeIds(place.animeIds, `place ${place.id} animeIds`);
  assertProvenance(place.provenance, `place ${place.id}`);
  if (place.geo !== null) assertGeo(place.geo, `place ${place.id} geo`);
  if (place.address !== undefined) assertLocalizedText(place.address, `place ${place.id} address`);
  if (place.hours !== undefined) assertLocalizedText(place.hours, `place ${place.id} hours`);
}

function validateRoleShape(role: PlaceRole): void {
  assertNonEmptyString(role.placeId, `role ${role.id} placeId`);
  assertAnimeIds(role.animeIds, `role ${role.id} animeIds`);
  assertProvenance(role.provenance, `role ${role.id}`);
  if (!['scene', 'stamp_stop', 'shop', 'festival_venue'].includes(role.kind)) {
    throw new Error(`role ${role.id} has invalid kind ${String(role.kind)}`);
  }
  if (role.kind === 'scene') {
    assertPositiveInteger(role.anitabiRef.bangumiId, `role ${role.id} anitabi bangumiId`);
    assertNonEmptyString(role.anitabiRef.pointId, `role ${role.id} anitabi pointId`);
  } else if (role.kind === 'stamp_stop') {
    assertNonEmptyString(role.campaignId, `role ${role.id} campaignId`);
    assertLocalizedText(role.sourceLabel, `role ${role.id} sourceLabel`);
    if (role.sourceAddress !== undefined) {
      assertLocalizedText(role.sourceAddress, `role ${role.id} sourceAddress`);
    }
  } else if (role.kind === 'shop') {
    assertLocalizedText(role.animeConnection, `role ${role.id} animeConnection`);
  }
}

function validateEventShape(event: LocalityEvent): void {
  assertLocalizedText(event.name, `event ${event.id} name`);
  assertLocalizedText(event.description, `event ${event.id} description`);
  assertAnimeIds(event.animeIds, `event ${event.id} animeIds`);
  assertUniqueStrings(event.placeRefs, `event ${event.id} placeRefs`);
  assertUniqueStrings(event.areaRefs, `event ${event.id} areaRefs`);
  assertProvenance(event.provenance, `event ${event.id}`);
}

function validateAreaShape(area: AreaDestination): void {
  if (area.areaKind !== 'administrative_area') {
    throw new Error(`area ${area.id} has invalid areaKind ${String(area.areaKind)}`);
  }
  if ('geo' in area) throw new Error(`area ${area.id} must not carry geo`);
  assertLocalizedText(area.name, `area ${area.id} name`);
  assertNonEmptyString(area.prefecture, `area ${area.id} prefecture`);
  assertNonEmptyString(area.locality, `area ${area.id} locality`);
  assertNonEmptyString(area.programId, `area ${area.id} programId`);
  assertNonEmptyString(area.edition, `area ${area.id} edition`);
  assertNonEmptyString(area.sourceEntryId, `area ${area.id} sourceEntryId`);
  assertAnimeIds(area.animeIds, `area ${area.id} animeIds`);
  assertUniqueStrings(area.placeRefs, `area ${area.id} placeRefs`);
  assertProvenance(area.provenance, `area ${area.id}`);
}

function validateGuideShape(guide: PlaceGuide): void {
  assertNonEmptyString(guide.placeId, `place guide ${guide.id} placeId`);
  assertAnimeIds(guide.animeIds, `place guide ${guide.id} animeIds`);
  assertLocalizedText(guide.name, `place guide ${guide.id} name`);
  assertLocalizedText(guide.description, `place guide ${guide.id} description`);
  assertLocalizedText(guide.note, `place guide ${guide.id} note`);
  assertProvenance(guide.provenance, `place guide ${guide.id}`);
}

function validateNewsSourceShape(source: LocalityNewsSource): void {
  assertLocalizedText(source.name, `news source ${source.id} name`);
  assertHttpUrl(source.feedUrl, `news source ${source.id} feedUrl`);
  assertHttpUrl(source.homepageUrl, `news source ${source.id} homepageUrl`);
  assertAnimeIds(source.animeIds, `news source ${source.id} animeIds`);
  assertUniqueStrings(source.placeRefs, `news source ${source.id} placeRefs`);
  assertUniqueStrings(source.eventRefs, `news source ${source.id} eventRefs`);
  assertProvenance(source.provenance, `news source ${source.id}`);
}

function validateTable<T extends { readonly id: string }>(
  value: unknown,
  label: string,
  validate: (entity: T) => void
): Record<string, T> {
  assertRecord(value, `${label} table`);
  const table = value as Record<string, T>;
  for (const [key, entity] of Object.entries(table)) {
    assertRecord(entity, `${label} ${key}`);
    assertNonEmptyString(entity.id, `${label} ${key} id`);
    if (key !== entity.id)
      throw new Error(`${label} table key ${key} does not match id ${entity.id}`);
    validate(entity);
  }
  return table;
}

function assertProvenance(value: unknown, label: string): asserts value is IntelProvenance[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} has empty provenance`);
  }
  value.forEach((credit, index) => {
    assertRecord(credit, `${label} provenance[${index}]`);
    assertLocalizedText(credit.sourceName, `${label} provenance[${index}] sourceName`);
    assertHttpUrl(credit.sourceUrl, `${label} provenance[${index}] sourceUrl`);
    assertIsoDate(credit.verifiedAt, `${label} provenance[${index}] verifiedAt`);
    if (credit.officialUrl !== undefined) {
      assertHttpUrl(credit.officialUrl, `${label} provenance[${index}] officialUrl`);
    }
    if (credit.license !== undefined) {
      assertNonEmptyString(credit.license, `${label} provenance[${index}] license`);
    }
    if (credit.copyrightNotice !== undefined) {
      assertLocalizedText(credit.copyrightNotice, `${label} provenance[${index}] copyrightNotice`);
    }
  });
}

function assertLocalizedText(value: unknown, label: string): asserts value is LocalizedText {
  assertRecord(value, label);
  assertNonEmptyString(value.ja, `${label}.ja`);
}

function assertAnimeIds(value: unknown, label: string): asserts value is number[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const seen = new Set<number>();
  for (const animeId of value) {
    assertPositiveInteger(animeId, label);
    if (seen.has(animeId)) throw new Error(`${label} contains duplicate ${animeId}`);
    seen.add(animeId);
  }
}

function assertUniqueStrings(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const seen = new Set<string>();
  for (const item of value) {
    assertNonEmptyString(item, label);
    if (seen.has(item)) throw new Error(`${label} contains duplicate ${item}`);
    seen.add(item);
  }
}

function assertGeo(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`${label} is invalid`);
  const [latitude, longitude] = value;
  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    (latitude === 0 && longitude === 0)
  ) {
    throw new Error(`${label} is invalid`);
  }
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must contain positive integer anime ids`);
  }
}

function assertHttpUrl(value: unknown, label: string): void {
  assertNonEmptyString(value, label);
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('protocol');
  } catch {
    throw new Error(`${label} must be an http(s) URL`);
  }
}

function assertIsoDate(value: unknown, label: string): void {
  assertNonEmptyString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must be an ISO date`);
  }
}

function assertIsoDateTime(value: unknown, label: string): void {
  assertNonEmptyString(value, label);
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp`);
}
