import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { MapillaryClient } from '../../../libs/services/pilgrimage/street-view/mapillary-client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('MapillaryClient', () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    fetchSpy = spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('PILG-021 missing token returns null without fetch', async () => {
    const images = await MapillaryClient.findNearbyImages(35.658, 139.701, { token: '' });

    expect(images).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('PILG-023 falls back from radius to bbox and sorts parsed images', async () => {
    const requestedUrls: string[] = [];
    fetchSpy.mockImplementation(async (input: URL | RequestInfo) => {
      requestedUrls.push(String(input));
      if (requestedUrls.length === 1) {
        return jsonResponse(200, { data: [{ id: 'unusable-no-thumbnail' }] });
      }
      return jsonResponse(200, {
        data: [
          {
            id: 'far-pano',
            thumb_1024_url: 'https://images.mapillary.com/far.jpg',
            geometry: { type: 'Point', coordinates: [139.702, 35.659] },
            compass_angle: 270,
            is_pano: true,
            quality_score: 1,
            captured_at: '2024-01-04T00:00:00Z',
          },
          {
            id: 'near-low',
            thumb_1024_url: 'https://images.mapillary.com/near-low.jpg',
            geometry: { type: 'Point', coordinates: [139.70105, 35.65805] },
            compass_angle: 80,
            is_pano: false,
            quality_score: 0.2,
            captured_at: '2024-01-03T00:00:00Z',
          },
          {
            id: 'near-high-flat',
            thumb_1024_url: 'https://images.mapillary.com/near-high-flat.jpg',
            geometry: { type: 'Point', coordinates: [139.70105, 35.65805] },
            compass_angle: 90,
            is_pano: false,
            quality_score: 0.8,
            captured_at: '2024-01-02T00:00:00Z',
          },
          {
            id: 'near-high-pano',
            thumb_1024_url: 'https://images.mapillary.com/near-high-pano.jpg',
            geometry: { type: 'Point', coordinates: [139.70105, 35.65805] },
            compass_angle: 100,
            is_pano: true,
            quality_score: 0.8,
            captured_at: '2024-01-01T00:00:00Z',
          },
        ],
      });
    });

    const images = await MapillaryClient.findNearbyImages(35.658, 139.701, {
      token: 'test-token',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const radiusUrl = new URL(requestedUrls[0]);
    expect(radiusUrl.hostname).toBe('graph.mapillary.com');
    expect(radiusUrl.pathname).toBe('/images');
    expect(radiusUrl.searchParams.get('lat')).toBe('35.658');
    expect(radiusUrl.searchParams.get('lng')).toBe('139.701');
    expect(radiusUrl.searchParams.get('radius')).toBe('50');
    expect(radiusUrl.searchParams.get('access_token')).toBe('test-token');

    const bboxUrl = new URL(requestedUrls[1]);
    expect(bboxUrl.searchParams.get('bbox')).toBe('139.6985,35.6555,139.7035,35.6605');
    expect(bboxUrl.searchParams.get('radius')).toBeNull();

    expect(images?.map((image) => image.id)).toEqual([
      'near-high-pano',
      'near-high-flat',
      'near-low',
      'far-pano',
    ]);
    expect(images?.[0]).toMatchObject({
      id: 'near-high-pano',
      thumb1024Url: 'https://images.mapillary.com/near-high-pano.jpg',
      latitude: 35.65805,
      longitude: 139.70105,
      compassAngle: 100,
      isPano: true,
      qualityScore: 0.8,
      capturedAt: '2024-01-01T00:00:00Z',
    });
    expect(images?.[0].distanceMeters).toBeGreaterThan(0);
  });

  it('PILG-024 returns null for rate limit network and malformed payloads', async () => {
    fetchSpy.mockImplementationOnce(async () => jsonResponse(429, { error: 'rate limited' }));
    await expect(
      MapillaryClient.findNearbyImages(35.658, 139.701, { token: 'test-token' })
    ).resolves.toBeNull();

    fetchSpy.mockImplementationOnce(async () => {
      throw new Error('offline');
    });
    await expect(
      MapillaryClient.findNearbyImages(35.658, 139.701, { token: 'test-token' })
    ).resolves.toBeNull();

    fetchSpy.mockImplementationOnce(async () => jsonResponse(200, { data: 'bad' }));
    await expect(
      MapillaryClient.findNearbyImages(35.658, 139.701, { token: 'test-token' })
    ).resolves.toBeNull();
  });
});
