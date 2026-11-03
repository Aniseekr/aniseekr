import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet } from 'react-native';
import { ThemedText } from '../themed';
import { Ink, Radius, Size, Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { withAlpha } from '../themed/contrast';

export function HomeSearchField({ label, onPress }: { label: string; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="search"
      accessibilityLabel={label}
      onPress={() => {
        hapticsBridge.tap();
        onPress();
      }}
      style={[
        styles.search,
        {
          backgroundColor: theme.background.secondary,
          borderColor: withAlpha(theme.text.primary, 0.22),
        },
      ]}>
      <Ionicons name="search" size={20} color={theme.text.tertiary} />
      <ThemedText variant="bodyMedium" tone="tertiary">
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: {
    minHeight: Size.minTouchTarget,
    borderRadius: Radius.sm,
    borderWidth: Ink.hairline,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
