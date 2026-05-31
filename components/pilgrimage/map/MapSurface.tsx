// The engine-neutral map surface the three pilgrimage screens render.
//
// Dispatches to the MapLibre engine when the rollout flag is 'maplibre',
// otherwise renders the screen's existing Leaflet surface (`leafletFallback`).
// This lets each screen adopt MapSurface incrementally — pass the neutral props
// + your current Leaflet component as the fallback, and flipping the flag (after
// the on-device spike) is all it takes to switch that surface to MapLibre.
//
// The forwarded ref always works in BOTH modes: it delegates to the live engine
// (MapLibre's camera handle, or — via `leafletRef` — the Leaflet component's own
// handle). Without this, the leaflet branch would drop the ref and the locate
// FAB / compass would silently no-op while the flag is still on 'leaflet'.
import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';

import type {
  MapEngineId,
  MapSurfaceHandle,
  MapSurfaceProps,
} from '../../../libs/services/pilgrimage/map-engine/types';
import { createDelegatingHandle } from '../../../libs/services/pilgrimage/map-engine/delegating-handle';
import { MapLibreEngine } from './engines/MapLibreEngine';

export interface MapSurfaceComponentProps extends MapSurfaceProps {
  /** Which renderer to use (read from `map-engine-prefs` by the caller). */
  engine: MapEngineId;
  /** The screen's existing Leaflet surface, rendered while `engine === 'leaflet'`. */
  leafletFallback?: ReactNode;
  /**
   * Ref the parent ALSO attaches to its Leaflet component, so the parent's
   * single ref keeps driving recenter/setHeading while `engine === 'leaflet'`.
   */
  leafletRef?: RefObject<MapSurfaceHandle | null>;
}

export const MapSurface = forwardRef<MapSurfaceHandle, MapSurfaceComponentProps>(
  function MapSurface({ engine, leafletFallback, leafletRef, ...props }, ref) {
    const maplibreRef = useRef<MapSurfaceHandle>(null);

    useImperativeHandle(
      ref,
      () =>
        createDelegatingHandle(() =>
          engine === 'maplibre' ? maplibreRef.current : (leafletRef?.current ?? null)
        ),
      [engine, leafletRef]
    );

    if (engine === 'maplibre') {
      return <MapLibreEngine ref={maplibreRef} {...props} />;
    }
    return <>{leafletFallback ?? null}</>;
  }
);
