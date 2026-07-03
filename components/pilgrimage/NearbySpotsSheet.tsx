// Shared "nearby spot" row + distance formatter, consumed by
// PilgrimageHubSheet's nearby list. The bottom-sheet shell that used to wrap
// these (the default-exported `NearbySpotsSheet`) had no importers left after
// PilgrimageHubSheet took over the fullscreen map's nearby UI — removed
// rather than kept as dead code.

import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ThemePalette } from '../../context/ThemeContext';
import { ThemedText } from '../themed';
import type { NearbySpot } from '../../libs/services/pilgrimage/nearby-spots';
import { SpotImage } from './SpotImage';

const THUMB_SIZE = 56;

export function formatKm(km: number): string {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

interface NearbySpotRowProps {
  spot: NearbySpot;
  theme: ThemePalette;
  onPress: () => void;
}

export function NearbySpotRow({ spot, theme, onPress }: NearbySpotRowProps) {
  const styles = useMemo(() => makeRowStyles(theme), [theme]);
  const subtitle = spot.ep > 0 ? `${spot.animeTitle} · EP ${spot.ep}` : spot.animeTitle;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spot.name}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
      <SpotImage uri={spot.image} style={styles.thumb} contentFit="cover" recyclingKey={spot.markerId} />
      <View style={styles.body}>
        <ThemedText variant="bodySmall" weight="700" numberOfLines={1}>
          {spot.name}
        </ThemedText>
        {subtitle ? (
          <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.distanceCol}>
        <Ionicons name="navigate" size={11} color={theme.accent} />
        <ThemedText variant="captionSmall" weight="700" style={{ color: theme.accent }}>
          {formatKm(spot.distanceKm)}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function makeRowStyles(theme: ThemePalette) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      minHeight: 56,
    },
    thumb: {
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: 8,
      backgroundColor: theme.background.tertiary,
    },
    body: {
      flex: 1,
      gap: 2,
      minWidth: 0,
    },
    distanceCol: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
  });
}
