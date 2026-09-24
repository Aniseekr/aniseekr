import { StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { Radius, Spacing } from '@/constants/DesignSystem';
import { useTheme } from '@/context/ThemeContext';

const STROKE = 1.5;

/**
 * Ticket tear line: two notches cut in the page colour and a dashed rule.
 * One SVG line (iOS can't dash a single-sided border, and a row of views per
 * dash multiplies native views on every card).
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
      <Svg style={styles.line} height={STROKE * 2}>
        <Line
          x1="0"
          y1={STROKE}
          x2="100%"
          y2={STROKE}
          stroke={theme.glassBorder}
          strokeWidth={STROKE}
          strokeDasharray="6 4"
          strokeLinecap="round"
        />
      </Svg>
      <View style={[styles.notch, notchStyle, { marginRight: -notch / 2 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  notch: { borderRadius: Radius.full },
  line: { flex: 1, marginHorizontal: Spacing.xs },
});
