# StoreKit / In-App Purchases

Canonical copy of `Products.storekit` lives here. The same file is also placed at
`ios/AniSeekr/Products.storekit` so Xcode can use it for local StoreKit testing —
but `ios/` is gitignored Expo prebuild output, so after `expo prebuild --clean`
you must copy `infra/storekit/Products.storekit` back into `ios/AniSeekr/` and
wire it via Xcode → Scheme → Run → Options → StoreKit Configuration.

## Product IDs (must match across native, App Store Connect, and RevenueCat)

| Product ID                          | Type           | Native price | Purpose          |
|-------------------------------------|----------------|--------------|------------------|
| `com.aniseeker.lifetime.premium`    | Non-Consumable | USD 49.9     | One-off lifetime |
| `com.aniseeker.pass.monthly`        | Auto-Renewable | USD 1.99/mo  | Monthly Premium  |
| `com.aniseeker.pass.yearly`         | Auto-Renewable | USD 19.9/yr  | Yearly Premium   |

Subscription Group: **AniSeeker Premium** (group ID `A5A942EF` for local testing).

## RevenueCat dashboard checklist

The Expo subscription service (`libs/services/subscription/subscription-service.ts`)
reads everything dynamically — there are no hardcoded product IDs in code. Wiring
is done in the RevenueCat dashboard:

1. **Products** — Add the three IDs above, each linked to the matching App Store
   Connect product (same ID, exact match).
2. **Entitlements** — Create entitlement with identifier `pro` and attach all
   three products. The code only checks `entitlements.active['pro']`, so the
   slug must be exactly `pro`.
3. **Offerings** — Create one offering (e.g. `default`) with three packages:
   - Monthly package → `com.aniseeker.pass.monthly`
   - Annual package → `com.aniseeker.pass.yearly`
   - Lifetime package → `com.aniseeker.lifetime.premium`

   `PaywallSheet` slots them via the package types `MONTHLY` / `ANNUAL` /
   `LIFETIME`, so use those package identifiers.

4. **Env vars** — Set in `.env` (and EAS secrets):
   - `EXPO_PUBLIC_REVENUECAT_IOS_KEY`
   - `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`

## Sanity test (TestFlight)

- Fresh install → open paywall → all three packages render with localized
  prices.
- Buy monthly → `subscriptionService.getState().isPro === true`,
  `productIdentifier === 'com.aniseeker.pass.monthly'`.
- Restore on a second device with same Apple ID → state restores.
- Cancel in App Store → at expiry, `isPro` flips to `false` after the next
  `refresh()`.
