// Convert an engine-neutral MapRoute into a GeoJSON LineString feature for the
// MapLibre GeoJSONSource. Pure + unit-tested — the one place that flips our
// [lat, lng] vocabulary into MapLibre's lng-first coordinate order.

import type { MapRoute } from './types';

/**
 * Returns `null` when `route.coords` has fewer than 2 positions — a
 * LineString requires ≥2 positions per RFC 7946 §3.1.4, and rendering an
 * invalid geometry risks a native MapLibre crash. This is the single source
 * of that rule; callers must skip rendering when this returns `null`.
 */
export function routeLineFeature(route: MapRoute): GeoJSON.Feature<GeoJSON.LineString> | null {
  if (route.coords.length < 2) return null;
  return {
    type: 'Feature',
    properties: { id: route.id },
    geometry: {
      type: 'LineString',
      coordinates: route.coords.map((c) => [c.lng, c.lat]),
    },
  };
}
