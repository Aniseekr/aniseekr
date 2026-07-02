import { describe, expect, it } from 'bun:test';

import {
  buildCaptureSessionShotFromRoute,
  reconcileCapturePreviewSelection,
  resolveCapturePreviewFocus,
  resolveRouteShotDimensions,
  routeShotDimensionsNeedDecode,
} from '../../../libs/services/pilgrimage/capture-preview-route';
import type { CaptureSessionShot } from '../../../libs/services/pilgrimage/capture-session';
import type { PhotoDimensions } from '../../../libs/services/pilgrimage/camera-engine-parity';
import type { RouterParams } from '../../../libs/utils/route-params';

describe('capture preview route shot hydration', () => {
  it('hydrates a real album shot from route params when the live capture session is empty', () => {
    const params: RouterParams = {
      spotId: 'spot-7',
      shotUri: 'file:///album/shot.jpg',
      shotWidth: '1440',
      shotHeight: '1080',
      capturedAt: '1710000000000',
      heading: '182.4',
      distanceMeters: '12.5',
      headingDeltaDeg: '-4.25',
      tilt: '1.5',
      userLat: '35.6812',
      userLng: '139.7671',
      shotSource: 'library',
      note: 'Near the west exit',
    };

    expect(buildCaptureSessionShotFromRoute(params)).toEqual({
      id: 'route:spot-7:1710000000000:file:///album/shot.jpg',
      uri: 'file:///album/shot.jpg',
      width: 1440,
      height: 1080,
      captureMode: 'single',
      source: 'library',
      createdAt: 1710000000000,
      heading: 182.4,
      distanceMeters: 12.5,
      headingDeltaDeg: -4.25,
      tilt: 1.5,
      userLocation: { latitude: 35.6812, longitude: 139.7671 },
      note: 'Near the west exit',
    });
  });

  it('returns null when the route does not carry a shot uri', () => {
    expect(buildCaptureSessionShotFromRoute({ spotId: 'spot-7' })).toBeNull();
  });
});

function shot(id: string): CaptureSessionShot {
  return {
    id,
    uri: `file:///${id}.jpg`,
    width: 100,
    height: 100,
    captureMode: 'single',
    source: 'manual',
    createdAt: 1,
    heading: null,
    distanceMeters: null,
    headingDeltaDeg: null,
    tilt: null,
    userLocation: null,
  };
}

describe('capture preview state reconciliation', () => {
  it('keeps the same selected-id Set when the effective selection did not change', () => {
    const selected = new Set(['a']);

    expect(reconcileCapturePreviewSelection(selected, [shot('a')])).toBe(selected);
  });

  it('selects the newest shot when the previous selection is empty', () => {
    expect([...reconcileCapturePreviewSelection(new Set(), [shot('new')])]).toEqual(['new']);
  });

  it('keeps the focused shot stable when it is still present', () => {
    expect(resolveCapturePreviewFocus('a', [shot('a')])).toBe('a');
  });
});

describe('routeShotDimensionsNeedDecode', () => {
  it('needs a decode when either dimension is missing / non-positive', () => {
    expect(routeShotDimensionsNeedDecode(0, 4032)).toBe(true);
    expect(routeShotDimensionsNeedDecode(3024, 0)).toBe(true);
    expect(routeShotDimensionsNeedDecode(0, 0)).toBe(true);
    expect(routeShotDimensionsNeedDecode(Number.NaN, 4032)).toBe(true);
    expect(routeShotDimensionsNeedDecode(-1, 4032)).toBe(true);
  });

  it('does not need a decode when both dimensions are already positive', () => {
    expect(routeShotDimensionsNeedDecode(3024, 4032)).toBe(false);
    expect(routeShotDimensionsNeedDecode(1, 1)).toBe(false);
  });
});

describe('resolveRouteShotDimensions', () => {
  it('returns the current dims unchanged (no decode) when they are already valid', async () => {
    let calls = 0;
    const decode = async (): Promise<PhotoDimensions> => {
      calls += 1;
      return { width: 1, height: 1 };
    };
    const current = { width: 3024, height: 4032 };
    const result = await resolveRouteShotDimensions(current, decode, 'file:///shot.jpg');
    expect(result).toEqual({ width: 3024, height: 4032 });
    expect(calls).toBe(0);
  });

  it('decodes the true dims (passing current as the fallback) when dims are 0', async () => {
    const seen: { uri: string; fallback: PhotoDimensions }[] = [];
    const decode = async (uri: string, fallback: PhotoDimensions): Promise<PhotoDimensions> => {
      seen.push({ uri, fallback });
      return { width: 1080, height: 1920 };
    };
    const result = await resolveRouteShotDimensions(
      { width: 0, height: 0 },
      decode,
      'file:///portrait.jpg'
    );
    expect(result).toEqual({ width: 1080, height: 1920 });
    expect(seen).toEqual([{ uri: 'file:///portrait.jpg', fallback: { width: 0, height: 0 } }]);
  });
});
