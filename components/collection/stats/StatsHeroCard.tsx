import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import { Spacing, Typography } from '../../../constants/DesignSystem';
import { Halftone, ThemedSurface, ThemedText } from '../../themed';

interface HeroValue {
  label: string;
  value: string;
  hidden?: boolean;
}

/** The headline numbers of the library, on the same halftone card as the profile. */
export function StatsHeroCard({ values }: { values: HeroValue[] }) {
  const { theme } = useTheme();
  const shown = values.filter((value) => !value.hidden);

  return (
    <ThemedSurface style={styles.card}>
      <Halftone color={theme.accent} />
      {shown.map((value, index) => (
        <View
          key={value.label}
          style={[
            styles.col,
            index > 0 && { borderLeftWidth: 1, borderLeftColor: theme.glassBorder },
          ]}>
          <ThemedText style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
            {value.value}
          </ThemedText>
          <ThemedText variant="caption" tone="secondary" numberOfLines={2}>
            {value.label}
          </ThemedText>
        </View>
      ))}
    </ThemedSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    paddingVertical: Spacing.lg,
  },
  col: {
    flex: 1,
    gap: Spacing.xxs,
    paddingHorizontal: Spacing.md,
  },
  value: {
    ...Typography.displayLarge,
    fontWeight: '800',
  },
});
