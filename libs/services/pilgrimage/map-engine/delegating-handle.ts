// A MapSurfaceHandle whose every call forwards to whatever `getTarget()` returns
// AT CALL TIME (or a safe no-op if none). This lets MapSurface route the
// parent's single imperative ref to whichever engine is currently live, with no
// re-render needed when the rollout flag flips — and without the leaflet branch
// silently dropping recenter/setHeading (which would kill the locate FAB /
// compass while the flag is still on 'leaflet').
import type { MapSurfaceHandle } from './types';

export function createDelegatingHandle(
  getTarget: () => Partial<MapSurfaceHandle> | null | undefined
): MapSurfaceHandle {
  return {
    recenter: (lat, lng, zoom, opts) => getTarget()?.recenter?.(lat, lng, zoom, opts),
    setHeading: (deg) => getTarget()?.setHeading?.(deg),
    focus: (target) => getTarget()?.focus?.(target),
    fitBounds: (box, opts) => getTarget()?.fitBounds?.(box, opts),
    updateVisited: (ids) => getTarget()?.updateVisited?.(ids),
  };
}
