// Event date-state machine (spec §13). Pure over `now` — no clocks inside.
//
// The honesty guarantees live here, not in UI: an ended event can never
// resolve to `active`, and an annual event whose current-year dates are not
// officially confirmed resolves to `unannounced` — a date is never invented.

import { wallDateToInstant } from './timezone';
import type { EventOccurrence, LocalIntelEvent } from './types';
import { DEFAULT_SPOT_TIMEZONE } from './types';

export type EventDateState =
  | { state: 'upcoming'; occurrence: EventOccurrence; startsInDays: number }
  | { state: 'active'; occurrence: EventOccurrence | null }
  | { state: 'ended'; occurrence: EventOccurrence | null }
  | { state: 'unannounced'; typicalMonth: number };

const DAY_MS = 86400000;

type OccurrenceState =
  | { state: 'upcoming'; startsInDays: number }
  | { state: 'active' }
  | { state: 'ended' };

/**
 * Where `now` falls relative to one occurrence's [start-of-startsAt,
 * end-of-endsAt] window in the event timezone. Malformed dates fail closed
 * to `ended` so bad data can never present as active.
 */
function resolveOccurrence(occurrence: EventOccurrence, now: Date, tz: string): OccurrenceState {
  const start = wallDateToInstant(occurrence.startsAt, tz, false);
  const end = wallDateToInstant(occurrence.endsAt, tz, true);
  if (!start || !end) return { state: 'ended' };
  if (now.getTime() < start.getTime()) {
    return { state: 'upcoming', startsInDays: Math.ceil((start.getTime() - now.getTime()) / DAY_MS) };
  }
  if (now.getTime() <= end.getTime()) return { state: 'active' };
  return { state: 'ended' };
}

export function resolveEventDateState(event: LocalIntelEvent, now: Date): EventDateState {
  const tz = event.timezone ?? DEFAULT_SPOT_TIMEZONE;
  const schedule = event.schedule;

  if (schedule.kind === 'ongoing') {
    return { state: 'active', occurrence: null };
  }

  if (schedule.kind === 'fixed') {
    const occurrence: EventOccurrence = {
      year: Number(schedule.startsAt.slice(0, 4)),
      startsAt: schedule.startsAt,
      endsAt: schedule.endsAt,
    };
    const resolved = resolveOccurrence(occurrence, now, tz);
    if (resolved.state === 'upcoming') {
      return { state: 'upcoming', occurrence, startsInDays: resolved.startsInDays };
    }
    return { state: resolved.state, occurrence };
  }

  // annual
  const ordered = [...schedule.confirmed].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  if (schedule.discontinued) {
    return { state: 'ended', occurrence: ordered[ordered.length - 1] ?? null };
  }
  let soonestUpcoming: { occurrence: EventOccurrence; startsInDays: number } | null = null;
  for (const occurrence of ordered) {
    const resolved = resolveOccurrence(occurrence, now, tz);
    if (resolved.state === 'active') return { state: 'active', occurrence };
    if (resolved.state === 'upcoming' && soonestUpcoming === null) {
      soonestUpcoming = { occurrence, startsInDays: resolved.startsInDays };
    }
  }
  if (soonestUpcoming) {
    return { state: 'upcoming', ...soonestUpcoming };
  }
  return { state: 'unannounced', typicalMonth: schedule.typicalMonth };
}
