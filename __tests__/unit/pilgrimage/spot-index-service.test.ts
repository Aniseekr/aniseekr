import { describe, expect, test } from 'bun:test';
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
