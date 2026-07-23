// Local intel repository (spec §13). Same seam as anitabi-index.ts:
// lazy-required bundled seed, sync queries, and a runtime-hydration swap for
// future server sync. The dataset is tens of entries, so queries are linear
// scans over memoized per-kind partitions.

import { hasSufficientRuntimeCoverage } from '../anitabi-runtime-coverage';
import { localityRepository } from '../locality/locality-repository';
import type {
  LocalityDataEnvelope,
  Place,
  PlaceId,
  PlaceRole,
  StampStopRole,
} from '../locality/types';
import { haversineKm } from '../spot-index';
import { resolveEventDateState, type EventDateState } from './event-schedule';
import { resolveOffsetMinutes } from './timezone';
import type {
  LocalIntelEntry,
  LocalIntelEvent,
  LocalIntelFile,
  LocalIntelShop,
  LocalIntelViewingHint,
} from './types';
import { DEFAULT_SPOT_TIMEZONE, DEFAULT_VIEWING_HINT_RADIUS_M } from './types';

interface IntelState {
  entries: LocalIntelEntry[];
  shops: LocalIntelShop[];
  events: LocalIntelEvent[];
  hints: LocalIntelViewingHint[];
}

let overrideState: IntelState | null = null;
let canonicalCache: { snapshot: LocalityDataEnvelope; state: IntelState } | null = null;
let version = 0;
const listeners = new Set<() => void>();

localityRepository.subscribe(() => {
  if (overrideState) return;
  canonicalCache = null;
  version += 1;
  for (const listener of listeners) listener();
});

function isFiniteGeo(geo: unknown): geo is [number, number] {
  return (
    Array.isArray(geo) && geo.length === 2 && Number.isFinite(geo[0]) && Number.isFinite(geo[1])
  );
}

/**
 * Lightweight normalization (the build pipeline owns full validation):
 * provenance and identity are load-bearing for the no-fake-data guarantee,
 * so entries missing them are dropped rather than rendered unverifiable.
 */
function normalize(file: LocalIntelFile): IntelState {
  const seen = new Set<string>();
  const entries: LocalIntelEntry[] = [];
  for (const entry of Array.isArray(file.entries) ? file.entries : []) {
    if (!entry || typeof entry !== 'object') continue;
    if (typeof entry.id !== 'string' || entry.id.length === 0) continue;
    if (entry.kind !== 'shop' && entry.kind !== 'event' && entry.kind !== 'viewing_hint') continue;
    if (typeof entry.sourceUrl !== 'string' || entry.sourceUrl.length === 0) continue;
    if (typeof entry.verifiedAt !== 'string' || entry.verifiedAt.length === 0) continue;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry.geo != null && !isFiniteGeo(entry.geo) ? { ...entry, geo: null } : entry);
  }
  return {
    entries,
    shops: entries.filter((e): e is LocalIntelShop => e.kind === 'shop'),
    events: entries.filter((e): e is LocalIntelEvent => e.kind === 'event'),
    hints: entries.filter((e): e is LocalIntelViewingHint => e.kind === 'viewing_hint'),
  };
}

function ensureBuilt(): IntelState {
  if (overrideState) return overrideState;
  const snapshot = localityRepository.getSnapshot();
  if (canonicalCache?.snapshot === snapshot) return canonicalCache.state;
  const state = projectCanonicalLocalIntel(snapshot);
  canonicalCache = { snapshot, state };
  return state;
}

/**
 * Swap in a runtime payload (future server sync). Guarded by the shared
 * coverage ratio so a degraded payload can never blank the bundled seed.
 */
