import type { ComponentProps } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Radius, Shadow, Spacing } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { useT, type TranslationKey } from '../../../libs/i18n';
import { readableTextOn, ThemedText } from '../../themed';
import { LOCALITY_CARD_RADIUS, localityMarkerPalette } from '../common/LocalityAesthetic';

export type LegendKind = 'scene' | 'stamp' | 'shop' | 'festival' | 'area';

const LABEL_KEYS: Record<LegendKind, TranslationKey> = {
  scene: 'pilgrimageUi.mapLegend.scene',
  stamp: 'pilgrimageUi.mapLegend.stamp',
  shop: 'pilgrimageUi.mapLegend.shop',
  festival: 'pilgrimageUi.mapLegend.festival',
  area: 'pilgrimageUi.mapLegend.area',
};

const ICONS: Record<LegendKind, ComponentProps<typeof Ionicons>['name']> = {
  scene: 'image-outline',
  stamp: 'ticket-outline',
  shop: 'storefront-outline',
  festival: 'sparkles-outline',
  area: 'map-outline',
};

export function LocalityMapLegend({
  kinds = ['scene', 'stamp', 'shop', 'festival', 'area'],
  style,
}: {
  kinds?: readonly LegendKind[];
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const t = useT();
  const markerColors = localityMarkerPalette(theme);
  const colors: Record<LegendKind, string> = {
    scene: theme.text.secondary,
    ...markerColors,
  };

  return (
    <View
      pointerEvents="none"
      style={[
        styles.legend,
        {
          backgroundColor: theme.background.secondary,
          borderColor: theme.glassBorder,
        },
        style,
      ]}>
      {kinds.map((kind) => (
        <View key={kind} style={styles.item}>
          <LegendSwatch kind={kind} color={colors[kind]} />
          <ThemedText variant="captionSmall" tone="secondary" numberOfLines={1}>
            {t(LABEL_KEYS[kind])}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

function LegendSwatch({ kind, color }: { kind: LegendKind; color: string }) {
  const { theme } = useTheme();
  const foreground = kind === 'scene' || kind === 'area' ? color : readableTextOn(color);
  return (
    <View
      style={[
        styles.swatch,
        kind === 'stamp'
          ? styles.stamp
          : kind === 'shop'
            ? styles.shop
            : kind === 'festival'
              ? styles.festival
              : kind === 'area'
                ? styles.area
                : styles.scene,
        {
          backgroundColor: kind === 'scene' || kind === 'area' ? theme.background.tertiary : color,
          borderColor: color,
        },
      ]}>
      <View style={kind === 'festival' ? styles.festivalIcon : undefined}>
        <Ionicons name={ICONS[kind]} size={12} color={foreground} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    borderWidth: 1,
    borderRadius: LOCALITY_CARD_RADIUS,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    opacity: 0.94,
    ...Shadow.subtle,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxs,
  },
  swatch: {
    width: Spacing.xl,
    height: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  scene: { borderRadius: Radius.full },
  stamp: { borderRadius: Radius.full, borderStyle: 'dashed' },
  shop: { borderRadius: Radius.sm },
  festival: {
    width: Spacing.lg,
    height: Spacing.lg,
    marginHorizontal: Spacing.xxs / 2,
    borderRadius: Radius.sm,
    transform: [{ rotate: '45deg' }],
  },
  festivalIcon: { transform: [{ rotate: '-45deg' }] },
  area: {
    width: Spacing.xxl,
    borderRadius: Radius.full,
    borderStyle: 'dashed',
  },
});
