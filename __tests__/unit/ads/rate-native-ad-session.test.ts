import { beforeEach, describe, expect, it } from 'bun:test';
import { __resetAppStorageForTests, kvSet } from '../../../libs/services/storage/app-storage';
import { RATE_NATIVE_AD_SUPPRESS_UNTIL_KEY } from '../../../libs/services/storage/keys';
import {
  RATE_NATIVE_AD_PROGRESS_MS,
  clearRateNativeAdSuppressionForTests,
  getRateNativeAdSuppressionSnapshot,
  isRateNativeAdSuppressedSync,
  suppressRateNativeAdsTemporarily,
} from '../../../libs/services/ads/rate-native-ad-session';

describe('rate-native-ad-session', () => {
  beforeEach(() => {
    __resetAppStorageForTests();
    clearRateNativeAdSuppressionForTests();
  });

  it('suppresses rate native ad cards for the current session after a load failure', () => {
    suppressRateNativeAdsTemporarily('load-failed', 1_000, 30_000);

    expect(isRateNativeAdSuppressedSync(1_500)).toBe(true);
    expect(getRateNativeAdSuppressionSnapshot(1_500)).toEqual({
      suppressed: true,
      reason: 'load-failed',
      suppressUntil: 31_000,
    });
  });

  it('hydrates a valid MMKV cooldown before requesting another native ad', () => {
    kvSet(RATE_NATIVE_AD_SUPPRESS_UNTIL_KEY, String(10_000));

    expect(isRateNativeAdSuppressedSync(9_999)).toBe(true);
    expect(getRateNativeAdSuppressionSnapshot(9_999)).toEqual({
      suppressed: true,
      reason: 'persisted-cooldown',
      suppressUntil: 10_000,
    });
  });

  it('clears stale MMKV cooldowns once they expire', () => {
    kvSet(RATE_NATIVE_AD_SUPPRESS_UNTIL_KEY, String(10_000));

    expect(isRateNativeAdSuppressedSync(10_001)).toBe(false);
    expect(getRateNativeAdSuppressionSnapshot(10_001)).toEqual({
      suppressed: false,
      reason: null,
      suppressUntil: null,
    });
  });

  it('keeps loaded native ad cards gated by a short 1-2 second progress window', () => {
    expect(RATE_NATIVE_AD_PROGRESS_MS).toBeGreaterThanOrEqual(1_000);
    expect(RATE_NATIVE_AD_PROGRESS_MS).toBeLessThanOrEqual(2_000);
  });
});
