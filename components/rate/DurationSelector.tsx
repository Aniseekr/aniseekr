import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated from 'react-native-reanimated';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { listItemEnterDown } from '../../libs/animations/presets';
import { useT, type TranslationKey } from '../../libs/i18n';

export type DurationKey = 'all' | 'short' | 'standard' | 'long' | 'movie';

interface DurationOption {
  key: DurationKey;
  labelKey: TranslationKey;
  /** Catalog key for the description; `description` is the raw fallback for ranges not yet in the catalog. */
  descriptionKey?: TranslationKey;
  description?: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  minMinutes?: number;
  maxMinutes?: number;
}

export const DURATION_OPTIONS: DurationOption[] = [
  {
    key: 'all',
    labelKey: 'rate.allLengths',
    descriptionKey: 'rate.anyEpisodeDuration',
    icon: 'all-inclusive',
  },
  {
    key: 'short',
    labelKey: 'rate.shortForm',
    descriptionKey: 'rate.under13Min',
    icon: 'flash-on',
    maxMinutes: 13,
  },
  {
    key: 'standard',
    labelKey: 'rate.standard',
    description: '13 to 30 min',
    icon: 'tv',
    minMinutes: 13,
    maxMinutes: 30,
  },
  {
    key: 'long',
    labelKey: 'rate.longForm',
    description: '30 to 60 min',
    icon: 'access-time-filled',
    minMinutes: 30,
    maxMinutes: 60,
  },
  {
    key: 'movie',
    labelKey: 'rate.movies',
    description: '60+ min',
    icon: 'movie',
    minMinutes: 60,
  },
];

interface DurationSelectorProps {
  value: DurationKey;
  onChange: (key: DurationKey) => void;
}

function DurationSelectorComponent({ value, onChange }: DurationSelectorProps) {
  const { theme } = useTheme();
  const t = useT();

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {DURATION_OPTIONS.map((option, idx) => {
        const isSelected = option.key === value;
        return (
          <Animated.View key={option.key} entering={listItemEnterDown(idx)}>
            <Pressable
              onPress={() => {
                hapticsBridge.selection();
                onChange(option.key);
              }}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: isSelected ? theme.accent + '24' : theme.background.secondary,
                  borderColor: isSelected ? theme.accent : theme.glassBorder,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}>
              <View
                style={[
                  styles.iconWrap,
                  {
                    backgroundColor: isSelected ? theme.accent : theme.background.tertiary,
                  },
                ]}>
                <MaterialIcons
                  name={option.icon}
                  size={20}
                  color={isSelected ? '#0E0A06' : theme.text.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: theme.text.primary }]}>
                  {t(option.labelKey)}
                </Text>
                <Text style={[styles.description, { color: theme.text.secondary }]}>
                  {option.descriptionKey ? t(option.descriptionKey) : option.description}
                </Text>
              </View>
              <MaterialIcons
                name={isSelected ? 'check-circle' : 'chevron-right'}
                size={22}
                color={isSelected ? theme.accent : theme.text.tertiary}
              />
            </Pressable>
          </Animated.View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm + 2,
    borderRadius: 14,
    borderWidth: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...Typography.titleMedium,
  },
  description: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
});

export const DurationSelector = memo(DurationSelectorComponent);
