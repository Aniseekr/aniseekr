import { describe, expect, test } from 'bun:test';
import { bearingDegrees, cardinalFromBearing } from '../../../components/pilgrimage/detail/_helpers';

describe('bearingDegrees', () => {
  test('due north is 0', () => {
    expect(Math.round(bearingDegrees({ latitude: 35, longitude: 139 }, [36, 139]))).toBe(0);
  });
  test('due east is ~90', () => {
    expect(Math.round(bearingDegrees({ latitude: 35, longitude: 139 }, [35, 140]))).toBe(90);
  });
});

describe('cardinalFromBearing', () => {
  test('rounds to 8 compass points with wraparound', () => {
    expect(cardinalFromBearing(0)).toBe('n');
    expect(cardinalFromBearing(44)).toBe('ne');
    expect(cardinalFromBearing(90)).toBe('e');
    expect(cardinalFromBearing(337.5)).toBe('n');
    expect(cardinalFromBearing(292.5)).toBe('nw');
  });
});
