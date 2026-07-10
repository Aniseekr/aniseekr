import { describe, expect, it } from 'bun:test';

import {
  buildPilgrimageAlbumEntries,
  FREE_FOLDER_ANIME_ID,
  getCaptureFrameMatchPercent,
} from '../../../libs/services/pilgrimage/album-captures';
import type { PilgrimageCapture } from '../../../libs/services/pilgrimage/captures';
import type { AnitabiBangumi, AnitabiPoint } from '../../../libs/services/pilgrimage/types';

function point(overrides: Partial<AnitabiPoint> = {}): AnitabiPoint {
  return {
    id: 'known-spot',
    name: 'Known station',
    image: 'https://image.anitabi.cn/known.jpg',
    ep: 2,
    s: 10,
    geo: [35.6, 139.7],
    ...overrides,
  };
}

function anime(overrides: Partial<AnitabiBangumi> = {}): AnitabiBangumi {
  return {
    id: 100,
    title: 'Known Anime',
    cn: '已知動畫',
    city: '東京都',
    cover: 'https://image.anitabi.cn/cover.jpg',
    color: '#4A90E2',
    geo: [35.6, 139.7],
    zoom: 12,
    modified: 1,
    litePoints: [point()],
    pointsLength: 10,
    imagesLength: 10,
    ...overrides,
  };
}

describe('pilgrimage album capture entries', () => {
  it('keeps captures visible from persisted capture metadata even when the anime is not preloaded', () => {
    const capture: PilgrimageCapture = {
      spotId: 'detail-only-spot',
      uri: 'file:///captures/detail-only.jpg',
      capturedAt: 1710000000000,
      animeId: 555,
      animeTitle: 'Detail Only Anime',
      animeTitleCn: '只在詳細頁出現的動畫',
      spotName: 'Detail location',
      spotNameCn: '詳細地點',
      spotImage: 'https://image.anitabi.cn/detail-only.jpg',
      spotEp: 8,
      spotSecond: 42,
      spotGeo: [35.1, 138.9],
      sensorSnapshot: {
        distanceMeters: 9,
        headingDeltaDeg: 2,
        tilt: -1,
        frameMatch: 0.842,
        frameValid: true,
      },
    };

    const entries = buildPilgrimageAlbumEntries({
      captures: [capture],
      animes: [],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].anime.id).toBe(555);
    expect(entries[0].anime.title).toBe('Detail Only Anime');
    expect(entries[0].anime.cn).toBe('只在詳細頁出現的動畫');
    expect(entries[0].spot.id).toBe('detail-only-spot');
    expect(entries[0].spot.name).toBe('Detail location');
    expect(entries[0].spot.image).toBe('https://image.anitabi.cn/detail-only.jpg');
    expect(entries[0].spot.ep).toBe(8);
    expect(entries[0].matchPercent).toBe(84);
  });

  it('matches legacy captures through known anime data without inventing a frame score', () => {
    const capture: PilgrimageCapture = {
      spotId: 'known-spot',
      uri: 'file:///captures/known.jpg',
      capturedAt: 1710000000100,
    };

    const entries = buildPilgrimageAlbumEntries({
      captures: [capture],
      animes: [anime()],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].anime.title).toBe('Known Anime');
    expect(entries[0].spot.name).toBe('Known station');
    expect(entries[0].matchPercent).toBeNull();
  });

  it('only exposes real persisted frame match values', () => {
    expect(
      getCaptureFrameMatchPercent({ spotId: 'a', uri: 'file:///a.jpg', capturedAt: 1 })
    ).toBeNull();
    expect(
      getCaptureFrameMatchPercent({
        spotId: 'b',
        uri: 'file:///b.jpg',
        capturedAt: 2,
        sensorSnapshot: {
          distanceMeters: null,
          headingDeltaDeg: null,
          tilt: null,
          frameMatch: 0.995,
          frameValid: true,
        },
      })
    ).toBe(100);
  });
});

describe('free-bucket album entries', () => {
  const free: PilgrimageCapture = {
    spotId: 'free-1',
    uri: 'file:///free.jpg',
    capturedAt: 100,
    source: 'camera',
    userLocation: { latitude: 35.1, longitude: 139.2 },
  };

  it('emits a free-folder entry for a free capture (no reference scene)', () => {
    const entries = buildPilgrimageAlbumEntries({ captures: [], free: [free], animes: [] });
    expect(entries).toHaveLength(1);
    expect(entries[0].isFree).toBe(true);
    expect(entries[0].anime.id).toBe(FREE_FOLDER_ANIME_ID);
    expect(entries[0].spot.image).toBe(''); // no scene image -> single-photo card
    expect(entries[0].capture.uri).toBe('file:///free.jpg');
    expect(entries[0].matchPercent).toBeNull();
  });

  it('keeps free entries separate from known-spot entries and sorts by capturedAt', () => {
    const spotCap: PilgrimageCapture = {
      spotId: 's1',
      uri: 'file:///s1.jpg',
      capturedAt: 200,
      animeId: 7,
      spotImage: 'https://x/scene.jpg',
      spotName: 'Shrine',
    };
    const entries = buildPilgrimageAlbumEntries({ captures: [spotCap], free: [free], animes: [] });
    expect(entries.map((e) => e.capture.uri)).toEqual(['file:///s1.jpg', 'file:///free.jpg']); // 200 > 100
    expect(entries.find((e) => e.isFree)?.anime.id).toBe(FREE_FOLDER_ANIME_ID);
  });
});
