/**
 * Background preloader for the rating-deck native ad.
 *
 * The deck only inserts an ad card once an ad has already loaded, so the card
 * paints real content on its first frame — no spinner card, no load-timeout
 * lock. One ad is kept `ready`; inserting claims it under a deck item id and
 * immediately starts loading the next one.
 */
import { requestNativeAd, type NativeAdLike } from './native-ad-request';

// Google: a loaded native ad should be shown within an hour.
const READY_AD_MAX_AGE_MS = 55 * 60_000;

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
  inFlight = true;
  void requestNativeAd().then((ad) => {
    inFlight = false;
    if (ad) setReady({ ad, loadedAt: Date.now() });
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
