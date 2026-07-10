import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as SQLite from 'expo-sqlite';
import { LocalDB } from '../../../libs/db';
import { getSpotsNear } from '../../../libs/services/pilgrimage/spot-index-service';
import type { SpotIndexRow } from '../../../libs/services/pilgrimage/spot-index';

const rows: SpotIndexRow[] = [
  { pointId: 'near', bangumiId: 1, lat: 35.01, lng: 139, name: 'A', cn: '', image: '/a.jpg' },
  { pointId: 'far', bangumiId: 2, lat: 36, lng: 139, name: 'B', cn: '', image: '/b.jpg' },
];

test('getSpotsNear prefilters via queryBox then ranks by haversine', async () => {
  const out = await getSpotsNear(
    { latitude: 35, longitude: 139 },
    30,
    10,
    { queryBox: async () => rows }
  );
  expect(out.map((s) => s.pointId)).toEqual(['near']); // 'far' ~111km dropped
  expect(out[0].distanceKm).toBeGreaterThan(0);
});

// Task 7 review carry-forward: exercise the REAL LocalDB.queryAnitabiSpotsByBox
// SQL (via test-setup.ts's FakeDatabase anitabi_spots shim) instead of stubbing
// queryBox, so a swapped min/max bind param in libs/db.ts would fail this test.
interface SqliteTestHooks {
  reset(): void;
}
const sqliteHooks = (SQLite as typeof SQLite & { __sqliteTestHooks: SqliteTestHooks })
  .__sqliteTestHooks;
const resetLocalDb = (LocalDB as typeof LocalDB & { __resetForTests(): void }).__resetForTests;

describe('LocalDB.queryAnitabiSpotsByBox (integration against FakeDatabase)', () => {
  beforeEach(() => {
    sqliteHooks.reset();
    resetLocalDb();
  });
  afterEach(() => {
    sqliteHooks.reset();
    resetLocalDb();
  });

  const seedRows: SpotIndexRow[] = [
    { pointId: 'inside', bangumiId: 1, lat: 35.01, lng: 139.01, name: 'Inside', cn: '', image: '/a.jpg' },
    { pointId: 'outside-lat', bangumiId: 2, lat: 40, lng: 139.01, name: 'OutsideLat', cn: '', image: '' },
    { pointId: 'outside-lng', bangumiId: 3, lat: 35.01, lng: 150, name: 'OutsideLng', cn: '', image: '' },
  ];

  test('hydrates then filters strictly by the lat/lng BETWEEN box, mapping snake_case columns back to SpotIndexRow', async () => {
    await LocalDB.hydrateAnitabiSpots(seedRows);

    const hits = await LocalDB.queryAnitabiSpotsByBox({
      minLat: 34,
      maxLat: 36,
      minLng: 138,
      maxLng: 140,
    });

    expect(hits.map((h) => h.pointId)).toEqual(['inside']);
    expect(hits[0]).toEqual(seedRows[0]);

    // getSpotsNear's default dep wires straight into LocalDB.queryAnitabiSpotsByBox
    // — confirm the full path (not just the raw query) also sees the hydrated row.
    const nearHits = await getSpotsNear({ latitude: 35, longitude: 139 }, 200, 5);
    expect(nearHits.map((h) => h.pointId)).toEqual(['inside']);
  });
});
