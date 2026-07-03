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

function points(ids: string[]): { id: string }[] {
  return ids.map((id) => ({ id }));
}

describe('resolveHubAnimeProgress', () => {
  test('full points list present: numerator counted against full ids, total = length', () => {
    const p = resolveHubAnimeProgress(anime(['a', 'b']), { a: true }, points(['a', 'b', 'c', 'd']));
    expect(p.visitedCount).toBe(1);
    expect(p.total).toBe(4); // honest denominator = full points count
  });
  test('no full points list → total is null (show check count only, never litePoints as denominator)', () => {
    const p = resolveHubAnimeProgress(anime(['a', 'b']), { a: true, b: true });
    expect(p.visitedCount).toBe(2);
    expect(p.total).toBeNull();
  });
  test('honesty: a visited id in litePoints but NOT in fullPoints does not count once fullPoints exists', () => {
    // "b" is visited and present in litePoints (the sample), but the full
    // per-anime list only has "a" and "c" — the stale/sample id must not
    // inflate the count once we hold the real basis.
    const p = resolveHubAnimeProgress(anime(['a', 'b']), { a: true, b: true }, points(['a', 'c']));
    expect(p.visitedCount).toBe(1); // only "a" counts — "b" isn't in fullPoints
    expect(p.total).toBe(2);
  });
});
