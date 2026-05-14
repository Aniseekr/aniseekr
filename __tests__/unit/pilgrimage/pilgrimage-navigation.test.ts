import { describe, expect, it } from 'bun:test';

import {
  buildPilgrimageDetailRoute,
  getPilgrimageDetailBackRoute,
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
});
