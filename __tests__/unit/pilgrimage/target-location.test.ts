import { describe, expect, it } from 'bun:test';
import { resolveTargetLocation } from '../../../libs/services/pilgrimage/target-location';

describe('resolveTargetLocation', () => {
  it('PILG-067 blank or missing coordinates are an unknown target, not null island', () => {
    expect(resolveTargetLocation('', '')).toBeNull();
    expect(resolveTargetLocation('  ', '139.7')).toBeNull();
    expect(resolveTargetLocation(undefined, undefined)).toBeNull();
    expect(resolveTargetLocation(null, '139.7')).toBeNull();
  });

  it('PILG-067 non-numeric coordinates are unknown', () => {
    expect(resolveTargetLocation('abc', '139.7')).toBeNull();
    expect(resolveTargetLocation('35.6', 'NaN')).toBeNull();
  });

  it('PILG-067 real coordinates pass through as numbers', () => {
    expect(resolveTargetLocation('35.1', '138.86')).toEqual({ latitude: 35.1, longitude: 138.86 });
    expect(resolveTargetLocation(35.1, 138.86)).toEqual({ latitude: 35.1, longitude: 138.86 });
  });
});
