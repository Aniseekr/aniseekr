import { memo, useMemo } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Radius, Size, Spacing, Typography } from '../../../constants/DesignSystem';
import type { ThemePalette } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import type { PilgrimageSpotFilter } from '../../../libs/services/pilgrimage/pilgrimage-detail-filter';
import { ThemedButton, ThemedIconButton } from '../../themed';

type MainFilter = 'all' | 'unvisited' | 'visited';
const FILTERS: readonly MainFilter[] = ['all', 'unvisited', 'visited'];

interface PilgrimageDetailControlsProps {
  spotSearchQuery: string;
  searchOpen: boolean;
  groupedCounts: { all: number; unvisited: number; visited: number };
  spotFilter: PilgrimageSpotFilter;
  themeColor: string;
  theme: ThemePalette;
  onSearchChange: (text: string) => void;
  onSearchClear: () => void;
  onSpotFilterChange: (filter: MainFilter) => void;
}

function PilgrimageDetailControlsImpl({
  spotSearchQuery,
  searchOpen,
  groupedCounts,
  spotFilter,
  themeColor,
  theme,
  onSearchChange,
  onSearchClear,
  onSpotFilterChange,
}: PilgrimageDetailControlsProps) {
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const activeFilter: MainFilter = FILTERS.includes(spotFilter as MainFilter)
    ? (spotFilter as MainFilter)
    : 'all';

  if (searchOpen) {
    return (
      <View style={styles.searchField}>
        <Ionicons name="search" size={18} color={theme.text.tertiary} />
        <TextInput
          autoFocus
          value={spotSearchQuery}
          onChangeText={onSearchChange}
          placeholder={t('pilgrimage.detail.searchPlaceholder')}
          placeholderTextColor={theme.text.tertiary}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          selectionColor={themeColor}
          accessibilityLabel={t('pilgrimage.detail.searchA11y')}
          style={[styles.searchInput, { color: theme.text.primary }]}
        />
        <ThemedIconButton
          variant="ghost"
          icon={(color) => <Ionicons name="close" size={20} color={color} />}
          accessibilityLabel={t('pilgrimage.detail.clearSearchA11y')}
          onPress={onSearchClear}
        />
      </View>
    );
  }

  return (
    <View style={styles.segments}>
      {FILTERS.map((filter) => {
        const label = t(`pilgrimage.detail.filter.${filter}`);
        return (
          <View key={filter} style={styles.segmentWrap}>
            <ThemedButton
              label={`${label} ${groupedCounts[filter]}`}
              accessibilityLabel={`${label} ${groupedCounts[filter]}`}
              variant={activeFilter === filter ? 'primary' : 'ghost'}
              accent={themeColor}
              size="md"
              shape="rounded"
              fullWidth
              haptic="selection"
              onPress={() => onSpotFilterChange(filter)}
              style={styles.segmentButton}
              textStyle={Typography.captionSmall}
            />
          </View>
        );
      })}
    </View>
  );
}

export const PilgrimageDetailControls = memo(PilgrimageDetailControlsImpl);

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    searchField: {
      minHeight: Size.minTouchTarget,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      paddingLeft: Spacing.sm,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.secondary,
    },
    searchInput: {
      flex: 1,
      minHeight: Size.minTouchTarget,
      paddingVertical: 0,
      ...Typography.bodyMedium,
    },
    segments: {
      flexDirection: 'row',
      padding: 3,
      borderRadius: Radius.lg,
      backgroundColor: theme.background.secondary,
      borderColor: theme.glassBorder,
      borderWidth: StyleSheet.hairlineWidth,
    },
    segmentWrap: { flex: 1 },
    segmentButton: { paddingHorizontal: 2 },
  });
}
