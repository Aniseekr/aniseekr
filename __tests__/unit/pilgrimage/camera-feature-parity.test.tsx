import { describe, expect, it } from 'bun:test';
import {
  preferredPhysicalDevicesForFacing,
  pickResolvedPhotoDimensions,
} from '../../../libs/services/pilgrimage/camera-engine-parity';

describe('camera feature parity', () => {
  it('prefers the combined back-camera device so zoom pillars can switch physical lenses', () => {
    expect(preferredPhysicalDevicesForFacing('back')).toEqual([
      'ultra-wide-angle',
      'wide-angle',
      'telephoto',
    ]);
    expect(preferredPhysicalDevicesForFacing('front')).toEqual(['wide-angle']);
  });

  it('uses decoded photo dimensions ahead of VisionCamera target dimensions', () => {
    expect(
      pickResolvedPhotoDimensions({
        decoded: { width: 4032, height: 3024 },
        fallback: { width: 3024, height: 4032 },
      })
    ).toEqual({ width: 4032, height: 3024 });

    expect(
      pickResolvedPhotoDimensions({
        decoded: null,
        fallback: { width: 3024, height: 4032 },
      })
    ).toEqual({ width: 3024, height: 4032 });

    expect(
      pickResolvedPhotoDimensions({
        decoded: { width: 0, height: 0 },
        fallback: { width: NaN, height: 0 },
      })
    ).toEqual({ width: 0, height: 0 });
  });
});
