import { describe, expect, it } from 'bun:test';
import {
  alignTranslation,
  meanSad,
  rgbaToLuma,
  scaleOffsetToFullRes,
} from '../../libs/services/pilgrimage/composite-hdr-align';

/**
 * Build a synthetic luma image with a single bright block at (blockX, blockY).
 * Everything else is dark. This gives a sharp SAD minimum at the correct
 * offset and is ideal for asserting the search returns the exact translation.
 *
 * Default block size 8 keeps the block sampled even at the coarse stride 4
 * the alignment search uses — without that, a 4-px block can be missed by
 * the decimation grid and the coarse pass picks an arbitrary tie-breaker.
 */
function buildLumaWithBlock(
  width: number,
  height: number,
  blockX: number,
  blockY: number,
  blockSize = 8
): Uint8Array {
  const buf = new Uint8Array(width * height).fill(20);
  for (let y = blockY; y < blockY + blockSize; y++) {
    for (let x = blockX; x < blockX + blockSize; x++) {
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      buf[y * width + x] = 240;
    }
  }
  return buf;
}

/**
 * Build a synthetic luma image with a 2D Gaussian-like peak centered at
 * (cx, cy). Every (x, y) has a distinct radial distance from the center, so
 * SAD has a sharp, isotropic minimum at the correct (dx, dy) offset.
 */
function buildLumaPeak(width: number, height: number, cx: number, cy: number): Uint8Array {
  const buf = new Uint8Array(width * height);
  const sigma = Math.max(2, Math.min(width, height) / 8);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const g = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
      buf[y * width + x] = Math.floor(g * 255);
    }
  }
  return buf;
}

/**
 * Shift `src` by (sx, sy) into a fresh buffer. Pixels that would come from
 * outside the source are filled with 0 (the search ignores out-of-overlap
 * regions, so this only affects the visible boundary).
 */
function shiftLuma(
  src: Uint8Array,
  width: number,
  height: number,
  sx: number,
  sy: number
): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const srcY = y - sy;
    if (srcY < 0 || srcY >= height) continue;
    for (let x = 0; x < width; x++) {
      const srcX = x - sx;
      if (srcX < 0 || srcX >= width) continue;
      out[y * width + x] = src[srcY * width + srcX];
    }
  }
  return out;
}

describe('meanSad', () => {
  it('returns 0 when two identical buffers are sampled at offset (0,0)', () => {
    const buf = buildLumaWithBlock(32, 32, 10, 10);
    expect(meanSad(buf, buf, 32, 32, 0, 0, 1)).toBe(0);
  });

  it('returns infinity when the overlap window is empty', () => {
    const buf = buildLumaWithBlock(16, 16, 5, 5);
    expect(meanSad(buf, buf, 16, 16, 100, 0, 1)).toBe(Number.POSITIVE_INFINITY);
    expect(meanSad(buf, buf, 16, 16, 0, -100, 1)).toBe(Number.POSITIVE_INFINITY);
  });

  it('honors the decimation stride and still completes', () => {
    const a = buildLumaWithBlock(32, 32, 10, 10);
    const b = buildLumaWithBlock(32, 32, 18, 18);
    // Stride 4 evaluates fewer pixels but still produces a finite cost.
    // Blocks now sit far apart so even decimated sampling sees the diff.
    const cost = meanSad(a, b, 32, 32, 0, 0, 4);
    expect(Number.isFinite(cost)).toBe(true);
    expect(cost).toBeGreaterThan(0);
  });
});

