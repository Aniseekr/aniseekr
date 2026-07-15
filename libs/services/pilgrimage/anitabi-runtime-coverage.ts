const MIN_RUNTIME_COVERAGE_RATIO = 0.8;

/**
 * Reject obviously degraded generated payloads before they replace the
 * bundled index. A small removal window is allowed because upstream entries
 * can legitimately disappear, but a partial CI fallback (for example 9 of
 * 781 rows after a Cloudflare 403) must never blank most of search.
 */
export function hasSufficientRuntimeCoverage(currentSize: number, candidateSize: number): boolean {
  if (!Number.isFinite(candidateSize) || candidateSize <= 0) return false;
  if (!Number.isFinite(currentSize) || currentSize <= 0) return true;
  return candidateSize >= Math.floor(currentSize * MIN_RUNTIME_COVERAGE_RATIO);
}
