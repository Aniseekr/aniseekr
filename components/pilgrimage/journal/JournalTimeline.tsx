// 時間流: the journal's shots by trip and day, newest first. Each trip header
// turns that run of days into a pilgrimage album in one tap.
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { ON_DARK, ThemedButton, ThemedText } from '../../themed';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { useT } from '../../../libs/i18n';
import type { PilgrimageAlbumEntry } from '../../../libs/services/pilgrimage/album-captures';
import { getPilgrimageAnimeTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import type { TimelineDay, TimelineTrip } from '../../../libs/services/pilgrimage/journal-timeline';
import { SpotImage } from '../SpotImage';
import { formatJournalDay, formatJournalRange } from './journal-dates';

const THUMB_PERCENT = 32.6;
const MAX_PLACES = 3;

interface JournalTimelineProps {
  trips: TimelineTrip[];
  onOpenEntry: (entry: PilgrimageAlbumEntry) => void;
  onDeleteEntry: (entry: PilgrimageAlbumEntry) => void;
  onMakeAlbum: (trip: TimelineTrip) => void;
}

function JournalTimelineImpl({
  trips,
  onOpenEntry,
  onDeleteEntry,
  onMakeAlbum,
}: JournalTimelineProps) {
  const t = useT();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.list}>
      {trips.map((trip) => (
        <View key={trip.from} style={styles.trip}>
          <View style={styles.tripHeader}>
            <View style={styles.tripText}>
              <ThemedText variant="titleMedium" weight="700" numberOfLines={1}>
                {formatJournalRange(trip.from, trip.to, t)}
              </ThemedText>
              <ThemedText variant="captionSmall" tone="secondary" numberOfLines={1}>
                {trip.works > 0
                  ? t('pilgrimage.album.tripSummary', { photos: trip.photos, works: trip.works })
                  : t('pilgrimage.album.tripSummaryNoWorks', { photos: trip.photos })}
              </ThemedText>
            </View>
            <ThemedButton
              size="sm"
              variant="secondary"
              label={t('pilgrimage.album.makeAlbum')}
              onPress={() => onMakeAlbum(trip)}
            />
          </View>
          {trip.days.map((day) => (
            <DaySection
              key={day.start}
              day={day}
              showDate={trip.days.length > 1}
              styles={styles}
              onOpenEntry={onOpenEntry}
              onDeleteEntry={onDeleteEntry}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export const JournalTimeline = memo(JournalTimelineImpl);

function DaySection({
  day,
  showDate,
  styles,
  onOpenEntry,
  onDeleteEntry,
}: {
  day: TimelineDay;
  /** A one-day trip already shows its date in the trip header. */
  showDate: boolean;
  styles: ReturnType<typeof makeStyles>;
  onOpenEntry: (entry: PilgrimageAlbumEntry) => void;
  onDeleteEntry: (entry: PilgrimageAlbumEntry) => void;
}) {
  const t = useT();
  const places = day.places.slice(0, MAX_PLACES).join(' · ');
  const more = day.places.length - MAX_PLACES;
  return (
    <View style={styles.day}>
      {showDate || places ? (
        <View style={styles.dayHeader}>
          {showDate ? (
            <ThemedText variant="bodySmall" weight="700">
              {formatJournalDay(day.start, t)}
            </ThemedText>
          ) : null}
          {places ? (
            <ThemedText
              variant="captionSmall"
              tone="secondary"
              numberOfLines={1}
              style={styles.places}>
              {more > 0 ? `${places} ${t('pilgrimage.album.morePlaces', { count: more })}` : places}
            </ThemedText>
          ) : null}
        </View>
      ) : null}
      <View style={styles.grid}>
        {day.entries.map((entry) => (
          <Thumb
            key={`${entry.capture.spotId}:${entry.capture.uri}`}
            entry={entry}
            styles={styles}
            onPress={() => onOpenEntry(entry)}
            onLongPress={() => onDeleteEntry(entry)}
          />
        ))}
      </View>
    </View>
  );
}

function Thumb({
  entry,
  styles,
  onPress,
  onLongPress,
}: {
  entry: PilgrimageAlbumEntry;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const t = useT();
  const work = entry.anime ? getPilgrimageAnimeTitles(entry.anime).primary : null;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={work ?? t('pilgrimage.album.freeCapturesFolder')}
      accessibilityHint={t('pilgrimage.album.deleteHint')}
      style={({ pressed }) => [styles.thumb, { opacity: pressed ? 0.85 : 1 }]}>
      <SpotImage uri={entry.capture.uri} style={styles.fill} contentFit="cover" />
      {work ? (
        <View style={styles.badge}>
          <ThemedText variant="badge" numberOfLines={1} style={{ color: ON_DARK }}>
            {work}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    list: { gap: Spacing.xl },
    trip: { gap: Spacing.md },
    tripHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    tripText: { flex: 1, gap: Spacing.xxs },
    day: { gap: Spacing.xs },
    dayHeader: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
    places: { flex: 1 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
    thumb: {
      // 3 × 32.6% leaves room for the two 2pt gaps on any phone width.
      width: `${THUMB_PERCENT}%`,
      aspectRatio: 1,
      backgroundColor: theme.background.tertiary,
      overflow: 'hidden',
      borderRadius: Radius.sm,
    },
    fill: { width: '100%', height: '100%' },
    badge: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: Spacing.xs,
      paddingVertical: 2,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
  });
}
