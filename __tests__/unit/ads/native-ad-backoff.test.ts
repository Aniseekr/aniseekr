import { beforeEach, describe, expect, it } from 'bun:test';
import {
  isNativeAdBackingOff,
  noteNativeAdLoadFailed,
  noteNativeAdLoaded,
} from '../../../libs/services/ads/native-ad-backoff';

describe('native-ad-backoff', () => {
  beforeEach(noteNativeAdLoaded);

  it('retries 30s after one failed load, doubling up to a 10-minute cap', () => {
    // Regression: a single no-fill used to silence ads for 30 minutes,
    // persisted across launches, so almost nobody ever saw one.
    noteNativeAdLoadFailed(0);
    expect(isNativeAdBackingOff(29_999)).toBe(true);
    expect(isNativeAdBackingOff(30_000)).toBe(false);

    noteNativeAdLoadFailed(30_000);
    expect(isNativeAdBackingOff(89_999)).toBe(true);
    expect(isNativeAdBackingOff(90_000)).toBe(false);

    for (let i = 0; i < 10; i += 1) noteNativeAdLoadFailed(100_000);
    expect(isNativeAdBackingOff(100_000 + 10 * 60_000 - 1)).toBe(true);
    expect(isNativeAdBackingOff(100_000 + 10 * 60_000)).toBe(false);
  });

  it('a successful load clears the backoff', () => {
    noteNativeAdLoadFailed(0);
    noteNativeAdLoadFailed(0);
    noteNativeAdLoaded();

    expect(isNativeAdBackingOff(1)).toBe(false);
    noteNativeAdLoadFailed(0);
    expect(isNativeAdBackingOff(30_000)).toBe(false);
  });
});
