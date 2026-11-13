import { StyleSheet, View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { Spacing } from '../../../constants/DesignSystem';
import { ThemedSurface, ThemedText } from '../../themed';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface Props {
  title?: string;
  slices: DonutSlice[];
  total?: number;
  centerLabel?: string;
}

export function StatusDonutCard({ title, slices, total, centerLabel }: Props) {
  const t = useT();
  const { theme } = useTheme();
  const data = slices.filter((s) => s.value > 0);
  const sumValue = total ?? data.reduce((acc, s) => acc + s.value, 0);

  return (
    <ThemedSurface style={styles.card}>
      <ThemedText variant="titleMedium" weight="700">
        {title ?? t('collectionUi.byStatus')}
      </ThemedText>
      <View style={styles.body}>
        {data.length === 0 ? (
          <ThemedText variant="bodySmall" tone="tertiary">
            {t('collectionUi.noDataYet')}
          </ThemedText>
        ) : (
          <>
            <PieChart
              data={data.map((s) => ({ value: s.value, color: s.color }))}
              radius={56}
              innerRadius={36}
              donut
              // The hole defaults to white, which hid the light total on dark themes.
              innerCircleColor={theme.background.secondary}
              showTooltip={false}
              centerLabelComponent={() => (
                <View style={styles.center}>
                  <ThemedText variant="titleLarge" weight="800">
                    {sumValue}
                  </ThemedText>
                  {centerLabel ? (
                    <ThemedText variant="captionSmall" tone="tertiary">
                      {centerLabel}
                    </ThemedText>
                  ) : null}
                </View>
              )}
            />
            <View style={styles.legend}>
              {data.map((s) => (
                <View key={s.label} style={styles.legendRow}>
                  <View style={[styles.dot, { backgroundColor: s.color }]} />
                  <ThemedText variant="bodySmall" tone="secondary" style={{ flex: 1 }}>
                    {s.label}
                  </ThemedText>
                  <ThemedText variant="titleSmall" weight="700">
                    {s.value}
                  </ThemedText>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
    </ThemedSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  center: {
    alignItems: 'center',
  },
  legend: {
    flex: 1,
    gap: 6,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
