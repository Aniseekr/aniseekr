import { describe, expect, it } from 'bun:test';
import {
  SEGMENT_PX,
  WIDE_FLOOR_MAX_ZOOM,
  WIDE_FLOOR_MIN_ZOOM,
  buildDetents,
  buildDetentsWithFloor,
  dialSpanPx,
  dragPositionForTranslation,
  nearestDetent,
  needsWideFloor,
  positionForStop,
  positionForZoom,
  wideFloorLabel,
  zoomForPosition,
  type StopZoomMap,
} from '../../../libs/services/pilgrimage/zoom-dial';
import type { FocalStop } from '../../../components/pilgrimage/camera/types';

// Mirrors useCameraZoom's STOP_TO_ZOOM in the VisionCamera path: zoom is a
// real device factor, not expo-camera's old normalized 0..1 value.
const STOP_ZOOM: StopZoomMap = {
  0.5: 0.5,
  1: 1,
  2: 2,
  3: 3,
};
const MAX_ZOOM = 15;

describe('buildDetents', () => {
  it('lays digital-only stops out at equal pixel offsets', () => {
    const detents = buildDetents([1, 2, 3], STOP_ZOOM);
    expect(detents.map((d) => d.stop)).toEqual([1, 2, 3]);
    expect(detents.map((d) => d.px)).toEqual([0, SEGMENT_PX, SEGMENT_PX * 2]);
  });

  it('sorts and de-duplicates the stop list', () => {
    const detents = buildDetents([3, 1, 2, 1] as FocalStop[], STOP_ZOOM);
    expect(detents.map((d) => d.stop)).toEqual([1, 2, 3]);
  });

  it('uses real zoom factor values for the 0.5x ultrawide detent', () => {
    const detents = buildDetents([0.5, 1, 2, 3], STOP_ZOOM);
    expect(detents[0].stop).toBe(0.5);
    expect(detents[0].zoom).toBe(0.5);
    expect(detents[0].px).toBe(0);
    expect(detents[1].stop).toBe(1);
    expect(detents[1].px).toBe(SEGMENT_PX);
  });

  it('uses the real STOP_TO_ZOOM values for 2x / 3x', () => {
    const detents = buildDetents([1, 2, 3], STOP_ZOOM);
    expect(detents[1].zoom).toBeCloseTo(STOP_ZOOM[2], 10);
    expect(detents[2].zoom).toBeCloseTo(STOP_ZOOM[3], 10);
  });

  it('accepts a custom segment width', () => {
    const detents = buildDetents([1, 2, 3], STOP_ZOOM, 50);
    expect(detents.map((d) => d.px)).toEqual([0, 50, 100]);
  });
});

describe('dialSpanPx', () => {
  it('runs one extra segment past the last detent (the neutral tail)', () => {
    const detents = buildDetents([1, 2, 3], STOP_ZOOM);
    expect(dialSpanPx(detents)).toBe(SEGMENT_PX * 3);
  });

  it('is zero for an empty detent list', () => {
    expect(dialSpanPx([])).toBe(0);
  });
});

describe('dragPositionForTranslation', () => {
  it('inverts horizontal translation and clamps inside the dial span', () => {
    const span = SEGMENT_PX * 3;

    expect(dragPositionForTranslation(SEGMENT_PX, -24, span)).toBe(SEGMENT_PX + 24);
    expect(dragPositionForTranslation(SEGMENT_PX, 24, span)).toBe(SEGMENT_PX - 24);
    expect(dragPositionForTranslation(10, 999, span)).toBe(0);
    expect(dragPositionForTranslation(span - 10, -999, span)).toBe(span);
  });

  it('treats non-finite gesture values as a safe no-op', () => {
    expect(dragPositionForTranslation(Number.NaN, 10, SEGMENT_PX)).toBe(0);
    expect(dragPositionForTranslation(10, Number.NaN, SEGMENT_PX)).toBe(10);
    expect(dragPositionForTranslation(10, 5, Number.NaN)).toBe(0);
  });
});

