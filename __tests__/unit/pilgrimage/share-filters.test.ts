// Track B (#4 photo-filter presets, #7 center-crop region) — pure helpers
// that the share/preview composer uses. Both pipelines are factored out of
// React/Skia so the math can be unit-tested without a renderer.

import { describe, expect, it } from 'bun:test';
import {
  FILTER_PRESETS,
  IDENTITY_COLOR_MATRIX,
  applyAutoColorMatrix,
  blendColorMatrix,
  centerCropRegion,
  getFilterMatrix,
  panToCropRegion,
  resolveCropAspect,
} from '../../../libs/services/pilgrimage/share-filters';

describe('share filters · presets', () => {
  it('ships at least five named presets + "none"', () => {
    const ids = FILTER_PRESETS.map((p) => p.id);
    expect(ids).toContain('none');
    expect(ids).toContain('cinematic');
    expect(ids).toContain('soft');
    expect(ids).toContain('anime');
    expect(ids).toContain('contrast');
    expect(ids).toContain('warm');
    expect(ids).toContain('cool');
  });

  it('exposes 20-element 4×5 ColorMatrix arrays for every preset', () => {
    for (const p of FILTER_PRESETS) {
      const m = getFilterMatrix(p.id, 1);
      expect(m).toHaveLength(20);
    }
  });

  it('"none" is the identity at any intensity', () => {
    expect(getFilterMatrix('none', 0)).toEqual(IDENTITY_COLOR_MATRIX);
    expect(getFilterMatrix('none', 1)).toEqual(IDENTITY_COLOR_MATRIX);
  });
});

describe('share filters · intensity blend', () => {
  it('intensity 0 collapses any filter back to identity', () => {
    expect(blendColorMatrix(getFilterMatrix('cinematic', 1), 0)).toEqual(IDENTITY_COLOR_MATRIX);
    expect(blendColorMatrix(getFilterMatrix('warm', 1), 0)).toEqual(IDENTITY_COLOR_MATRIX);
  });

  it('intensity 1 leaves the target matrix unchanged', () => {
    const cinematic = getFilterMatrix('cinematic', 1);
    expect(blendColorMatrix(cinematic, 1)).toEqual(cinematic);
  });

  it('intensity 0.5 returns the linear midpoint between identity and target', () => {
    const target = [
      1.2, 0, 0, 0, 0,
      0, 1.2, 0, 0, 0,
      0, 0, 1.2, 0, 0,
      0, 0, 0, 1, 0,
    ];
    const mid = blendColorMatrix(target, 0.5);
    // (1 + 1.2) / 2 = 1.1 on the diagonal
    expect(mid[0]).toBeCloseTo(1.1, 5);
    expect(mid[6]).toBeCloseTo(1.1, 5);
    expect(mid[12]).toBeCloseTo(1.1, 5);
  });

  it('clamps intensity outside [0, 1]', () => {
    const cinematic = getFilterMatrix('cinematic', 1);
    expect(blendColorMatrix(cinematic, -0.4)).toEqual(IDENTITY_COLOR_MATRIX);
    expect(blendColorMatrix(cinematic, 2.7)).toEqual(cinematic);
  });
});

describe('share filters · auto color match', () => {
  it('returns identity when both images already share the same averages', () => {
    const m = applyAutoColorMatrix({ r: 128, g: 128, b: 128 }, { r: 128, g: 128, b: 128 });
    expect(m).toEqual(IDENTITY_COLOR_MATRIX);
  });

  it('scales each channel so userMean × scale ≈ refMean', () => {
    const m = applyAutoColorMatrix({ r: 200, g: 150, b: 100 }, { r: 100, g: 150, b: 200 });
    // diagonal entries: ref / user
    expect(m[0]).toBeCloseTo(2.0, 3); // R
    expect(m[6]).toBeCloseTo(1.0, 3); // G
    expect(m[12]).toBeCloseTo(0.5, 3); // B
  });

  it('clamps per-channel gain so a near-black user image cannot blow up', () => {
    const m = applyAutoColorMatrix({ r: 200, g: 200, b: 200 }, { r: 1, g: 1, b: 1 });
    // Without a clamp this would be 200×; we cap aggressively (≤ 3×).
    expect(m[0]).toBeLessThanOrEqual(3);
    expect(m[6]).toBeLessThanOrEqual(3);
    expect(m[12]).toBeLessThanOrEqual(3);
  });

  it('falls back to identity when either side is missing', () => {
    expect(applyAutoColorMatrix(null, { r: 100, g: 100, b: 100 })).toEqual(IDENTITY_COLOR_MATRIX);
    expect(applyAutoColorMatrix({ r: 100, g: 100, b: 100 }, null)).toEqual(IDENTITY_COLOR_MATRIX);
  });
});

