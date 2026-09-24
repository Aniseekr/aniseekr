import { describe, expect, it } from 'bun:test';
import {
  getLocalityEventDetail,
  type LocalityEventListRow,
  type LocalityEventDetail,
} from '@/libs/services/pilgrimage/locality/event-detail';
import type { EventId } from '@/libs/services/pilgrimage/locality/types';
import {
  buildRallyRoute,
  buildStampBooks,
  countJoinableRallies,
  selectDiscoverRallies,
  summarizeRallyProgress,
} from '@/libs/services/pilgrimage/locality/stamp-rally';

function rallyDetail(): LocalityEventDetail {
  return getLocalityEventDetail('numazu-machiaruki-stamp' as EventId)!;
}

describe('stamp rallies', () => {
  it('PILG-061 preserves published stamp order and derives only known straight-line legs', () => {
    const detail = rallyDetail();
    const festival = getLocalityEventDetail('yuwaku-bonbori-matsuri' as EventId)!;
    const stops = [detail.stops[2], detail.stops[0], detail.stops[1]].map((stop, index) => ({
      ...stop,
      place: { ...stop.place, geo: index === 2 ? null : ([0, index] as const) },
    }));
    const route = buildRallyRoute({
      ...detail,
      stops: [stops[0], festival.stops[0], ...stops.slice(1)],
    });
    expect(route.map((stop) => stop.id)).toEqual(stops.map((stop) => stop.id));
    expect(Math.abs(route[0].legToNext!.straightLineKm - 111.195)).toBeLessThan(0.05);
    expect(route[1].legToNext).toBeNull();
    expect(route[2].legToNext).toBeNull();
    expect(buildRallyRoute({ ...detail, stops: [stops[2], stops[0]] })[0].legToNext).toBeNull();
    expect(buildRallyRoute({ ...detail, stops: [] })).toEqual([]);
  });
});

it('PILG-062 counts only collected route stops and does not complete an empty rally', () => {
  const route = buildRallyRoute(rallyDetail()).slice(0, 2);
  expect(summarizeRallyProgress(route, { [route[0].id]: true, unrelated: true })).toEqual({
    collected: 1,
    total: 2,
    complete: false,
  });
  expect(summarizeRallyProgress(route, { [route[0].id]: true, [route[1].id]: true })).toEqual({
    collected: 2,
    total: 2,
    complete: true,
  });
  expect(summarizeRallyProgress([], {})).toEqual({ collected: 0, total: 0, complete: false });
});

function row(
  id: string,
  state: LocalityEventListRow['state'],
  category: LocalityEventListRow['event']['category'] = 'stamp_rally'
): LocalityEventListRow {
  const detail = rallyDetail();
  return { ...detail, event: { ...detail.event, id: id as EventId, category }, state };
}

it('PILG-063 selects only joinable rallies in input order with the requested cap', () => {
  const rows = [
    row('ended', { state: 'ended', occurrence: null }),
    row('upcoming', {
      state: 'upcoming',
      occurrence: { year: 2026, startsAt: '2026-10-01', endsAt: '2026-10-02' },
      startsInDays: 7,
    }),
    row('tba', { state: 'unannounced', typicalMonth: 10 }),
    row('festival', { state: 'active', occurrence: null }, 'festival'),
    row('active', { state: 'active', occurrence: null }),
  ];
  expect(selectDiscoverRallies(rows).map((r) => String(r.event.id))).toEqual([
    'upcoming',
    'active',
  ]);
  expect(selectDiscoverRallies(rows, 1).map((r) => String(r.event.id))).toEqual(['upcoming']);
  expect(selectDiscoverRallies(rows, 0)).toEqual([]);
  expect(selectDiscoverRallies(Array.from({ length: 12 }, () => rows[4]))).toHaveLength(10);
  expect(countJoinableRallies(rows)).toBe(2);
  expect(countJoinableRallies(Array.from({ length: 12 }, () => rows[4]))).toBe(12);
});

/** A synthetic rally whose stop ids are unique to it, so one visited map can hold every rally. */
function rallyRow(
  id: string,
  state: LocalityEventListRow['state'],
  category: LocalityEventListRow['event']['category'] = 'stamp_rally'
): LocalityEventListRow {
  const base = row(id, state, category);
  return {
    ...base,
    stops: base.stops.map((stop) => ({ ...stop, id: `${id}:${stop.id}` as typeof stop.id })),
  };
}

const ACTIVE = { state: 'active', occurrence: null } as const;
const ENDED = { state: 'ended', occurrence: null } as const;

it('PILG-064 builds a book only for rallies with at least one stamp, stamps in route order', () => {
  const rally = rallyRow('a', ACTIVE);
  const festival = rallyRow('f', ACTIVE, 'festival');
  const route = buildRallyRoute(rally);
  const visitedAt: Record<string, number> = {};
  const at = (roleId: string): number | null => visitedAt[roleId] ?? null;

  expect(buildStampBooks([rally, festival], at)).toEqual([]);

  visitedAt[route[0].id] = 1_000;
  visitedAt[festival.stops[0].id] = 1_000; // a stamped festival stop still yields no book
  const books = buildStampBooks([rally, festival], at);
  expect(books).toHaveLength(1);
  const [book] = books;
  expect(String(book.eventId)).toBe('a');
  expect(book.name).toEqual(rally.event.name);
  expect(book.stamps.map((stamp) => stamp.roleId)).toEqual(route.map((stop) => stop.id));
  expect(book.stamps[0]).toEqual({ roleId: route[0].id, label: route[0].name, collectedAt: 1_000 });
  expect(book.stamps.slice(1).every((stamp) => stamp.collectedAt === null)).toBe(true);
  expect(book).toMatchObject({
    collected: 1,
    total: route.length,
    complete: false,
    lastCollectedAt: 1_000,
  });
});

it('PILG-064 orders books in-progress → complete → ended-incomplete, newest stamp first within a group', () => {
  const rows = [
    rallyRow('ended-partial', ENDED),
    rallyRow('complete-old', ACTIVE),
    rallyRow('progress-old', ACTIVE),
    rallyRow('complete-new', ENDED), // a finished book stays "complete" even after the rally ends
    rallyRow('progress-new', ACTIVE),
  ];
  const visitedAt: Record<string, number> = {};
  const stamp = (r: LocalityEventListRow, count: number, time: number) =>
    buildRallyRoute(r)
      .slice(0, count)
      .forEach((stop) => (visitedAt[stop.id] = time));
  const total = buildRallyRoute(rows[0]).length;
  stamp(rows[0], 1, 9_999);
  stamp(rows[1], total, 200);
  stamp(rows[2], 1, 100);
  stamp(rows[3], total, 300);
  stamp(rows[4], 1, 500);

  const books = buildStampBooks(rows, (roleId) => visitedAt[roleId] ?? null);
  expect(books.map((b) => String(b.eventId))).toEqual([
    'progress-new',
    'progress-old',
    'complete-new',
    'complete-old',
    'ended-partial',
  ]);
  expect(books.find((b) => b.eventId === 'complete-new')?.complete).toBe(true);
});
