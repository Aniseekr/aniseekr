import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Radius, Size, Spacing, Typography } from '../../../constants/DesignSystem';
import type { ThemePalette } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import type { PilgrimageSpotFilter } from '../../../libs/services/pilgrimage/pilgrimage-detail-filter';
import type { PilgrimageDetailViewPreset } from '../../../libs/services/pilgrimage/pilgrimage-detail-flow';
import { ThemedText } from '../../themed';
import { FilterCyclePill, type FilterCyclePillState } from './FilterCyclePill';

interface PilgrimageDetailControlsProps {
  spotSearchQuery: string;
  filterCycleStates: readonly FilterCyclePillState[];
  spotFilter: PilgrimageSpotFilter;
  activeViewPreset: PilgrimageDetailViewPreset;
  filteredMappablePointCount: number;
  themeColor: string;
  themeColorFg: string;
  theme: ThemePalette;
  onSearchChange: (text: string) => void;
  onSearchClear: () => void;
  onSpotFilterChange: (filter: PilgrimageSpotFilter) => void;
  onViewPresetChange: (preset: PilgrimageDetailViewPreset) => void;
}

const VIEW_OPTIONS: readonly {
  preset: PilgrimageDetailViewPreset;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { preset: 'grid', icon: 'grid-outline' },
  { preset: 'rows', icon: 'list-outline' },
  { preset: 'map', icon: 'map-outline' },
];

/** Primary browse controls live with the content they affect, not over the map. */
function PilgrimageDetailControlsImpl({
  spotSearchQuery,
  filterCycleStates,
  spotFilter,
  activeViewPreset,
  filteredMappablePointCount,
  themeColor,
  themeColorFg,
  theme,
  onSearchChange,
  onSearchClear,
  onSpotFilterChange,
  onViewPresetChange,
}: PilgrimageDetailControlsProps) {
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const hasQuery = spotSearchQuery.trim().length > 0;

  return (
    <View style={styles.controls}>
      <View style={styles.searchField}>
        <Ionicons name="search" size={17} color={theme.text.tertiary} />
        <TextInput
          value={spotSearchQuery}
          onChangeText={onSearchChange}
          placeholder={t('pilgrimage.detail.searchPlaceholder')}
          placeholderTextColor={theme.text.tertiary}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          selectionColor={themeColor}
          clearButtonMode="never"
          accessibilityLabel={t('pilgrimage.detail.searchA11y')}
          style={[styles.searchInput, { color: theme.text.primary }]}
        />
        {hasQuery ? (
          <Pressable
            onPress={onSearchClear}
            accessibilityRole="button"
            accessibilityLabel={t('pilgrimage.detail.clearSearchA11y')}
            hitSlop={6}
            style={({ pressed }) => [styles.clearButton, pressed && { opacity: 0.65 }]}>
            <Ionicons name="close-circle" size={19} color={theme.text.tertiary} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.secondaryRow}>
        <FilterCyclePill
          states={filterCycleStates}
          current={spotFilter}
          themeColor={themeColor}
          themeColorFg={themeColorFg}
          theme={theme}
          onCycle={onSpotFilterChange}
        />

        <View style={styles.viewModeGroup}>
          {VIEW_OPTIONS.map(({ preset, icon }) => {
            const active = activeViewPreset === preset;
            const label = t(`pilgrimage.detail.viewMode.${preset}`);
            const countSuffix = preset === 'map' ? `, ${filteredMappablePointCount}` : '';
            return (
              <Pressable
                key={preset}
                onPress={() => onViewPresetChange(preset)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${label}${countSuffix}`}
                style={({ pressed }) => [
                  styles.viewModeButton,
                  active && { backgroundColor: themeColor },
                  pressed && { opacity: 0.74 },
                ]}>
                <Ionicons
                  name={icon}
                  size={16}
                  color={active ? themeColorFg : theme.text.secondary}
                />
                <ThemedText
                  variant="captionSmall"
                  weight="700"
                  numberOfLines={1}
                  style={{ color: active ? themeColorFg : theme.text.secondary }}>
                  {label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export const PilgrimageDetailControls = memo(PilgrimageDetailControlsImpl);

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    controls: {
      gap: Spacing.xs,
    },
    searchField: {
      minHeight: Size.minTouchTarget,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      paddingLeft: Spacing.sm,
      paddingRight: 4,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.secondary,
    },
    searchInput: {
      flex: 1,
      minHeight: Size.minTouchTarget - 2,
      paddingVertical: 0,
      ...Typography.bodyMedium,
      letterSpacing: 0,
    },
    clearButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: Radius.md,
    },
    secondaryRow: {
      minHeight: Size.recommendedTouchTarget,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Spacing.xs,
    },
    viewModeGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 3,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.secondary,
    },
    viewModeButton: {
      minWidth: 52,
      height: Size.minTouchTarget,
      paddingHorizontal: 7,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1,
    },
  });
}