describe('share filters · crop region', () => {
  it('exports the five aspect presets the share screen offers', () => {
    expect(resolveCropAspect('free', 1, 1)).toBeNull();
    expect(resolveCropAspect('square', 1, 1)).toBe(1);
    expect(resolveCropAspect('portrait', 9, 16)).toBeCloseTo(9 / 16, 4);
    expect(resolveCropAspect('landscape', 16, 9)).toBeCloseTo(16 / 9, 4);
  });

  it('matchReference uses the supplied reference aspect', () => {
    expect(resolveCropAspect('matchReference', 1920, 1080)).toBeCloseTo(1920 / 1080, 4);
  });

  it('matchReference returns null when reference dimensions are unknown', () => {
    expect(resolveCropAspect('matchReference', 0, 0)).toBeNull();
    expect(resolveCropAspect('matchReference', 1920, 0)).toBeNull();
  });

  it('centerCropRegion returns the full image for "free" (no crop)', () => {
    expect(centerCropRegion(1080, 1920, null)).toEqual({
      originX: 0,
      originY: 0,
      width: 1080,
      height: 1920,
    });
  });

  it('centerCropRegion clips a portrait image to a 1:1 centered square', () => {
    const out = centerCropRegion(1080, 1920, 1);
    expect(out.width).toBe(1080);
    expect(out.height).toBe(1080);
    expect(out.originX).toBe(0);
    expect(out.originY).toBe(420); // (1920 - 1080) / 2
  });

  it('centerCropRegion clips a landscape image to 9:16 centered portrait', () => {
    const out = centerCropRegion(1920, 1080, 9 / 16);
    expect(out.height).toBe(1080);
    expect(out.width).toBeCloseTo(607.5, 1);
    expect(out.originY).toBe(0);
    expect(out.originX).toBeCloseTo((1920 - 607.5) / 2, 1);
  });

  it('refuses negative or zero output dimensions', () => {
    expect(() => centerCropRegion(0, 100, 1)).toThrow();
    expect(() => centerCropRegion(-5, 100, 1)).toThrow();
  });
});

describe('share filters · pan-to-crop region', () => {
  it('returns the centered crop when pan is (0, 0)', () => {
    // 1080×1920 source, 1:1 frame 360px on screen — covers shorter (width)
    const out = panToCropRegion({ w: 1080, h: 1920 }, { w: 360, h: 360 }, { x: 0, y: 0 });
    expect(out.width).toBeCloseTo(1080, 1);
    expect(out.height).toBeCloseTo(1080, 1);
    expect(out.originX).toBeCloseTo(0, 1);
    expect(out.originY).toBeCloseTo(420, 1); // (1920-1080)/2
  });

  it('pan up shifts the crop window downward in source coords', () => {
    // pan.y = -100 in viewport → image moved up → frame sees lower part of img
    const out = panToCropRegion({ w: 1080, h: 1920 }, { w: 360, h: 360 }, { x: 0, y: -100 });
    // scale = 360/1080 = 0.333; -100/scale ≈ -300; centerY → 1920/2 - (-300) = 1260
    expect(out.originY).toBeGreaterThan(420);
  });

  it('clamps so the crop never escapes the source image', () => {
    const out = panToCropRegion(
      { w: 1080, h: 1920 },
      { w: 360, h: 360 },
      { x: 9999, y: 9999 } // huge pan
    );
    expect(out.originX).toBeGreaterThanOrEqual(0);
    expect(out.originY).toBeGreaterThanOrEqual(0);
    expect(out.originX + out.width).toBeLessThanOrEqual(1080);
    expect(out.originY + out.height).toBeLessThanOrEqual(1920);
  });

  it('refuses non-positive image or frame dimensions', () => {
    expect(() => panToCropRegion({ w: 0, h: 100 }, { w: 100, h: 100 }, { x: 0, y: 0 })).toThrow();
    expect(() => panToCropRegion({ w: 100, h: 100 }, { w: 0, h: 100 }, { x: 0, y: 0 })).toThrow();
  });
});