describe('zoomForPosition / positionForZoom round-trip', () => {
  const detents = buildDetents([1, 2, 3], STOP_ZOOM);

  it('maps each detent position back to its exact zoom value', () => {
    for (const d of detents) {
      expect(zoomForPosition(d.px, detents)).toBeCloseTo(d.zoom, 10);
    }
  });

  it('maps each detent zoom back to its exact position', () => {
    for (const d of detents) {
      expect(positionForZoom(d.zoom, detents)).toBeCloseTo(d.px, 6);
    }
  });

  it('round-trips position -> zoom -> position across the whole strip', () => {
    const span = dialSpanPx(detents);
    for (let px = 0; px <= span; px += 7) {
      const z = zoomForPosition(px, detents, SEGMENT_PX, MAX_ZOOM);
      expect(positionForZoom(z, detents, SEGMENT_PX, MAX_ZOOM)).toBeCloseTo(px, 4);
    }
  });

  it('interpolates linearly within a segment (midpoint of 1x->2x gap)', () => {
    const mid = SEGMENT_PX / 2;
    const z = zoomForPosition(mid, detents, SEGMENT_PX, MAX_ZOOM);
    expect(z).toBeCloseTo((STOP_ZOOM[1] + STOP_ZOOM[2]) / 2, 10);
  });

  it('is monotonically increasing along the strip', () => {
    const span = dialSpanPx(detents);
    let prev = -1;
    for (let px = 0; px <= span; px += 4) {
      const z = zoomForPosition(px, detents, SEGMENT_PX, MAX_ZOOM);
      expect(z).toBeGreaterThanOrEqual(prev);
      prev = z;
    }
  });

  it('reaches the real device max zoom at the end of the neutral tail', () => {
    expect(zoomForPosition(dialSpanPx(detents), detents, SEGMENT_PX, MAX_ZOOM)).toBeCloseTo(
      MAX_ZOOM,
      10
    );
  });
});

describe('zoomForPosition / positionForZoom clamping', () => {
  const detents = buildDetents([1, 2, 3], STOP_ZOOM);

  it('clamps negative positions to the first detent zoom', () => {
    expect(zoomForPosition(-200, detents, SEGMENT_PX, MAX_ZOOM)).toBe(1);
  });

  it('clamps positions past the span to the real device max zoom', () => {
    expect(zoomForPosition(99999, detents, SEGMENT_PX, MAX_ZOOM)).toBeCloseTo(MAX_ZOOM, 10);
  });

  it('clamps out-of-range zoom values to the strip span', () => {
    expect(positionForZoom(-5, detents, SEGMENT_PX, MAX_ZOOM)).toBe(0);
    expect(positionForZoom(500, detents, SEGMENT_PX, MAX_ZOOM)).toBeCloseTo(
      dialSpanPx(detents),
      6
    );
  });

  it('returns 0 for an empty detent list', () => {
    expect(zoomForPosition(50, [])).toBe(0);
    expect(positionForZoom(0.5, [])).toBe(0);
  });
});

