import { describe, expect, it } from 'bun:test';
import { nearestUnvisitedWithin } from '../../../libs/services/pilgrimage/proximity-checkin';
import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';

function pt(id: string, lat: number, lng: number): AnitabiPoint {
  return { id, name: id, image: '', ep: 0, s: 0, geo: [lat, lng] };
}
const user = { latitude: 35.0, longitude: 139.0 };

describe('nearestUnvisitedWithin', () => {
  it('ignores visited points and returns the nearest unvisited within radius', () => {
    const points = [pt('a', 35.0002, 139.0), pt('b', 35.0004, 139.0)]; // a nearer than b
    const res = nearestUnvisitedWithin(points, { a: true }, user, 100);
    expect(res?.spot.id).toBe('b'); // a is visited -> skipped
  });
  it('returns null when the only nearby point is already visited', () => {
    const points = [pt('a', 35.0002, 139.0)];
    expect(nearestUnvisitedWithin(points, { a: true }, user, 100)).toBeNull();
  });
  it('returns null when nothing is within radius', () => {
    expect(nearestUnvisitedWithin([pt('far', 36, 140)], {}, user, 100)).toBeNull();
  });
});
