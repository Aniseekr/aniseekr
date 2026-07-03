// Full-screen trip map for one anime's planned spots. A thin route shell
// (Rule 9): the tracking hook + mapRef push location/heading straight to the
// native surface, and the route/markers/next-stop are memoised pure derivations
// from planned intents (offline via each spot's meta snapshot). No async, no
// skeleton — everything is seeded synchronously from MMKV (Rule 10).

import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Radius, Spacing } from '../../../../constants/DesignSystem';
import { useTheme } from '../../../../context/ThemeContext';
import { ThemedButton, ThemedText } from '../../../../components/themed';
import { SpotImage } from '../../../../components/pilgrimage/SpotImage';
import { MapSurface } from '../../../../components/pilgrimage/map/MapSurface';
import { LocateFab } from '../../../../components/pilgrimage/LocateFab';
import type {
  MapMarker,
  MapRoute,
  MapSurfaceHandle,
} from '../../../../libs/services/pilgrimage/map-engine/types';
import { CLUSTER_DISABLE_AT } from '../../../../libs/services/pilgrimage/map-engine/cluster-style';
import { loadSpotIntentsSync } from '../../../../libs/services/pilgrimage/spot-intents';
import { groupPlannedIntents } from '../../../../libs/services/pilgrimage/planned-trips';
import { loadVisitedSpotsSync } from '../../../../libs/services/pilgrimage/visited-prefs';
import {
  haversineKm,
  orderSpotsByNearestNeighbor,
} from '../../../../libs/services/pilgrimage/route-order';
import { buildMultiStopDirectionsUrl } from '../../../../libs/services/pilgrimage/pilgrimage-navigation';
import { getIndexedById } from '../../../../libs/services/pilgrimage/anitabi-index';
import { useUserLocationTracking } from '../../../../libs/services/pilgrimage/use-user-location-tracking';
import { getNumberParam } from '../../../../libs/utils/route-params';
import { formatDistanceKm, hasValidGeo } from '../../../../components/pilgrimage/detail/_helpers';
import { useT } from '../../../../libs/i18n';

