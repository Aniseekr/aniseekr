import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { ThemedSurface, ThemedText } from '../../themed';
import type { ScoreBucket } from '../../../libs/services/collection/stats-service';

/** How many shows got each score, 1–10. The most-given score is the accent bar. */
export function ScoreDistributionCard({ title, data }: { title: string; data: ScoreBucket[] }) {
  const { theme } = useTheme();
  const max = Math.max(1, ...data.map((b) => b.count));
  const peak = data.findIndex((b) => b.count === max);

  return (
    <ThemedSurface style={styles.card}>
      <ThemedText variant="titleMedium" weight="700">
        {title}
      </ThemedText>
      <View style={styles.bars}>
        {data.map((bucket, i) => {
          const isPeak = i === peak && bucket.count > 0;
          return (
            <View key={bucket.score} style={styles.col}>
              <ThemedText variant="captionSmall" tone={isPeak ? 'primary' : 'tertiary'}>
                {bucket.count > 0 ? bucket.count : ''}
              </ThemedText>
              <View style={styles.track}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${bucket.count > 0 ? Math.max(6, (bucket.count / max) * 100) : 0}%`,
                      backgroundColor: isPeak ? theme.accent : `${theme.text.tertiary}66`,
                    },
                  ]}
                />
              </View>
              <ThemedText variant="captionSmall" tone={isPeak ? 'primary' : 'tertiary'}>
                {bucket.score}
              </ThemedText>
            </View>
          );
        })}
      </View>
    </ThemedSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.xxs,
  },
  col: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xxs,
  },
  track: {
    width: '100%',
    height: 72,
    justifyContent: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  bar: {
    width: '100%',
    borderRadius: Radius.sm,
  },
});
