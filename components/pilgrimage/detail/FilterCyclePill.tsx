// FilterCyclePill — single pill that cycles through the available filter
// states on tap. Replaces the horizontal strip of FilterPill chips when we
// want a more compact filter affordance. Shows the current label + count and
// one repeat glyph so the tap-to-rotate gesture is discoverable without a
// decorative train of state dots.

import React, { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Radius } from '../../../constants/DesignSystem';
import { ThemedText } from '../../themed';
import { useT } from '../../../libs/i18n';
import type { ThemePalette } from '../../../context/ThemeContext';
import type { PilgrimageSpotFilter } from '../../../libs/services/pilgrimage/pilgrimage-detail-filter';

export interface FilterCyclePillState {
  filter: PilgrimageSpotFilter;
  label: string;
  badge: number;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

export interface FilterCyclePillProps {
  states: readonly FilterCyclePillState[];
  current: PilgrimageSpotFilter;
  themeColor: string;
  themeColorFg: string;
  theme: ThemePalette;
  onCycle: (next: PilgrimageSpotFilter) => void;
}

function FilterCyclePillImpl({
  states,
  current,
  themeColor,
  themeColorFg,
  theme,
  onCycle,
}: FilterCyclePillProps) {
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const currentIndex = Math.max(
    0,
    states.findIndex((s) => s.filter === current)
  );
  const active = states[currentIndex] ?? states[0];
  const hasAppliedFilter = current !== 'all';
  const fg = hasAppliedFilter ? themeColor : theme.text.primary;

  const handlePress = () => {
    if (states.length <= 1) return;
    const next = states[(currentIndex + 1) % states.length];
    onCycle(next.filter);
  };

  if (!active) return null;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ selected: true }}
      accessibilityLabel={t('pilgrimage.detail.filterCycleA11y', { label: active.label })}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: theme.background.secondary,
          borderColor: hasAppliedFilter ? `${themeColor}77` : theme.glassBorder,
        },
        pressed && { opacity: 0.86 },
      ]}>
      <Ionicons name={active.icon ?? 'funnel-outline'} size={14} color={fg} />
      <ThemedText variant="bodySmall" weight="700" style={{ color: fg }}>
        {active.label}
      </ThemedText>
      <View style={[styles.badge, { backgroundColor: theme.background.tertiary }]}>
        <ThemedText variant="captionSmall" weight="700" style={{ color: fg }}>
          {active.badge}
        </ThemedText>
      </View>
      {states.length > 1 ? (
        <Ionicons name="repeat-outline" size={13} color={theme.text.tertiary} />
      ) : null}
    </Pressable>
  );
}

function areEqual(prev: FilterCyclePillProps, next: FilterCyclePillProps): boolean {
  return (
    prev.states === next.states &&
    prev.current === next.current &&
    prev.themeColor === next.themeColor &&
    prev.themeColorFg === next.themeColorFg &&
    prev.theme === next.theme &&
    prev.onCycle === next.onCycle
  );
}

export const FilterCyclePill = memo(FilterCyclePillImpl, areEqual);

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    pill: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
    },
    badge: {
      minWidth: 22,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
