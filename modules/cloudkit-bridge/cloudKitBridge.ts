// JS surface for the native iOS CloudKit bridge.
//
// On Android (or any build without the native module), every method short-
// circuits to a "not available" response so callers can probe at runtime
// without crashing.
//
// The native counterpart lives in `plugins/templates/AniseekrCloudKitBridge.swift`
// and is installed into the Xcode project by `plugins/with-cloudkit-bridge.js`
// during `expo prebuild`.

import { NativeModules, Platform } from 'react-native';

import type { CloudKitRecord } from '../../libs/services/backup/cloudkit-converter';
import type { LegacySwiftDataSnapshot } from '../../libs/services/backup/legacy-swiftdata';

interface NativeCloudKitBridge {
  isAvailable(): Promise<boolean>;
  fetchAllRecords(): Promise<CloudKitRecord[]>;
  writeRecords(records: CloudKitRecord[]): Promise<{ written: number; failed: number }>;
  deleteAllRecords(): Promise<{ deleted: number }>;
  // Direct read of the legacy SwiftUI app's V1→V2 recovery blob:
  // UserDefaults["migration_v1_v2_data"]. That is the old app's minimal
  // migration backup path and contains RatingMigrationData rows only.
  fetchLegacySwiftDataStore(): Promise<LegacySwiftDataSnapshot>;
  markLegacyStoreImported(): Promise<void>;
}

const Native = (NativeModules as Record<string, unknown>).AniseekrCloudKitBridge as
  | NativeCloudKitBridge
  | undefined;

export type CloudKitAvailability = 'unavailable' | 'no-account' | 'ready';

export interface CloudKitBridgeLike {
  isInstalled(): boolean;
  getAvailability(): Promise<CloudKitAvailability>;
  fetchAllRecords(): Promise<CloudKitRecord[]>;
  writeRecords(records: CloudKitRecord[]): Promise<{ written: number; failed: number }>;
  deleteAllRecords(): Promise<{ deleted: number }>;
  fetchLegacySwiftDataStore(): Promise<LegacySwiftDataSnapshot>;
  markLegacyStoreImported(): Promise<void>;
}

// Returned when the native module is missing (Android, or an iOS dev client
// that hasn't been rebuilt since the bridge was added). Distinguishable from a
// real iOS device with no legacy data by `storePath == null`.
const UNAVAILABLE_LEGACY_SNAPSHOT: LegacySwiftDataSnapshot = {
  hasStore: false,
  alreadyImported: false,
  storePath: null,
};

export const cloudKitBridge: CloudKitBridgeLike = {
  isInstalled() {
    return Platform.OS === 'ios' && !!Native;
  },

  async getAvailability() {
    if (Platform.OS !== 'ios') return 'unavailable';
    if (!Native) return 'unavailable';
    try {
      const ok = await Native.isAvailable();
      return ok ? 'ready' : 'no-account';
    } catch {
      return 'unavailable';
    }
  },

  async fetchAllRecords() {
    if (!Native) throw new Error('CloudKit bridge is not installed on this platform/build');
    return Native.fetchAllRecords();
  },

  async writeRecords(records) {
    if (!Native) throw new Error('CloudKit bridge is not installed on this platform/build');
    return Native.writeRecords(records);
  },

  async deleteAllRecords() {
    if (!Native) throw new Error('CloudKit bridge is not installed on this platform/build');
    return Native.deleteAllRecords();
  },

  async fetchLegacySwiftDataStore() {
    // Resolves to UNAVAILABLE_LEGACY_SNAPSHOT (rather than throwing) so the UI
    // can probe unconditionally on mount without try/catch — Android and old
    // dev clients just look like "no legacy data here", same as a clean
    // install.
    if (!Native) return UNAVAILABLE_LEGACY_SNAPSHOT;
    return Native.fetchLegacySwiftDataStore();
  },

  async markLegacyStoreImported() {
    if (!Native) return;
    return Native.markLegacyStoreImported();
  },
};
