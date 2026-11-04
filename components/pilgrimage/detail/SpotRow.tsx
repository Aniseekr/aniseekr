import React, { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Spacing } from '../../../constants/DesignSystem';
import type { ThemePalette } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { spotRowLayout } from '../../../libs/animations/presets';
import { getPilgrimageSpotTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import type { PilgrimageSpot } from '../../../libs/services/pilgrimage/types';
import { ThemedIconButton, ThemedText } from '../../themed';
import { formatDistanceKm, getSpotGeo, getSpotEpisode } from './_helpers';

export interface SpotRowProps {
  group: PilgrimageSpot;
  spot: PilgrimageSpot;
  index: number;
  selected: boolean;
  themeColor: string;
  distanceKm: number | null;
  visited: boolean;
  theme: ThemePalette;
  onPress: (group: PilgrimageSpot) => void;
  onToggleVisited: (group: PilgrimageSpot) => void;
}

function SpotRowImpl({
  group,
  spot,
  index: _index,
  selected,
  themeColor,
  distanceKm,
  visited,
  theme,
  onPress,
  onToggleVisited,
}: SpotRowProps) {
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const titles = getPilgrimageSpotTitles(spot);
  // Episode and distance only — the address, source confidence and actions live
  // on the selected-spot card, so a long list stays scannable.
  const subtitle = [
    getSpotEpisode(spot),
    getSpotGeo(spot) ? null : t('pilgrimage.detail.unverified'),
    distanceKm === null ? null : formatDistanceKm(distanceKm),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Animated.View
      layout={spotRowLayout()}
      style={[styles.container, selected && { borderLeftColor: themeColor }]}>
      <View style={styles.row}>
        <Pressable
          onPress={() => onPress(group)}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          accessibilityLabel={t('pilgrimage.detail.openSpotA11y', { title: titles.primary })}
          style={styles.rowBody}>
          <ThemedText
            variant="bodyMedium"
            weight="700"
            numberOfLines={1}
            style={selected ? { color: themeColor } : undefined}>
            {titles.primary}
          </ThemedText>
          {subtitle ? (
            <ThemedText variant="captionSmall" tone="secondary" numberOfLines={1}>
              {subtitle}
            </ThemedText>
          ) : null}
        </Pressable>
        <ThemedIconButton
          variant="ghost"
          haptic="none"
          icon={() => (
            <Ionicons
              name={visited ? 'checkmark-circle' : 'ellipse-outline'}
              size={25}
              color={visited ? themeColor : theme.text.tertiary}
            />
          )}
          accessibilityLabel={t(
            visited ? 'pilgrimage.detail.markNotVisitedA11y' : 'pilgrimage.detail.markVisitedA11y'
          )}
          onPress={() => onToggleVisited(group)}
        />
      </View>
    </Animated.View>
  );
}

export const SpotRow = memo(SpotRowImpl);

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    container: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.glassBorder,
      borderLeftWidth: 3,
      borderLeftColor: 'transparent',
      paddingLeft: Spacing.sm,
    },
    row: { flexDirection: 'row', alignItems: 'center' },
    rowBody: { flex: 1, minWidth: 0, minHeight: 56, justifyContent: 'center', gap: 2 },
  });
}
