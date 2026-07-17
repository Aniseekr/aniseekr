import { describe, expect, it } from 'bun:test';

import { deriveEventDateBlock } from '../../../components/pilgrimage/event-date-block';
import type { EventDateState } from '../../../libs/services/pilgrimage/local-intel/event-schedule';

describe('deriveEventDateBlock', () => {
  it('PILG-052 derives date block per state and language', () => {
    const active: EventDateState = {
      state: 'active',
      occurrence: { year: 2026, startsAt: '2026-07-18', endsAt: '2026-07-20' },
    };
    const upcoming: EventDateState = {
      state: 'upcoming',
      occurrence: { year: 2026, startsAt: '2026-10-03', endsAt: '2026-10-04' },
      startsInDays: 7,
    };
    const ongoing: EventDateState = { state: 'active', occurrence: null };
    const unannounced: EventDateState = { state: 'unannounced', typicalMonth: 8 };

    expect(deriveEventDateBlock(active, 'en')).toEqual({
      top: 'Jul',
      main: '18',
      emphasis: 'active',
    });
    expect(deriveEventDateBlock(upcoming, 'zh-Hant')).toEqual({
      top: '10月',
      main: '3',
      emphasis: 'upcoming',
    });
    expect(deriveEventDateBlock(ongoing, 'zh-Hant')).toEqual({
      top: '常設',
      main: '',
      emphasis: 'ongoing',
    });
    expect(deriveEventDateBlock(unannounced, 'en')).toEqual({
      top: 'TBA',
      main: 'Aug',
      emphasis: 'tba',
    });
  });
});
