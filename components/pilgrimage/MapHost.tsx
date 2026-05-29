// Map host — keeps exactly ONE <HubMapWebView/> alive for the whole pilgrimage
// stack so the ~200KB Leaflet parse + tile init is paid ONCE per session
// instead of on every hub-map navigation (CLAUDE.md Rule 10 — cold-open feel).
//
// HubMapWebView's `html` is `useMemo([])`, so the WebView never remounts on
// prop change; every update flows through its own injectJavaScript effects.
// We exploit that here: this provider renders the single instance as the
// BOTTOM layer of the pilgrimage layout (absoluteFill, before children, so the
// stack's screens paint above it). The hub map screen "claims" the host on
// focus and drives it via `update(...)`; on blur it "releases" but the WebView
// stays mounted, so re-entering the hub re-paints instantly with no reload.
//
// The provider re-renders only when the config object identity changes (claim /
// update / release). Because HubMapWebView re-injects rather than remounts,
// those re-renders never throw away the tile cache or camera state.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { type LatLng } from '../../libs/services/pilgrimage/location-service';
import { type BoundingBox } from '../../libs/services/pilgrimage/anitabi-index';
import {
  HubMapWebView,
  type HubMapMarker,
  type HubMapWebViewHandle,
  type RegionBounds,
} from './HubMapWebView';

// The prop-shaped half of HubMapWebView's inputs (everything that is data, not
// a callback). The claiming screen owns these and pushes them via claim/update.
export interface MapHostConfig {
  markers: readonly HubMapMarker[];
  replaceKey: string;
  userLocation: LatLng | null;
  ringColor: string;
  theme: ThemePalette;
  focusBangumiId: number | null;
  flyBoundsRequest: { key: string; bounds: RegionBounds } | null;
}

// The callback half. Stored in a ref so the claiming screen can pass fresh
// useCallback identities without forcing the host's WebView wrapper to
// re-create handlers (and never causing a remount of the WebView itself).
export interface MapHostHandlers {
  onAnimePress: (bangumiId: number) => void;
  onBoundsChange: (bounds: BoundingBox) => void;
  onUserPan: () => void;
}

export interface MapHostClaim extends MapHostConfig, MapHostHandlers {}

export interface MapHostContextValue {
  /** Take ownership: mark active, install the full config + handlers. */
  claim: (claim: MapHostClaim) => void;
  /** Merge a partial config into the live one (markers/theme/camera/etc.). */
  update: (partial: Partial<MapHostConfig>) => void;
  /** Give up ownership. The WebView stays mounted so re-claim is instant. */
  release: () => void;
  /** Imperative camera recenter — forwarded to the live HubMapWebView handle. */
  recenter: (
    lat: number,
    lng: number,
    zoom?: number,
    opts?: { animate?: boolean }
  ) => void;
  /** Push the device heading (or null to clear the cone) into the WebView. */
  setHeading: (deg: number | null) => void;
}

const MapHostContext = createContext<MapHostContextValue | null>(null);

export function useMapHost(): MapHostContextValue {
  const ctx = useContext(MapHostContext);
  if (!ctx) {
    throw new Error('useMapHost must be used within <MapHostProvider>');
  }
  return ctx;
}

export function MapHostProvider({ children }: { children: React.ReactNode }) {
  // App-level theme used only while UNCLAIMED, so the host still pre-warms
  // tiles with sane chrome. Once a screen claims, its own theme is pushed
  // through config.theme (the provider can't know the claiming screen's theme).
  const { theme: appTheme } = useTheme();

  const hostRef = useRef<HubMapWebViewHandle>(null);

  // active=false → unclaimed (empty markers, app theme). We keep config in a
  // single state object so a claim/update is one setState and one re-render;
  // HubMapWebView only re-injects from it, never remounts.
  const [state, setState] = useState<{ active: boolean; config: MapHostConfig }>(
    () => ({
      active: false,
      config: {
        markers: [],
        replaceKey: 'idle',
        userLocation: null,
        ringColor: appTheme.accent,
        theme: appTheme,
        focusBangumiId: null,
        flyBoundsRequest: null,
      },
    })
  );

  // Handlers in a ref: the host's WebView props read from these via stable
  // wrappers below, so swapping in fresh useCallback identities from the
  // claiming screen never re-creates the WebView's own handler props.
  const handlersRef = useRef<MapHostHandlers>({
    onAnimePress: () => undefined,
    onBoundsChange: () => undefined,
    onUserPan: () => undefined,
  });

  const claim = useCallback((claimArgs: MapHostClaim) => {
    const { onAnimePress, onBoundsChange, onUserPan, ...config } = claimArgs;
    handlersRef.current = { onAnimePress, onBoundsChange, onUserPan };
    setState({ active: true, config });
  }, []);

  const update = useCallback((partial: Partial<MapHostConfig>) => {
    setState((prev) => {
      // Only the claiming screen drives updates; ignore stale updates that land
      // after release so a blurred screen can't repaint the idle host.
      if (!prev.active) return prev;
      // Skip no-op writes (e.g. the update effect firing on the same commit as
      // claim) so the provider doesn't re-render with an identical config.
      let changed = false;
      for (const k of Object.keys(partial) as (keyof MapHostConfig)[]) {
        if (prev.config[k] !== partial[k]) {
          changed = true;
          break;
        }
      }
      if (!changed) return prev;
      return { active: true, config: { ...prev.config, ...partial } };
    });
  }, []);

  const release = useCallback(() => {
    // Keep markers/camera so re-claim is instant — just drop the active flag.
    setState((prev) => (prev.active ? { ...prev, active: false } : prev));
  }, []);

  const recenter = useCallback<MapHostContextValue['recenter']>(
    (lat, lng, zoom, opts) => {
      hostRef.current?.recenter(lat, lng, zoom, opts);
    },
    []
  );

  const setHeading = useCallback<MapHostContextValue['setHeading']>((deg) => {
    hostRef.current?.setHeading(deg);
  }, []);

  // Stable wrappers — read the latest handler from the ref so the WebView's
  // onAnimePress/onBoundsChange/onUserPan props never change identity (no
  // remount) yet always call the claiming screen's current callbacks.
  const onAnimePress = useCallback(
    (id: number) => handlersRef.current.onAnimePress(id),
    []
  );
  const onBoundsChange = useCallback(
    (bounds: BoundingBox) => handlersRef.current.onBoundsChange(bounds),
    []
  );
  const onUserPan = useCallback(() => handlersRef.current.onUserPan(), []);

  const value = useMemo<MapHostContextValue>(
    () => ({ claim, update, release, recenter, setHeading }),
    [claim, update, release, recenter, setHeading]
  );

  const { config } = state;

  return (
    <MapHostContext.Provider value={value}>
      {/* BOTTOM layer: rendered before children so the stack's screens stack
          above it. While unclaimed it still pre-warms tiles with app theme. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="auto">
        <HubMapWebView
          ref={hostRef}
          markers={config.markers}
          replaceKey={config.replaceKey}
          userLocation={config.userLocation}
          ringColor={config.ringColor}
          theme={config.theme}
          focusBangumiId={config.focusBangumiId}
          flyBoundsRequest={config.flyBoundsRequest}
          onAnimePress={onAnimePress}
          onBoundsChange={onBoundsChange}
          onUserPan={onUserPan}
        />
      </View>
      {children}
    </MapHostContext.Provider>
  );
}