describe('alignTranslation', () => {
  it('recovers the exact integer shift on a radial peak pattern', () => {
    // A Gaussian peak centered on the frame gives a unique radial signature
    // per pixel — SAD has a sharp, isotropic, alias-free minimum at the
    // correct (dx, dy).
    const W = 32;
    const H = 32;
    const ref = buildLumaPeak(W, H, 16, 16);
    // Shift the peak by +2 px right, +1 px down (i.e. a slight hand shake).
    const candidate = shiftLuma(ref, W, H, 2, 1);
    const result = alignTranslation({
      refLuma: ref,
      candidateLuma: candidate,
      width: W,
      height: H,
      maxRadius: 8,
    });
    // SAD samples candidate[rx + dx, ry + dy] against ref[rx, ry]. With the
    // candidate shifted +2/+1, we need dx = 2, dy = 1 to register it.
    expect(result.dx).toBe(2);
    expect(result.dy).toBe(1);
    expect(result.cost).toBeLessThan(5);
  });

  it('returns (0, 0) for identical frames', () => {
    const ref = buildLumaWithBlock(32, 32, 10, 10);
    const result = alignTranslation({
      refLuma: ref,
      candidateLuma: ref,
      width: 32,
      height: 32,
      maxRadius: 8,
    });
    expect(result.dx).toBe(0);
    expect(result.dy).toBe(0);
    expect(result.cost).toBe(0);
  });

  it('returns an offset within [-maxRadius, +maxRadius] even on random noise', () => {
    const w = 24;
    const h = 24;
    const ref = new Uint8Array(w * h);
    const cand = new Uint8Array(w * h);
    let seed = 1;
    function rand(): number {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed & 0xff;
    }
    for (let i = 0; i < ref.length; i++) ref[i] = rand();
    for (let i = 0; i < cand.length; i++) cand[i] = rand();
    const result = alignTranslation({
      refLuma: ref,
      candidateLuma: cand,
      width: w,
      height: h,
      maxRadius: 4,
    });
    expect(result.dx).toBeGreaterThanOrEqual(-4);
    expect(result.dx).toBeLessThanOrEqual(4);
    expect(result.dy).toBeGreaterThanOrEqual(-4);
    expect(result.dy).toBeLessThanOrEqual(4);
    expect(Number.isFinite(result.cost)).toBe(true);
  });

  it('handles a degenerate input (zero dims) without crashing', () => {
    const result = alignTranslation({
      refLuma: new Uint8Array(0),
      candidateLuma: new Uint8Array(0),
      width: 0,
      height: 0,
      maxRadius: 4,
    });
    expect(result.dx).toBe(0);
    expect(result.dy).toBe(0);
    expect(result.cost).toBe(Number.POSITIVE_INFINITY);
  });

  it('recovers a negative shift when the candidate moved up-left', () => {
    const W = 32;
    const H = 32;
    const ref = buildLumaPeak(W, H, 16, 16);
    // Candidate captured after the camera drifted -3 px in x, -2 px in y.
    const candidate = shiftLuma(ref, W, H, -3, -2);
    const result = alignTranslation({
      refLuma: ref,
      candidateLuma: candidate,
      width: W,
      height: H,
      maxRadius: 8,
    });
    expect(result.dx).toBe(-3);
    expect(result.dy).toBe(-2);
  });
});

describe('rgbaToLuma', () => {
  it('extracts luma using Rec. 601 weights for pure colors', () => {
    // 1×1 pure red, pure green, pure blue, pure white.
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
    const luma = rgbaToLuma(rgba, 4, 1);
    expect(luma.length).toBe(4);
    // 0.299*255 ≈ 76.245 → integer-scaled becomes 76 (255*77 >> 8 = 76).
    expect(luma[0]).toBe((255 * 77) >> 8);
    expect(luma[1]).toBe((255 * 150) >> 8);
    expect(luma[2]).toBe((255 * 29) >> 8);
    // White: (255*77 + 255*150 + 255*29) = 255 * 256 → /256 = 255.
    expect(luma[3]).toBe((255 * 77 + 255 * 150 + 255 * 29) >> 8);
    expect(luma[3]).toBe(255);
  });

  it('returns a buffer of the requested pixel count', () => {
    const rgba = new Uint8Array(4 * 16);
    const luma = rgbaToLuma(rgba, 4, 4);
    expect(luma.length).toBe(16);
    // All zero RGBA → all zero luma.
    for (const v of luma) expect(v).toBe(0);
  });
});

describe('scaleOffsetToFullRes', () => {
  it('scales an offset from the downscaled grid to full resolution', () => {
    // Downscaled space 128×96, full space 4096×3072 → 32× scale.
    const out = scaleOffsetToFullRes(2, -1, 128, 96, 4096, 3072);
    expect(out.dx).toBe(64);
    expect(out.dy).toBe(-32);
  });

  it('rounds to the nearest integer pixel', () => {
    const out = scaleOffsetToFullRes(1, 1, 100, 100, 350, 350);
    // 1 * 350 / 100 = 3.5 → rounded to 4 (Math.round uses banker's rounding
    // for .5 in some engines, but JS Math.round always rounds .5 toward +∞).
    expect(out.dx).toBe(4);
    expect(out.dy).toBe(4);
  });

  it('returns zero offset on degenerate small dims', () => {
    expect(scaleOffsetToFullRes(5, 5, 0, 0, 100, 100)).toEqual({ dx: 0, dy: 0 });
  });
});
