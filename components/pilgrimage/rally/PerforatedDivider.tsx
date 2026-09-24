import { StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/DesignSystem';
import { useTheme } from '@/context/ThemeContext';

const DASH = 6;
const DASH_GAP = 4;
// Enough dashes for any phone width; the row clips the overflow.
const DASH_COUNT = 60;

/**
 * Ticket tear line: two notches cut in the page colour and a dashed rule.
 * Dashes are real views because iOS can't dash a single-sided border.
 */
export function PerforatedDivider({ notch = Spacing.md }: { notch?: number }) {
  const { theme } = useTheme();
  const notchStyle = {
    width: notch,
    height: notch,
    backgroundColor: theme.background.primary,
  };
  return (
    <View
      style={[styles.row, { height: notch }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View style={[styles.notch, notchStyle, { marginLeft: -notch / 2 }]} />
      <View style={styles.dashes}>
        {Array.from({ length: DASH_COUNT }, (_, index) => (
          <View key={index} style={[styles.dash, { backgroundColor: theme.glassBorder }]} />
        ))}
      </View>
      <View style={[styles.notch, notchStyle, { marginRight: -notch / 2 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  notch: { borderRadius: Radius.full },
  dashes: {
    flex: 1,
    flexDirection: 'row',
    gap: DASH_GAP,
    overflow: 'hidden',
    marginHorizontal: Spacing.xs,
  },
  dash: { width: DASH, height: 1.5, borderRadius: Radius.full },
});
