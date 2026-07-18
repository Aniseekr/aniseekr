import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Radius, Shadow, Size, Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { useI18n, useT, type LanguageId } from '../../libs/i18n';
import { bannerEnter, Springs } from '../../libs/animations/presets';
import type { LocalityEventListRow } from '../../libs/services/pilgrimage/locality/event-detail';
import type { LocalityCalendarMonth } from '../../libs/services/pilgrimage/locality/event-calendar';
import type { IsoDate } from '../../libs/services/pilgrimage/locality/types';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import {
  LOCALITY_CARD_RADIUS,
  LocalityCardDecor,
  LocalityMiniStamp,
  localityCategoryIcon,
} from './common/LocalityAesthetic';
import {
  readableTextOn,
  ThemedButton,
  ThemedIconButton,
  ThemedSurface,
  ThemedText,
} from '../themed';

export interface LocalityCalendarEventRow extends LocalityEventListRow {
  cover: string | null;
  accent: string;
}

interface LocalityEventCalendarProps {
  month: LocalityCalendarMonth;
  selectedDate: IsoDate;
  today: IsoDate;
  eventsByDay: ReadonlyMap<IsoDate, readonly LocalityCalendarEventRow[]>;
  unplacedEventCount: number;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  onSelectDate: (date: IsoDate) => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const DAY_CELL_HEIGHT = Size.minTouchTarget + Spacing.md;
const MARKER_SIZE = Spacing.md;

function LocalityEventCalendarComponent({
  month,
  selectedDate,
  today,
  eventsByDay,
  unplacedEventCount,
  onPreviousMonth,
  onNextMonth,
  onToday,
  onSelectDate,
}: LocalityEventCalendarProps) {
  const { theme } = useTheme();
  const { language } = useI18n();
  const t = useT();
  const monthLabel = useMemo(() => formatCalendarMonth(month, language), [language, month]);
  const weeks = useMemo(() => buildCalendarWeeks(month), [month]);
  const weekdayLabels = useMemo(
    () => [
      t('news.calendar.weekdays.sun'),
      t('news.calendar.weekdays.mon'),
      t('news.calendar.weekdays.tue'),
      t('news.calendar.weekdays.wed'),
      t('news.calendar.weekdays.thu'),
      t('news.calendar.weekdays.fri'),
      t('news.calendar.weekdays.sat'),
    ],
    [t]
  );

  return (
    <Animated.View entering={bannerEnter()}>
      <ThemedSurface padded={0} radius={LOCALITY_CARD_RADIUS} style={styles.surface}>
        <LocalityCardDecor accent={theme.secondary} tape="right" />

        <View style={styles.header}>
          <View style={styles.monthCopy}>
            <ThemedText variant="captionSmall" tone="tertiary" weight="800">
              {t('news.calendar.title')}
            </ThemedText>
            <ThemedText variant="headlineSmall" weight="800">
              {monthLabel}
            </ThemedText>
          </View>
          <View style={styles.monthNav}>
            <ThemedIconButton
              accessibilityLabel={t('news.calendar.previousMonth')}
              variant="ghost"
              icon={(color) => <Ionicons name="chevron-back" size={18} color={color} />}
              onPress={onPreviousMonth}
            />
            <ThemedIconButton
              accessibilityLabel={t('news.calendar.nextMonth')}
              variant="ghost"
              icon={(color) => <Ionicons name="chevron-forward" size={18} color={color} />}
              onPress={onNextMonth}
            />
          </View>
        </View>

        <View style={styles.legendRow}>
          <View style={styles.legendCopy}>
            <View style={[styles.legendRing, { borderColor: theme.accent }]}>
              <Ionicons name="sparkles" size={10} color={theme.accent} />
            </View>
            <ThemedText variant="captionSmall" tone="secondary" style={styles.legendText}>
              {t('news.calendar.markerLegend')}
            </ThemedText>
          </View>
          <ThemedButton
            label={t('news.calendar.today')}
            variant="secondary"
            size="md"
            icon={<Ionicons name="locate-outline" size={15} color={theme.accent} />}
            haptic="selection"
            onPress={onToday}
          />
        </View>

        <View style={styles.weekdayRow}>
          {weekdayLabels.map((label, index) => (
            <View key={`${label}:${index}`} style={styles.weekdayCell}>
              <ThemedText
                variant="captionSmall"
                weight="800"
                align="center"
                style={{
                  color:
                    index === 0
                      ? theme.status.error
                      : index === 6
                        ? theme.status.info
                        : theme.text.tertiary,
                }}>
                {label}
              </ThemedText>
            </View>
          ))}
        </View>

        <View style={styles.grid}>
          {weeks.map((week, weekIndex) => (
            <View key={`week:${weekIndex}`} style={styles.weekRow}>
              {week.map((date, weekday) => (
                <View key={date ?? `blank:${weekIndex}:${weekday}`} style={styles.daySlot}>
                  {date ? (
                    <CalendarDayCell
                      date={date}
                      events={eventsByDay.get(date) ?? []}
                      selected={date === selectedDate}
                      today={date === today}
                      onPress={() => onSelectDate(date)}
                    />
                  ) : null}
                </View>
              ))}
            </View>
          ))}
        </View>

        {unplacedEventCount > 0 ? (
          <View style={[styles.unplacedNote, { borderColor: theme.glassBorder }]}>
            <Ionicons name="information-circle-outline" size={16} color={theme.text.tertiary} />
            <ThemedText variant="captionSmall" tone="tertiary" style={styles.unplacedText}>
              {t('news.calendar.unplacedNote', { count: unplacedEventCount })}
            </ThemedText>
          </View>
        ) : null}
      </ThemedSurface>
    </Animated.View>
  );
}

function CalendarDayCell({
  date,
  events,
  selected,
  today,
  onPress,
}: {
  date: IsoDate;
  events: readonly LocalityCalendarEventRow[];
  selected: boolean;
  today: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const { language } = useI18n();
  const t = useT();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const day = Number(date.slice(8, 10));
  const dayLabel = formatCalendarDate(date, language);
  const selectedForeground = readableTextOn(theme.accent);

  const handlePress = () => {
    hapticsBridge.selection();
    onPress();
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={t('news.calendar.dayA11y', {
        date: dayLabel,
        count: events.length,
      })}
      accessibilityState={{ selected }}
      onPress={handlePress}
      onPressIn={() => {
        // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValues are intentionally mutable.
        scale.value = withSpring(0.96, Springs.press);
      }}
      onPressOut={() => {
        // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValues are intentionally mutable.
        scale.value = withSpring(1, Springs.focus);
      }}
      style={[
        styles.dayCell,
        {
          backgroundColor: theme.background.tertiary,
          borderColor: selected || today ? theme.accent : theme.glassBorder,
          borderWidth: selected ? 2 : 1,
        },
        animatedStyle,
      ]}>
      <View style={[styles.dayNumber, selected ? { backgroundColor: theme.accent } : undefined]}>
        <ThemedText
          variant="bodySmall"
          weight={selected || today ? '800' : '600'}
          align="center"
          style={{
            color: selected ? selectedForeground : today ? theme.accent : theme.text.primary,
          }}>
          {day}
        </ThemedText>
      </View>
      <AnimeMarkerStack events={events} />
    </AnimatedPressable>
  );
}

function AnimeMarkerStack({ events }: { events: readonly LocalityCalendarEventRow[] }) {
  const { theme } = useTheme();
  if (events.length === 0) return <View style={styles.markerPlaceholder} />;

  const visible = events.slice(0, events.length > 3 ? 2 : 3);
  const remaining = events.length - visible.length;
  return (
    <View style={styles.markerRow} pointerEvents="none">
      {visible.map((row, index) => (
        <LocalityMiniStamp
          key={row.event.id}
          accent={row.accent}
          imageUri={row.cover}
          icon={localityCategoryIcon(row.event.category)}
          size="sm"
          style={{ marginLeft: index === 0 ? 0 : -Spacing.xxs }}
        />
      ))}
      {remaining > 0 ? (
        <View
          style={[
            styles.moreMarker,
            { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
          ]}>
          <ThemedText variant="captionSmall" weight="800" align="center">
            +{remaining}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

export function formatCalendarDate(date: IsoDate, language: LanguageId): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return new Intl.DateTimeFormat(language, {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function formatCalendarMonth(month: LocalityCalendarMonth, language: LanguageId): string {
  return new Intl.DateTimeFormat(language, {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(month.year, month.month - 1, 1, 12)));
}

function buildCalendarWeeks(month: LocalityCalendarMonth): readonly (IsoDate | null)[][] {
  const firstWeekday = new Date(Date.UTC(month.year, month.month - 1, 1, 12)).getUTCDay();
  const dayCount = new Date(Date.UTC(month.year, month.month, 0, 12)).getUTCDate();
  const cells: (IsoDate | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= dayCount; day += 1) {
    cells.push(toIsoDate(month.year, month.month, day));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (IsoDate | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

function toIsoDate(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  surface: {
    position: 'relative',
    overflow: 'hidden',
    paddingBottom: Spacing.md,
    ...Shadow.subtle,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
  },
  monthCopy: { flex: 1, minWidth: 0, gap: Spacing.xxs },
  monthNav: { flexDirection: 'row', alignItems: 'center' },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  legendCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  legendRing: {
    width: Spacing.lg,
    height: Spacing.lg,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
  },
  legendText: { flex: 1 },
  weekdayRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xxs,
    marginBottom: Spacing.xxs,
  },
  weekdayCell: { flex: 1, paddingVertical: Spacing.xxs },
  grid: { paddingHorizontal: Spacing.xxs, gap: Spacing.xxs },
  weekRow: { flexDirection: 'row' },
  daySlot: { flex: 1, paddingHorizontal: Spacing.xxs / 2 },
  dayCell: {
    minHeight: DAY_CELL_HEIGHT,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.xxs,
    paddingVertical: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xxs,
  },
  dayNumber: {
    minWidth: Spacing.xl,
    height: Spacing.xl,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxs,
  },
  markerPlaceholder: { height: MARKER_SIZE },
  markerRow: {
    minHeight: MARKER_SIZE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreMarker: {
    minWidth: MARKER_SIZE,
    height: MARKER_SIZE,
    marginLeft: -Spacing.xxs,
    paddingHorizontal: Spacing.xxs,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unplacedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
  },
  unplacedText: { flex: 1 },
});

export const LocalityEventCalendar = memo(LocalityEventCalendarComponent);
