import { describe, expect, it } from 'bun:test';

import {
  resolvePilgrimageHubInitialView,
  type PilgrimageHubInitialViewInput,
} from '../../../libs/services/pilgrimage/pilgrimage-hub-initial-view';
import { getAllIndexed } from '../../../libs/services/pilgrimage/anitabi-index';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';

const anime = (
  overrides: Partial<AnitabiBangumi> & Pick<AnitabiBangumi, 'id'>
): AnitabiBangumi => ({
  id: overrides.id,
  title: overrides.title ?? `Anime ${overrides.id}`,
  cn: overrides.cn ?? '',
  cover: overrides.cover ?? '',
  color: overrides.color ?? '#4488CC',
  city: overrides.city ?? '',
  geo: overrides.geo ?? [35.0, 135.0],
  zoom: overrides.zoom ?? 11,
  modified: overrides.modified ?? 0,
  litePoints: overrides.litePoints ?? [],
  pointsLength: overrides.pointsLength ?? 1,
  imagesLength: overrides.imagesLength ?? 0,
});

const resolve = (input: Partial<PilgrimageHubInitialViewInput> = {}) =>
  resolvePilgrimageHubInitialView({
    focusBangumiId: null,
    snapshot: null,
    ...input,
  });

describe('resolvePilgrimageHubInitialView', () => {
  it('uses a fresh Japan user location before a route focus anime', () => {
    const focused = getAllIndexed()[0];
    expect(focused).toBeDefined();

    const view = resolve({
      focusBangumiId: focused!.id,
      now: 1_000_000,
      snapshot: {
        updatedAt: 1_000_000,
        userLocationUpdatedAt: 960_000,
        userLocation: { latitude: 35.7767, longitude: 138.4233 },
      },
    });

    expect(view).toEqual({ center: { lat: 35.7767, lng: 138.4233 }, zoom: 15 });
  });

  it('uses the route focus anime when it exists in the sync index', () => {
    const focused = getAllIndexed()[0];
    expect(focused).toBeDefined();

    const view = resolve({ focusBangumiId: focused!.id });

    expect(view).toEqual({
      center: { lat: focused!.lat, lng: focused!.lng },
      zoom: 11,
    });
  });

  it('lets a route focus anime from the snapshot beat stronger fallback candidates', () => {
    const view = resolve({
      focusBangumiId: 9_999_999,
      fallbackFeaturedIds: [],
      snapshot: {
        updatedAt: 1,
        featuredAnimes: [
          anime({ id: 1, geo: [35.0, 135.0], pointsLength: 500 }),
          anime({ id: 9_999_999, geo: [36.0, 136.0], pointsLength: 1 }),
        ],
      },
    });

    expect(view).toEqual({ center: { lat: 36.0, lng: 136.0 }, zoom: 11 });
  });

  it('uses a remembered session viewport before anime candidates when user location is stale', () => {
    const view = resolve({
      now: 1_000_000,
      snapshot: {
        updatedAt: 1,
        userLocationUpdatedAt: 100_000,
        userLocation: { latitude: 35.66, longitude: 139.7 },
        mapViewport: { center: { lat: 36.2, lng: 138.1 }, zoom: 12.5 },
        featuredAnimes: [
          anime({ id: 1, geo: [34.98, 135.76], pointsLength: 500 }),
          anime({ id: 2, geo: [35.66, 139.7], pointsLength: 1 }),
        ],
      },
    });

    expect(view).toEqual({ center: { lat: 36.2, lng: 138.1 }, zoom: 12.5 });
  });

  it('uses the centroid of visited scenes before anime seed locations', () => {
    const view = resolve({
      fallbackFeaturedIds: [],
      snapshot: {
        updatedAt: 1,
        visited: { a: true, b: true },
        featuredAnimes: [
          anime({
            id: 1,
            geo: [35.0, 139.0],
            pointsLength: 500,
            litePoints: [
              {
                id: 'a',
                name: 'A',
                image: '',
                ep: 1,
                s: 0,
                geo: [35.8, 138.4],
              },
              {
                id: 'b',
                name: 'B',
                image: '',
                ep: 1,
                s: 0,
                geo: [36.0, 138.6],
              },
            ],
          }),
        ],
      },
    });

    expect(view).toEqual({ center: { lat: 35.9, lng: 138.5 }, zoom: 11 });
  });

  it('chooses the strongest snapshot anime when no user location is cached', () => {
    const view = resolve({
      fallbackFeaturedIds: [],
      snapshot: {
        updatedAt: 1,
        featuredAnimes: [
          anime({ id: 1, geo: [35.0, 135.0], pointsLength: 1 }),
          anime({ id: 2, geo: [36.0, 136.0], pointsLength: 500 }),
        ],
      },
    });

    expect(view).toEqual({ center: { lat: 36.0, lng: 136.0 }, zoom: 11 });
  });

  it('uses a fresh cached user location before anime candidates', () => {
    const view = resolve({
      now: 1_000_000,
      snapshot: {
        updatedAt: 1_000_000,
        userLocationUpdatedAt: 990_000,
        userLocation: { latitude: 35.68, longitude: 139.76 },
        featuredAnimes: [anime({ id: 1, geo: [36.0, 136.0], pointsLength: 500 })],
      },
    });

    expect(view).toEqual({ center: { lat: 35.68, lng: 139.76 }, zoom: 15 });
  });

  it('centers on a fresh user location outside Japan (Taipei)', () => {
    const view = resolve({
      now: 1_000,
      snapshot: {
        updatedAt: 1_000,
        userLocationUpdatedAt: 1_000,
        userLocation: { latitude: 25.03, longitude: 121.56 },
      },
    });

    expect(view).toEqual({ center: { lat: 25.03, lng: 121.56 }, zoom: 15 });
  });

  it('returns the Japan overview when there is no usable candidate', () => {
    expect(
      resolve({
        fallbackFeaturedIds: [],
        snapshot: {
          updatedAt: 1,
          userLocation: { latitude: 25.04, longitude: 121.56 },
          featuredAnimes: [],
        },
      })
    ).toEqual({ center: { lat: 36.5, lng: 138.0 }, zoom: 5 });
  });
});
