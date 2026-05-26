// Track C #5 (auto color match) and #8 (perspective warp) — math helpers
// driving the composer's "smart match" toggles. The async URI loaders are
// covered by their own integration suites; this file exercises the pure
// derivation that turns analyzer output into Skia matrices / RN transforms.

import { describe, expect, it } from 'bun:test';
import {
  IDENTITY_COLOR_MATRIX,
  deriveAutoMatrixFromAnalysis,
  type RgbMeanAnalysis,
} from '../../../libs/services/pilgrimage/share-auto-match';
import {
  IDENTITY_HOMOGRAPHY,
  computeHomography,
  cornerPinHomography,
  homographyToCss,
  homographyToMatrix4,
  tiltCorrectionTransform,
} from '../../../libs/services/pilgrimage/share-perspective';

describe('share auto match · derive from analysis', () => {
  const refMid: RgbMeanAnalysis = { avgR: 150, avgG: 140, avgB: 130 };
  const userMid: RgbMeanAnalysis = { avgR: 130, avgG: 140, avgB: 150 };

  it('returns identity when either side is null (no data, no guess)', () => {
    expect(deriveAutoMatrixFromAnalysis(null, userMid)).toEqual(IDENTITY_COLOR_MATRIX);
    expect(deriveAutoMatrixFromAnalysis(refMid, null)).toEqual(IDENTITY_COLOR_MATRIX);
  });

  it('produces a per-channel gain that pulls user toward ref', () => {
    const m = deriveAutoMatrixFromAnalysis(refMid, userMid);
    // diagonal entries: ref / user
    expect(m[0]).toBeCloseTo(150 / 130, 3);
    expect(m[6]).toBeCloseTo(140 / 140, 3);
    expect(m[12]).toBeCloseTo(130 / 150, 3);
  });

  it('stays inside the 0.5×–3× safety band', () => {
    const m = deriveAutoMatrixFromAnalysis(
      { avgR: 250, avgG: 250, avgB: 250 },
      { avgR: 1, avgG: 1, avgB: 1 }
    );
    expect(m[0]).toBeLessThanOrEqual(3);
    expect(m[6]).toBeLessThanOrEqual(3);
    expect(m[12]).toBeLessThanOrEqual(3);
  });
});

describe('share perspective · homography math (Phase 2 corner-pin)', () => {
  it('exports a 3×3 identity matrix', () => {
    expect(IDENTITY_HOMOGRAPHY).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('returns identity when src === dst corners', () => {
    const corners = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const H = computeHomography(corners, corners);
    expect(H).not.toBeNull();
    for (let i = 0; i < 9; i++) {
      expect(H![i]).toBeCloseTo(IDENTITY_HOMOGRAPHY[i], 5);
    }
  });

  it('maps a unit square onto another unit square via translation', () => {
    const src = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const dst = src.map((p) => ({ x: p.x + 30, y: p.y + 10 }));
    const H = computeHomography(src, dst);
    expect(H).not.toBeNull();
    // Translation should not touch the scale entries (3rd column == [tx, ty, 1])
    expect(H![2]).toBeCloseTo(30, 3); // h13 = tx
    expect(H![5]).toBeCloseTo(10, 3); // h23 = ty
  });

  it('returns null for degenerate inputs (three collinear src points)', () => {
    const collinear = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ];
    const dst = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 10 },
      { x: 30, y: 15 },
    ];
    expect(computeHomography(collinear, dst)).toBeNull();
  });

  it('homographyToCss emits a 16-element Matrix4 column-major string compatible with RN transform', () => {
    const css = homographyToCss(IDENTITY_HOMOGRAPHY);
    // Identity 3×3 → 4×4 identity → CSS matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)
    expect(css).toBe('matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)');
  });

  it('homographyToMatrix4 returns the same 16-element column-major array for native RN transform', () => {
    const m = homographyToMatrix4(IDENTITY_HOMOGRAPHY);
    expect(m).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('cornerPinHomography maps the unit rect onto user-dragged corners', () => {
    const W = 100;
    const H = 100;
    // Push the top-right corner down-and-in by (10, 5)
    const dragged = [
      { x: 0, y: 0 },
      { x: 90, y: 5 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const m = cornerPinHomography(W, H, dragged);
    expect(m).not.toBeNull();
    // Mapping origin should pin to origin (identity column tx=0, ty=0).
    expect(m![2]).toBeCloseTo(0, 5);
    expect(m![5]).toBeCloseTo(0, 5);
  });

  it('cornerPinHomography returns null if any dragged corner is missing', () => {
    expect(cornerPinHomography(100, 100, [{ x: 0, y: 0 }])).toBeNull();
  });
});

describe('share perspective · tilt correction (auto-from-sensor)', () => {
  it('zero tilt and zero heading delta → no transform (empty array)', () => {
    expect(tiltCorrectionTransform({ tiltDeg: 0, headingDeltaDeg: 0 })).toEqual([]);
  });

  it('returns RN transform tokens: perspective first, then rotateX/Y', () => {
    const t = tiltCorrectionTransform({ tiltDeg: 5, headingDeltaDeg: -3 });
    expect(t[0]).toEqual({ perspective: 800 });
    // rotateX corrects vertical tilt — sign is *negative* of measured tilt so
    // the corrected image looks level.
    const rx = t.find((x) => 'rotateX' in x) as { rotateX: string } | undefined;
    expect(rx).toBeDefined();
    expect(rx!.rotateX).toMatch(/-?[0-9.]+deg/);
    const ry = t.find((x) => 'rotateY' in x) as { rotateY: string } | undefined;
    expect(ry).toBeDefined();
  });

  it('clamps correction so a wild tilt cannot fold the image past 15°', () => {
    const t = tiltCorrectionTransform({ tiltDeg: 90, headingDeltaDeg: 90 });
    const rx = t.find((x) => 'rotateX' in x) as { rotateX: string };
    const ry = t.find((x) => 'rotateY' in x) as { rotateY: string };
    expect(Math.abs(parseFloat(rx.rotateX))).toBeLessThanOrEqual(15);
    expect(Math.abs(parseFloat(ry.rotateY))).toBeLessThanOrEqual(15);
  });

  it('returns empty when either reading is missing (no fake correction)', () => {
    expect(tiltCorrectionTransform({ tiltDeg: null, headingDeltaDeg: 5 })).toEqual([]);
    expect(tiltCorrectionTransform({ tiltDeg: 5, headingDeltaDeg: null })).toEqual([]);
  });
});
