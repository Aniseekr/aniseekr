/**
 * Background preloader for the rating-deck native ad.
 *
 * The deck only inserts an ad card once an ad has already loaded, so the card
 * paints real content on its first frame — no spinner card, no load-timeout
 * lock. One ad is kept `ready`; inserting claims it under a deck item id and
 * immediately starts loading the next one.
 */
import { NPA_REQUEST_OPTIONS, getAdUnitId } from './ad-config';
import {
  isRateNativeAdSuppressedSync,
  suppressRateNativeAdsTemporarily,
} from './rate-native-ad-session';

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

type PoolAdsModule = {
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
const RATE_NATIVE_AD_PRELOAD_TIMEOUT_MS = 15_000;
// Google: a loaded native ad should be shown within an hour.
const READY_AD_MAX_AGE_MS = 55 * 60_000;

let adsModule: PoolAdsModule | null | undefined;
function getAdsModule(): PoolAdsModule | null {
  if (adsModule !== undefined) return adsModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-google-mobile-ads');
    adsModule = mod?.NativeAd ? (mod as PoolAdsModule) : null;
  } catch {
    adsModule = null;
  }
  return adsModule;
}

let initPromise: Promise<void> | null = null;
let ready: { ad: NativeAdLike; loadedAt: number } | null = null;
let inFlight = false;
let claimCounter = 0;
const claimed = new Map<string, NativeAdLike>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function setReady(next: { ad: NativeAdLike; loadedAt: number } | null): void {
  ready = next;
  notify();
}

/** Start loading an ad if none is ready or in flight. Safe to call often. */
export function preloadRateNativeAd(): void {
  if (inFlight) return;
  if (ready && Date.now() - ready.loadedAt < READY_AD_MAX_AGE_MS) return;
  if (ready) {
    ready.ad.destroy();
    setReady(null);
  }
  if (isRateNativeAdSuppressedSync()) return;
  const unitId = getAdUnitId('rate_native');
  if (!unitId) return;
  const mod = getAdsModule();
  if (!mod) {
    suppressRateNativeAdsTemporarily('module-unavailable');
    return;
  }

  inFlight = true;
  let settled = false;
  const fail = (reason: 'load-failed' | 'load-timeout') => {
    if (settled) return;
    settled = true;
    inFlight = false;
    suppressRateNativeAdsTemporarily(reason);
  };
  let timeout: ReturnType<typeof setTimeout> | undefined;

  initPromise ??= mod
    .default()
    .initialize()
    .then(() => undefined)
    .catch((error) => console.warn('[ads] initialize failed', error));

  void initPromise
    .then(() => {
      // Timed from the request, not from SDK init: the first initialize() can
      // take seconds on a cold start and nothing on screen waits for it.
      timeout = setTimeout(() => fail('load-timeout'), RATE_NATIVE_AD_PRELOAD_TIMEOUT_MS);
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
      inFlight = false;
      clearTimeout(timeout);
      setReady({ ad, loadedAt: Date.now() });
    })
    .catch(() => {
      clearTimeout(timeout);
      fail('load-failed');
    });
}

export function hasReadyRateNativeAd(): boolean {
  return ready !== null;
}

export function subscribeRateNativeAdReady(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Move the ready ad under a new deck item id and start loading the next one. */
export function claimRateNativeAd(): string | null {
  if (!ready) return null;
  const id = `ad-${claimCounter++}`;
  claimed.set(id, ready.ad);
  setReady(null);
  preloadRateNativeAd();
  return id;
}

export function getClaimedRateNativeAd(id: string): NativeAdLike | null {
  return claimed.get(id) ?? null;
}

export function releaseRateNativeAd(id: string): void {
  claimed.get(id)?.destroy();
  claimed.delete(id);
}

/** Destroy every claimed ad (screen unmount). The ready ad is kept for next time. */
export function releaseAllClaimedRateNativeAds(): void {
  for (const ad of claimed.values()) ad.destroy();
  claimed.clear();
}
