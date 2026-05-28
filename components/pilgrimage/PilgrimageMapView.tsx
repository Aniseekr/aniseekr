// Interactive map view for the pilgrimage feature.
//
// Stack:
//   Leaflet (bundled locally — see scripts/bundle-leaflet.mjs) inside a WebView,
//   served from the stable origin `MAP_BASE_URL` so the Cache API persists
//   tiles between launches. OpenStreetMap raster tiles are cached on first
//   paint and re-served instantly on revisit, including offline.
//
// Native ↔ WebView protocol:
//   WebView → native:  { type: 'ready' } | { type: 'markerPress', id }
//   native → WebView:  injectJavaScript(`window.__updateMarkers([...])`) — keeps
//                      pan/zoom/cache when filters change instead of reloading.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { ThemedText } from '../themed';
import {
  LEAFLET_CSS,
  LEAFLET_JS,
  LEAFLET_MARKERCLUSTER_CSS,
  LEAFLET_MARKERCLUSTER_JS,
} from '../../libs/services/pilgrimage/leaflet-assets';
import {
  MAP_BASE_BODY,
  MAP_BASE_CSS,
  MAP_BASE_JS,
  MAP_BASE_URL,
  TILE_STYLES,
  TOKYO_STATION,
  buildMapThemeVars,
  resolveTileStyle,
  type MapThemeVars,
  type TileStyleId,
} from '../../libs/services/pilgrimage/leaflet-map';
import { resolveMapMode } from '../../libs/services/pilgrimage/map-theme-prefs';
import type { AnitabiBangumi } from '../../libs/services/pilgrimage/types';
import { cityToColor } from '../../libs/services/pilgrimage/region-color';
import { useMapThemePref } from '../../hooks/useMapThemePref';

export { cityToColor };

export interface PilgrimageMapAnime {
  anime: AnitabiBangumi;
  distanceKm?: number;
  /** True when this anime is in the user's collection — marker shows a check overlay. */
  inCollection?: boolean;
}

export interface PilgrimageMapViewProps {
  animeList: readonly PilgrimageMapAnime[];
  userLocation?: { latitude: number; longitude: number } | null;
  onMarkerPress?: (anime: AnitabiBangumi) => void;
  style?: StyleProp<ViewStyle>;
  /**
   * Bump to force the map to re-fit bounds to the currently-rendered markers.
   * Use when the caller filters `animeList` (e.g. picking a city) and wants
   * the map to fly to the new subset instead of staying where the user panned.
   */
  refitNonce?: number;
  /**
   * Pixels to lift the in-WebView map controls off the bottom edge. Use this
   * when the parent renders a floating tab bar / sheet that would otherwise
   * cover the +/-/locate buttons. Defaults to 12 (true-fullscreen mounts).
   */
  controlsBottomOffset?: number;
}

const USER_ZOOM = 11;

const isValidGeo = (geo: readonly [number, number] | null | undefined): geo is [number, number] => {
  if (!geo || geo.length < 2) return false;
  const [lat, lng] = geo;
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
};

interface MarkerPayload {
  id: string;
  lat: number;
  lng: number;
  title: string;
  cover: string | null;
  ringColor: string;
  pointsLength: number;
  city: string | null;
  inCollection: boolean;
}

function buildMarkers(
  list: readonly PilgrimageMapAnime[],
  idIndex: Map<string, AnitabiBangumi>,
  themeAccent: string
) {
  const markers: MarkerPayload[] = [];
  idIndex.clear();
  for (const { anime, inCollection } of list) {
    if (!isValidGeo(anime.geo)) continue;
    const [lat, lng] = anime.geo;
    const idStr = String(anime.id);
    idIndex.set(idStr, anime);
    const ringColor = anime.city
      ? cityToColor(anime.city, anime.color || themeAccent)
      : anime.color || themeAccent;
    markers.push({
      id: idStr,
      lat,
      lng,
      title: anime.title || anime.cn || '',
      // Keep Anitabi's h160 thumb (~6 KB) — h120 404s on the CDN.
      cover: anime.cover || null,
      ringColor,
      pointsLength: anime.pointsLength,
      city: anime.city || null,
      inCollection: !!inCollection,
    });
  }
  return markers;
}

/**
 * Builds the static map shell. Markers are not embedded — they are pushed in
 * via `__updateMarkers` after the page reports `ready`, so filter changes
 * don't blow away the tile cache or the user's current pan/zoom.
 */
