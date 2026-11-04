import { describe, expect, it } from 'bun:test';
import { PilgrimageSearchService } from '../../../libs/services/pilgrimage/pilgrimage-search-service';

describe('Pilgrimage search city labels', () => {
  it('PILG-084 renders municipality names instead of Atlas municipality codes', async () => {
    const service = new PilgrimageSearchService({
      works: async () => [
        {
          key: 'yuru-camp',
          ja: 'ゆるキャン△',
          en: 'Laid-Back Camp',
          mal: [34798],
          bgm: [226780],
          n: 244,
          conf: { c: 244, s: 0, u: 0 },
          cities: ['19365'],
        },
      ],
      cityLookup: async () => new Map([['19365', { pref: '山梨県', name: '身延町' }]]),
    });

    const results = await service.search('ゆるキャン△', { includeBangumiFallback: false });

    expect(results[0].city).toBe('山梨県 身延町');
    expect(results[0].city).not.toContain('19365');
  });
});
