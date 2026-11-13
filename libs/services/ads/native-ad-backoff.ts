// Retry backoff after a failed native ad load, shared by every native
// placement (they all request the same unit). No-fill is routine for a
// non-personalized request on a low-volume app, so one miss must not silence
// ads for long: 30s, 1m, 2m … capped at 10m, reset by the next successful
// load. Kept in memory only — a fresh app launch always gets to try again.
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 10 * 60_000;

let consecutiveFailures = 0;
let retryAt = 0;

/** True while native ad requests should hold off. */
export function isNativeAdBackingOff(now: number = Date.now()): boolean {
  return now < retryAt;
}

export function noteNativeAdLoadFailed(now: number = Date.now()): void {
  retryAt = now + Math.min(RETRY_BASE_MS * 2 ** consecutiveFailures, RETRY_MAX_MS);
  consecutiveFailures += 1;
}

export function noteNativeAdLoaded(): void {
  consecutiveFailures = 0;
  retryAt = 0;
}
