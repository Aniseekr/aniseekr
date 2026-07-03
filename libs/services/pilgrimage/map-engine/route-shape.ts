// Convert an engine-neutral MapRoute into a GeoJSON LineString feature for the
// MapLibre GeoJSONSource. Pure + unit-tested — the one place that flips our
// [lat, lng] vocabulary into MapLibre's lng-first coordinate order.

import type { MapRoute } from './types';

export function routeLineFeature(route: MapRoute): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: { id: route.id },
    geometry: {
      type: 'LineString',
      coordinates: route.coords.map((c) => [c.lng, c.lat]),
    },
  };
}
