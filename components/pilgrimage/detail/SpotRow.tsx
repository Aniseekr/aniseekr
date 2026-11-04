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
import { ThemedButton, ThemedIconButton, ThemedText } from '../../themed';
import { formatDistanceKm, getSpotConfidenceLabel, getSpotGeo, getSpotEpisode } from './_helpers';

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
  onOpenMaps: (spot: PilgrimageSpot) => void;
  onStartCamera: (spot: PilgrimageSpot) => void;
  onMenuOpen: (spotId: string) => void;
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
  onOpenMaps,
  onStartCamera,
  onMenuOpen,
}: SpotRowProps) {
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const titles = getPilgrimageSpotTitles(spot);
  const subtitle = [
    getSpotEpisode(spot),
    spot.address || null,
    getSpotConfidenceLabel(t, spot.confidence),
    getSpotGeo(spot) ? null : t('pilgrimage.detail.unverified'),
    distanceKm === null ? null : formatDistanceKm(distanceKm),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Animated.View layout={spotRowLayout()} style={styles.container}>
      <View style={styles.row}>
        <Pressable
          onPress={() => onPress(group)}
          accessibilityRole="button"
          accessibilityState={{ expanded: selected }}
          accessibilityLabel={t('pilgrimage.detail.openSpotA11y', { title: titles.primary })}
          style={styles.rowBody}>
          <View style={styles.info}>
            <ThemedText variant="bodyMedium" weight="700" numberOfLines={1}>
              {titles.primary}
            </ThemedText>
            {subtitle ? (
              <ThemedText variant="captionSmall" tone="secondary" numberOfLines={1}>
                {subtitle}
              </ThemedText>
            ) : null}
          </View>
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

      {selected ? (
        <View style={styles.expanded}>
          {spot.scenes.map((scene, index) => (
            <View key={`${spot.id}-${scene.episode}-${index}`}>
              <ThemedText variant="captionSmall" tone="secondary">
                {[scene.episode, scene.time].filter(Boolean).join(' · ')}
              </ThemedText>
              {scene.episodeBasis === 'reference' || scene.timeBasis === 'reference' ? (
                <ThemedText variant="captionSmall" tone="tertiary">
                  {t('pilgrimage.identify.referenceBasis')}
                </ThemedText>
              ) : null}
            </View>
          ))}
          <View style={styles.actions}>
            <View style={styles.actionFlex}>
              <ThemedButton
                label={t('pilgrimage.detail.directions')}
                variant="secondary"
                size="md"
                fullWidth
                disabled={!getSpotGeo(spot)}
                onPress={() => onOpenMaps(spot)}
              />
            </View>
            <View style={styles.actionFlex}>
              <ThemedButton
                label={t('pilgrimage.detail.cameraCompare')}
                size="md"
                fullWidth
                accent={themeColor}
                onPress={() => onStartCamera(spot)}
              />
            </View>
            <ThemedIconButton
              icon={(color) => <Ionicons name="ellipsis-horizontal" size={22} color={color} />}
              accessibilityLabel={t('pilgrimage.detail.moreSpotActions')}
              onPress={() => onMenuOpen(spot.id)}
            />
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

export const SpotRow = memo(SpotRowImpl);

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    container: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.glassBorder,
      paddingVertical: Spacing.xs,
    },
    row: { flexDirection: 'row', alignItems: 'center' },
    rowBody: { flex: 1, minHeight: 64, justifyContent: 'center' },
    info: { flex: 1, minWidth: 0, gap: 3 },
    expanded: { gap: Spacing.sm, paddingTop: Spacing.xs, paddingBottom: Spacing.sm },
    actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    actionFlex: { flex: 1 },
  });
}