describe('zoomForPosition with a 0.5x ultrawide detent', () => {
  const detents = buildDetents([0.5, 1, 2, 3], STOP_ZOOM);

  it('interpolates in real factor space across the 0.5x->1x segment', () => {
    expect(zoomForPosition(0, detents, SEGMENT_PX, MAX_ZOOM)).toBeCloseTo(0.5, 10);
    expect(zoomForPosition(SEGMENT_PX / 2, detents, SEGMENT_PX, MAX_ZOOM)).toBeCloseTo(
      0.75,
      10
    );
    expect(zoomForPosition(SEGMENT_PX, detents, SEGMENT_PX, MAX_ZOOM)).toBeCloseTo(1, 10);
  });

  it('positionForZoom(0.5) snaps to the segment start (0.5x detent)', () => {
    expect(positionForZoom(0.5, detents, SEGMENT_PX, MAX_ZOOM)).toBe(0);
  });

  it('still round-trips for zoom values above 1x', () => {
    expect(positionForZoom(STOP_ZOOM[2], detents, SEGMENT_PX, MAX_ZOOM)).toBeCloseTo(
      SEGMENT_PX * 2,
      6
    );
    expect(positionForZoom(STOP_ZOOM[3], detents, SEGMENT_PX, MAX_ZOOM)).toBeCloseTo(
      SEGMENT_PX * 3,
      6
    );
  });

  it('uses custom real-factor stop values when the native engine reports them', () => {
    const nativeZoom: StopZoomMap = {
      0.5: 0.6,
      1: 1.1,
      2: 2.2,
      3: 3.3,
    };
    const nativeDetents = buildDetents([0.5, 1, 2, 3], nativeZoom);

    expect(zoomForPosition(0, nativeDetents, SEGMENT_PX, MAX_ZOOM)).toBeCloseTo(
      nativeZoom[0.5],
      10
    );
    expect(zoomForPosition(SEGMENT_PX, nativeDetents, SEGMENT_PX, MAX_ZOOM)).toBeCloseTo(
      nativeZoom[1],
      10
    );
    expect(zoomForPosition(SEGMENT_PX / 2, nativeDetents, SEGMENT_PX, MAX_ZOOM)).toBeCloseTo(
      0.85,
      10
    );
  });
});

describe('nearestDetent', () => {
  const detents = buildDetents([1, 2, 3], STOP_ZOOM);

  it('returns the focal stop when the position is exactly on a detent', () => {
    expect(nearestDetent(0, detents)).toBe(1);
    expect(nearestDetent(SEGMENT_PX, detents)).toBe(2);
    expect(nearestDetent(SEGMENT_PX * 2, detents)).toBe(3);
  });

  it('snaps within tolerance', () => {
    expect(nearestDetent(SEGMENT_PX + 15, detents, 22)).toBe(2);
    expect(nearestDetent(SEGMENT_PX - 15, detents, 22)).toBe(2);
  });

  it('returns null when the nearest detent is beyond tolerance', () => {
    expect(nearestDetent(SEGMENT_PX / 2, detents, 22)).toBeNull();
  });

  it('returns null in the unlabeled neutral tail past the last detent', () => {
    expect(nearestDetent(SEGMENT_PX * 2 + 60, detents, 22)).toBeNull();
  });

  it('returns null for an empty detent list', () => {
    expect(nearestDetent(0, [], 22)).toBeNull();
  });

  it('respects a custom tolerance', () => {
    expect(nearestDetent(SEGMENT_PX / 2, detents, SEGMENT_PX)).toBe(1);
  });
});

describe('positionForStop', () => {
  const detents = buildDetents([0.5, 1, 2, 3], STOP_ZOOM);

  it('returns the pixel offset for a present stop', () => {
    expect(positionForStop(0.5, detents)).toBe(0);
    expect(positionForStop(1, detents)).toBe(SEGMENT_PX);
    expect(positionForStop(3, detents)).toBe(SEGMENT_PX * 3);
  });

  it('returns null for a stop not on the dial', () => {
    const digitalOnly = buildDetents([1, 2, 3], STOP_ZOOM);
    expect(positionForStop(0.5, digitalOnly)).toBeNull();
  });
});

