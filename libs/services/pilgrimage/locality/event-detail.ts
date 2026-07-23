import {
  resolveEventDateState,
  type EventDateState,
} from '@/libs/services/pilgrimage/local-intel/event-schedule';
import { resolveLocalIntelText } from '@/libs/services/pilgrimage/local-intel/local-intel-localization';
import { localityRepository } from '@/libs/services/pilgrimage/locality/locality-repository';
import type { LocalityRepository } from '@/libs/services/pilgrimage/locality/repository';
import type {
  AreaDestination,
  EntityProvenance,
  EventId,
  FestivalVenueRole,
  GeoPoint,
  IntelProvenance,
  LocalityEvent,
  LocalizedText,
  Place,
  RoleId,
  StampStopRole,
} from '@/libs/services/pilgrimage/locality/types';

export type LocalityEventStopRole = StampStopRole | FestivalVenueRole;

export interface LocalityEventStop {
  id: RoleId;
  role: LocalityEventStopRole;
  place: Place;
  name: LocalizedText;
  address?: LocalizedText;
  mapsUrl: string | null;
  provenance: EntityProvenance;
}

export interface LocalityEventDetail {
  event: LocalityEvent;
  stops: readonly LocalityEventStop[];
  areas: readonly AreaDestination[];
  stopCount: number;
  primaryLocation: LocalizedText | null;
  additionalLocationCount: number;
}

export interface LocalityEventListRow extends LocalityEventDetail {
  state: EventDateState;
}

/** Google Maps search target for one real stop. Exact coordinates win over address text. */
export function buildGoogleMapsSearchUrl(
  geo: GeoPoint | null,
  address?: LocalizedText,
  language?: string
): string | null {
  if (geo) {
    return `https://www.google.com/maps/search/?api=1&query=${geo[0]},${geo[1]}`;
  }
  const query = address ? resolveLocalIntelText(address, language).value.trim() : '';
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Join one canonical Event to its campaign stops / festival venues without a legacy projection. */
export function getLocalityEventDetail(
  eventId: EventId,
  repository: LocalityRepository = localityRepository
): LocalityEventDetail | null {
  const event = repository.getEventById(eventId);
  if (!event) return null;

  const stopRoles = repository.getRoles({ campaignId: event.id }).filter(isStampStopRole);
  const festivalRolesByPlace = new Map(
    repository
      .getRoles({ kinds: ['festival_venue'] })
      .filter(isFestivalVenueRole)
      .map((role) => [role.placeId, role])
  );
  const festivalRoles = event.placeRefs.flatMap((placeId) => {
    const role = festivalRolesByPlace.get(placeId);
    return role ? [role] : [];
  });

  const seen = new Set<RoleId>();
  const roles: LocalityEventStopRole[] = [];
  for (const role of [...stopRoles, ...festivalRoles]) {
    if (seen.has(role.id)) continue;
    seen.add(role.id);
    roles.push(role);
  }

  const stops = roles.flatMap<LocalityEventStop>((role) => {
    const place = repository.getPlaceById(role.placeId);
    if (!place) return [];
    const name = role.kind === 'stamp_stop' ? role.sourceLabel : place.name;
    const address =
      role.kind === 'stamp_stop' ? (role.sourceAddress ?? place.address) : place.address;
    return [
      {
        id: role.id,
        role,
        place,
        name,
        ...(address ? { address } : {}),
        mapsUrl: buildGoogleMapsSearchUrl(place.geo, address),
        provenance: mergeProvenance(role.provenance, place.provenance),
      },
    ];
  });

  const snapshot = repository.getSnapshot();
  const areas = event.areaRefs.flatMap((areaId) => {
    const area = snapshot.entities.areaDestinations[areaId];
    return area ? [area] : [];
  });
  const primaryLocation = areas[0]?.name ?? stops[0]?.address ?? stops[0]?.place.name ?? null;
  const locationCount = new Set([
    ...areas.map((area) => `area:${area.id}`),
    ...stops.map((stop) => `place:${stop.place.id}`),
  ]).size;

  return {
    event,
    stops,
    areas,
    stopCount: stops.length,
    primaryLocation,
    additionalLocationCount: Math.max(0, locationCount - 1),
  };
}

/** Integrated hub rows: live first, then TBA annuals and honestly ended history. */
export function getLocalityEventListRows(
  now: Date,
  repository: LocalityRepository = localityRepository
): readonly LocalityEventListRow[] {
  return repository
    .getEvents()
    .flatMap((event) => {
      const detail = getLocalityEventDetail(event.id, repository);
      if (!detail) return [];
      const state = resolveEventDateState(event, now);
      return [{ ...detail, state }];
    })
    .sort(compareEventRows);
}

function compareEventRows(a: LocalityEventListRow, b: LocalityEventListRow): number {
  const rank = (state: EventDateState): number => {
    if (state.state === 'active') return 0;
    if (state.state === 'upcoming') return 1;
    if (state.state === 'unannounced') return 2;
    return 3;
  };
  const rankDiff = rank(a.state) - rank(b.state);
  if (rankDiff !== 0) return rankDiff;
  if (a.state.state === 'upcoming' && b.state.state === 'upcoming') {
    const startDiff = a.state.startsInDays - b.state.startsInDays;
    if (startDiff !== 0) return startDiff;
  }
  if (a.state.state === 'unannounced' && b.state.state === 'unannounced') {
    const monthDiff = a.state.typicalMonth - b.state.typicalMonth;
    if (monthDiff !== 0) return monthDiff;
  }
  return a.event.id.localeCompare(b.event.id);
}

function isStampStopRole(role: unknown): role is StampStopRole {
  return !!role && typeof role === 'object' && (role as { kind?: string }).kind === 'stamp_stop';
}

function isFestivalVenueRole(role: unknown): role is FestivalVenueRole {
  return (
    !!role && typeof role === 'object' && (role as { kind?: string }).kind === 'festival_venue'
  );
}

function mergeProvenance(primary: EntityProvenance, secondary: EntityProvenance): EntityProvenance {
  const out: IntelProvenance[] = [];
  const seen = new Set<string>();
  for (const credit of [...primary, ...secondary]) {
    const key = `${credit.officialUrl ?? credit.sourceUrl}\0${credit.sourceUrl}\0${credit.verifiedAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(credit);
  }
  return out as unknown as EntityProvenance;
}
