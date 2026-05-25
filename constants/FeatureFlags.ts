/**
 * Temporary kill switches for the free-version posture.
 *
 * Why: at this stage we want to stay clear of CC-NC licensing concerns
 * around commercial use, so subscription paywalls and AdMob slots are
 * suppressed app-wide. The underlying services (RevenueCat, Google Mobile
 * Ads) are still wired up — these flags just gate every consumer.
 *
 * Flip back to `true` to restore the original behavior; no other code
 * changes should be required.
 */
export const FeatureFlags = {
  /**
   * When false:
   *  - `useSubscription()` short-circuits `isPro` to `true`, which auto-
   *    unlocks premium themes and any other isPro-gated feature.
   *  - All paywall / "Upgrade" / PRO badge UI is hidden at the call site.
   */
  PREMIUM_ENABLED: false,

  /**
   * When false:
   *  - `getAdUnitId()` returns `null` for every slot, so every ad surface
   *    (banner, native, interstitial, rewarded) renders nothing.
   *  - The `EXPO_PUBLIC_ADS_DISABLED=1` env kill switch still works the
   *    same way and is independent of this flag.
   */
  ADS_ENABLED: false,
} as const;
