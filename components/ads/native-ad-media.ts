import type { NativeAdLike } from '../../libs/services/ads/native-ad-request';

// Media box shape for a native ad. The creative is always shown whole
// (`contain`) — AdMob does not allow cropping an advertiser's image by more
// than a sliver — so the box follows the creative's own ratio, clamped so a
// square or portrait creative cannot take over the card. 1.91:1 is the
// standard landscape creative and fits edge to edge.
const WIDEST = 1.91;
const TALLEST = 1.2;

export function nativeAdMediaAspectRatio(ad: NativeAdLike | null): number {
  const ratio = ad?.mediaContent?.aspectRatio;
  if (!ratio || !Number.isFinite(ratio)) return WIDEST;
  return Math.min(WIDEST, Math.max(TALLEST, ratio));
}
