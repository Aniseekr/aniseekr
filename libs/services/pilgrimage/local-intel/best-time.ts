// Real best-viewing-time computation (spec §13).
//
// Same display shape as scene-analysis's inferBestTime, but the range is
// actual solar math for the spot's coordinates — flagged `computed: true` so
// the two can never be confused. Non-solar hints (night, seasonal) return
// null instead of a fabricated window; their curated note still renders.

import { getSunTimes } from './solar';
import type { SunTimes, SunWindow } from './solar';
import { civilDateInTimeZone, formatTimeInTimeZone } from './timezone';
import type { LocalIntelViewingHint, ViewingHintKind } from './types';
import { DEFAULT_SPOT_TIMEZONE } from './types';

export interface ComputedBestTime {
  jp: string;
  en: string;
  /** 'HH:mm – HH:mm' in the spot's timezone. Real solar math, never a guess. */
  range: string;
  computed: true;
  /** 0 = today's window, 1 = tomorrow's (today's already passed). */
  dayOffset: 0 | 1;
  sourceHintId?: string;
}

const LABELS: Record<string, { jp: string; en: string }> = {
  sunset: { jp: '夕陽', en: 'Sunset' },
  sunrise: { jp: '朝焼け', en: 'Sunrise' },
  golden_hour: { jp: '黃金時刻', en: 'Golden hour' },
  blue_hour: { jp: '藍調時刻', en: 'Blue hour' },
};

function windowFor(times: SunTimes, kind: ViewingHintKind | 'golden_hour'): SunWindow | null {
  switch (kind) {
    case 'sunrise':
      return times.goldenHourAm;
    case 'blue_hour':
      return times.sunset && times.civilDusk ? { start: times.sunset, end: times.civilDusk } : null;
    case 'sunset':
    case 'golden_hour':
      return times.goldenHourPm;
    default:
      return null;
  }
}

export function computeBestTimeForSpot(
  geo: [number, number],
  now: Date,
  hint: LocalIntelViewingHint | null,
  tz: string = DEFAULT_SPOT_TIMEZONE,
): ComputedBestTime | null {
  const kind = hint?.hint ?? 'golden_hour';
  if (kind === 'night' || kind === 'seasonal') return null;
  const [lat, lng] = geo;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const today = civilDateInTimeZone(now, tz);
  let dayOffset: 0 | 1 = 0;
  let window = windowFor(getSunTimes(lat, lng, today), kind);
  if (window && window.end.getTime() < now.getTime()) {
    // Today's window already passed — show tomorrow's instead of a past time.
    dayOffset = 1;
    const tomorrow = civilDateInTimeZone(new Date(now.getTime() + 86400000), tz);
    window = windowFor(getSunTimes(lat, lng, tomorrow), kind);
  }
  if (!window) return null; // polar edge — no honest window to show

  const label = LABELS[kind] ?? LABELS.golden_hour;
  return {
    jp: label.jp,
    en: label.en,
    range: `${formatTimeInTimeZone(window.start, tz)} – ${formatTimeInTimeZone(window.end, tz)}`,
    computed: true,
    dayOffset,
    sourceHintId: hint?.id,
  };
}
