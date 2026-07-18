import { describe, expect, it } from 'bun:test';

import data from '../../../libs/services/pilgrimage/local-intel/local-intel.data.json';
import type {
  LocalIntelEvent,
  LocalIntelFile,
  StampSpot,
} from '../../../libs/services/pilgrimage/local-intel/types';

describe('local-intel stamp spots', () => {
  it('PILG-039 accepts events with sourced stamp spots while existing entries still parse', () => {
    const spot: StampSpot = {
      name: {
        ja: '沼津観光案内所',
        en: 'Numazu Tourist Information Center',
        zhHant: '沼津觀光案內所',
      },
      address: '静岡県沼津市大手町1-1-1 アントレ2階',
      geo: null,
      sourceUrl: 'https://example.com/stamp',
    };
    const event: LocalIntelEvent = {
      kind: 'event',
      id: 'stamp-shape',
      bangumiIds: [165553],
      category: 'stamp_rally',
      name: { ja: 'スタンプラリー' },
      description: { ja: 'スタンプラリー' },
      geo: null,
      schedule: { kind: 'ongoing' },
      stampSpots: [spot],
      sourceUrl: 'https://example.com/stamp',
      verifiedAt: '2026-07-18',
    };

    const bundled = data as LocalIntelFile;

    expect(event.stampSpots?.[0]).toEqual(spot);
    expect(Array.isArray(bundled.entries)).toBe(true);
    expect(bundled.entries.length).toBe(bundled.count);
  });
});