export default function PilgrimageTripScreen() {
  const params = useLocalSearchParams();
  const animeId = getNumberParam(params, 'animeId');
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const t = useT();

  const mapRef = useRef<MapSurfaceHandle>(null);
  const tracking = useUserLocationTracking({
    onFollowLocation: (loc) => {
      mapRef.current?.recenter(loc.latitude, loc.longitude, 15, { animate: true });
    },
    onHeadingChange: (deg) => mapRef.current?.setHeading(deg),
  });
  const userLocation = tracking.location;
  const { onUserPan } = tracking;

  // Seed sync — the trip's spots come entirely from planned-intent meta.
  const [intents] = useState(loadSpotIntentsSync);
  const [visited] = useState(loadVisitedSpotsSync);

  const group = useMemo(
    () => groupPlannedIntents(intents).groups.find((g) => g.animeId === animeId) ?? null,
    [intents, animeId]
  );

  const indexed = animeId != null ? getIndexedById(animeId) : null;
  const title = group?.name || indexed?.title || indexed?.cn || '';
  const accent = indexed?.color || theme.accent;

  // Drop points with no usable geo before route-ordering them (a spot with
  // (0,0) or non-finite coords would otherwise anchor the nearest-neighbor
  // chain and the route line at a bogus location).
  const validSpots = useMemo(
    () => (group ? group.spots.filter((s) => hasValidGeo(s.geo)) : []),
    [group]
  );

  // Nearest-neighbor ordered stops (from the user, else index order).
  const ordered = useMemo(
    () => orderSpotsByNearestNeighbor(validSpots, userLocation),
    [validSpots, userLocation]
  );

  const markers = useMemo<MapMarker[]>(
    () =>
      ordered.map((s) => ({
        id: s.id,
        lat: s.geo[0],
        lng: s.geo[1],
        kind: 'spot',
        title,
        image: s.image,
        color: accent,
        visited: visited[s.id] === true,
        markerMode: 'bubble',
      })),
    [ordered, title, accent, visited]
  );

  const routes = useMemo<MapRoute[]>(() => {
    if (ordered.length < 2) return [];
    return [
      {
        id: `trip-${animeId}`,
        kind: 'tour',
        color: accent,
        coords: ordered.map((s) => ({ lat: s.geo[0], lng: s.geo[1] })),
      },
    ];
  }, [ordered, animeId, accent]);

  // Next stop = first unvisited in walk order.
  const nextStop = useMemo(() => ordered.find((s) => visited[s.id] !== true) ?? null, [ordered, visited]);
  const nextStopDistanceKm =
    nextStop && userLocation
      ? haversineKm([userLocation.latitude, userLocation.longitude], nextStop.geo)
      : null;

  const initialCenter = ordered[0]
    ? { lat: ordered[0].geo[0], lng: ordered[0].geo[1] }
    : indexed
      ? { lat: indexed.lat, lng: indexed.lng }
      : undefined;

  const handleBack = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.back();
  }, [router]);

  const handleOpenMaps = useCallback(() => {
    if (ordered.length === 0) return;
    Haptics.selectionAsync().catch(() => undefined);
    const stops = ordered.map((s) => s.geo);
    const urls = buildMultiStopDirectionsUrl(stops, 'google');
    if (urls.length === 0) return;
    Linking.openURL(urls[0]).catch(() => undefined);
    // Google dir links cap at 9 waypoints; a longer trip chains into more
    // than one URL but only the first leg opens automatically here — tell
    // the user honestly instead of silently dropping the rest of the trip.
    if (urls.length > 1) {
      // Explicit localized button — RN's default Alert dismiss is hardcoded
      // English on Android (Rule 11).
      Alert.alert(t('pilgrimage.trip.routeTruncated'), undefined, [{ text: t('common.ok') }]);
    }
  }, [ordered, t]);

  const hasStops = ordered.length > 0;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {initialCenter ? (
        <MapSurface
          ref={mapRef}
          markers={markers}
          routes={routes}
          user={userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : null}
          center={initialCenter}
          zoom={13}
          clusterDisableAtZoom={CLUSTER_DISABLE_AT.hub}
          controlsBottomOffset={140}
          onPanned={onUserPan}
        />
      ) : (
        <View style={[styles.container, { backgroundColor: theme.background.primary }]} />
      )}

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable
          onPress={handleBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('pilgrimage.trip.back')}
          style={({ pressed }) => [
            styles.roundBtn,
            { backgroundColor: `${theme.background.secondary}E6`, borderColor: theme.glassBorder },
            pressed && { opacity: 0.8 },
          ]}>
          <Ionicons name="chevron-back" size={20} color={theme.text.primary} />
        </Pressable>
        <View
          style={[
            styles.titlePill,
            { backgroundColor: `${theme.background.secondary}E6`, borderColor: theme.glassBorder },
          ]}>
          <ThemedText variant="bodyMedium" weight="800" numberOfLines={1}>
            {title}
          </ThemedText>
        </View>
      </View>

      {hasStops ? (
        <LocateFab
          state={tracking.state}
          onPress={tracking.cycleState}
          loading={tracking.isRequestingPermission}
          bottomInset={insets.bottom + 130}
        />
      ) : null}

      {/* Next-stop card */}
      <View style={[styles.bottomCard, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
        <View
          style={[
            styles.card,
            { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
          ]}>
          {!hasStops ? (
            <ThemedText variant="bodySmall" tone="secondary" align="center">
              {t('pilgrimage.trip.empty')}
            </ThemedText>
          ) : nextStop ? (
            <View style={styles.nextRow}>
              <SpotImage uri={nextStop.image} style={styles.nextThumb} recyclingKey={nextStop.id} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <ThemedText variant="captionSmall" tone="tertiary" weight="700">
                  {t('pilgrimage.trip.nextStop')}
                </ThemedText>
                {nextStopDistanceKm != null ? (
                  <ThemedText variant="bodySmall" weight="700">
                    {t('pilgrimage.trip.away', { distance: formatDistanceKm(nextStopDistanceKm) })}
                  </ThemedText>
                ) : null}
              </View>
            </View>
          ) : (
            <ThemedText variant="bodySmall" weight="700" tone="secondary" align="center">
              {t('pilgrimage.trip.allVisited')}
            </ThemedText>
          )}

          {hasStops ? (
            <ThemedButton
              label={t('pilgrimage.trip.openInMaps')}
              accessibilityLabel={t('pilgrimage.trip.openInMapsA11y')}
              onPress={handleOpenMaps}
              size="md"
              fullWidth
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.screenPadding,
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  titlePill: {
    flex: 1,
    minWidth: 0,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  bottomCard: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing.screenPadding },
  card: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextThumb: { width: 56, height: 42, borderRadius: 8 },
});
