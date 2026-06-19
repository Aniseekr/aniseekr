import { describe, expect, it } from 'bun:test';
import { formatFocalStopLabel, isFocalStopActive } from '../../../libs/services/pilgrimage/zoom-presets';

describe('zoom presets', () => {
  it('formats focal stops with the multiplication sign', () => {
    expect(formatFocalStopLabel(0.5)).toBe('0.5×');
    expect(formatFocalStopLabel(1)).toBe('1×');
    expect(formatFocalStopLabel(2)).toBe('2×');
    expect(formatFocalStopLabel(3)).toBe('3×');
  });

  it('marks the active stop only on an exact match', () => {
    expect(isFocalStopActive(1, 1)).toBe(true);
    expect(isFocalStopActive(0.5, 1)).toBe(false);
    expect(isFocalStopActive(3, null)).toBe(false);
  });
});
