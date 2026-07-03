import { describe, expect, test } from 'bun:test';
import { spotsToSeed } from '../../../libs/services/pilgrimage/spot-index-data-service';

describe('spotsToSeed', () => {
  test('returns only ids that are not already cached and have a non-empty array', () => {
    const byBangumiId = {
      '10': [{ id: 'a' }],
      '20': [], // empty payload → skip
      '30': [{ id: 'b' }],
    };
    const cached = new Set([10]);
    expect(spotsToSeed(byBangumiId, (id) => cached.has(id))).toEqual([30]);
  });
  test('ignores non-numeric keys', () => {
    expect(spotsToSeed({ x: [{ id: 'a' }] }, () => false)).toEqual([]);
  });
});
