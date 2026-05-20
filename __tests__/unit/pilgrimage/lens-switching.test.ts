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
    physicalFocalLengths: [],
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

  it('infers the 0.5× pillar on Android multi-cam from sub-1× minZoom alone', () => {
    // Android Triple-Camera: VisionCamera's CameraX adapter reports
    // physicalLensTypes and zoomLensSwitchFactors as empty (known bug), but
    // CameraX's zoomState.minZoomRatio is real and shows the ultra-wide reach.
    const device = makeDevice({
      minZoom: 0.6,
      maxZoom: 10,
    });
    expect(availableStopsFromDeviceInfo(device)).toEqual([0.5, 1]);
  });

  it('infers a 3× telephoto pillar from physical-child focal-length ratios on Android', () => {
    // Pixel 6/7-shaped Triple-Camera: ultra-wide ~1.6mm, main ~6.8mm, 3×
    // telephoto ~19mm raw (ratio ≈ 2.85). minZoom is 0.6 (Pixel reports
    // ultra-wide reach as ~0.6 not 0.5), so the dial should expose 0.5/1/3
    // like the iOS Triple-Camera.
    const device = makeDevice({
      minZoom: 0.6,
      maxZoom: 30,
      physicalFocalLengths: [1.6, 6.8, 19.4],
    });
    expect(availableStopsFromDeviceInfo(device)).toEqual([0.5, 1, 3]);
  });

  it('infers a 2× telephoto pillar when the child focal-length ratio is near 2', () => {
    // Older iPhone-11-Pro-shaped Dual-Camera with a 2× telephoto. The
    // ultra-wide is absent (minZoom == 1), so the main is the shortest sibling
    // and the raw ratio (≈ 1.85) is below the 2.2 snap boundary → 2× pillar.
    const device = makeDevice({
      minZoom: 1,
      maxZoom: 8,
      physicalFocalLengths: [4.25, 7.9],
    });
    expect(availableStopsFromDeviceInfo(device)).toEqual([1, 2]);
  });

  it('only adds the 0.5× pillar when the child set has no telephoto-grade sibling', () => {
    // Hypothetical Android device that reports only an ultra-wide and a main
    // lens (no telephoto). The 0.5× pillar is added from minZoom, but no
    // telephoto pillar should appear because no child ratio crosses
    // TELEPHOTO_MIN_RATIO.
    const device = makeDevice({
      minZoom: 0.5,
      maxZoom: 8,
      physicalFocalLengths: [1.5, 5.4],
    });
    expect(availableStopsFromDeviceInfo(device)).toEqual([0.5, 1]);
  });

  it('does not invent pillars for a single-lens Android device', () => {
    // Pixel 6a-shaped single-lens: minZoom 1.0, no physical children. The
    // fallback must stay quiet — a generous maxZoom only means digital crop.
    const device = makeDevice({
      minZoom: 1,
      maxZoom: 8,
    });
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

  it('is true when the Android fallback surfaces a 0.5× pillar', () => {
    const device = makeDevice({
      minZoom: 0.6,
      maxZoom: 10,
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
