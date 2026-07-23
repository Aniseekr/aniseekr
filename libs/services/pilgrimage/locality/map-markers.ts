import type { AnimeTourism88EntryWithCoords } from '@/libs/services/pilgrimage/anime88-repository';
import { resolveLocalIntelText } from '@/libs/services/pilgrimage/local-intel/local-intel-localization';
import type { MapMarker } from '@/libs/services/pilgrimage/map-engine/types';
import type { LocalityRepository } from '@/libs/services/pilgrimage/locality/repository';
import type {
  EventId,
  FestivalVenueRole,
  PlaceRole,
  ShopRole,
  StampStopRole,
} from '@/libs/services/pilgrimage/locality/types';

export interface LocalityMarkerPalette {
  stamp: string;
  shop: string;
  festival: string;
  area: string;
}

export interface LocalityMarkerQuery {
  animeId?: number;
  eventId?: EventId;
  language?: string;
  visitedRoleIds?: ReadonlySet<string>;
}

type MappableRole = StampStopRole | ShopRole | FestivalVenueRole;

/** Exact canonical PlaceRole markers. Coordinate-free destinations never enter this path. */
export function buildCanonicalLocalityMarkers(
  repository: LocalityRepository,
  palette: LocalityMarkerPalette,
  query: LocalityMarkerQuery = {}
): MapMarker[] {
  const event = query.eventId ? repository.getEventById(query.eventId) : null;
  const roles = event
    ? eventRoles(repository, event.id)
    : repository
        .getRoles({
          ...(query.animeId !== undefined ? { animeId: query.animeId } : {}),
          kinds: ['stamp_stop', 'shop', 'festival_venue'],
        })
        .filter(isMappableRole);

  return roles.flatMap((role) => {
    const place = repository.getPlaceById(role.placeId);
    if (!place?.geo) return [];
    const kind = markerKind(role);
    const eventId =
      role.kind === 'stamp_stop'
        ? role.campaignId
        : (query.eventId ?? resolveFestivalEventId(repository, role));
    const name = role.kind === 'stamp_stop' ? role.sourceLabel : place.name;
    return [
      {
        id: `locality:${role.id}`,
        lat: place.geo[0],
        lng: place.geo[1],
        kind,
        title: resolveLocalIntelText(name, query.language).value,
        color: palette[kind],
        visited: role.kind === 'stamp_stop' && query.visitedRoleIds?.has(role.id) === true,
        precision: 'exact',
        placeId: place.id,
        roleId: role.id,
        ...(eventId ? { eventId } : {}),
        ...(role.animeIds[0] !== undefined ? { bangumiId: role.animeIds[0] } : {}),
      },
    ];
  });
}

/** Administrative map anchors: explicitly labelled areas, never Place ids or visitable pins. */
export function buildAnime88AreaMarkers(
  entries: readonly AnimeTourism88EntryWithCoords[],
  color: string
): MapMarker[] {
  return entries.map((entry) => ({
    id: `area:anime-tourism-88:${entry.year}:${entry.id}`,
    lat: entry.lat,
    lng: entry.lng,
    kind: 'area',
    title: entry.city.trim() || entry.prefecture,
    city: [entry.prefecture, entry.city].filter(Boolean).join(' '),
    color,
    precision: 'area',
    areaId: `anime-tourism-88:${entry.year}:${entry.id}`,
    eightyEightId: entry.id,
    ...(typeof entry.externalIds.bangumi === 'number'
      ? { bangumiId: entry.externalIds.bangumi }
      : {}),
  }));
}

function eventRoles(repository: LocalityRepository, eventId: EventId): MappableRole[] {
  const event = repository.getEventById(eventId);
  if (!event) return [];
  const stampRoles = repository.getRoles({ campaignId: eventId }).filter(isMappableRole);
  const festivalRoles = repository
    .getRoles({ kinds: ['festival_venue'] })
    .filter(isMappableRole)
    .filter((role) => event.placeRefs.includes(role.placeId));
  const byId = new Map([...stampRoles, ...festivalRoles].map((role) => [role.id, role]));
  return [...byId.values()];
}

function resolveFestivalEventId(
  repository: LocalityRepository,
  role: MappableRole
): EventId | undefined {
  if (role.kind !== 'festival_venue') return undefined;
  return repository
    .getEvents({ placeId: role.placeId, categories: ['festival'] })
    .find((event) => event.animeIds.some((id) => role.animeIds.includes(id)))?.id;
}

function markerKind(role: MappableRole): 'stamp' | 'shop' | 'festival' {
  if (role.kind === 'stamp_stop') return 'stamp';
  if (role.kind === 'shop') return 'shop';
  return 'festival';
}

function isMappableRole(role: PlaceRole): role is MappableRole {
  return role.kind === 'stamp_stop' || role.kind === 'shop' || role.kind === 'festival_venue';
}