describe('single-detent dial (front-facing camera)', () => {
  const detents = buildDetents([1], STOP_ZOOM);

  it('has a span of exactly one segment', () => {
    expect(dialSpanPx(detents)).toBe(SEGMENT_PX);
  });

  it('interpolates the tail from the detent zoom up to real max zoom', () => {
    expect(zoomForPosition(0, detents, SEGMENT_PX, MAX_ZOOM)).toBeCloseTo(1, 10);
    expect(zoomForPosition(SEGMENT_PX, detents, SEGMENT_PX, MAX_ZOOM)).toBeCloseTo(
      MAX_ZOOM,
      10
    );
    expect(zoomForPosition(SEGMENT_PX / 2, detents, SEGMENT_PX, MAX_ZOOM)).toBeCloseTo(8, 10);
  });

  it('round-trips position <-> zoom', () => {
    for (let px = 0; px <= SEGMENT_PX; px += 6) {
      const z = zoomForPosition(px, detents, SEGMENT_PX, MAX_ZOOM);
      expect(positionForZoom(z, detents, SEGMENT_PX, MAX_ZOOM)).toBeCloseTo(px, 4);
    }
  });
});

describe('needsWideFloor', () => {
  // Pixel 6 Pro wide-only shape: logical rear camera reports minZoom ~0.67
  // (the ultra-wide reach floor), classified wide-only so there's no 0.5
  // detent and no 0.5x island chip.
  it('is true for a sub-1-but-not-0.5-class minZoom with no 0.5 / no island', () => {
    expect(needsWideFloor(0.67, [1, 2, 3], false)).toBe(true);
    expect(needsWideFloor(0.6, [1], false)).toBe(true);
    expect(needsWideFloor(0.9, [1, 2, 3], false)).toBe(true);
  });

  it('is false when a 0.5 detent already gives a zoom-out affordance', () => {
    expect(needsWideFloor(0.67, [0.5, 1, 2, 3], false)).toBe(false);
  });

  it('is false when a 0.5x island chip already gives a zoom-out affordance', () => {
    expect(needsWideFloor(0.67, [1, 2, 3], true)).toBe(false);
  });

  it('is false for a 0.5-class minZoom (already handled by the 0.5 detent)', () => {
    expect(needsWideFloor(0.5, [1, 2, 3], false)).toBe(false);
    expect(needsWideFloor(WIDE_FLOOR_MIN_ZOOM, [1, 2, 3], false)).toBe(false);
    expect(needsWideFloor(0.4, [1, 2, 3], false)).toBe(false);
  });

  it('is false when minZoom is 1 or higher (no real sub-1 reach)', () => {
    expect(needsWideFloor(1, [1, 2, 3], false)).toBe(false);
    expect(needsWideFloor(WIDE_FLOOR_MAX_ZOOM, [1, 2, 3], false)).toBe(false);
    expect(needsWideFloor(1.5, [1, 2, 3], false)).toBe(false);
  });

  it('is false for undefined / non-finite minZoom', () => {
    expect(needsWideFloor(undefined, [1, 2, 3], false)).toBe(false);
    expect(needsWideFloor(Number.NaN, [1, 2, 3], false)).toBe(false);
    expect(needsWideFloor(Number.POSITIVE_INFINITY, [1, 2, 3], false)).toBe(false);
  });
});

describe('wideFloorLabel', () => {
  it('rounds the real minZoom to 1 decimal place using the dial x convention', () => {
    // 0.67 is a real CameraX value; "0.7x" is an honest rounding (not an
    // invented number), using the dial's lowercase `x` (see formatStop).
    expect(wideFloorLabel(0.67)).toBe('0.7x');
    expect(wideFloorLabel(0.6)).toBe('0.6x');
    expect(wideFloorLabel(0.85)).toBe('0.9x');
  });
});

