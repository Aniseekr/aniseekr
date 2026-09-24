import type { EventDateState } from '@/libs/services/pilgrimage/local-intel/event-schedule';
import type {
  LocalityEventDetail,
  LocalityEventListRow,
  LocalityEventStop,
} from '@/libs/services/pilgrimage/locality/event-detail';
import type { EventId, LocalizedText, RoleId } from '@/libs/services/pilgrimage/locality/types';
import { haversineKm } from '@/libs/services/pilgrimage/route-order';
import type { StampStopVisitedMap } from '@/libs/services/pilgrimage/visited-prefs';

/**
 * One stamp stop on a rally's route. `legToNext` is the straight-line distance to
 * the next stop — never a walking/transit estimate, which we have no data for.
 */
export interface RallyRouteStop extends LocalityEventStop {
  legToNext: { straightLineKm: number } | null;
}

export interface RallyProgress {
  collected: number;
  total: number;
  complete: boolean;
}

export interface StampBookStamp {
  roleId: RoleId;
  /** Stop label exactly as the campaign published it. */
  label: LocalizedText;
  collectedAt: number | null;
}

/** A rally the user has started collecting, as shown in the Journal stamp book. */
export interface StampBook {
  eventId: EventId;
  name: LocalizedText;
  state: EventDateState;
  stamps: readonly StampBookStamp[];
  collected: number;
  total: number;
  complete: boolean;
  lastCollectedAt: number;
}

/** The repository's published order is the route; coordinates never reorder it. */
export function buildRallyRoute(detail: LocalityEventDetail): RallyRouteStop[] {
  const stops = detail.stops.filter((stop) => stop.role.kind === 'stamp_stop');
  return stops.map((stop, index) => {
    const next = stops[index + 1];
    return {
      ...stop,
      legToNext:
        stop.place.geo && next?.place.geo
          ? { straightLineKm: haversineKm(stop.place.geo, next.place.geo) }
          : null,
    };
  });
}

export function summarizeRallyProgress(
  route: readonly RallyRouteStop[],
  visited: StampStopVisitedMap
): RallyProgress {
  const total = route.length;
  const collected = route.filter((stop) => visited[stop.id] === true).length;
  return { collected, total, complete: total > 0 && collected === total };
}

function isJoinableRally(row: LocalityEventListRow): boolean {
  return (
    row.event.category === 'stamp_rally' &&
    (row.state.state === 'active' || row.state.state === 'upcoming')
  );
}

/** Rallies worth advertising on Discover: running now or starting soon, in list order. */
export function selectDiscoverRallies(
  rows: readonly LocalityEventListRow[],
  limit = 10
): LocalityEventListRow[] {
  return rows.filter(isJoinableRally).slice(0, Math.max(0, limit));
}

export function countJoinableRallies(rows: readonly LocalityEventListRow[]): number {
  return rows.filter(isJoinableRally).length;
}

/**
 * Stamp books for every rally with at least one collected stamp. Unfinished books
 * of rallies still running come first, then finished books, then unfinished books
 * of rallies that have ended; within each group the most recent stamp wins.
 */
export function buildStampBooks(
  rows: readonly LocalityEventListRow[],
  visitedAtFor: (roleId: RoleId) => number | null
): StampBook[] {
  const books = rows.flatMap<StampBook>((row) => {
    if (row.event.category !== 'stamp_rally') return [];
    const stamps = buildRallyRoute(row).map<StampBookStamp>((stop) => ({
      roleId: stop.id,
      label: stop.name,
      collectedAt: visitedAtFor(stop.id),
    }));
    const collectedTimes = stamps.flatMap((stamp) =>
      stamp.collectedAt === null ? [] : [stamp.collectedAt]
    );
    if (collectedTimes.length === 0) return [];
    return [
      {
        eventId: row.event.id,
        name: row.event.name,
        state: row.state,
        stamps,
        collected: collectedTimes.length,
        total: stamps.length,
        complete: collectedTimes.length === stamps.length,
        lastCollectedAt: Math.max(...collectedTimes),
      },
    ];
  });

  const rank = (book: StampBook): number => {
    if (book.complete) return 1;
    return book.state.state === 'ended' ? 2 : 0;
  };
  return books
    .map((book, index) => ({ book, index }))
    .sort(
      (a, b) =>
        rank(a.book) - rank(b.book) ||
        b.book.lastCollectedAt - a.book.lastCollectedAt ||
        a.index - b.index
    )
    .map(({ book }) => book);
}
