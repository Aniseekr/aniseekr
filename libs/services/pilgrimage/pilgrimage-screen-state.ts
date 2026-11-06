import type { LatLng } from './location-service';

export function sameLatLng(a: LatLng | null, b: LatLng | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.latitude === b.latitude && a.longitude === b.longitude;
}
