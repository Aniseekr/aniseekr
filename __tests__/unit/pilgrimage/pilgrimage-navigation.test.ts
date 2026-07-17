import { describe, expect, it } from 'bun:test';

import {
  buildMultiStopDirectionsUrl,
  buildPilgrimageDetailRoute,
  buildPilgrimageSceneIdRoute,
  getPilgrimageSceneIdSeed,
  getPilgrimageDetailBackRoute,
  getPilgrimageDetailChromeSeed,
  getPilgrimageDetailFocusSpotId,
  resolvePilgrimageSpotFocus,
} from '../../../libs/services/pilgrimage/pilgrimage-navigation';

describe('pilgrimage navigation', () => {
  it('routes search results to detail with an explicit search return target', () => {
    expect(
      buildPilgrimageDetailRoute(485936, {
        returnTo: 'search',
        returnQuery: 'mono',
      })
    ).toEqual({
      pathname: '/pilgrimage/[animeId]',
      params: {
        animeId: '485936',
        returnTo: 'search',
        returnQuery: 'mono',
      },
    });
  });

  it('returns pilgrimage detail back to the pilgrimage search screen when requested', () => {
    expect(
      getPilgrimageDetailBackRoute({
        animeId: '485936',
        returnTo: 'search',
        returnQuery: 'mono',
      })
    ).toEqual({
      pathname: '/search',
      params: {
        context: 'pilgrimage',
        q: 'mono',
      },
    });
  });

  it('returns pilgrimage detail back to the hub instead of the default home tab', () => {
    expect(
      getPilgrimageDetailBackRoute({
        animeId: '485936',
        returnTo: 'hub',
      })
    ).toEqual({
      pathname: '/pilgrimage',
    });
  });

  it('carries the chrome seed (title / poster / themeColor) into the detail route so frame-1 paint has real chrome', () => {
    const route = buildPilgrimageDetailRoute(485936, {
      returnTo: 'hub',
      title: '青春ブタ野郎はバニーガール先輩の夢を見ない',
      titleSecondary: '青春笨蛋少年不做兔女郎学姐的梦',
      poster: 'https://lain.bgm.tv/r/400/pic/cover/l/00.jpg',
      themeColor: '#8DC5D8',
    });
    expect(route.params).toMatchObject({
      animeId: '485936',
      returnTo: 'hub',
      title: '青春ブタ野郎はバニーガール先輩の夢を見ない',
      titleSecondary: '青春笨蛋少年不做兔女郎学姐的梦',
      poster: 'https://lain.bgm.tv/r/400/pic/cover/l/00.jpg',
      themeColor: '#8DC5D8',
    });
  });

  it('drops null / empty chrome seed values so the detail screen falls back to a skeleton', () => {
    const route = buildPilgrimageDetailRoute(485936, {
      returnTo: 'hub',
      title: null,
      poster: '',
    });
    expect(route.params).toEqual({
      animeId: '485936',
      returnTo: 'hub',
    });
  });

  it('reads the chrome seed back out of the route params on the detail side', () => {
    expect(
      getPilgrimageDetailChromeSeed({
        animeId: '485936',
        title: '青春ブタ野郎',
        poster: 'https://lain.bgm.tv/r/400/pic/cover/l/00.jpg',
        themeColor: '#8DC5D8',
      })
    ).toEqual({
      title: '青春ブタ野郎',
      titleSecondary: null,
      poster: 'https://lain.bgm.tv/r/400/pic/cover/l/00.jpg',
      themeColor: '#8DC5D8',
    });
  });

  it('PILG-035 round-trips focusSpotId and consumes the available focus once', () => {
    const route = buildPilgrimageDetailRoute(485936, {
      returnTo: 'hub',
      focusSpotId: 'spot-42',
    });
    const focusSpotId = getPilgrimageDetailFocusSpotId(route.params ?? {});
    expect(focusSpotId).toBe('spot-42');

    const beforeLoad = resolvePilgrimageSpotFocus({
      bangumiId: 485936,
      focusSpotId,
      spotIsAvailable: false,
      consumedKey: null,
    });
    expect(beforeLoad).toEqual({ spotId: null, consumedKey: null });

    const firstOpen = resolvePilgrimageSpotFocus({
      bangumiId: 485936,
      focusSpotId,
      spotIsAvailable: true,
      consumedKey: beforeLoad.consumedKey,
    });
    expect(firstOpen).toEqual({
      spotId: 'spot-42',
      consumedKey: '485936:spot-42',
    });

    const afterClose = resolvePilgrimageSpotFocus({
      bangumiId: 485936,
      focusSpotId,
      spotIsAvailable: true,
      consumedKey: firstOpen.consumedKey,
    });
    expect(afterClose).toEqual({
      spotId: null,
      consumedKey: '485936:spot-42',
    });

    const identifyRoute = buildPilgrimageSceneIdRoute(
      {
        id: 'spot-42',
        name: 'Station crossing',
        cn: '車站平交道',
        image: 'https://img.example/spot-42.jpg',
        ep: 4,
        s: 101,
        geo: [35.1, 139.2],
        origin: 'Frame contributor',
        originURL: 'https://example.com/frame',
      },
      {
        bangumiId: 485936,
        title: 'Test Anime',
        titleSecondary: '測試動畫',
        poster: 'https://img.example/poster.jpg',
        themeColor: '#336699',
      }
    );
    expect(getPilgrimageSceneIdSeed(identifyRoute.params ?? {})).toEqual({
      bangumiId: 485936,
      point: {
        id: 'spot-42',
        name: 'Station crossing',
        cn: '車站平交道',
        image: 'https://img.example/spot-42.jpg',
        ep: 4,
        s: 101,
        geo: [35.1, 139.2],
        origin: 'Frame contributor',
        originURL: 'https://example.com/frame',
      },
      chrome: {
        title: 'Test Anime',
        titleSecondary: '測試動畫',
        poster: 'https://img.example/poster.jpg',
        themeColor: '#336699',
      },
    });
  });
});