describe('buildDetentsWithFloor', () => {
  it('prepends a floor detent at the real minZoom for a wide-only sub-1 device', () => {
    // Pixel 6 Pro wide-only: minZoom 0.67, stops [1,2,3], no island.
    const detents = buildDetentsWithFloor([1, 2, 3], STOP_ZOOM, 0.67, false);
    expect(detents.map((d) => d.stop)).toEqual(['floor', 1, 2, 3]);
    expect(detents[0].zoom).toBeCloseTo(0.67, 10);
    expect(detents[0].label).toBe('0.7x');
    expect(detents[0].px).toBe(0);
    // Real focal stops shift one segment right to make room for the floor.
    expect(detents.map((d) => d.px)).toEqual([0, SEGMENT_PX, SEGMENT_PX * 2, SEGMENT_PX * 3]);
    // Real focal stops carry no label override.
    expect(detents[1].label).toBeUndefined();
  });

  it('adds NO floor detent when a 0.5 detent already exists', () => {
    const detents = buildDetentsWithFloor([0.5, 1, 2, 3], STOP_ZOOM, 0.67, false);
    expect(detents.map((d) => d.stop)).toEqual([0.5, 1, 2, 3]);
    expect(detents.some((d) => d.stop === 'floor')).toBe(false);
  });

  it('adds NO floor detent when a 0.5x island is present', () => {
    const detents = buildDetentsWithFloor([1, 2, 3], STOP_ZOOM, 0.67, true);
    expect(detents.map((d) => d.stop)).toEqual([1, 2, 3]);
  });

  it('adds NO floor detent for a 0.5-class minZoom', () => {
    const detents = buildDetentsWithFloor([1, 2, 3], STOP_ZOOM, 0.5, false);
    expect(detents.map((d) => d.stop)).toEqual([1, 2, 3]);
    expect(detents.some((d) => d.stop === 'floor')).toBe(false);
  });

  it('adds NO floor detent for a minZoom of 1.0', () => {
    const detents = buildDetentsWithFloor([1, 2, 3], STOP_ZOOM, 1.0, false);
    expect(detents.map((d) => d.stop)).toEqual([1, 2, 3]);
  });

  it('matches buildDetents exactly when no floor is needed', () => {
    expect(buildDetentsWithFloor([1, 2, 3], STOP_ZOOM, 1.0, false)).toEqual(
      buildDetents([1, 2, 3], STOP_ZOOM)
    );
  });
});

describe('floor detent integration: drag, snap, span', () => {
  // Pixel 6 Pro wide-only dial: [floor@0.67, 1, 2, 3] with native max 10.
  const detents = buildDetentsWithFloor([1, 2, 3], STOP_ZOOM, 0.67, false);
  const FLOOR_MAX = 10;

  it('the floor detent is the leftmost snap target (px 0)', () => {
    expect(positionForStop('floor', detents)).toBe(0);
    expect(nearestDetent(0, detents)).toBe('floor');
  });

  it('snaps to the floor detent within tolerance (tap / drag-to-floor)', () => {
    expect(nearestDetent(12, detents, 22)).toBe('floor');
  });

  it('positionForZoom(minZoom) lands on the floor detent', () => {
    expect(positionForZoom(0.67, detents, SEGMENT_PX, FLOOR_MAX)).toBe(0);
  });

  it('zoomForPosition at the floor px returns the real device minZoom', () => {
    expect(zoomForPosition(0, detents, SEGMENT_PX, FLOOR_MAX)).toBeCloseTo(0.67, 10);
  });

  it('interpolates the floor->1x segment in real factor space', () => {
    expect(zoomForPosition(SEGMENT_PX / 2, detents, SEGMENT_PX, FLOOR_MAX)).toBeCloseTo(
      (0.67 + 1) / 2,
      10
    );
  });

  it('round-trips position <-> zoom across the whole floor-extended strip', () => {
    const span = dialSpanPx(detents);
    for (let px = 0; px <= span; px += 7) {
      const z = zoomForPosition(px, detents, SEGMENT_PX, FLOOR_MAX);
      expect(positionForZoom(z, detents, SEGMENT_PX, FLOOR_MAX)).toBeCloseTo(px, 4);
    }
  });

  it('the strip span grows by one segment vs the no-floor dial', () => {
    const noFloor = buildDetents([1, 2, 3], STOP_ZOOM);
    expect(dialSpanPx(detents)).toBe(dialSpanPx(noFloor) + SEGMENT_PX);
  });
});
