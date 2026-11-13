/**
 * One native ad request against the app's native unit. Every native
 * placement (rating deck card, inline card/row) goes through here so they
 * share SDK init, the non-personalized request options and the failure
 * backoff.
 */
import { NPA_REQUEST_OPTIONS, getAdUnitId } from './ad-config';
import {
  isNativeAdBackingOff,
  noteNativeAdLoadFailed,
  noteNativeAdLoaded,
} from './native-ad-backoff';

export type NativeAdImage = { url: string; scale?: number };

export type NativeAdLike = {
  destroy: () => void;
  advertiser: string | null;
  body: string;
  callToAction: string;
  headline: string;
  icon: NativeAdImage | null;
  images: NativeAdImage[] | null;
  mediaContent?: { aspectRatio?: number } | null;
};

type NativeAdRequestOptions = {
  requestNonPersonalizedAdsOnly?: boolean;
  aspectRatio?: number;
  adChoicesPlacement?: number;
  startVideoMuted?: boolean;
};

type AdsModule = {
  default: () => { initialize: () => Promise<unknown> };
  NativeAd: {
    createForAdRequest: (
      unitId: string,
      requestOptions?: NativeAdRequestOptions
    ) => Promise<NativeAdLike>;
  };
  NativeMediaAspectRatio?: { LANDSCAPE?: number };
  NativeAdChoicesPlacement?: { TOP_RIGHT?: number };
};

// Background request budget. Generous: nothing on screen waits for it.
const REQUEST_TIMEOUT_MS = 15_000;

let adsModule: AdsModule | null | undefined;
function getAdsModule(): AdsModule | null {
  if (adsModule !== undefined) return adsModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-google-mobile-ads');
    adsModule = mod?.NativeAd ? (mod as AdsModule) : null;
  } catch {
    adsModule = null;
  }
  return adsModule;
}

let initPromise: Promise<void> | null = null;

/**
 * Resolves a loaded ad, or `null` when ads are off, backing off after a
 * failure, or this request failed / timed out. The caller owns the ad and
 * must `destroy()` it.
 */
export function requestNativeAd(): Promise<NativeAdLike | null> {
  if (isNativeAdBackingOff()) return Promise.resolve(null);
  const unitId = getAdUnitId('rate_native');
  if (!unitId) return Promise.resolve(null);
  const mod = getAdsModule();
  if (!mod) return Promise.resolve(null);

  initPromise ??= mod
    .default()
    .initialize()
    .then(() => undefined)
    .catch((error) => console.warn('[ads] initialize failed', error));
  const ready = initPromise;

  return new Promise((resolve) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      noteNativeAdLoadFailed();
      resolve(null);
    };

    void ready
      .then(() => {
        // Timed from the request, not from SDK init: the first initialize()
        // can take seconds on a cold start.
        timeout = setTimeout(fail, REQUEST_TIMEOUT_MS);
        return mod.NativeAd.createForAdRequest(unitId, {
          ...NPA_REQUEST_OPTIONS,
          aspectRatio: mod.NativeMediaAspectRatio?.LANDSCAPE,
          adChoicesPlacement: mod.NativeAdChoicesPlacement?.TOP_RIGHT,
          startVideoMuted: true,
        });
      })
      .then((ad) => {
        if (settled) {
          ad.destroy();
          return;
        }
        settled = true;
        clearTimeout(timeout);
        noteNativeAdLoaded();
        resolve(ad);
      })
      .catch(fail);
  });
}
