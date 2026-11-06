// SpotMapView — the on-location pilgrimage detail map (MapLibre Native).
// Memo'd so a chip-strip selection (a root state change) doesn't churn the map.
// Markers, clustering, visited flips, heading and offline are handled natively
// by the engine behind MapSurface; this surface maps spots into the shared map
// marker model and forwards the locate-FAB recenter/heading handle.

import { memo, useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { useMapThemePref } from '../../../hooks/useMapThemePref';
import { resolveMapModeWithClock } from '../../../libs/services/pilgrimage/map-theme-clock';
import type { LatLng } from '../../../libs/services/pilgrimage/location-service';
import type { PilgrimageSpot } from '../../../libs/services/pilgrimage/types';
import type { VisitedMap } from '../../../libs/services/pilgrimage/visited-prefs';
import type { MapMarkerMode } from '../../../hooks/usePilgrimageDetailView';
import { getEpisodeNumber, getSpotGeo } from './_helpers';
import { MapSurface, type MapMarker, type MapSurfaceHandle } from '../map';
import { CLUSTER_DISABLE_AT } from '../../../libs/services/pilgrimage/map-engine/cluster-style';
import {
  loadMapStyleOverrideSync,
  resolveMapStyleUrl,
} from '../../../libs/services/pilgrimage/map-source-prefs';

export interface SpotMapViewHandle {
  /** Pan the camera to a target location (used by the locate FAB). */
  recenter: (lat: number, lng: number, zoom?: number, opts?: { animate?: boolean }) => void;
  /** Push device heading (or null to clear) into the user puck cone. */
  setHeading: (deg: number | null) => void;
  /** Fit the camera to a bounding box (used by the detail list's area jump). */
  fitBounds: (
    box: { south: number; west: number; north: number; east: number },
    opts?: { animate?: boolean }
  ) => void;
}

function hasValidGeo(geo: readonly [number, number]): boolean {
  return Number.isFinite(geo[0]) && Number.isFinite(geo[1]) && (geo[0] !== 0 || geo[1] !== 0);
}

export interface SpotMapViewProps {
  spots: readonly PilgrimageSpot[];
  /** Exact typed locality pins + honest area labels, additive to scene markers. */
  localityMarkers?: readonly MapMarker[];
  visited: VisitedMap;
  ringColor: string;
  userLocation: LatLng | null;
  centerGeo: readonly [number, number] | null;
  centerZoom: number;
  markerMode: MapMarkerMode;
  offlineOnly: boolean;
  /**
   * Id of the spot currently selected in the chip strip above the map. When
   * this changes, the map pans/zooms to that spot so the chip strip doubles as
   * a quick spot picker without forcing the modal sheet open.
   */
  focusSpotId?: string | null;
  /** Height of whatever covers the map's bottom edge at focus time (the sheet). */
  getFocusBottomInset?: () => number;
  /**
   * Pixels to lift the in-map controls + attribution off the bottom edge so
   * they clear whatever floating UI sits on top of the map (bottom sheet peek,
   * tab bar, etc.). Defaults to 16 (true-fullscreen maps).
   */
  controlsBottomOffset?: number;
  onSpotPress: (spot: PilgrimageSpot) => void;
  onClusterPick: (spots: readonly PilgrimageSpot[]) => void;
  onLocalityMarkerPress?: (marker: MapMarker) => void;
  /** Notified the moment the user drags the map (drops follow/compass). */
  onUserPan?: () => void;
  theme: ThemePalette;
  style?: StyleProp<ViewStyle>;
  ref?: Ref<SpotMapViewHandle>;
}

function SpotMapViewImpl({
  spots,
  localityMarkers = [],
  visited,
  ringColor,
  userLocation,
  centerGeo,
  centerZoom,
  markerMode,
  offlineOnly,
  focusSpotId,
  getFocusBottomInset,
  controlsBottomOffset = 16,
  onSpotPress,
  onClusterPick,
  onLocalityMarkerPress,
  onUserPan,
  theme,
  style,
  ref,
}: SpotMapViewProps) {
  const { effectiveMode } = useTheme();
  const { pref: mapThemePref } = useMapThemePref();
  // 'auto' picks dark at night (18:00–06:00) as well as in a dark app theme.
  const mapMode = resolveMapModeWithClock(mapThemePref, effectiveMode, new Date().getHours());
  const styleUrl = resolveMapStyleUrl(mapMode, loadMapStyleOverrideSync());

  const maplibreRef = useRef<MapSurfaceHandle>(null);
  const styles = useMemo(() => makeMapStyles(theme), [theme]);
  const spotsById = useMemo(() => {
    const byId = new Map<string, PilgrimageSpot>();
    for (const spot of spots) {
      if (getSpotGeo(spot)) byId.set(spot.id, spot);
    }
    return byId;
  }, [spots]);

  // Engine-neutral scene markers. The memoized `spotsById` lookup resolves
  // marker / cluster taps back to the source PilgrimageSpot.
  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    for (const spot of spots) {
      const geo = getSpotGeo(spot);
      if (!geo) continue;
      out.push({
        id: spot.id,
        lat: geo[0],
        lng: geo[1],
        kind: 'spot',
        title: spot.name,
        color: ringColor,
        visited: visited[spot.id] === true,
        episode: getEpisodeNumber(spot),
        markerMode: markerMode === 'dot' ? 'dot' : 'bubble',
        selected: spot.id === focusSpotId,
      });
    }
    out.push(...localityMarkers);
    return out;
  }, [localityMarkers, spots, ringColor, markerMode, visited, focusSpotId]);

  // Chip-strip selection pans to the focused spot (native flyTo, zoom 16).
  useEffect(() => {
    if (!focusSpotId) return;
    const spot = spotsById.get(focusSpotId);
    const geo = spot ? getSpotGeo(spot) : null;
    if (!spot || !geo) return;
    maplibreRef.current?.focus?.({
      lat: geo[0],
      lng: geo[1],
      zoom: 16,
      bottomInset: getFocusBottomInset?.(),
    });
  }, [focusSpotId, spotsById, getFocusBottomInset]);

  // Imperative recenter / heading — driven by the locate-FAB hook so location +
  // 60 Hz magnetometer ticks bypass React state entirely (CLAUDE.md Rule 9).
  useImperativeHandle(
    ref,
    () => ({
      recenter: (lat, lng, zoom, opts) => maplibreRef.current?.recenter(lat, lng, zoom, opts),
      setHeading: (deg) => maplibreRef.current?.setHeading(deg),
      fitBounds: (box, opts) => maplibreRef.current?.fitBounds?.(box, opts),
    }),
    []
  );

  const user = userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : null;
  const center =
    centerGeo && hasValidGeo(centerGeo)
      ? { lat: centerGeo[0], lng: centerGeo[1] }
      : localityMarkers[0]
        ? { lat: localityMarkers[0].lat, lng: localityMarkers[0].lng }
        : undefined;

  return (
    <View style={[styles.container, style]} testID="pilgrimage-spot-map">
      <MapSurface
        ref={maplibreRef}
        markers={markers}
        styleUrl={styleUrl}
        user={user}
        center={center}
        zoom={centerZoom}
        markerMode={markerMode === 'dot' ? 'dot' : 'bubble'}
        clusterDisableAtZoom={CLUSTER_DISABLE_AT.spot}
        offlineOnly={offlineOnly}
        controlsBottomOffset={controlsBottomOffset}
        onMarkerPress={(m) => {
          const spot = spotsById.get(m.id);
          if (spot) onSpotPress(spot);
          else onLocalityMarkerPress?.(m);
        }}
        onClusterPress={(picked) => {
          const spotsPicked: PilgrimageSpot[] = [];
          for (const m of picked) {
            const s = spotsById.get(m.id);
            if (s) spotsPicked.push(s);
          }
          if (spotsPicked.length > 0) onClusterPick(spotsPicked);
          else if (picked[0]) onLocalityMarkerPress?.(picked[0]);
        }}
        onPanned={onUserPan}
      />
    </View>
  );
}

function areEqual(prev: SpotMapViewProps, next: SpotMapViewProps): boolean {
  return (
    prev.spots === next.spots &&
    prev.localityMarkers === next.localityMarkers &&
    prev.visited === next.visited &&
    prev.ringColor === next.ringColor &&
    prev.userLocation === next.userLocation &&
    prev.centerGeo === next.centerGeo &&
    prev.centerZoom === next.centerZoom &&
    prev.markerMode === next.markerMode &&
    prev.offlineOnly === next.offlineOnly &&
    prev.focusSpotId === next.focusSpotId &&
    prev.getFocusBottomInset === next.getFocusBottomInset &&
    prev.controlsBottomOffset === next.controlsBottomOffset &&
    prev.onSpotPress === next.onSpotPress &&
    prev.onClusterPick === next.onClusterPick &&
    prev.onLocalityMarkerPress === next.onLocalityMarkerPress &&
    prev.onUserPan === next.onUserPan &&
    prev.theme === next.theme &&
    prev.style === next.style
  );
}

export const SpotMapView = memo(SpotMapViewImpl, areEqual);

function makeMapStyles(theme: ThemePalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      overflow: 'hidden',
      backgroundColor: theme.background.secondary,
    },
  });
}
