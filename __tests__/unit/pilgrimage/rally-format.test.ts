import { describe, expect, it } from 'bun:test';

import {
  formatStampDate,
  formatStraightLineDistance,
  sameCollectedAt,
} from '../../../components/pilgrimage/rally/rally-format';

describe('rally-format', () => {
  it('formats straight-line legs without pretending to more precision than we have', () => {
    expect(formatStraightLineDistance(0)).toBe('< 10 m');
    expect(formatStraightLineDistance(0.004)).toBe('< 10 m');
    expect(formatStraightLineDistance(0.012)).toBe('10 m');
    expect(formatStraightLineDistance(0.456)).toBe('460 m');
    expect(formatStraightLineDistance(0.999)).toBe('1000 m');
    expect(formatStraightLineDistance(1)).toBe('1.0 km');
    expect(formatStraightLineDistance(12.34)).toBe('12.3 km');
  });

  it('formats a stamp time as local month/day', () => {
    expect(formatStampDate(new Date(2026, 8, 24, 12).getTime())).toBe('9/24');
  });

  it('treats maps with the same stamps and times as equal so focus refreshes can skip renders', () => {
    expect(sameCollectedAt({ a: 1, b: null }, { b: null, a: 1 })).toBe(true);
    expect(sameCollectedAt({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameCollectedAt({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameCollectedAt({ a: null }, { b: null })).toBe(false);
  });
});
