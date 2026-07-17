import { describe, expect, it } from 'bun:test';

import { computeBestTimeForSpot } from '../../../libs/services/pilgrimage/local-intel/best-time';
import { getSunTimes } from '../../../libs/services/pilgrimage/local-intel/solar';
import {
  civilDateInTimeZone,
  formatTimeInTimeZone,
  formatTimeWithFixedOffset,
} from '../../../libs/services/pilgrimage/local-intel/timezone';
import type { LocalIntelViewingHint } from '../../../libs/services/pilgrimage/local-intel/types';

const TOKYO_LAT = 35.6762;
const TOKYO_LNG = 139.6503;
const TWO_MINUTES_MS = 2 * 60 * 1000;

function expectClose(actual: Date | null, expectedUtcMs: number): void {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual as Date).getTime() - expectedUtcMs)).toBeLessThanOrEqual(TWO_MINUTES_MS);
}

function sunsetHint(): LocalIntelViewingHint {
  return {
    kind: 'viewing_hint',
    id: 'test-hint',
    bangumiIds: [1],
    name: { ja: 'テスト' },
    description: { ja: 'テスト' },
    geo: [TOKYO_LAT, TOKYO_LNG],
    hint: 'sunset',
    note: { ja: 'テスト' },
    sourceUrl: 'https://example.com',
    verifiedAt: '2026-07-17',
  };
}

describe('local-intel solar', () => {
  it('PILG-042 matches NOAA reference sunrise and sunset for Tokyo solstices', () => {
    // NOAA solar calculator, Tokyo (35.6762, 139.6503), JST = UTC+9.
    const june = getSunTimes(TOKYO_LAT, TOKYO_LNG, { y: 2024, m: 6, d: 21 });
    expectClose(june.sunrise, Date.UTC(2024, 5, 20, 19, 25)); // 04:25 JST
    expectClose(june.sunset, Date.UTC(2024, 5, 21, 10, 0)); // 19:00 JST

    const december = getSunTimes(TOKYO_LAT, TOKYO_LNG, { y: 2024, m: 12, d: 21 });
    expectClose(december.sunrise, Date.UTC(2024, 11, 20, 21, 47)); // 06:47 JST
    expectClose(december.sunset, Date.UTC(2024, 11, 21, 7, 32)); // 16:32 JST
  });

  it('PILG-042 returns explicit polar flags instead of fabricated times', () => {
    const polarNight = getSunTimes(78.2, 15.6, { y: 2024, m: 12, d: 21 });
    expect(polarNight.sunrise).toBeNull();
    expect(polarNight.sunset).toBeNull();
    expect(polarNight.polar).toBe('night');

    const midnightSun = getSunTimes(78.2, 15.6, { y: 2024, m: 6, d: 21 });
    expect(midnightSun.sunrise).toBeNull();
    expect(midnightSun.sunset).toBeNull();
    expect(midnightSun.polar).toBe('day');
  });

  it('PILG-043 evening golden hour ends at sunset and spans a sane window', () => {
    const times = getSunTimes(TOKYO_LAT, TOKYO_LNG, { y: 2024, m: 6, d: 21 });
    expect(times.goldenHourPm).not.toBeNull();
    const window = times.goldenHourPm as { start: Date; end: Date };
    expect(window.end.getTime()).toBe((times.sunset as Date).getTime());
    const durationMin = (window.end.getTime() - window.start.getTime()) / 60000;
    expect(durationMin).toBeGreaterThan(10);
    expect(durationMin).toBeLessThan(90);
  });

  it('PILG-043 formats HH:mm in the spot timezone with a fixed-offset fallback', () => {
    const sunsetInstant = new Date(Date.UTC(2024, 5, 21, 10, 0));
    expect(formatTimeInTimeZone(sunsetInstant, 'Asia/Tokyo')).toBe('19:00');
    // The fallback path must be correct on its own (Hermes without Intl.timeZone).
    expect(formatTimeWithFixedOffset(sunsetInstant, 540)).toBe('19:00');
    // 19:25 UTC on the 20th is already June 21 in JST.
    expect(civilDateInTimeZone(new Date(Date.UTC(2024, 5, 20, 19, 25)), 'Asia/Tokyo')).toEqual({
      y: 2024,
      m: 6,
      d: 21,
    });
  });

  it('PILG-043 computes a real best-time range for any spot', () => {
    const now = new Date(Date.UTC(2024, 5, 21, 3, 0)); // June 21 noon JST
    const generic = computeBestTimeForSpot([TOKYO_LAT, TOKYO_LNG], now, null);
    expect(generic).not.toBeNull();
    expect(generic?.computed).toBe(true);
    expect(generic?.range).toMatch(/^\d{2}:\d{2} – \d{2}:\d{2}$/);

    expect(generic?.dayOffset).toBe(0);
    // After sunset the window rolls to tomorrow instead of showing a past time.
    const lateNight = computeBestTimeForSpot(
      [TOKYO_LAT, TOKYO_LNG],
      new Date(Date.UTC(2024, 5, 21, 14, 0)), // 23:00 JST
      null,
    );
    expect(lateNight?.dayOffset).toBe(1);

    const withHint = computeBestTimeForSpot([TOKYO_LAT, TOKYO_LNG], now, sunsetHint());
    expect(withHint).not.toBeNull();
    // The sunset window's end is the real computed sunset for the spot's day.
    const times = getSunTimes(TOKYO_LAT, TOKYO_LNG, { y: 2024, m: 6, d: 21 });
    const expectedEnd = formatTimeInTimeZone(times.sunset as Date, 'Asia/Tokyo');
    expect(withHint?.range.endsWith(expectedEnd)).toBe(true);
  });

  it('PILG-043 returns null instead of a fabricated window for non-solar hints', () => {
    const now = new Date(Date.UTC(2024, 5, 21, 3, 0));
    const seasonal: LocalIntelViewingHint = { ...sunsetHint(), hint: 'seasonal' };
    expect(computeBestTimeForSpot([TOKYO_LAT, TOKYO_LNG], now, seasonal)).toBeNull();
  });
});
