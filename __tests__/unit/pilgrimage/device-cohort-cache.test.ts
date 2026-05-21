import { describe, expect, it } from 'bun:test';
import {
  type CohortSnapshot,
  readCohortSnapshot,
  writeCohortSnapshot,
} from '../../../libs/services/pilgrimage/device-cohort-cache';

interface FakeStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

function makeMemoryStorage(): FakeStorageLike {
  const map = new Map<string, string>();
  return {
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => {
      map.set(k, v);
    },
    removeItem: async (k) => {
      map.delete(k);
    },
  };
}

const SNAPSHOT_BASE: CohortSnapshot = {
  manufacturer: 'samsung',
  modelID: 'SM-G780G',
  facing: 'back',
  buildNumber: '1.0.0+42',
  strategy: 'standalone-switch',
  primaryDeviceId: 's20fe-wide',
  ultraWideDeviceId: 's20fe-uw',
  savedAtMs: 1_700_000_000_000,
};

describe('device-cohort-cache', () => {
  it('write then read returns the same snapshot', async () => {
    const storage = makeMemoryStorage();
    const now = () => 1_700_000_000_000;
    await writeCohortSnapshot(SNAPSHOT_BASE, { storage, now });
    const read = await readCohortSnapshot(
      { manufacturer: 'samsung', modelID: 'SM-G780G', facing: 'back' },
      { storage, now, buildNumber: '1.0.0+42' }
    );
    expect(read?.strategy).toBe('standalone-switch');
    expect(read?.primaryDeviceId).toBe('s20fe-wide');
    expect(read?.ultraWideDeviceId).toBe('s20fe-uw');
  });

  it('returns null when no cache entry exists for the identity', async () => {
    const storage = makeMemoryStorage();
    const read = await readCohortSnapshot(
      { manufacturer: 'samsung', modelID: 'SM-G780G', facing: 'back' },
      { storage, now: () => 0, buildNumber: '1.0.0+42' }
    );
    expect(read).toBeNull();
  });

  it('returns null after the TTL has elapsed (default 30d)', async () => {
    const storage = makeMemoryStorage();
    await writeCohortSnapshot(SNAPSHOT_BASE, {
      storage,
      now: () => 1_700_000_000_000,
    });
    // 30 days + 1 ms later → outside TTL
    const past = 1_700_000_000_000 + 30 * 24 * 60 * 60 * 1000 + 1;
    const read = await readCohortSnapshot(
      { manufacturer: 'samsung', modelID: 'SM-G780G', facing: 'back' },
      { storage, now: () => past, buildNumber: '1.0.0+42' }
    );
    expect(read).toBeNull();
  });

  it('returns null when buildNumber differs (OTA invalidation)', async () => {
    const storage = makeMemoryStorage();
    await writeCohortSnapshot(SNAPSHOT_BASE, {
      storage,
      now: () => 1_700_000_000_000,
    });
    const read = await readCohortSnapshot(
      { manufacturer: 'samsung', modelID: 'SM-G780G', facing: 'back' },
      { storage, now: () => 1_700_000_000_000, buildNumber: '1.1.0+99' }
    );
    expect(read).toBeNull();
  });

  it('back and front facings are isolated', async () => {
    const storage = makeMemoryStorage();
    const now = () => 1_700_000_000_000;
    await writeCohortSnapshot(SNAPSHOT_BASE, { storage, now });
    const frontRead = await readCohortSnapshot(
      { manufacturer: 'samsung', modelID: 'SM-G780G', facing: 'front' },
      { storage, now, buildNumber: '1.0.0+42' }
    );
    expect(frontRead).toBeNull();
  });

  it('different manufacturer:modelID never collides', async () => {
    const storage = makeMemoryStorage();
    const now = () => 1_700_000_000_000;
    await writeCohortSnapshot(SNAPSHOT_BASE, { storage, now });
    const otherDevice = await readCohortSnapshot(
      { manufacturer: 'google', modelID: 'pixel-8', facing: 'back' },
      { storage, now, buildNumber: '1.0.0+42' }
    );
    expect(otherDevice).toBeNull();
  });

  it('manufacturer casing is normalised so cold/warm enumeration both hit', async () => {
    // CameraX returns `samsung` cold and sometimes `Samsung` warm — same
    // device, but a case-sensitive key would miss the cache and force a
    // re-enumeration on every launch.
    const storage = makeMemoryStorage();
    const now = () => 1_700_000_000_000;
    await writeCohortSnapshot(
      { ...SNAPSHOT_BASE, manufacturer: 'samsung' },
      { storage, now }
    );
    const read = await readCohortSnapshot(
      { manufacturer: 'Samsung', modelID: 'SM-G780G', facing: 'back' },
      { storage, now, buildNumber: '1.0.0+42' }
    );
    expect(read).not.toBeNull();
  });

  it('corrupt JSON in storage returns null without throwing', async () => {
    const storage = makeMemoryStorage();
    await storage.setItem(
      'aniseekr.pilgrimage.cohort.v1:samsung:SM-G780G:back',
      '{not valid json'
    );
    const read = await readCohortSnapshot(
      { manufacturer: 'samsung', modelID: 'SM-G780G', facing: 'back' },
      { storage, now: () => 1_700_000_000_000, buildNumber: '1.0.0+42' }
    );
    expect(read).toBeNull();
  });
});
