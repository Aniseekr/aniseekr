// Timezone helpers for the local intel layer (spec §13).
//
// Prefers Intl.DateTimeFormat for arbitrary IANA zones but never depends on
// it: a fixed-offset table backs every P0 zone (Japan has no DST), so solar
// windows and event boundaries stay correct on runtimes without full Intl
// timezone data (Hermes).

import { DEFAULT_SPOT_TIMEZONE } from './types';

const FIXED_TZ_OFFSET_MINUTES: Record<string, number> = {
  'Asia/Tokyo': 540,
};

const DEFAULT_OFFSET_MINUTES = FIXED_TZ_OFFSET_MINUTES[DEFAULT_SPOT_TIMEZONE];

export interface CivilDate {
  y: number;
  m: number;
  d: number;
}

function offsetViaIntl(tz: string, instant: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(instant);
    const read = (type: string): number => {
      const value = parts.find((p) => p.type === type)?.value;
      const n = Number(value);
      return Number.isFinite(n) ? n : NaN;
    };
    const wallMs = Date.UTC(
      read('year'),
      read('month') - 1,
      read('day'),
      read('hour'),
      read('minute'),
      read('second'),
    );
    if (!Number.isFinite(wallMs)) return null;
    return Math.round((wallMs - instant.getTime()) / 60000);
  } catch {
    return null;
  }
}

/** UTC offset in minutes for `tz` at `instant`. Intl first, table fallback. */
export function resolveOffsetMinutes(tz: string, instant: Date): number {
  return offsetViaIntl(tz, instant) ?? FIXED_TZ_OFFSET_MINUTES[tz] ?? DEFAULT_OFFSET_MINUTES;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 'HH:mm' for an instant shifted by a known offset. The guaranteed path. */
export function formatTimeWithFixedOffset(instant: Date, offsetMinutes: number): string {
  const shifted = new Date(instant.getTime() + offsetMinutes * 60000);
  return `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`;
}

/** 'HH:mm' wall-clock time of `instant` in `tz`. */
export function formatTimeInTimeZone(instant: Date, tz: string): string {
  return formatTimeWithFixedOffset(instant, resolveOffsetMinutes(tz, instant));
}

/** The civil (wall-clock) date of `instant` in `tz`. */
export function civilDateInTimeZone(instant: Date, tz: string): CivilDate {
  const shifted = new Date(instant.getTime() + resolveOffsetMinutes(tz, instant) * 60000);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() };
}

/**
 * UTC instant for an ISO `YYYY-MM-DD` wall-clock date in `tz` — start of day,
 * or the final millisecond when `endOfDay` (date ranges are end-inclusive).
 * Returns null for malformed dates so callers can fail closed.
 */
export function wallDateToInstant(dateStr: string, tz: string, endOfDay: boolean): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;
  const [, y, m, d] = match;
  const naive = Date.UTC(Number(y), Number(m) - 1, Number(d)) + (endOfDay ? 86399999 : 0);
  // Two-pass so DST zones resolve the offset at the actual instant.
  const firstPass = naive - resolveOffsetMinutes(tz, new Date(naive)) * 60000;
  const offset = resolveOffsetMinutes(tz, new Date(firstPass));
  return new Date(naive - offset * 60000);
}
