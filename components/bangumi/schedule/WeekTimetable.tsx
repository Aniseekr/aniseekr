import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Anime } from '../../rate/types';
import { ThemedText } from '../../themed';
import { Spacing } from '../../../constants/DesignSystem';
import { useT } from '../../../libs/i18n';
import { airingWeekdayKey } from '../../../libs/utils/airing';

/** The next seven local days starting today, as weekday numbers (0 = Sun). */
export function upcomingWeekdays(now = new Date()): number[] {
  return Array.from({ length: 7 }, (_, i) => (now.getDay() + i) % 7);
}

/**
 * The whole week as one vertical timetable, today first. Each day reports its
 * y-offset so the sticky week strip can jump to it and follow the scroll.
 */
export function WeekTimetable({
  grouped,
  renderRows,
  emptyLabel,
  onDayLayout,
}: {
  grouped: Record<number | 'unknown', Anime[]>;
  renderRows: (list: Anime[]) => ReactNode;
  emptyLabel: string;
  onDayLayout: (day: number, y: number) => void;
}) {
  const t = useT();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowEnd = new Date(today);
  windowEnd.setDate(today.getDate() + 7);
  const endSec = windowEnd.getTime() / 1000;
  const airing = (a: Anime) => a.nextAiringEpisode?.airingAt ?? 0;
  const byTime = (a: Anime, b: Anime) => airing(a) - airing(b);
  // A break week or a late premiere puts the next episode past this week;
  // listing it under this week's weekday would show the wrong date.
  const later = Object.values(grouped)
    .flat()
    .filter((a) => airing(a) >= endSec)
    .sort(byTime);
  return (
    <View style={styles.root}>
      {upcomingWeekdays(today).map((day, offset) => {
        const date = new Date(today);
        date.setDate(today.getDate() + offset);
        const list = grouped[day].filter((a) => airing(a) < endSec).sort(byTime);
        const weekday = t(airingWeekdayKey(date.getTime() / 1000));
        const relative =
          offset === 0
            ? t('tabs.schedule.today')
            : offset === 1
              ? t('tabs.schedule.tomorrow')
              : null;
        return (
          <View key={day} onLayout={(e) => onDayLayout(day, e.nativeEvent.layout.y)}>
            <View style={styles.header}>
              <ThemedText variant="titleMedium" weight="700">
                {relative ? `${relative} · ${weekday}` : weekday}
              </ThemedText>
              <ThemedText variant="caption" tone="tertiary">
                {`${date.getMonth() + 1}/${date.getDate()}`}
              </ThemedText>
            </View>
            {list.length > 0 ? (
              renderRows(list)
            ) : (
              <ThemedText variant="bodySmall" tone="tertiary" style={styles.empty}>
                {emptyLabel}
              </ThemedText>
            )}
          </View>
        );
      })}
      {later.length > 0 ? (
        <View>
          <View style={styles.header}>
            <ThemedText variant="titleMedium" weight="700">
              {t('tabs.schedule.later')}
            </ThemedText>
          </View>
          {renderRows(later)}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.xs,
    paddingBottom: Spacing.xxs,
  },
  empty: { paddingVertical: Spacing.xs },
});
