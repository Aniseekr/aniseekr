import { describe, expect, test } from 'bun:test';
import { groupPlannedIntents } from '../../../libs/services/pilgrimage/planned-trips';
import type { SpotIntentMap } from '../../../libs/services/pilgrimage/spot-intents';

const meta = (animeId: number, name: string, geo: [number, number], image: string, cn?: string) => ({
  animeId,
  name,
  geo,
  image,
  ...(cn ? { cn } : {}),
});

describe('groupPlannedIntents', () => {
  test('groups planned points by animeId and drops saved-only points', () => {
    const map: SpotIntentMap = {
      p1: { planned: true, meta: meta(1, 'Anime One', [35, 135], 'https://x/p1.jpg', 'A1') },
      p2: { planned: true, meta: meta(1, 'Anime One', [35.1, 135.1], 'https://x/p2.jpg') },
      p3: { planned: true, meta: meta(2, 'Anime Two', [34, 134], 'https://x/p3.jpg') },
      s1: { saved: true, meta: meta(3, 'Saved Only', [1, 1], 'https://x/s1.jpg') },
    };
    const out = groupPlannedIntents(map);
    expect(out.groups.map((g) => g.animeId)).toEqual([1, 2]); // 2 spots before 1
    expect(out.groups[0]).toEqual({
      animeId: 1,
      name: 'Anime One',
      cn: 'A1',
      spots: [
        { id: 'p1', geo: [35, 135], image: 'https://x/p1.jpg' },
        { id: 'p2', geo: [35.1, 135.1], image: 'https://x/p2.jpg' },
      ],
    });
    expect(out.uncategorized).toEqual([]);
  });

  test('planned points without meta (v1-migrated) go to uncategorized', () => {
    const map: SpotIntentMap = {
      old1: { planned: true },
      old2: { saved: true, planned: true },
    };
    const out = groupPlannedIntents(map);
    expect(out.groups).toEqual([]);
    expect(out.uncategorized.sort()).toEqual(['old1', 'old2']);
  });

  test('empty map → empty result', () => {
    expect(groupPlannedIntents({})).toEqual({ groups: [], uncategorized: [] });
  });
});
