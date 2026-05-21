import { describe, expect, it } from 'bun:test';

import {
  buildPilgrimageDetailRoute,
  getPilgrimageDetailBackRoute,
  getPilgrimageDetailChromeSeed,
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
});
