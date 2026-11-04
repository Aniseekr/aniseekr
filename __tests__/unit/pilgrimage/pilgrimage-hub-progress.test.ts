import { describe, expect, test } from 'bun:test';
import { resolveHubAnimeProgress } from '../../../libs/services/pilgrimage/pilgrimage-hub-progress';
import type { PilgrimageWork } from '../../../libs/services/pilgrimage/types';

function anime(spotIds: string[]): PilgrimageWork {
  return {
    key: 'x',
    ja: 'X',
    en: 'X',
    zh: { hans: '', hant: '' },
    mal: [],
    bgm: [],
    n: spotIds.length,
    conf: { c: 0, s: 0, u: 0 },
    cities: [],
    dataVersion: 'test',
    titleJa: 'X',
    titleEn: 'X',
    titleZh: { hans: '', hant: '' },
    spots: spotIds.map((id) => ({
      id,
      name: id,
      workKey: 'x',
      address: '',
      note: '',
      lat: 35,
      lon: 139,
      confidence: 'confirmed' as const,
      scenes: [{ episode: '第1話' }],
      sources: [],
    })),
  };
}

describe('resolveHubAnimeProgress', () => {
  test('counts visited Atlas spots against the work spot list', () => {
    const p = resolveHubAnimeProgress(anime(['a', 'b', 'c', 'd']), { a: true });
    expect(p.visitedCount).toBe(1);
    expect(p.total).toBe(4);
  });
  test('an empty Atlas work has no known visited spots', () => {
    const p = resolveHubAnimeProgress(anime([]), { a: true, b: true });
    expect(p.visitedCount).toBe(0);
    expect(p.total).toBe(0);
  });
  test('does not count saved ids missing from the Atlas work', () => {
    const p = resolveHubAnimeProgress(anime(['a', 'c']), { a: true, b: true });
    expect(p.visitedCount).toBe(1);
    expect(p.total).toBe(2);
  });
});
