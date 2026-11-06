/** Longest edge kept for an imported reference: sharp enough to overlay, small enough for Skia. */
export const REFERENCE_MAX_EDGE = 1920;

/**
 * Resize for an imported reference image, or null when it already fits.
 * Library picks can be 24–48 MP HEICs; the overlay and frame match decode the
 * reference on the JS side, so it is normalised to a ≤1920px JPEG first.
 */
export function referenceResize(
  width: number,
  height: number
): { width: number } | { height: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  if (Math.max(width, height) <= REFERENCE_MAX_EDGE) return null;
  return width >= height ? { width: REFERENCE_MAX_EDGE } : { height: REFERENCE_MAX_EDGE };
}
