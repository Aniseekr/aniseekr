import { StyleSheet, View } from 'react-native';
import { ThemedButton, ThemedSurface } from '../../themed';
import { Radius, Typography } from '../../../constants/DesignSystem';
import { useT } from '../../../libs/i18n';

export type ScheduleSegment = 'tracking' | 'season';
export function ScheduleSegments({
  selected,
  trackedCount,
  seasonCount,
  onSelect,
}: {
  selected: ScheduleSegment;
  trackedCount: number | null;
  seasonCount: number | null;
  onSelect: (segment: ScheduleSegment) => void;
}) {
  const t = useT();
  return (
    <ThemedSurface radius={Radius.lg} style={styles.segments}>
      {(['tracking', 'season'] as const).map((value) => {
        const count = value === 'tracking' ? trackedCount : seasonCount;
        const label =
          count === null
            ? t(value === 'tracking' ? 'tabs.schedule.trackingLabel' : 'tabs.schedule.seasonLabel')
            : t(value === 'tracking' ? 'tabs.schedule.tracking' : 'tabs.schedule.season', {
                count,
              });
        return (
          <View key={value} style={styles.grow}>
            <ThemedButton
              fullWidth
              shape="rounded"
              haptic="selection"
              size="md"
              label={label}
              variant={selected === value ? 'primary' : 'ghost'}
              textStyle={Typography.bodySmall}
              onPress={() => onSelect(value)}
            />
          </View>
        );
      })}
    </ThemedSurface>
  );
}
const styles = StyleSheet.create({
  segments: { flexDirection: 'row', padding: 3 },
  grow: { flex: 1 },
});
