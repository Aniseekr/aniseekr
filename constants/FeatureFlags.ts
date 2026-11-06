/**
 * Feature switches for monetization surfaces.
 *
 * Anitabi and its CC-NC content have been removed, so premium subscriptions
 * are enabled again. Ad availability remains independently controlled.
 */
export const FeatureFlags = {
  /**
   * When false, premium features are unlocked and paywall / upgrade UI is
   * hidden at the call site.
   */
  PREMIUM_ENABLED: true,

  /**
   * When false:
   *  - `getAdUnitId()` returns `null` for every slot, so every ad surface
   *    (banner, native, interstitial, rewarded) renders nothing.
   *  - The `EXPO_PUBLIC_ADS_DISABLED=1` env kill switch still works the
   *    same way and is independent of this flag.
   * Ads are gated on `useSubscription().adFree` (the real entitlement), not
   * `isPro`.
   */
  ADS_ENABLED: true,
} as const;
