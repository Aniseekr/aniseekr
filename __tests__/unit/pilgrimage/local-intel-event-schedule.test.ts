import { describe, expect, it } from 'bun:test';

import { resolveEventDateState } from '../../../libs/services/pilgrimage/local-intel/event-schedule';
import type {
  EventSchedule,
  LocalIntelEvent,
} from '../../../libs/services/pilgrimage/local-intel/types';

function event(schedule: EventSchedule): LocalIntelEvent {
  return {
    kind: 'event',
    id: 'test-event',
    bangumiIds: [10380],
    category: 'festival',
    name: { ja: 'テスト祭り' },
    description: { ja: 'テスト' },
    geo: [36.4907, 136.757],
    schedule,
    sourceUrl: 'https://example.com',
    verifiedAt: '2026-07-17',
  };
}

// Fixed window: 2026-08-01 .. 2026-08-31, Asia/Tokyo (UTC+9).
const FIXED = event({ kind: 'fixed', startsAt: '2026-08-01', endsAt: '2026-08-31' });
const START_INSTANT = Date.UTC(2026, 6, 31, 15, 0, 0); // Aug 1 00:00 JST

describe('local-intel event schedule', () => {
  it('PILG-040 fixed schedule is upcoming before its start in the event timezone', () => {
    const oneHourBefore = new Date(START_INSTANT - 60 * 60 * 1000);
    const state = resolveEventDateState(FIXED, oneHourBefore);
    expect(state.state).toBe('upcoming');
    if (state.state === 'upcoming') {
      expect(state.startsInDays).toBe(1);
      expect(state.occurrence.startsAt).toBe('2026-08-01');
    }
  });

  it('PILG-040 fixed schedule becomes active exactly at start and stays active through end of endsAt day', () => {
    expect(resolveEventDateState(FIXED, new Date(START_INSTANT)).state).toBe('active');
    // Aug 31 23:59 JST — endsAt date is end-of-day inclusive.
    const lastMinute = new Date(Date.UTC(2026, 7, 31, 14, 59, 0));
    expect(resolveEventDateState(FIXED, lastMinute).state).toBe('active');
  });

  it('PILG-040 fixed schedule ends after the endsAt day closes in the event timezone', () => {
    const justAfter = new Date(Date.UTC(2026, 7, 31, 15, 0, 1)); // Sep 1 00:00:01 JST
    const state = resolveEventDateState(FIXED, justAfter);
    expect(state.state).toBe('ended');
  });

  it('PILG-041 annual schedule with only past occurrences resolves to unannounced with its typical month', () => {
    const annual = event({
      kind: 'annual',
      typicalMonth: 10,
      confirmed: [{ year: 2025, startsAt: '2025-10-18', endsAt: '2025-10-18' }],
    });
    const state = resolveEventDateState(annual, new Date(Date.UTC(2026, 6, 17)));
    expect(state.state).toBe('unannounced');
    if (state.state === 'unannounced') expect(state.typicalMonth).toBe(10);
  });

  it('PILG-041 annual schedule prefers the latest relevant confirmed occurrence', () => {
    const annual = event({
      kind: 'annual',
      typicalMonth: 10,
      confirmed: [
        { year: 2025, startsAt: '2025-10-18', endsAt: '2025-10-18' },
        { year: 2026, startsAt: '2026-10-17', endsAt: '2026-10-17' },
      ],
    });
    const before = resolveEventDateState(annual, new Date(Date.UTC(2026, 6, 17)));
    expect(before.state).toBe('upcoming');
    if (before.state === 'upcoming') expect(before.occurrence.year).toBe(2026);

    // Midday JST on the confirmed date.
    const during = resolveEventDateState(annual, new Date(Date.UTC(2026, 9, 17, 3, 0)));
    expect(during.state).toBe('active');

    // After the 2026 edition with no 2027 announcement: back to unannounced.
    const after = resolveEventDateState(annual, new Date(Date.UTC(2026, 10, 1)));
    expect(after.state).toBe('unannounced');
  });

  it('PILG-040 ongoing schedule is always active with no occurrence', () => {
    const ongoing = event({ kind: 'ongoing', since: '2018-04-01' });
    const state = resolveEventDateState(ongoing, new Date(Date.UTC(2026, 6, 17)));
    expect(state.state).toBe('active');
    if (state.state === 'active') expect(state.occurrence).toBeNull();
  });

  it('PILG-041 discontinued annual schedule is ended and never unannounced', () => {
    const annual = event({
      kind: 'annual',
      typicalMonth: 10,
      confirmed: [{ year: 2025, startsAt: '2025-10-18', endsAt: '2025-10-18' }],
      discontinued: true,
    });
    const state = resolveEventDateState(annual, new Date(Date.UTC(2026, 6, 17)));
    expect(state.state).toBe('ended');
  });
});