describe('buildMultiStopDirectionsUrl', () => {
  const g = (lat: number, lng: number) => [lat, lng] as const;

  it('google: single segment with waypoints + final destination', () => {
    const urls = buildMultiStopDirectionsUrl(
      [g(35, 135), g(35.1, 135.1), g(35.2, 135.2)],
      'google'
    );
    expect(urls).toEqual([
      'https://www.google.com/maps/dir/?api=1&destination=35.2,135.2&waypoints=35,135%7C35.1,135.1',
    ]);
  });

  it('google: two stops → destination only, no waypoints param', () => {
    expect(buildMultiStopDirectionsUrl([g(1, 2), g(3, 4)], 'google')).toEqual([
      'https://www.google.com/maps/dir/?api=1&destination=3,4&waypoints=1,2',
    ]);
  });

  it('google: >10 stops split into chained segments (<=9 waypoints each)', () => {
    const stops = Array.from({ length: 12 }, (_, i) => g(i, i));
    const urls = buildMultiStopDirectionsUrl(stops, 'google');
    expect(urls.length).toBe(2);
    // segment 1 ends at stop index 9 (10 stops: 9 waypoints + destination)
    expect(urls[0]).toContain('destination=9,9');
    // segment 2 resumes from stop 9 and ends at stop 11
    expect(urls[1]).toContain('destination=11,11');
    expect(urls[1]).toContain('waypoints=9,9%7C10,10');
  });

  it('apple: one search url per stop (no multi-stop support)', () => {
    expect(buildMultiStopDirectionsUrl([g(35, 135), g(36, 136)], 'apple')).toEqual([
      'https://maps.apple.com/?ll=35,135',
      'https://maps.apple.com/?ll=36,136',
    ]);
  });

  it('empty stops → empty array', () => {
    expect(buildMultiStopDirectionsUrl([], 'google')).toEqual([]);
    expect(buildMultiStopDirectionsUrl([], 'apple')).toEqual([]);
  });
});
