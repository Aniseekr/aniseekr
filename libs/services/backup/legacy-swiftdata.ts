// Adapter from the legacy SwiftUI aniseeker's migration data →
// BackupEnvelopeV1.
//
// The old aniseeker's only real "minimal backup" path is the V1→V2 migration
// blob: `[RatingMigrationData]` encoded by Swift `JSONEncoder()` and stored in
// `UserDefaults.standard` under `migration_v1_v2_data`. That blob contains
// ratings/watch progress metadata only; the legacy app did not back up photos
// or image assets.
//
// Both apps share the bundle identifier `kidneyweakx.aniseeker`, so an App
// Store upgrade preserves UserDefaults. The native bridge reads that
// migration blob and returns it as `ratings`, which we hand straight to
// `importLegacyAniseekerExport()` to reuse the existing merge logic.
//
// This module is pure JS — no React Native imports — so it stays unit-testable
// without spinning up the native bridge.

import {
  importLegacyAniseekerExport,
  type LegacyAniseekerExport,
  type LegacyFolderV2,
  type LegacyRatingMigrationData,
  type LegacyTrackingItemV2,
  type LegacyUserRatingV2,
  type LegacyWatchedItemV2,
  type LegacyWishlistItemV2,
} from './legacy-aniseeker';
import type { BackupEnvelopeV1 } from './schema';

// The shape returned by the native iOS bridge. `ratings` mirrors the old
// `migration_v1_v2_data` UserDefaults blob. The V2 arrays remain accepted as a
// defensive fallback for old hand-rolled exports/tests, but they are not the
// primary migration path.
//
// `hasStore` is false on Android, on iOS builds without the native module, or
// when the migration blob genuinely doesn't exist (clean install of the Expo
// app on a device that never had the old SwiftUI app's V1→V2 recovery data).
//
// `alreadyImported` is the persistent flag set by `markLegacyStoreImported()`.
// We expose it on the snapshot so the UI can decide whether to surface the
// migration banner without a second round-trip to the bridge.
export interface LegacySwiftDataSnapshot {
  hasStore: boolean;
  alreadyImported: boolean;
  storePath?: string | null;
  ratings?: LegacyRatingMigrationData[];
  userRatings?: LegacyUserRatingV2[];
  trackingItems?: LegacyTrackingItemV2[];
  watchedItems?: LegacyWatchedItemV2[];
  wishlistItems?: LegacyWishlistItemV2[];
  folders?: LegacyFolderV2[];
}

export interface LegacySwiftDataCounts {
  ratingMigrationItems: number;
  userRatings: number;
  trackingItems: number;
  watchedItems: number;
  wishlistItems: number;
  folders: number;
  total: number;
}

export function countLegacySwiftDataSnapshot(
  snap: LegacySwiftDataSnapshot
): LegacySwiftDataCounts {
  const ratingMigrationItems = snap.ratings?.length ?? 0;
  const userRatings = snap.userRatings?.length ?? 0;
  const trackingItems = snap.trackingItems?.length ?? 0;
  const watchedItems = snap.watchedItems?.length ?? 0;
  const wishlistItems = snap.wishlistItems?.length ?? 0;
  const folders = snap.folders?.length ?? 0;
  return {
    ratingMigrationItems,
    userRatings,
    trackingItems,
    watchedItems,
    wishlistItems,
    folders,
    total:
      ratingMigrationItems + userRatings + trackingItems + watchedItems + wishlistItems + folders,
  };
}

export function hasLegacyContent(snap: LegacySwiftDataSnapshot | null | undefined): boolean {
  if (!snap || !snap.hasStore) return false;
  return countLegacySwiftDataSnapshot(snap).total > 0;
}

// Convert the native snapshot into the LegacyAniseekerExport shape and run it
// through the existing import pipeline. Doing it this way means a single
// merge/dedupe code path covers both the JSON-paste import flow and the native
// UserDefaults read flow, so they're guaranteed to produce the same envelope
// for the same migration data.
export function swiftDataSnapshotToEnvelope(
  snap: LegacySwiftDataSnapshot
): BackupEnvelopeV1 {
  const exp: LegacyAniseekerExport = {
    version: 'swift-v1-v2-migration-data',
    ratings: snap.ratings ?? [],
    userRatings: snap.userRatings ?? [],
    trackingItems: snap.trackingItems ?? [],
    watchedItems: snap.watchedItems ?? [],
    wishlistItems: snap.wishlistItems ?? [],
    folders: snap.folders ?? [],
  };
  return importLegacyAniseekerExport(exp);
}
