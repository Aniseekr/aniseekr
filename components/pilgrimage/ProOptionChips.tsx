// A row of single-choice chips where some choices need Pro. Locked choices
// stay visible with a Pro badge; tapping one asks the caller to show the
// paywall instead of selecting it.
import { Pressable, StyleSheet, View } from 'react-native';
import { ThemedText, readableTextOn } from '../themed';
import { Radius, Size } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { ProBadge } from '../subscription/ProBadge';

export type ProOption<T extends string> = { id: T; label: string; pro: boolean };

export function ProOptionChips<T extends string>({
  options,
  value,
  isPro,
  accent,
  onChange,
  onLocked,
  accessibilityLabel,
}: {
  options: readonly ProOption<T>[];
  value: T;
  isPro: boolean;
  accent: string;
  onChange: (next: T) => void;
  onLocked: () => void;
  accessibilityLabel: (option: ProOption<T>) => string;
}) {
  const { theme } = useTheme();
  const accentFg = readableTextOn(accent);
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const active = option.id === value;
        const locked = option.pro && !isPro;
        return (
          <Pressable
            key={option.id}
            onPress={() => {
              hapticsBridge.selection();
              if (locked) onLocked();
              else onChange(option.id);
            }}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel(option)}
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: active ? accent : theme.background.secondary,
                borderColor: active ? accent : theme.glassBorder,
                opacity: pressed ? 0.85 : 1,
              },
            ]}>
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: active ? accentFg : theme.text.primary }}>
              {option.label}
            </ThemedText>
            {option.pro ? <ProBadge locked={locked} color={active ? accentFg : undefined} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: Size.minTouchTarget - 8,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
});
