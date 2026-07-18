import { describe, expect, it } from 'bun:test';

import { AnitabiPipelineSceneProjector } from '../../../libs/services/pilgrimage/locality';
import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';

describe('canonical locality Anitabi projection', () => {
  it('PILG-055 delegates to detailed points and preserves existing physical grouping', async () => {
    const calls: number[] = [];
    const points: AnitabiPoint[] = [
      {
        id: 'station-a',
        name: '沼津駅',
        cn: '沼津站',
        image: 'https://image.anitabi.cn/a.jpg',
        ep: 1,
        s: 10,
        geo: [35.1034, 138.8613],
        origin: 'Scene contributor',
        originURL: 'https://example.com/scene-a',
      },
      {
        id: 'station-b',
        name: '沼津駅 別角度',
        image: 'https://image.anitabi.cn/b.jpg',
        ep: 1,
        s: 11,
        geo: [35.10341, 138.86131],
      },
    ];
    const projector = new AnitabiPipelineSceneProjector(
      {
        getDetailedPointsByBangumiId: async (bangumiId) => {
          calls.push(bangumiId);
          return points;
        },
      },
      () => '2026-07-18'
    );

    const projection = await projector.getScenePlacesForAnime(165553);

    expect(calls).toEqual([165553]);
    expect(projection.places).toHaveLength(1);
    expect(projection.places[0]).toMatchObject({
      id: 'anitabi:165553:station-a',
      name: { ja: '沼津駅', zhHans: '沼津站' },
      geo: [35.1034, 138.8613],
      animeIds: [165553],
    });
    expect(projection.roles).toHaveLength(1);
    expect(projection.roles[0]).toMatchObject({
      id: 'scene:anitabi:165553:station-a',
      kind: 'scene',
      placeId: 'anitabi:165553:station-a',
      anitabiRef: { bangumiId: 165553, pointId: 'station-a' },
    });
    expect(projection.roles[0].provenance[0].license).toBe('CC BY-NC-SA 4.0');
    expect(projection.roles[0].provenance[1]).toMatchObject({
      sourceName: { ja: 'Scene contributor' },
      sourceUrl: 'https://example.com/scene-a',
    });
  });
});
