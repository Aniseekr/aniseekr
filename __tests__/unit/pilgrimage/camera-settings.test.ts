import { describe, expect, it } from 'bun:test';
import {
  qualityToNumber,
  qualityToPrioritization,
} from '../../../libs/services/pilgrimage/camera-settings';

describe('qualityToNumber', () => {
  it('maps PictureQuality to a numeric JPEG quality in 0..1', () => {
    expect(qualityToNumber('standard')).toBe(0.7);
    expect(qualityToNumber('high')).toBe(0.92);
    expect(qualityToNumber('max')).toBe(1.0);
  });
});

describe('qualityToPrioritization', () => {
  it("maps PictureQuality onto VisionCamera's QualityPrioritization", () => {
    expect(qualityToPrioritization('standard')).toBe('speed');
    expect(qualityToPrioritization('high')).toBe('balanced');
    expect(qualityToPrioritization('max')).toBe('quality');
  });
});
