import type { LocalityEventListRow } from '@/libs/services/pilgrimage/locality/event-detail';
import type { IsoDate } from '@/libs/services/pilgrimage/locality/types';

export interface LocalityCalendarMonth {
  year: number;
  /** ISO month number, 1 through 12. */
  month: number;
}

/**
 * Expand real active/upcoming occurrence windows into one requested month.
 * Ongoing, unannounced, and ended rows deliberately have no calendar day.
 */
export function mapLocalityEventRowsByDay<Row extends LocalityEventListRow>(
  rows: readonly Row[],
  month: LocalityCalendarMonth
): ReadonlyMap<IsoDate, readonly Row[]> {
  assertCalendarMonth(month);

  const monthStart = toIsoDate(month.year, month.month, 1);
  const monthEnd = toIsoDate(month.year, month.month, daysInMonth(month.year, month.month));
  const rowsByDay = new Map<IsoDate, Row[]>();

  for (const row of rows) {
    const occurrence =
      row.state.state === 'active' || row.state.state === 'upcoming' ? row.state.occurrence : null;
    if (!occurrence) continue;

    const clippedStart = occurrence.startsAt < monthStart ? monthStart : occurrence.startsAt;
    const clippedEnd = occurrence.endsAt > monthEnd ? monthEnd : occurrence.endsAt;
    if (clippedStart > clippedEnd) continue;

    const firstDay = Number(clippedStart.slice(8, 10));
    const lastDay = Number(clippedEnd.slice(8, 10));
    for (let day = firstDay; day <= lastDay; day += 1) {
      const key = toIsoDate(month.year, month.month, day);
      const current = rowsByDay.get(key);
      if (current) current.push(row);
      else rowsByDay.set(key, [row]);
    }
  }

  return rowsByDay;
}

function assertCalendarMonth(month: LocalityCalendarMonth): void {
  if (
    !Number.isInteger(month.year) ||
    !Number.isInteger(month.month) ||
    month.month < 1 ||
    month.month > 12
  ) {
    throw new RangeError(`Invalid calendar month ${month.year}-${month.month}`);
  }
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toIsoDate(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
