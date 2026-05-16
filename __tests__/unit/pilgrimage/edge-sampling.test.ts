import { describe, expect, it } from 'bun:test';
import { edgeShaderSampleStep } from '../../../libs/services/pilgrimage/edge-sampling';

describe('edgeShaderSampleStep', () => {
  it('uses pixel-space sampling for Skia RuntimeEffect coordinates', () => {
    expect(edgeShaderSampleStep(1920, 1080)).toEqual([1, 1]);
    expect(edgeShaderSampleStep(284, 160)).toEqual([1, 1]);
  });

  it('keeps invalid dimensions safe', () => {
    expect(edgeShaderSampleStep(0, 1080)).toEqual([1, 1]);
    expect(edgeShaderSampleStep(Number.NaN, 1080)).toEqual([1, 1]);
  });
});
