// Pure software alignment for HDR exposure brackets.
//
// During an exposure bracket (~300ms span) a handheld camera typically shakes
// 1–4 px at 4K resolution. We model the misalignment as a pure 2D translation
// — no rotation correction, which would blow the latency budget. The math
// below is intentionally JS-only and pixel-buffer based so it can be unit
// tested without a Skia surface.
//
// Algorithm (coarse-to-fine sum-of-absolute-differences on luma):
//   1. Downscale luma to a small grid (callers pass ~128×96).
//   2. Coarse pass: SAD over an integer search window at decimation 4 (every
//      4th row/col), pick the best (dx, dy).
//   3. Fine pass: SAD ±1 px around the coarse winner, full resolution of the
//      downscaled grid. Pick the global minimum.
//
// Returning the offset is mandatory; if cost behaves pathologically (e.g.
// uniform noise) the search still produces an answer within ±maxRadius, which
// is "better than nothing" alignment. The fusion shader is robust to small
// misalignments anyway.

export interface AlignInput {
  /** Reference luma buffer (mid-frame), row-major, length = width * height. */
  refLuma: Uint8Array;
  /** Candidate luma buffer (under or over). Must match refLuma dimensions. */
  candidateLuma: Uint8Array;
  width: number;
  height: number;
  /** Max search radius in pixels of the downscaled space. */
  maxRadius: number;
}

export interface AlignResult {
  /** Translation applied to the candidate to register it against the reference. */
  dx: number;
  dy: number;
  /** Mean absolute difference on the best overlap (0 = identical pixels). */
  cost: number;
}

const COARSE_STRIDE = 4;

/**
 * Compute mean SAD between `ref` and `candidate` when the candidate is shifted
 * by (dx, dy). Only the overlapping region contributes. `step` decimates the
 * sampled pixels — step=4 means every 4th row and column.
 *
 * Returns Number.POSITIVE_INFINITY when the overlap is empty so the caller
 * never selects an out-of-bounds offset.
 */
export function meanSad(
  ref: Uint8Array,
  candidate: Uint8Array,
  width: number,
  height: number,
  dx: number,
  dy: number,
  step: number
): number {
  // Determine the overlapping window in the reference frame:
  //   ref pixel (rx, ry) ↔ candidate pixel (rx + dx, ry + dy)
  // both must lie in [0, width) × [0, height).
  const xStart = Math.max(0, -dx);
  const yStart = Math.max(0, -dy);
  const xEnd = Math.min(width, width - dx);
  const yEnd = Math.min(height, height - dy);
  if (xEnd <= xStart || yEnd <= yStart) return Number.POSITIVE_INFINITY;

  let sum = 0;
  let count = 0;
  const s = Math.max(1, step);
  for (let ry = yStart; ry < yEnd; ry += s) {
    const cy = ry + dy;
    const refRow = ry * width;
    const candRow = cy * width;
    for (let rx = xStart; rx < xEnd; rx += s) {
      const cx = rx + dx;
      const a = ref[refRow + rx];
      const b = candidate[candRow + cx];
      const diff = a - b;
      sum += diff < 0 ? -diff : diff;
      count++;
    }
  }
  if (count === 0) return Number.POSITIVE_INFINITY;
  return sum / count;
}

/**
 * Coarse-to-fine translation search. The two passes are:
 *   1. Coarse: evaluate every offset in the [-R..R] × [-R..R] grid at
 *      decimation 4. This is the bulk of the work; with R=8 we evaluate
 *      17×17 = 289 candidates but each candidate only sums width*height/16
 *      pixels.
 *   2. Fine: ±1 around the coarse winner, full density on the downscaled
 *      grid. 9 evaluations total.
 */
export function alignTranslation(input: AlignInput): AlignResult {
  const { refLuma, candidateLuma, width, height, maxRadius } = input;

  if (
    width <= 0 ||
    height <= 0 ||
    refLuma.length < width * height ||
    candidateLuma.length < width * height
  ) {
    return { dx: 0, dy: 0, cost: Number.POSITIVE_INFINITY };
  }

  const r = Math.max(0, Math.floor(maxRadius));

  // Coarse search across the full radius.
  let bestDx = 0;
  let bestDy = 0;
  let bestCost = meanSad(refLuma, candidateLuma, width, height, 0, 0, COARSE_STRIDE);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx === 0 && dy === 0) continue;
      const cost = meanSad(refLuma, candidateLuma, width, height, dx, dy, COARSE_STRIDE);
      if (cost < bestCost) {
        bestCost = cost;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }

  // Fine refinement ±1 around the coarse winner, full density.
  let refinedDx = bestDx;
  let refinedDy = bestDy;
  let refinedCost = meanSad(refLuma, candidateLuma, width, height, bestDx, bestDy, 1);
  for (let dy = bestDy - 1; dy <= bestDy + 1; dy++) {
    for (let dx = bestDx - 1; dx <= bestDx + 1; dx++) {
      if (Math.abs(dx) > r || Math.abs(dy) > r) continue;
      const cost = meanSad(refLuma, candidateLuma, width, height, dx, dy, 1);
      if (cost < refinedCost) {
        refinedCost = cost;
        refinedDx = dx;
        refinedDy = dy;
      }
    }
  }

  return { dx: refinedDx, dy: refinedDy, cost: refinedCost };
}

/**
 * Convert an interleaved RGBA buffer (row-major, 4 bytes per pixel) into a
 * luma buffer using the Rec. 601 coefficients. Returns a new Uint8Array of
 * length `width * height`.
 */
export function rgbaToLuma(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const count = width * height;
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    // 0.299, 0.587, 0.114 scaled to integers for speed.
    const y = (r * 77 + g * 150 + b * 29) >> 8;
    out[i] = y;
  }
  return out;
}

/**
 * Scale a downscaled-space offset back to full-resolution pixel space. We
 * round to the nearest pixel — the shader can sample at sub-pixel offsets but
 * the SAD search is integer-only so any sub-pixel claim would be fabricated.
 */
export function scaleOffsetToFullRes(
  smallDx: number,
  smallDy: number,
  smallWidth: number,
  smallHeight: number,
  fullWidth: number,
  fullHeight: number
): { dx: number; dy: number } {
  if (smallWidth <= 0 || smallHeight <= 0) return { dx: 0, dy: 0 };
  const dx = Math.round((smallDx * fullWidth) / smallWidth);
  const dy = Math.round((smallDy * fullHeight) / smallHeight);
  return { dx, dy };
}
