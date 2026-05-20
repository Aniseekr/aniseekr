import { describe, expect, it } from 'bun:test';
import {
  availableStopsFromDeviceInfo,
  hasMultipleLenses,
} from '../../../libs/services/pilgrimage/lens-switching';
import type { CameraDeviceInfo } from '../../../components/pilgrimage/camera/camera-engine';

function makeDevice(overrides: Partial<CameraDeviceInfo>): CameraDeviceInfo {
  return {
    minZoom: 1,
    maxZoom: 1,
    neutralZoom: 1,
    physicalLensTypes: [],
    zoomLensSwitchFactors: [],
    supportsPhotoHdr: false,
    minExposureBias: 0,
    maxExposureBias: 0,
    supportsFocusMetering: true,
    hasFlash: false,
    hasTorch: false,
    ...overrides,
  };
}

describe('availableStopsFromDeviceInfo', () => {
  it('returns the neutral 1× pillar when device info is unknown', () => {
    expect(availableStopsFromDeviceInfo(null)).toEqual([1]);
  });

  it('maps physical lenses to sorted focal stops without inventing missing ones', () => {
    const device = makeDevice({
      minZoom: 0.5,
      maxZoom: 15,
      physicalLensTypes: ['telephoto', 'wide-angle', 'ultra-wide-angle'],
    });
    expect(availableStopsFromDeviceInfo(device)).toEqual([0.5, 1, 3]);
  });

  it('respects older 2x telephoto mappings when requested', () => {
    const device = makeDevice({
      minZoom: 1,
      maxZoom: 6,
      physicalLensTypes: ['wide-angle', 'telephoto'],
    });
    expect(availableStopsFromDeviceInfo(device, 2)).toEqual([1, 2]);
  });

  it('surfaces virtual zoom-lens switch factors as snap pillars', () => {
    // A Triple-Camera reports switch factors at [1, 3] without listing
    // ultra-wide-angle in physicalLensTypes (the array can be empty for
    // virtual devices on some OS reports).
    const device = makeDevice({
      minZoom: 0.5,
      maxZoom: 15,
      zoomLensSwitchFactors: [1, 3],
    });
    expect(availableStopsFromDeviceInfo(device)).toEqual([1, 3]);
  });

  it('filters out stops that fall outside the device zoom range', () => {
    const device = makeDevice({
      minZoom: 1,
      maxZoom: 2,
      physicalLensTypes: ['ultra-wide-angle', 'wide-angle', 'telephoto'],
    });
    // 0.5 is below minZoom and 3 is above maxZoom, so both are dropped.
    expect(availableStopsFromDeviceInfo(device)).toEqual([1]);
  });
});

describe('hasMultipleLenses', () => {
  it('is true when the dial would render two or more pillars', () => {
    const device = makeDevice({
      minZoom: 1,
      maxZoom: 6,
      physicalLensTypes: ['wide-angle', 'telephoto'],
    });
    expect(hasMultipleLenses(device)).toBe(true);
  });

  it('is false on a single-lens device', () => {
    const device = makeDevice({ physicalLensTypes: ['wide-angle'] });
    expect(hasMultipleLenses(device)).toBe(false);
  });

  it('is false when device info is unknown', () => {
    expect(hasMultipleLenses(null)).toBe(false);
  });
});
