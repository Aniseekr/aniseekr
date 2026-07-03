// Engine-neutral data model + surface contract for the pilgrimage map.
//
// The map surfaces (hub fullscreen and spot-detail map) share this single
// vocabulary so screens stay decoupled from the concrete MapLibre Native
// renderer.
//
// Pure types only — no runtime, no engine import.

export interface LatLng {
  lat: number;
  lng: number;
}

/** Geographic bounding box used by map camera fit requests. */
export interface BBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface Viewport {
  center: LatLng;
  zoom: number;
}

export type MapMarkerKind = 'anime' | 'spot' | 'city88';

export type MapMarkerMode = 'bubble' | 'dot';

/**
 * One marker consumed by MapSurface. Kind-specific fields are optional and only
 * set for the relevant `kind`.
 */
export interface MapMarker {
  /** Unique within a marker set (e.g. "bgm:<id>", "88:<entryId>", spot id). */
  id: string;
  lat: number;
  lng: number;
  kind: MapMarkerKind;
  title: string;
  /** Cover / scene thumbnail URL, when the marker shows an image. */
  image?: string;
  /** Ring / accent colour (hex). */
  color: string;
  visited?: boolean;
  // --- anime / city88 ---
  /** Source Bangumi subject id. */
  bangumiId?: number;
  /** City label shown in the popup. */
  city?: string;
  /** Number of scene points behind an anime centroid. */
  pointsLength?: number;
  /** Sequential Tourism-88 id (1..N) for `kind: 'city88'`. */
  eightyEightId?: number;
  // --- spot ---
  /** Episode number badge for `kind: 'spot'`. */
  episode?: number;
  /** Per-marker bubble vs dot rendering for `kind: 'spot'`. */
  markerMode?: MapMarkerMode;
}

/** The user's location puck; `heading` rotates the cone (null clears it). */
export interface UserPuck {
  lat: number;
  lng: number;
  heading?: number | null;
}

export type MapRouteKind = 'gpx' | 'tour';

/** A polyline (GPX track / 導覽 leg). Reserved for spec P5/P6; engines may ignore. */
export interface MapRoute {
  /** Unique within a route set — source/layer ids derive from it. */
  id: string;
  coords: readonly LatLng[];
  kind: MapRouteKind;
  color?: string;
}

/** An ordered 導覽 waypoint. Reserved for spec P6. */
export interface MapWaypoint {
  id: string;
  lat: number;
  lng: number;
  order: number;
  label?: string;
}

/**
 * Imperative handle the screens drive. 1:1 with today's Hub/Spot handles
 * (`recenter` + `setHeading`) plus the generalised focus/fit/visited methods —
 * keeping camera/heading/visited updates OFF the React render path (Rule 9).
 */
export interface MapSurfaceHandle {
  recenter: (lat: number, lng: number, zoom?: number, opts?: { animate?: boolean }) => void;
  setHeading: (deg: number | null) => void;
  focus?: (target: { lat: number; lng: number; zoom?: number }) => void;
  fitBounds?: (box: BBox, opts?: { animate?: boolean }) => void;
  updateVisited?: (ids: readonly string[]) => void;
}

/** Props every map surface accepts. */
export interface MapSurfaceProps {
  markers: readonly MapMarker[];
  routes?: readonly MapRoute[];
  waypoints?: readonly MapWaypoint[];
  user?: UserPuck | null;
  center?: LatLng;
  zoom?: number;
  /** Default rendering for markers that don't carry their own `markerMode`. */
  markerMode?: MapMarkerMode;
  visitedIds?: readonly string[];
  /** Zoom at which clustering stops; configured per surface. */
  clusterDisableAtZoom?: number;
  /** Style/source URL (resolved via `map-source-prefs.resolveMapStyleUrl`). */
  styleUrl?: string;
  /** On-location offline-only mode. Reserved until explicit MapLibre packs land. */
  offlineOnly?: boolean;
  /** Pixels to lift in-map controls/attribution off the bottom edge. */
  controlsBottomOffset?: number;
  onMarkerPress?: (marker: MapMarker) => void;
  /** Long-press on a marker → contextual quick actions. */
  onMarkerLongPress?: (marker: MapMarker) => void;
  onClusterPress?: (markers: readonly MapMarker[]) => void;
  /** Fired the moment the user drags/pinches (drops follow/compass). */
  onPanned?: () => void;
  onBoundsChange?: (box: BBox, viewport?: Viewport) => void;
  /** Base map (style/tiles) failed to load — usually offline with no cached
   *  tiles for the area. Lets the screen show an empty state + retry instead of
   *  a silent blank map. */
  onLoadError?: () => void;
  /** Base map finished loading — clears any prior load-error state. */
  onLoadSuccess?: () => void;
}
