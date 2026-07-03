import { describe, expect, test } from 'bun:test';
import { resolveHubAnimeProgress } from '../../../libs/services/pilgrimage/pilgrimage-hub-progress';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';

function anime(litePointIds: string[]): AnitabiBangumi {
  return {
    id: 1, title: 'X', cn: '', city: '', cover: '', color: '#8DC5D8',
    geo: [35, 139], zoom: 12, modified: 0, pointsLength: 500,
    imagesLength: 0,
    litePoints: litePointIds.map((id) => ({ id, name: id, image: 'https://x/a.jpg', ep: 0, s: 0, geo: [35, 139] as [number, number] })),
  };
}

describe('resolveHubAnimeProgress', () => {
  test('counts visited ∩ points; total from cached detail ids when present', () => {
    const p = resolveHubAnimeProgress(anime(['a', 'b']), { a: true }, ['a', 'b', 'c', 'd']);
    expect(p.visitedCount).toBe(1);
    expect(p.total).toBe(4); // honest denominator = cached detail point count
  });
  test('no cached detail ids → total is null (show check count only, never litePoints as denominator)', () => {
    const p = resolveHubAnimeProgress(anime(['a', 'b']), { a: true, b: true });
    expect(p.visitedCount).toBe(2);
    expect(p.total).toBeNull();
  });
});