function buildHtml(initial: {
  center: { lat: number; lng: number; zoom: number };
  user: { lat: number; lng: number } | null;
  themeAccent: string;
  /** Pixels to lift the map controls off the WebView bottom. */
  controlsBottom: number;
  /** Tile style to load on first paint — keeps the loading shell in sync
   * with the tile that's about to render. */
  tileStyle: TileStyleId;
  themeVars: MapThemeVars;
}): string {
  const initialJson = JSON.stringify(initial).replace(/</g, '\\u003c');
  const tile = TILE_STYLES[initial.tileStyle];
  const themeVarsCss = Object.entries(initial.themeVars)
    .map(([k, v]) => `${k}: ${v};`)
    .join(' ');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>${LEAFLET_CSS}</style>
<style>${LEAFLET_MARKERCLUSTER_CSS}</style>
<style>${MAP_BASE_CSS}</style>
<style>
  :root {
    --mc-bottom: ${initial.controlsBottom}px;
    --attr-bottom: ${Math.max(0, initial.controlsBottom - 32)}px;
    ${themeVarsCss}
  }
  /* Google-Maps-style balloon marker:
       circular photo + white ring + small downward tail anchoring it to
       the geo coordinate. iconAnchor on the leaflet side points at the
       tail tip (bottom-center), so a marker sits *above* its lat/lng
       like every modern map app.
     The ring color (region/city) used to be the entire 2px border —
     visually noisy on a colourful tile. It's now a small dot in the
     bottom-right corner so the photo reads first. */
  .ani-marker {
    position: relative;
    width: 48px; height: 48px; border-radius: 50%;
    border: 3px solid #ffffff;
    background: var(--map-chrome);
    overflow: visible;
    box-shadow: 0 1px 3px 0 rgba(0,0,0,0.30),
                0 4px 8px 3px rgba(0,0,0,0.15);
  }
  .ani-marker .photo {
    width: 100%; height: 100%; border-radius: 50%; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
  }
  .ani-marker .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ani-marker .pin { color: var(--map-on-chrome); font-size: 20px; }
  .ani-marker::after {
    content: '';
    position: absolute;
    bottom: -8px; left: 50%; transform: translateX(-50%);
    width: 0; height: 0;
    border-left: 7px solid transparent;
    border-right: 7px solid transparent;
    border-top: 9px solid #ffffff;
    /* Subtle drop on the tail so it floats with the bubble. */
    filter: drop-shadow(0 2px 1px rgba(0,0,0,0.18));
  }
  .ani-marker .region-dot {
    position: absolute; right: -2px; bottom: 2px;
    width: 14px; height: 14px; border-radius: 50%;
    background: var(--ring, ${initial.themeAccent});
    border: 2px solid #ffffff;
    box-shadow: 0 1px 2px rgba(0,0,0,0.25);
  }
  .ani-marker .check {
    position: absolute; right: -4px; top: -4px;
    width: 18px; height: 18px; border-radius: 50%;
    background: #34A853; color: #ffffff;
    font: 700 12px 'Google Sans Text', Roboto, system-ui, sans-serif;
    display: flex; align-items: center; justify-content: center;
    border: 2px solid #ffffff;
    box-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }
  .ani-marker.in-collection { border-color: #34A853; }
  .leaflet-popup-content-wrapper {
    background: var(--map-chrome); color: var(--map-on-chrome);
    border: none;
    border-radius: 12px;
    box-shadow: 0 1px 3px 0 rgba(0,0,0,0.30), 0 4px 8px 3px rgba(0,0,0,0.15);
  }
  .leaflet-popup-tip { background: var(--map-chrome); border: none; }
  .leaflet-popup-content { margin: 10px 12px; min-width: 180px; }
  .pop-title { font: 600 14px 'Google Sans Text', Roboto, system-ui, sans-serif; color: var(--map-on-chrome); margin: 0 0 2px; }
  .pop-meta { font: 500 11px 'Google Sans Text', Roboto, system-ui, sans-serif; color: var(--map-attr-fg); margin: 0 0 8px; }
  .pop-btn {
    display: block; width: 100%; padding: 8px 10px; border: 0;
    border-radius: 20px; color: #fff;
    font: 600 13px 'Google Sans Text', Roboto, system-ui, sans-serif;
    text-align: center; cursor: pointer;
    box-shadow: 0 1px 2px 0 rgba(0,0,0,0.30), 0 1px 3px 1px rgba(0,0,0,0.15);
  }
</style>
</head>
<body>
${MAP_BASE_BODY}
<script>${LEAFLET_JS}</script>
<script>${LEAFLET_MARKERCLUSTER_JS}</script>
<script>${MAP_BASE_JS}</script>
<script>
(function() {
  var initial = ${initialJson};
  var map = L.map('map', { zoomControl: false, attributionControl: true, fadeAnimation: true })
    .setView([initial.center.lat, initial.center.lng], initial.center.zoom);
  new window.CachedTileLayer(${JSON.stringify(tile.url)}, {
    maxZoom: ${tile.maxZoom},
    minZoom: 3,
    subdomains: ${JSON.stringify(tile.subdomains)},
    attribution: ${JSON.stringify(tile.attribution)},
    keepBuffer: 4,
    updateWhenIdle: false
  }).addTo(map);

  if (initial.user) {
    var userIcon = L.divIcon({ className: '', html: '<div class="user-pulse"></div>', iconSize: [16,16], iconAnchor: [8,8] });
    L.marker([initial.user.lat, initial.user.lng], { icon: userIcon, interactive: false, keyboard: false }).addTo(map);
  }

  // Native LocateFab now owns recentre; __bindMap installs the shared
  // userPanned dragstart emitter from MAP_BASE_JS.
  window.__bindMap(map);
  void initial; // kept for back-compat references in the snippet above.

  var markerLayer = window.__makeClusterGroup({ ringColor: initial.themeAccent, disableAt: 10 });
  markerLayer.addTo(map);
  var lastMarkerCount = 0;

  window.__updateMarkers = function(markers, refit) {
    markerLayer.clearLayers();
    var batch = [];
    var bounds = [];
    for (var i = 0; i < markers.length; i++) {
      var m = markers[i];
      var cls = 'ani-marker' + (m.inCollection ? ' in-collection' : '');
      var inner = m.cover
        ? '<img src="' + m.cover + '" loading="lazy" />'
        : '<span class="pin">📍</span>';
      var html = '<div class="' + cls + '">' +
        '<div class="photo">' + inner + '</div>' +
        '<span class="region-dot" style="background:' + m.ringColor + '"></span>' +
        (m.inCollection ? '<span class="check">✓</span>' : '') +
      '</div>';
      // Bounding box: 48 (bubble) wide × 57 tall (48 + 9 tail). Anchor at
      // the tail tip (24, 57) so the lat/lng sits *under* the marker.
      var icon = L.divIcon({ className: '', html: html, iconSize: [48, 57], iconAnchor: [24, 57] });
      var marker = L.marker([m.lat, m.lng], { icon: icon, regionColor: m.ringColor });
      marker.__appId = m.id;
      var meta = m.pointsLength + ' spot' + (m.pointsLength === 1 ? '' : 's') +
        (m.city ? ' · ' + m.city : '') +
        (m.inCollection ? ' · ✓ in collection' : '');
      var popup = '<div>' +
        '<div class="pop-title">' + (m.title || 'Untitled') + '</div>' +
        '<div class="pop-meta">' + meta + '</div>' +
        '<button class="pop-btn" style="background:' + m.ringColor + '" onclick="window.__open(\\'' + m.id + '\\')">Open</button>' +
      '</div>';
      // Popup offset accounts for the new tail anchor — pop appears above the
      // bubble, not above where the centre used to be.
      marker.bindPopup(popup, { closeButton: false, offset: [0, -54] });
      batch.push(marker);
      bounds.push([m.lat, m.lng]);
    }
    if (typeof markerLayer.addLayers === 'function') markerLayer.addLayers(batch);
    else for (var j = 0; j < batch.length; j++) markerLayer.addLayer(batch[j]);

    if (refit && bounds.length > 0) {
      try { map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 12, duration: 0.45 }); } catch (e) {}
    } else if (bounds.length > 1 && lastMarkerCount === 0 && !initial.user) {
      try { map.fitBounds(bounds, { padding: [40, 40], maxZoom: 8, animate: false }); } catch (e) {}
    }
    lastMarkerCount = markers.length;
  };

  window.__open = function(id) { window.__post({ type: 'markerPress', id: id }); };

  window.__post({ type: 'ready' });
})();
</script>
</body>
</html>`;
}

export function PilgrimageMapView({
  animeList,
  userLocation,
  onMarkerPress,
  style,
  refitNonce,
  controlsBottomOffset = 12,
}: PilgrimageMapViewProps) {
  const { theme, effectiveMode } = useTheme();
  const { pref: mapThemePref } = useMapThemePref();
  const mapMode = resolveMapMode(mapThemePref, effectiveMode);
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const webviewRef = useRef<WebView>(null);
  const animeById = useRef(new Map<string, AnitabiBangumi>());
  const [ready, setReady] = useState(false);
  const [clusterItems, setClusterItems] = useState<AnitabiBangumi[] | null>(null);

  const html = useMemo(() => {
    // Start at Tokyo Station so the map always has useful context even when
    // the user is outside Japan or hasn't granted location yet. The user pin
    // (if granted) drives the locate-me bounds fit but doesn't anchor the
    // initial view.
    const center = { lat: TOKYO_STATION.lat, lng: TOKYO_STATION.lng, zoom: TOKYO_STATION.zoom };
    const user = userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : null;
    const tileStyle: TileStyleId = resolveTileStyle(mapMode);
    const themeVars: MapThemeVars = buildMapThemeVars({
      effectiveMode: mapMode,
      accent: theme.accent,
      tileStyle,
    });
    return buildHtml({
      center,
      user,
      themeAccent: theme.accent,
      controlsBottom: controlsBottomOffset,
      tileStyle,
      themeVars,
    });
    // userLocation/theme/mapMode intentionally captured once for the first
    // paint. Live updates (theme switch, accent change, map-pref toggle) are
    // pushed via __setTileStyle / __setMapTheme below — re-rendering the
    // WebView would wipe the tile cache and the user's pan/zoom state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live tile + chrome theme push. Fires when the user toggles light/dark or
  // picks a new accent — bridge functions repaint in place.
  useEffect(() => {
    if (!ready || !webviewRef.current) return;
    const tileStyle: TileStyleId = resolveTileStyle(mapMode);
    const tile = TILE_STYLES[tileStyle];
    const themeVars = buildMapThemeVars({
      effectiveMode: mapMode,
      accent: theme.accent,
      tileStyle,
    });
    webviewRef.current.injectJavaScript(`
      try { window.__setMapTheme && window.__setMapTheme(${JSON.stringify(themeVars)}); } catch(e) {}
      try { window.__setTileStyle && window.__setTileStyle(${JSON.stringify({
        url: tile.url,
        subdomains: tile.subdomains,
        attribution: tile.attribution,
        maxZoom: tile.maxZoom,
      })}); } catch(e) {}
      true;
    `);
  }, [mapMode, theme.accent, ready]);

  const markers = useMemo(
    () => buildMarkers(animeList, animeById.current, theme.accent),
    [animeList, theme.accent]
  );

  useEffect(() => {
    if (!ready || !webviewRef.current) return;
    const json = JSON.stringify(markers).replace(/</g, '\\u003c');
    webviewRef.current.injectJavaScript(`
      try { window.__updateMarkers && window.__updateMarkers(${json}); } catch(e) {}
      true;
    `);
  }, [markers, ready]);

  useEffect(() => {
    if (refitNonce === undefined) return;
    if (!ready || !webviewRef.current) return;
    const json = JSON.stringify(markers).replace(/</g, '\\u003c');
    webviewRef.current.injectJavaScript(`
      try { window.__updateMarkers && window.__updateMarkers(${json}, true); } catch(e) {}
      true;
    `);
    // markers intentionally excluded — we re-fit only on nonce changes, not
    // every marker tick; the regular effect above handles marker updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refitNonce, ready]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data) as {
          type: string;
          id?: string;
          ids?: unknown[];
        };
        if (data.type === 'ready') {
          setReady(true);
          return;
        }
        if (data.type === 'markerPress' && data.id) {
          const anime = animeById.current.get(data.id);
          if (anime) onMarkerPress?.(anime);
          return;
        }
        if (data.type === 'clusterPress' && Array.isArray(data.ids)) {
          const items: AnitabiBangumi[] = [];
          for (const raw of data.ids) {
            const a = animeById.current.get(String(raw));
            if (a) items.push(a);
          }
          if (items.length > 0) {
            Haptics.selectionAsync().catch(() => undefined);
            setClusterItems(items);
          }
        }
      } catch {
        // ignore malformed messages
      }
    },
    [onMarkerPress]
  );

  const handleClusterPick = useCallback(
    (anime: AnitabiBangumi) => {
      Haptics.selectionAsync().catch(() => undefined);
      setClusterItems(null);
      onMarkerPress?.(anime);
    },
    [onMarkerPress]
  );

  return (
    <View style={[styles.container, style]} testID="pilgrimage-map">
      <WebView
        ref={webviewRef}
        originWhitelist={['*']}
        source={{ html, baseUrl: MAP_BASE_URL }}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        cacheMode={Platform.OS === 'android' ? 'LOAD_DEFAULT' : undefined}
        allowsInlineMediaPlayback
        androidLayerType="hardware"
        onMessage={handleMessage}
        style={styles.webview}
        renderError={() => (
          <View style={styles.fallback}>
            <Ionicons name="map-outline" size={32} color={theme.text.secondary} />
            <ThemedText variant="titleMedium" weight="600" style={{ marginTop: 8 }}>
              Map unavailable
            </ThemedText>
            <ThemedText variant="bodySmall" tone="secondary" align="center">
              Couldn&apos;t load the map. Check your connection and try again.
            </ThemedText>
          </View>
        )}
        startInLoadingState
      />
      <ClusterPickerSheet
        items={clusterItems}
        theme={theme}
        onClose={() => setClusterItems(null)}
        onPick={handleClusterPick}
      />
    </View>
  );
}

interface ClusterPickerSheetProps {
  items: AnitabiBangumi[] | null;
  theme: ThemePalette;
  onClose: () => void;
  onPick: (anime: AnitabiBangumi) => void;
}

function ClusterPickerSheet({ items, theme, onClose, onPick }: ClusterPickerSheetProps) {
  const styles = useMemo(() => makePickerStyles(theme), [theme]);
  if (!items || items.length === 0) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <SafeAreaView edges={['bottom']}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <ThemedText variant="titleMedium" weight="700">
                {items.length} anime here
              </ThemedText>
              <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={theme.text.secondary} />
              </Pressable>
            </View>
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}>
              {items.map((anime) => (
                <ClusterPickerRow
                  key={anime.id}
                  anime={anime}
                  theme={theme}
                  onPress={() => onPick(anime)}
                />
              ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

interface ClusterPickerRowProps {
  anime: AnitabiBangumi;
  theme: ThemePalette;
  onPress: () => void;
}

function ClusterPickerRow({ anime, theme, onPress }: ClusterPickerRowProps) {
  const styles = useMemo(() => makePickerStyles(theme), [theme]);
  const ring = anime.color || theme.accent;
  // Keep Anitabi's h160 thumb — the CDN does not serve h120.
  const cover = anime.cover ?? '';
  const meta = `${anime.pointsLength} spot${anime.pointsLength === 1 ? '' : 's'}${anime.city ? ` · ${anime.city}` : ''}`;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.78 }]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${anime.title}`}>
      <View style={[styles.thumbWrap, { borderColor: ring }]}>
        {cover ? (
          <Image
            source={{ uri: cover }}
            style={styles.thumb}
            contentFit="cover"
            transition={120}
          />
        ) : (
          <View style={[styles.thumb, { backgroundColor: theme.background.tertiary }]} />
        )}
      </View>
      <View style={styles.rowBody}>
        <ThemedText variant="bodyMedium" weight="700" numberOfLines={1}>
          {anime.title || anime.cn || 'Untitled'}
        </ThemedText>
        {anime.cn && anime.cn !== anime.title ? (
          <ThemedText variant="bodySmall" tone="secondary" numberOfLines={1} style={{ marginTop: 1 }}>
            {anime.cn}
          </ThemedText>
        ) : null}
        <ThemedText variant="captionSmall" tone="tertiary" weight="500" numberOfLines={1} style={{ marginTop: 3 }}>
          {meta}
        </ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.text.tertiary} />
    </Pressable>
  );
}

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      overflow: 'hidden',
      backgroundColor: theme.background.secondary,
    },
    webview: {
      flex: 1,
      backgroundColor: theme.background.secondary,
    },
    fallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      backgroundColor: theme.background.secondary,
      borderRadius: Radius.lg,
      gap: 8,
    },
  });
}

function makePickerStyles(theme: ThemePalette) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: theme.background.secondary,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderColor: theme.glassBorder,
      borderTopWidth: 1,
      paddingHorizontal: Spacing.screenPadding,
      paddingTop: 8,
      paddingBottom: Spacing.sm,
      maxHeight: '70%',
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.glassBorder,
      marginBottom: Spacing.xs,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Spacing.xs,
      marginBottom: Spacing.xs,
    },
    closeBtn: {
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 15,
      backgroundColor: theme.background.tertiary,
    },
    list: {
      marginTop: 4,
    },
    listContent: {
      paddingBottom: Spacing.md,
      gap: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.background.secondary,
      borderColor: theme.glassBorder,
      borderWidth: 1,
      borderRadius: Radius.lg,
      padding: 10,
    },
    thumbWrap: {
      width: 56,
      height: 56,
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 2,
      backgroundColor: theme.background.tertiary,
    },
    thumb: {
      width: '100%',
      height: '100%',
    },
    rowBody: {
      flex: 1,
      minWidth: 0,
    },
  });
}
