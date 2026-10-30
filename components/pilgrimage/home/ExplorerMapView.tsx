import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MapSurface } from '../map/MapSurface';
import { LocateFab } from '../LocateFab';
import { LocationPermissionSheet } from '../LocationPermissionSheet';
import { MapOfflineOverlay } from '../MapOfflineOverlay';
import { SpotImage } from '../SpotImage';
import { ThemedIconButton, ThemedSurface, ThemedText } from '../../themed';
import { usePilgrimageHubData } from '../../../hooks/usePilgrimageHubData';
import { useMapThemePref } from '../../../hooks/useMapThemePref';
import { useTheme } from '../../../context/ThemeContext';
import { bottomPad, Radius, Shadow, Size, Spacing, TabBar } from '../../../constants/DesignSystem';
import { useT } from '../../../libs/i18n';
import { buildPilgrimageDetailRoute } from '../../../libs/services/pilgrimage/pilgrimage-navigation';
import { getPilgrimageAnimeTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import {
  buildHomeMapAnimes,
  buildHomeMapMarkers,
} from '../../../libs/services/pilgrimage/home-map-markers';
import type {
  MapMarker,
  MapSurfaceHandle,
} from '../../../libs/services/pilgrimage/map-engine/types';
import {
  useUserLocationTracking,
  LOCATE_FAB_ZOOM,
  LOCATE_FAB_COMPASS_ZOOM,
} from '../../../libs/services/pilgrimage/use-user-location-tracking';
import { resolveMapModeWithClock } from '../../../libs/services/pilgrimage/map-theme-clock';
import {
  loadMapStyleOverrideSync,
  resolveMapStyleUrl,
} from '../../../libs/services/pilgrimage/map-source-prefs';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';

export function ExplorerMapView({ onShowList }: { onShowList: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, effectiveMode } = useTheme();
  const t = useT();
  const mapRef = useRef<MapSurfaceHandle>(null);
  const lastMarkerPressAt = useRef(0);
  const mapPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { pref } = useMapThemePref();
  const [styleOverride] = useState(loadMapStyleOverrideSync);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const tracking = useUserLocationTracking({
    autoEngage: true,
    onFollowLocation: (loc, state) =>
      mapRef.current?.recenter(
        loc.latitude,
        loc.longitude,
        state === 'compass' ? LOCATE_FAB_COMPASS_ZOOM : LOCATE_FAB_ZOOM,
        { animate: true }
      ),
    onHeadingChange: (heading) => mapRef.current?.setHeading(heading),
  });
  const { knownAnimes, collectionIds, visited, handleBoundsChange } = usePilgrimageHubData({
    focusBangumiId: null,
    userLocation: tracking.location,
  });
  const entries = useMemo(
    () => buildHomeMapAnimes(knownAnimes, tracking.location, visited, collectionIds),
    [knownAnimes, tracking.location, visited, collectionIds]
  );
  const markers = useMemo(
    () => buildHomeMapMarkers(entries, theme.accent),
    [entries, theme.accent]
  );
  const selected = entries.find((entry) => entry.anime.id === selectedId) ?? null;
  const styleUrl = resolveMapStyleUrl(
    resolveMapModeWithClock(pref, effectiveMode, new Date().getHours()),
    styleOverride
  );
  const bottom = bottomPad(insets) + TabBar.height + Spacing.md;

  useEffect(
    () => () => {
      if (mapPressTimer.current) clearTimeout(mapPressTimer.current);
    },
    []
  );

  const noteMarkerPress = () => {
    lastMarkerPressAt.current = Date.now();
    if (mapPressTimer.current) clearTimeout(mapPressTimer.current);
    mapPressTimer.current = null;
  };

  const handleMapPress = () => {
    // MapLibre can dispatch a map press alongside an annotation press. Defer
    // dismissal until the annotation callback has had a chance to run.
    if (Date.now() - lastMarkerPressAt.current < 250) return;
    const markerPressAtStart = lastMarkerPressAt.current;
    if (mapPressTimer.current) clearTimeout(mapPressTimer.current);
    mapPressTimer.current = setTimeout(() => {
      if (lastMarkerPressAt.current === markerPressAtStart) setSelectedId(null);
      mapPressTimer.current = null;
    }, 150);
  };

  const openSelected = () => {
    if (!selected) return;
    hapticsBridge.tap();
    const anime = selected.anime;
    router.push(
      buildPilgrimageDetailRoute(anime.id, {
        returnTo: 'map',
        title: getPilgrimageAnimeTitles(anime).primary,
        poster: anime.cover,
      })
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background.primary }]}>
      <MapSurface
        key={reloadKey}
        ref={mapRef}
        markers={markers}
        styleUrl={styleUrl}
        user={
          tracking.location
            ? {
                lat: tracking.location.latitude,
                lng: tracking.location.longitude,
              }
            : null
        }
        controlsBottomOffset={bottom}
        onBoundsChange={handleBoundsChange}
        onPanned={tracking.onUserPan}
        onMapPress={handleMapPress}
        onMarkerPress={(marker: MapMarker) => {
          noteMarkerPress();
          hapticsBridge.selection();
          setSelectedId(marker.bangumiId ?? null);
        }}
        onClusterPress={(cluster) => {
          noteMarkerPress();
          if (!cluster.length) return;
          if (cluster.length === 1) {
            setSelectedId(cluster[0].bangumiId ?? null);
            return;
          }
          mapRef.current?.fitBounds?.(
            {
              north: Math.max(...cluster.map((marker) => marker.lat)),
              south: Math.min(...cluster.map((marker) => marker.lat)),
              east: Math.max(...cluster.map((marker) => marker.lng)),
              west: Math.min(...cluster.map((marker) => marker.lng)),
            },
            { animate: true }
          );
        }}
        onLoadError={() => setMapFailed(true)}
        onLoadSuccess={() => setMapFailed(false)}
      />
      {mapFailed ? (
        <MapOfflineOverlay
          onRetry={() => {
            setMapFailed(false);
            setReloadKey((current) => current + 1);
          }}
        />
      ) : null}
      <ThemedSurface
        variant="card"
        radius={Radius.card}
        style={[styles.header, { top: insets.top + Spacing.md }]}>
        <ThemedText variant="titleLarge" weight="700" style={styles.title} numberOfLines={1}>
          {t('tabs.pilgrimage')}
        </ThemedText>
        <ThemedIconButton
          accessibilityLabel={t('tabs.pilgrimageHome.showList')}
          icon={(color) => <Ionicons name="list" size={22} color={color} />}
          onPress={onShowList}
        />
      </ThemedSurface>
      {selected ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={getPilgrimageAnimeTitles(selected.anime).primary}
          onPress={openSelected}
          style={[styles.cardPress, { bottom }]}>
          <ThemedSurface variant="card" style={styles.card}>
            <SpotImage uri={selected.anime.cover} style={styles.poster} />
            <View style={styles.cardCopy}>
              <ThemedText variant="titleMedium" weight="700" numberOfLines={1}>
                {getPilgrimageAnimeTitles(selected.anime).primary}
              </ThemedText>
              <ThemedText variant="bodySmall" tone="secondary" numberOfLines={1}>
                {t('tabs.pilgrimageHome.spotCount', { count: selected.anime.pointsLength })}
                {selected.distanceKm === undefined ? '' : ` · ${selected.distanceKm.toFixed(1)} km`}
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.text.tertiary} />
          </ThemedSurface>
        </Pressable>
      ) : null}
      <LocateFab
        state={tracking.state}
        onPress={tracking.cycleState}
        bottomInset={selected ? bottom + 88 : bottom}
        loading={tracking.isRequestingPermission}
      />
      <LocationPermissionSheet
        visible={tracking.permissionSheetVisible}
        onDismiss={tracking.dismissPermissionSheet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    position: 'absolute',
    left: Spacing.screenPadding,
    right: Spacing.screenPadding,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.xs,
    paddingVertical: Spacing.xs,
    ...Shadow.subtle,
  },
  title: { flex: 1 },
  cardPress: {
    position: 'absolute',
    left: Spacing.screenPadding,
    right: Spacing.screenPadding,
    minHeight: Size.minTouchTarget,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    gap: Spacing.sm,
    borderRadius: Radius.card,
  },
  poster: { width: 50, height: 70, borderRadius: Radius.sm },
  cardCopy: { flex: 1, gap: Spacing.xxs },
});
