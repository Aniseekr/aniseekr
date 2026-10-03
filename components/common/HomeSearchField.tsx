import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet } from 'react-native';
import { ThemedText } from '../themed';
import { Radius, Size, Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

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
      style={[styles.search, { backgroundColor: theme.background.secondary }]}>
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
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
