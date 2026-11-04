import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Radius, Spacing } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { useMapThemePref } from '../../../hooks/useMapThemePref';
import { useT } from '../../../libs/i18n';
import type { MapMarker } from '../../../libs/services/pilgrimage/map-engine/types';
import { resolveMapModeWithClock } from '../../../libs/services/pilgrimage/map-theme-clock';
import {
  loadMapStyleOverrideSync,
  resolveMapStyleUrl,
} from '../../../libs/services/pilgrimage/map-source-prefs';
import type { NearbySpotHit } from '../../../libs/services/pilgrimage/spot-index';
import type { LatLng } from '../../../libs/services/pilgrimage/location-service';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { MapSurface } from '../map/MapSurface';
import { Skeleton, ThemedButton, ThemedText } from '../../themed';

/** Whole-Japan overview when we do not know where the user is. */
const JAPAN_CENTER = { lat: 36.5, lng: 138.0 };
const JAPAN_ZOOM = 4.2;
const NEARBY_ZOOM = 13;
const HERO_HEIGHT = 200;

export interface HubMapHeroProps {
  locationStatus: 'pending' | 'granted' | 'denied' | 'unavailable';
  locationCanAskAgain: boolean;
  userLocation: LatLng | null;
  nearbySpots: readonly NearbySpotHit[];
  nearbyCount: number;
  nearbyPending: boolean;
  nearbyKnown: boolean;
  onOpenMap: () => void;
  onRequestLocation: () => void;
  onOpenSettings: () => void;
}

/**
 * The hub's entry to the map is a piece of the map itself: the user's
 * surroundings with the real nearby pins, or Japan when we don't have a
 * location — in which case the map carries the one "enable location" action
 * instead of a card of text. The preview is not interactive; a tap opens the
 * full map.
 */
function HubMapHeroImpl({
  locationStatus,
  locationCanAskAgain,
  userLocation,
  nearbySpots,
  nearbyCount,
  nearbyPending,
  nearbyKnown,
  onOpenMap,
  onRequestLocation,
  onOpenSettings,
}: HubMapHeroProps) {
  const { theme, effectiveMode } = useTheme();
  const t = useT();
  const { pref } = useMapThemePref();
  const styleUrl = resolveMapStyleUrl(
    resolveMapModeWithClock(pref, effectiveMode, new Date().getHours()),
    loadMapStyleOverrideSync()
  );
  const markers = useMemo<MapMarker[]>(
    () =>
      nearbySpots.map((hit) => ({
        id: `${hit.workKey}:${hit.spotId}`,
        kind: 'spot',
        lat: hit.lat,
        lng: hit.lon,
        title: hit.name,
        color: theme.accent,
        markerMode: 'dot',
      })),
    [nearbySpots, theme.accent]
  );

  if (locationStatus === 'pending') {
    return <Skeleton.Block width="100%" height={HERO_HEIGHT} borderRadius={Radius.card} />;
  }

  const located = locationStatus === 'granted' && userLocation !== null;
  const caption = !located
    ? null
    : nearbyPending
      ? null
      : nearbyKnown && nearbyCount > 0
        ? t('tabs.pilgrimageHome.within3km', { count: nearbyCount })
        : nearbyKnown
          ? t('tabs.pilgrimageHome.noNearbyWithin3km')
          : null;

  return (
    <Pressable
      onPress={() => {
        hapticsBridge.tap();
        onOpenMap();
      }}
      accessibilityRole="button"
      accessibilityLabel={t('tabs.pilgrimageHome.showMap')}
      style={[
        styles.hero,
        { borderColor: theme.glassBorder, backgroundColor: theme.background.secondary },
      ]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {/* The engine applies center/zoom once; remount when the location lands. */}
        <MapSurface
          key={located ? 'nearby' : 'japan'}
          markers={markers}
          styleUrl={styleUrl}
          center={
            located ? { lat: userLocation.latitude, lng: userLocation.longitude } : JAPAN_CENTER
          }
          zoom={located ? NEARBY_ZOOM : JAPAN_ZOOM}
          markerMode="dot"
          user={located ? { lat: userLocation.latitude, lng: userLocation.longitude } : null}
          // Keep the map attribution visible above the label row.
          controlsBottomOffset={52}
        />
      </View>

      <View pointerEvents="box-none" style={styles.footer}>
        <View
          style={[styles.label, { backgroundColor: theme.background.primary }]}
          pointerEvents="none">
          <Ionicons name="map" size={16} color={theme.accent} />
          <View style={styles.labelText}>
            <ThemedText variant="titleSmall" weight="700" numberOfLines={1}>
              {t('tabs.pilgrimageHome.nearby')}
            </ThemedText>
            {caption ? (
              <ThemedText variant="captionSmall" tone="secondary" numberOfLines={1}>
                {caption}
              </ThemedText>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.text.tertiary} />
        </View>
        {!located ? (
          <ThemedButton
            size="sm"
            label={t(
              locationCanAskAgain
                ? 'tabs.pilgrimageHome.enableLocation'
                : 'tabs.pilgrimageHome.openSettings'
            )}
            icon={<Ionicons name="locate" size={16} color={theme.text.primary} />}
            variant="secondary"
            onPress={locationCanAskAgain ? onRequestLocation : onOpenSettings}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

export const HubMapHero = memo(HubMapHeroImpl);

const styles = StyleSheet.create({
  hero: {
    height: HERO_HEIGHT,
    borderRadius: Radius.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  footer: {
    position: 'absolute',
    left: Spacing.sm,
    right: Spacing.sm,
    bottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  label: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
  },
  labelText: { flexShrink: 1 },
});