export function hydrateLocalIntelFromRuntime(file: LocalIntelFile): void {
  if (!file || !Array.isArray(file.entries)) return;
  const current = ensureBuilt();
  const candidate = normalize(file);
  if (!hasSufficientRuntimeCoverage(current.entries.length, candidate.entries.length)) return;
  overrideState = candidate;
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribeLocalIntel(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLocalIntelVersion(): number {
  return version;
}

/** Test-only: reset module state, optionally installing a fixture directly. */
export function resetLocalIntelForTests(file?: LocalIntelFile): void {
  overrideState = file ? normalize(file) : null;
  canonicalCache = null;
  version = 0;
  listeners.clear();
}

export function getAllLocalIntelEntries(): readonly LocalIntelEntry[] {
  return ensureBuilt().entries;
}

export function getShopsForAnime(bangumiId: number): readonly LocalIntelShop[] {
  return ensureBuilt().shops.filter((s) => s.bangumiIds.includes(bangumiId));
}

export function getShopsNear(geo: [number, number], radiusKm: number): readonly LocalIntelShop[] {
  return ensureBuilt()
    .shops.flatMap((s) => {
      if (!s.geo) return [];
      const distanceKm = haversineKm(geo[0], geo[1], s.geo[0], s.geo[1]);
      return distanceKm <= radiusKm ? [{ shop: s, distanceKm }] : [];
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .map((x) => x.shop);
}

export function getEventsForAnime(bangumiId: number): readonly LocalIntelEvent[] {
  return ensureBuilt().events.filter((e) => e.bangumiIds.includes(bangumiId));
}

export function getActiveEvents(now: Date): readonly LocalIntelEvent[] {
  return ensureBuilt().events.filter((e) => resolveEventDateState(e, now).state === 'active');
}

export function getUpcomingEvents(now: Date, horizonDays = 90): readonly LocalIntelEvent[] {
  return ensureBuilt().events.filter((e) => {
    const state = resolveEventDateState(e, now);
    return state.state === 'upcoming' && state.startsInDays <= horizonDays;
  });
}

export interface HubRailEvent {
  event: LocalIntelEvent;
  state: EventDateState;
}

const DAY_MS = 86400000;

/** Start of `month` as a UTC instant in the event's timezone (not UTC months). */
function monthStartMs(year: number, month: number, tz: string): number {
  const naive = Date.UTC(year, month - 1, 1);
  return naive - resolveOffsetMinutes(tz, new Date(naive)) * 60000;
}

/** Days from `now` until the next start of `month` (this year or next). */
function daysUntilMonthStart(month: number, now: Date, tz: string): number {
  const year = now.getUTCFullYear();
  const thisYear = monthStartMs(year, month, tz);
  const start = thisYear >= now.getTime() ? thisYear : monthStartMs(year + 1, month, tz);
  return Math.ceil((start - now.getTime()) / DAY_MS);
}

/** Whether any day of `month` (this year or next) falls within the horizon. */
function monthWithinHorizon(month: number, now: Date, horizonDays: number, tz: string): boolean {
  const horizonEnd = now.getTime() + horizonDays * DAY_MS;
  for (const year of [now.getUTCFullYear(), now.getUTCFullYear() + 1]) {
    const monthStart = monthStartMs(year, month, tz);
    const monthEnd =
      monthStartMs(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, tz) - 1;
    if (monthStart <= horizonEnd && monthEnd >= now.getTime()) return true;
  }
  return false;
}

/**
 * Rail ordering (spec §13): active first (sooner-ending first, open-ended
 * `ongoing` programs last among actives), then dated upcoming by start date,
 * then unannounced annuals whose typical month falls within the horizon.
 */
export function getHubRailEvents(now: Date, horizonDays = 90): readonly HubRailEvent[] {
  const rows = ensureBuilt().events.map((event) => ({
    event,
    state: resolveEventDateState(event, now),
  }));

  const active = rows
    .filter((r) => r.state.state === 'active')
    .sort((a, b) => activeEndMs(a.state) - activeEndMs(b.state));
  const upcoming = rows
    .filter((r) => r.state.state === 'upcoming')
    .sort((a, b) => upcomingStartDays(a.state) - upcomingStartDays(b.state))
    .filter((r) => upcomingStartDays(r.state) <= horizonDays);
  const unannounced = rows
    .filter(
      (r) =>
        r.state.state === 'unannounced' &&
        monthWithinHorizon(r.state.typicalMonth, now, horizonDays, eventTz(r))
    )
    .sort((a, b) => tbaMonthDays(a, now) - tbaMonthDays(b, now));

  return [...active, ...upcoming, ...unannounced];
}

function activeEndMs(state: EventDateState): number {
  if (state.state !== 'active' || !state.occurrence) return Number.POSITIVE_INFINITY;
  return Date.parse(state.occurrence.endsAt);
}

function upcomingStartDays(state: EventDateState): number {
  return state.state === 'upcoming' ? state.startsInDays : Number.POSITIVE_INFINITY;
}

function eventTz(row: HubRailEvent): string {
  return row.event.timezone ?? DEFAULT_SPOT_TIMEZONE;
}

function tbaMonthDays(row: HubRailEvent, now: Date): number {
  return row.state.state === 'unannounced'
    ? daysUntilMonthStart(row.state.typicalMonth, now, eventTz(row))
    : 0;
}

export function getViewingHintForSpot(
  bangumiId: number,
  pointId: string
): LocalIntelViewingHint | null {
  const match = ensureBuilt().hints.find((h) =>
    h.spotRefs?.some((ref) => ref.bangumiId === bangumiId && ref.pointId === pointId)
  );
  return match ?? null;
}

export function getViewingHintNear(geo: [number, number]): LocalIntelViewingHint | null {
  let best: { hint: LocalIntelViewingHint; distanceKm: number } | null = null;
  for (const h of ensureBuilt().hints) {
    if (!h.geo) continue;
    const distanceKm = haversineKm(geo[0], geo[1], h.geo[0], h.geo[1]);
    const radiusKm = (h.radiusM ?? DEFAULT_VIEWING_HINT_RADIUS_M) / 1000;
    if (distanceKm <= radiusKm && (best === null || distanceKm < best.distanceKm)) {
      best = { hint: h, distanceKm };
    }
  }
  return best?.hint ?? null;
}

function projectCanonicalLocalIntel(snapshot: LocalityDataEnvelope): IntelState {
  const { entities } = snapshot;
  const entries: LocalIntelEntry[] = [];

  for (const guide of Object.values(entities.placeGuides)) {
    const place = entities.places[guide.placeId];
    if (!place) continue;
    const provenance = legacyProvenance(guide.provenance[0]);
    entries.push({
      kind: 'viewing_hint',
      id: guide.id,
      bangumiIds: [...guide.animeIds],
      name: guide.name,
      description: guide.description,
      geo: legacyGeo(place),
      timezone: place.timezone,
      hint: guide.guidanceKind,
      note: guide.note,
      ...(guide.bestMonths ? { bestMonths: [...guide.bestMonths] } : {}),
      ...(guide.appliesWithinMeters !== undefined ? { radiusM: guide.appliesWithinMeters } : {}),
      ...provenance,
    });
  }

  for (const role of Object.values(entities.roles)) {
    if (role.kind !== 'shop') continue;
    const place = entities.places[role.placeId];
    if (!place) continue;
    const provenance = legacyProvenance(role.provenance[0]);
    entries.push({
      kind: 'shop',
      id: place.id,
      bangumiIds: [...role.animeIds],
      name: place.name,
      description: role.description ?? place.name,
      geo: legacyGeo(place),
      timezone: place.timezone,
      category: role.shopCategory,
      animeConnection: role.animeConnection,
      ...(place.hours?.ja ? { hours: place.hours.ja } : {}),
      ...provenance,
    });
  }

  const roles = Object.values(entities.roles);
  for (const event of Object.values(entities.events)) {
    const stopRoles = roles.filter(
      (role): role is StampStopRole => role.kind === 'stamp_stop' && role.campaignId === event.id
    );
    const venue =
      event.category === 'stamp_rally'
        ? null
        : firstEventVenue(event.placeRefs, roles, entities.places);
    const provenance = legacyProvenance(event.provenance[0]);
    entries.push({
      kind: 'event',
      id: event.id,
      bangumiIds: [...event.animeIds],
      name: event.name,
      description: event.description,
      geo: venue ? legacyGeo(venue) : null,
      timezone: event.timezone,
      category: event.category,
      schedule: event.schedule,
      ...(venue ? { venue: venue.name } : {}),
      ...(stopRoles.length > 0
        ? {
            stampSpots: stopRoles.flatMap((role) => {
              const place = entities.places[role.placeId];
              if (!place) return [];
              return [
                {
                  name: role.sourceLabel,
                  ...(role.sourceAddress?.ja ? { address: role.sourceAddress.ja } : {}),
                  geo: legacyGeo(place),
                  sourceUrl: role.provenance[0].sourceUrl,
                },
              ];
            }),
          }
        : {}),
      ...provenance,
    });
  }

  return {
    entries,
    shops: entries.filter((entry): entry is LocalIntelShop => entry.kind === 'shop'),
    events: entries.filter((entry): entry is LocalIntelEvent => entry.kind === 'event'),
    hints: entries.filter((entry): entry is LocalIntelViewingHint => entry.kind === 'viewing_hint'),
  };
}

function firstEventVenue(
  placeIds: readonly PlaceId[],
  roles: readonly PlaceRole[],
  places: Readonly<Record<PlaceId, Place>>
): Place | null {
  for (const placeId of placeIds) {
    if (!roles.some((role) => role.placeId === placeId && role.kind === 'festival_venue')) continue;
    const place = places[placeId];
    if (place) return place;
  }
  return null;
}

function legacyGeo(place: Place): [number, number] | null {
  return place.geo ? [place.geo[0], place.geo[1]] : null;
}

function legacyProvenance(provenance: {
  sourceUrl: string;
  officialUrl?: string;
  verifiedAt: string;
}): Pick<LocalIntelEntry, 'sourceUrl' | 'officialUrl' | 'verifiedAt'> {
  return {
    sourceUrl: provenance.sourceUrl,
    ...(provenance.officialUrl ? { officialUrl: provenance.officialUrl } : {}),
    verifiedAt: provenance.verifiedAt,
  };
}
