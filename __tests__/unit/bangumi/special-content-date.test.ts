import { describe, expect, it } from 'bun:test';
import { formatReleaseDate } from '../../../libs/utils/release-date';

describe('formatReleaseDate', () => {
  it('keeps the real year, month, and day visible for a scheduled release', () => {
    expect(formatReleaseDate({ year: 2026, month: 7, day: 16 })).toBe('2026.07.16');
  });

  it('does not invent a date when the source has no year', () => {
    expect(formatReleaseDate({ year: null, month: null, day: null })).toBeNull();
  });
});
