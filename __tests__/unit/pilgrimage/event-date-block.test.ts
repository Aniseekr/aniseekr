import { describe, expect, it } from 'bun:test';

import { deriveEventDateBlock } from '../../../components/pilgrimage/event-date-block';
import { translate } from '../../../libs/i18n/engine';
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
    const ended: EventDateState = {
      state: 'ended',
      occurrence: { year: 2025, startsAt: '2025-12-25', endsAt: '2025-12-25' },
    };
    const unannounced: EventDateState = { state: 'unannounced', typicalMonth: 8 };

    const en = {
      ongoing: translate('en', 'pilgrimageUi.eventDetail.permanent'),
      tba: translate('en', 'pilgrimageUi.eventDetail.dateTba'),
    };
    const zhHant = {
      ongoing: translate('zh-Hant', 'pilgrimageUi.eventDetail.permanent'),
      tba: translate('zh-Hant', 'pilgrimageUi.eventDetail.dateTba'),
    };

    expect(deriveEventDateBlock(active, 'en', en)).toEqual({
      top: 'Jul',
      main: '18',
      emphasis: 'active',
    });
    expect(deriveEventDateBlock(upcoming, 'zh-Hant', zhHant)).toEqual({
      top: '10月',
      main: '3',
      emphasis: 'upcoming',
    });
    expect(deriveEventDateBlock(ongoing, 'zh-Hant', zhHant)).toEqual({
      top: '常設',
      main: '',
      emphasis: 'ongoing',
    });
    expect(deriveEventDateBlock(ended, 'en', en)).toEqual({
      top: 'Dec',
      main: '25',
      emphasis: 'ended',
    });
    expect(deriveEventDateBlock(unannounced, 'en', en)).toEqual({
      top: 'TBA',
      main: 'Aug',
      emphasis: 'tba',
    });
  });
});
