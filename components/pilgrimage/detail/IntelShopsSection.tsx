// Anime-tied shops near the active spot (spec §13). Each row is curated,
// web-verified data; tapping opens the official/source URL. Distances are
// measured from the SPOT (walking context), not the user.

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Radius, Size, Spacing } from '../../../constants/DesignSystem';
import { ThemedText } from '../../themed';
import { useT } from '../../../libs/i18n';
import type { ThemePalette } from '../../../context/ThemeContext';
import { resolveLocalIntelText } from '../../../libs/services/pilgrimage/local-intel/local-intel-localization';
import type {
  LocalIntelShop,
  ShopCategory,
} from '../../../libs/services/pilgrimage/local-intel/types';
import { formatDistanceKm } from './_helpers';
import { IntelProvenanceLine } from './IntelProvenanceLine';

export interface NearbyShopRow {
  shop: LocalIntelShop;
  distanceKm: number;
}

const CATEGORY_ICON: Record<ShopCategory, keyof typeof Ionicons.glyphMap> = {
  restaurant: 'restaurant-outline',
  cafe: 'cafe-outline',
  goods: 'bag-handle-outline',
  museum: 'business-outline',
  hotel: 'bed-outline',
  other: 'storefront-outline',
};

export function IntelShopsSection({
  rows,
  theme,
  onOpenShop,
}: {
  rows: readonly NearbyShopRow[];
  theme: ThemePalette;
  onOpenShop: (shop: LocalIntelShop) => void;
}) {
  const t = useT();
  if (rows.length === 0) return null;

  return (
    <View style={styles.section}>
      <ThemedText variant="bodySmall" weight="800" tone="secondary" style={styles.header}>
        {t('pilgrimageUi.intel.nearbyShops')}
      </ThemedText>
      {rows.map(({ shop, distanceKm }) => {
        const connection = resolveLocalIntelText(shop.animeConnection);
        return (
          <Pressable
            key={shop.id}
            onPress={() => onOpenShop(shop)}
            accessibilityRole="link"
            accessibilityLabel={resolveLocalIntelText(shop.name).value}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: theme.background.tertiary,
                borderColor: theme.glassBorder,
              },
              pressed && { opacity: 0.82 },
            ]}>
            <View style={[styles.iconWrap, { backgroundColor: theme.background.secondary }]}>
              <Ionicons
                name={CATEGORY_ICON[shop.category] ?? CATEGORY_ICON.other}
                size={16}
                color={theme.text.secondary}
              />
            </View>
            <View style={styles.rowBody}>
              <View style={styles.nameRow}>
                <ThemedText variant="bodySmall" weight="700" numberOfLines={1} style={styles.name}>
                  {resolveLocalIntelText(shop.name).value}
                </ThemedText>
                <ThemedText variant="captionSmall" tone="tertiary">
                  {formatDistanceKm(distanceKm)}
                </ThemedText>
              </View>
              <ThemedText variant="captionSmall" tone="secondary" numberOfLines={2}>
                {connection.value}
              </ThemedText>
              <IntelProvenanceLine verifiedAt={shop.verifiedAt} theme={theme} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  header: {
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: Size.minTouchTarget,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    flex: 1,
  },
});
