// The map surface the pilgrimage screens render — a thin, stable handle over the
// single MapLibre engine. This keeps screens decoupled from the concrete renderer.
import type { Ref } from 'react';

import type {
  MapSurfaceHandle,
  MapSurfaceProps,
} from '../../../libs/services/pilgrimage/map-engine/types';
import { MapLibreEngine } from './engines/MapLibreEngine';

/** Public prop name kept stable for call sites; identical to MapSurfaceProps. */
export type MapSurfaceComponentProps = MapSurfaceProps;

export function MapSurface({ ref, ...props }: MapSurfaceProps & { ref?: Ref<MapSurfaceHandle> }) {
  return <MapLibreEngine ref={ref} {...props} />;
}
